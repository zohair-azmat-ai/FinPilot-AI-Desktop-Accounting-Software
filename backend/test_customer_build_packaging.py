"""
Tests for the Al Siwan customer-build packaging configuration (STEP 4A).

These check the STATIC packaging setup (which files exist where, what's
excluded, what the staged build config resolves to) rather than booting the
full app — no installer is built or run by this suite.

Run with:  python -m unittest test_customer_build_packaging -v
"""
import os
import subprocess
import sys
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_HERE)

sys.path.insert(0, _HERE)
import customer_profiles  # noqa: E402
import license_manager  # noqa: E402


def _read(path: str) -> str:
    with open(path, encoding="utf-8") as f:
        return f.read()


class TestAlSiwanBuildConfigStaged(unittest.TestCase):
    def test_staged_customer_profile_file_exists(self):
        path = os.path.join(_REPO_ROOT, "desktop", "customer-builds", "alsiwan", "customer_profile.txt")
        self.assertTrue(os.path.exists(path), path)

    def test_staged_customer_profile_value_is_alsiwan(self):
        path = os.path.join(_REPO_ROOT, "desktop", "customer-builds", "alsiwan", "customer_profile.txt")
        self.assertEqual(_read(path).strip(), "alsiwan")

    def test_staged_value_maps_to_a_real_profile(self):
        path = os.path.join(_REPO_ROOT, "desktop", "customer-builds", "alsiwan", "customer_profile.txt")
        key = _read(path).strip()
        self.assertIn(key, customer_profiles.CUSTOMER_PROFILES)

    def test_alsiwan_profile_has_correct_invoice_template(self):
        self.assertEqual(customer_profiles.CUSTOMER_PROFILES["alsiwan"]["invoice_template"], "alsiwan")

    def test_alsiwan_profile_customer_id(self):
        self.assertEqual(customer_profiles.CUSTOMER_PROFILES["alsiwan"]["customer_id"], "ALSIWAN")

    def test_live_resources_folder_does_not_contain_customer_profile_by_default(self):
        """The default/Dar Al Salam build resources must NOT have the Al Siwan
        (or any) profile file staged — that would silently redirect the next
        routine build away from default behavior."""
        live_path = os.path.join(_REPO_ROOT, "desktop", "src-tauri", "resources", "customer_profile.txt")
        self.assertFalse(
            os.path.exists(live_path),
            "customer_profile.txt must not be present in the live resources folder "
            "by default — it should only be staged there temporarily for a "
            "customer-specific build, then removed.",
        )


class TestDefaultProfileStillUnaffected(unittest.TestCase):
    def test_no_env_var_gives_none(self):
        os.environ.pop("FINPILOT_CUSTOMER_PROFILE", None)
        self.assertIsNone(customer_profiles.get_active_profile())

    def test_unset_profile_key_is_empty_string(self):
        os.environ.pop("FINPILOT_CUSTOMER_PROFILE", None)
        self.assertEqual(customer_profiles.get_active_profile_key(), "")


class TestMainRsReadsResourceFileNotEnvVar(unittest.TestCase):
    """Static source check: the Rust launcher must read the profile from a
    bundled resource file, not assume an OS environment variable is already
    set on the customer's machine."""

    def _main_rs(self) -> str:
        path = os.path.join(_REPO_ROOT, "desktop", "src-tauri", "src", "main.rs")
        return _read(path)

    def test_reads_customer_profile_resource_file(self):
        src = self._main_rs()
        self.assertIn('customer_profile.txt', src)
        self.assertIn('fs::read_to_string', src)

    def test_sets_env_for_spawned_backend_process(self):
        src = self._main_rs()
        self.assertIn('FINPILOT_CUSTOMER_PROFILE', src)
        self.assertIn('.env(', src)

    def test_does_not_read_profile_from_std_env_var(self):
        """Must not do std::env::var("FINPILOT_CUSTOMER_PROFILE") to *read*
        the profile (that would depend on the customer's own shell state);
        it should only *set* it for the child process it spawns."""
        src = self._main_rs()
        self.assertNotIn('env::var("FINPILOT_CUSTOMER_PROFILE")', src)


class TestVendorPrivateKeyExcludedFromPackaging(unittest.TestCase):
    def test_private_key_path_gitignored(self):
        key_path = os.path.join(_REPO_ROOT, "tools", "license_signer", "keys", "vendor_private_key.pem")
        result = subprocess.run(
            ["git", "check-ignore", "-q", key_path],
            cwd=_REPO_ROOT,
        )
        self.assertEqual(result.returncode, 0, "vendor_private_key.pem must be gitignored")

    def test_no_packaging_config_references_tools_dir(self):
        candidates = [
            os.path.join(_REPO_ROOT, "build.ps1"),
            os.path.join(_REPO_ROOT, "desktop", "src-tauri", "tauri.conf.json"),
            os.path.join(_REPO_ROOT, "desktop", "src-tauri", "src", "main.rs"),
            os.path.join(_HERE, "backend.spec"),
        ]
        for path in candidates:
            if not os.path.exists(path):
                continue
            content = _read(path)
            self.assertNotIn("license_signer", content, f"{path} must not reference tools/license_signer")
            self.assertNotIn("vendor_private_key", content, f"{path} must not reference the private key")

    def test_no_pem_private_key_material_anywhere_under_backend_or_resources(self):
        """Scan the two actual packaging source trees for accidentally
        committed/copied private key material."""
        scan_dirs = [
            _HERE,
            os.path.join(_REPO_ROOT, "desktop", "src-tauri", "resources"),
        ]
        offenders = []
        for base in scan_dirs:
            if not os.path.isdir(base):
                continue
            marker = "BEGIN " + "PRIVATE KEY"  # split to avoid self-matching this scanner's own source
            for root, _dirs, files in os.walk(base):
                for fname in files:
                    if fname == os.path.basename(__file__):
                        continue
                    if fname.endswith((".py", ".pem", ".key")):
                        fpath = os.path.join(root, fname)
                        try:
                            content = _read(fpath)
                        except (UnicodeDecodeError, OSError):
                            continue
                        if marker in content:
                            offenders.append(fpath)
        self.assertEqual(offenders, [], f"Private key material found in packaging tree: {offenders}")

    def test_public_key_is_present_and_non_placeholder(self):
        self.assertTrue(hasattr(license_manager, "_PUBLIC_KEY_B64"))
        self.assertNotIn("REPLACE_WITH", license_manager._PUBLIC_KEY_B64)
        self.assertGreater(len(license_manager._PUBLIC_KEY_B64), 20)


class TestCloudCredentialsNotPackaged(unittest.TestCase):
    def test_no_dat_files_in_source_backend(self):
        offenders = []
        for root, _dirs, files in os.walk(_HERE):
            for fname in files:
                if fname in ("sync.dat", "license.dat"):
                    offenders.append(os.path.join(root, fname))
        self.assertEqual(offenders, [])

    def test_license_and_sync_storage_paths_use_appdata_not_bundled_path(self):
        """Both credential stores must resolve via %APPDATA% (per-machine,
        never inside the installer payload), not a path under this source
        tree or the Tauri resources folder."""
        import sync_engine
        self.assertIn("FinPilot AI", sync_engine._DAT)
        self.assertNotIn(_REPO_ROOT, sync_engine._DAT)
        self.assertIn("FinPilot AI", license_manager._DAT)
        self.assertNotIn(_REPO_ROOT, license_manager._DAT)

    def test_no_supabase_credentials_hardcoded_in_customer_profile(self):
        for profile in customer_profiles.CUSTOMER_PROFILES.values():
            blob = str(profile).lower()
            self.assertNotIn("supabase", blob)
            self.assertNotIn("http://", blob)
            self.assertNotIn("https://", blob)


if __name__ == "__main__":
    unittest.main(verbosity=2)
