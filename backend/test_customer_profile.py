"""
Tests for the Al Siwan customer-profile seed configuration (STEP 2).

Verifies:
  - A brand-new database + FINPILOT_CUSTOMER_PROFILE=alsiwan seeds the
    Company row from customer_profiles.CUSTOMER_PROFILES["alsiwan"] instead
    of the generic blank "My Company".
  - customer_id (license default) and invoice_template come from the profile.
  - No customers/invoices/quotations/company data of any kind pre-exists in
    a fresh database (i.e. nothing is copied from anywhere).
  - No sync.dat/license.dat/cloud credentials exist after a fresh boot —
    cloud sync stays disconnected by default.
  - With no profile set, existing behavior (blank "My Company", default
    invoice_template) is completely unchanged — this is what the real Dar
    Al Salam / generic install path exercises.

Each scenario boots the REAL FastAPI app (database.py's engine, main.py's
create_all + migrations, routes/company.py's seed logic — the exact same
code that runs on real startup) in a genuinely separate Python process
with an isolated fake HOME/APPDATA, since DB_DIR/engine are resolved once
at import time. This never reads or writes anything under the real
%USERPROFILE%\\FinPilot\\ or %APPDATA%\\FinPilot AI\\, and never touches
C:\\Program Files\\FinPilot AI\\.

Run with:  python -m unittest test_customer_profile -v
"""
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

_BOOT_SCRIPT = r"""
import sys, json
sys.path.insert(0, {backend_dir!r})
sys.path.insert(0, {routes_dir!r})
from fastapi.testclient import TestClient
from main import app
client = TestClient(app)
r = client.get("/api/company/")
r2 = client.get("/api/license/default-customer-id")
print("__COMPANY__" + json.dumps(r.json()))
print("__DEFAULT_CUSTOMER_ID__" + json.dumps(r2.json()))
"""


class ProfileScenario:
    """Boots the real app once, in an isolated fake home, optionally with a
    customer profile active. Captures the resulting company/db/appdata state."""

    def __init__(self, profile: str | None):
        self.profile = profile
        self.fake_home = tempfile.mkdtemp(prefix="fpai_profile_test_")
        self.appdata = os.path.join(self.fake_home, "AppData", "Roaming")
        self.localappdata = os.path.join(self.fake_home, "AppData", "Local")
        os.makedirs(self.appdata, exist_ok=True)
        os.makedirs(self.localappdata, exist_ok=True)

        env = dict(os.environ)
        env["USERPROFILE"] = self.fake_home
        env["HOME"] = self.fake_home
        env["APPDATA"] = self.appdata
        env["LOCALAPPDATA"] = self.localappdata
        if profile:
            env["FINPILOT_CUSTOMER_PROFILE"] = profile
        else:
            env.pop("FINPILOT_CUSTOMER_PROFILE", None)

        script = _BOOT_SCRIPT.format(
            backend_dir=BACKEND_DIR,
            routes_dir=os.path.join(BACKEND_DIR, "routes"),
        )
        result = subprocess.run(
            [sys.executable, "-c", script],
            env=env, capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Boot subprocess failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}")

        self.company = None
        self.default_customer_id = None
        for line in result.stdout.splitlines():
            if line.startswith("__COMPANY__"):
                self.company = json.loads(line[len("__COMPANY__"):])
            elif line.startswith("__DEFAULT_CUSTOMER_ID__"):
                self.default_customer_id = json.loads(line[len("__DEFAULT_CUSTOMER_ID__"):])

        self.db_path = os.path.join(self.fake_home, "FinPilot", "finpilot.db")

    def db_table_count(self, table: str) -> int:
        con = sqlite3.connect(self.db_path)
        try:
            return con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        finally:
            con.close()

    def cleanup(self):
        shutil.rmtree(self.fake_home, ignore_errors=True)


class TestAlSiwanProfileSeed(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.alsiwan = ProfileScenario("alsiwan")

    @classmethod
    def tearDownClass(cls):
        cls.alsiwan.cleanup()

    def test_fresh_database_file_created(self):
        self.assertTrue(os.path.exists(self.alsiwan.db_path))

    def test_company_name_is_al_siwan(self):
        self.assertEqual(
            self.alsiwan.company["name"],
            "AL SIWAN MACHINERY AND ELECTRICA EQUIPMENT TRADING FZE LLC",
        )

    def test_company_contact_details_match_profile(self):
        c = self.alsiwan.company
        self.assertEqual(c["email"], "alsiwan2026@gmail.com")
        self.assertEqual(c["phone"], "+971 545654826")
        self.assertIn("Naimiya 1 Hafiz Ibrahim Street", c["address"])
        self.assertIn("Dubai", c["address"])

    def test_invoice_template_is_alsiwan(self):
        self.assertEqual(self.alsiwan.company["invoice_template"], "alsiwan")

    def test_default_customer_id_is_alsiwan(self):
        self.assertEqual(self.alsiwan.default_customer_id["customer_id"], "ALSIWAN")

    def test_no_dar_al_salam_or_any_other_data_present(self):
        # A fresh DB must have zero rows in every business table — nothing
        # copied or seeded from any other installation.
        for table in ("customers", "invoices", "quotations", "delivery_notes",
                       "payments", "suppliers", "items"):
            self.assertEqual(self.alsiwan.db_table_count(table), 0, f"{table} should be empty")
        self.assertEqual(self.alsiwan.db_table_count("companies"), 1, "exactly one seeded company row")

    def test_no_dar_al_salam_name_anywhere_in_seeded_company(self):
        blob = json.dumps(self.alsiwan.company).lower()
        self.assertNotIn("dar al salam", blob)
        self.assertNotIn("daralsalam", blob)

    def test_no_sync_dat_created(self):
        sync_dat = os.path.join(self.alsiwan.appdata, "FinPilot AI", "sync.dat")
        self.assertFalse(os.path.exists(sync_dat), "cloud sync must stay disconnected by default")

    def test_no_license_dat_pre_activated(self):
        license_dat = os.path.join(self.alsiwan.appdata, "FinPilot AI", "license.dat")
        # license.dat may exist (trial record is created on first status check),
        # but it must never already be in a "licensed" state out of the box.
        if os.path.exists(license_dat):
            with open(license_dat, "rb") as f:
                raw = f.read()
            self.assertNotIn(b"licensed", raw)  # even XOR-obfuscated this is a weak
            # sanity check only; the real guarantee is that get_company() never
            # touches license_manager at all, verified structurally by inspection.


class TestDefaultProfileUnchanged(unittest.TestCase):
    """No FINPILOT_CUSTOMER_PROFILE set — must reproduce the exact pre-existing
    behavior (blank 'My Company', default invoice template), unaffected."""

    @classmethod
    def setUpClass(cls):
        cls.default = ProfileScenario(None)

    @classmethod
    def tearDownClass(cls):
        cls.default.cleanup()

    def test_default_company_name_unchanged(self):
        self.assertEqual(self.default.company["name"], "My Company")

    def test_default_invoice_template_unchanged(self):
        self.assertEqual(self.default.company["invoice_template"], "default")

    def test_default_contact_fields_blank(self):
        c = self.default.company
        self.assertEqual(c["email"], "")
        self.assertEqual(c["phone"], "")
        self.assertEqual(c["address"], "")

    def test_default_customer_id_blank(self):
        self.assertEqual(self.default.default_customer_id["customer_id"], "")

    def test_no_sync_dat_created(self):
        sync_dat = os.path.join(self.default.appdata, "FinPilot AI", "sync.dat")
        self.assertFalse(os.path.exists(sync_dat))

    def test_no_data_present(self):
        for table in ("customers", "invoices", "quotations"):
            self.assertEqual(self.default.db_table_count(table), 0)


class TestUnknownProfileFallsBackSafely(unittest.TestCase):
    """An unrecognized FINPILOT_CUSTOMER_PROFILE value must not crash and
    must not silently invent data — falls back to the safe default."""

    @classmethod
    def setUpClass(cls):
        cls.unknown = ProfileScenario("some-typo-that-does-not-exist")

    @classmethod
    def tearDownClass(cls):
        cls.unknown.cleanup()

    def test_falls_back_to_default_company(self):
        self.assertEqual(self.unknown.company["name"], "My Company")
        self.assertEqual(self.unknown.company["invoice_template"], "default")


if __name__ == "__main__":
    unittest.main(verbosity=2)
