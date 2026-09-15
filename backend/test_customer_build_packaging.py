"""
Tests for the Al Siwan customer-build packaging configuration (STEP 4A/4B).

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
_RESOURCES_BACKEND = os.path.join(_REPO_ROOT, "desktop", "src-tauri", "resources", "backend")
_EMBEDDED_PYTHON = os.path.join(_REPO_ROOT, "desktop", "src-tauri", "resources", "python", "python.exe")

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


@unittest.skipUnless(os.path.isdir(_RESOURCES_BACKEND), "resources/backend/ not staged on this machine")
class TestActualPackagedResourcesState(unittest.TestCase):
    """Inspects the REAL desktop/src-tauri/resources/backend/ staging folder
    on this machine (STEP 4B: refreshed to match the corrected build.ps1
    exclusion logic) — not just the mechanism in the abstract."""

    def test_current_license_manager_is_packaged(self):
        path = os.path.join(_RESOURCES_BACKEND, "license_manager.py")
        self.assertTrue(os.path.exists(path))
        content = _read(path)
        self.assertIn("_PUBLIC_KEY_B64", content)
        self.assertNotIn("FinPilotAI-UAE-2026-SecretKey-Zentro", content)

    def test_old_license_generator_not_packaged(self):
        path = os.path.join(_RESOURCES_BACKEND, "license_generator.py")
        self.assertFalse(os.path.exists(path), "stale license_generator.py must not be packaged")

    def test_alsiwan_watermark_png_packaged(self):
        path = os.path.join(_RESOURCES_BACKEND, "assets", "alsiwan_watermark.png")
        self.assertTrue(os.path.exists(path))

    def test_alsiwan_footer_icon_png_packaged(self):
        path = os.path.join(_RESOURCES_BACKEND, "assets", "alsiwan_footer_icon.png")
        self.assertTrue(os.path.exists(path))

    def test_no_finpilot_db_packaged(self):
        offenders = []
        for root, _dirs, files in os.walk(_RESOURCES_BACKEND):
            for fname in files:
                if fname.endswith(".db") or fname.endswith(".db-journal"):
                    offenders.append(os.path.join(root, fname))
        self.assertEqual(offenders, [])

    def test_no_test_or_check_scripts_packaged(self):
        offenders = []
        for root, _dirs, files in os.walk(_RESOURCES_BACKEND):
            for fname in files:
                if fname.startswith("test_") or fname == "check_inv.py":
                    offenders.append(os.path.join(root, fname))
        self.assertEqual(offenders, [])

    def test_no_build_log_packaged(self):
        path = os.path.join(_RESOURCES_BACKEND, "build_log.txt")
        self.assertFalse(os.path.exists(path))

    def test_customer_profiles_module_is_packaged(self):
        """This IS a runtime-required module — must not be caught by the
        test_*/check_* exclusion patterns."""
        path = os.path.join(_RESOURCES_BACKEND, "customer_profiles.py")
        self.assertTrue(os.path.exists(path))

    def test_routes_still_present(self):
        routes_dir = os.path.join(_RESOURCES_BACKEND, "routes")
        self.assertTrue(os.path.isdir(routes_dir))
        self.assertIn("license.py", os.listdir(routes_dir))
        self.assertIn("company.py", os.listdir(routes_dir))


class TestBuildScriptMechanisms(unittest.TestCase):
    """Static checks on build.ps1 and backend.spec — the actual packaging
    scripts — rather than just their observed output on this one machine."""

    def _build_ps1(self) -> str:
        return _read(os.path.join(_REPO_ROOT, "build.ps1"))

    def _backend_spec(self) -> str:
        return _read(os.path.join(_HERE, "backend.spec"))

    def test_build_ps1_parses_as_valid_powershell(self):
        """Regression guard: a script can contain all the right substrings
        (checked by every other test in this class) and still be broken —
        e.g. a non-ASCII character inside a double-quoted string can corrupt
        string termination for Windows PowerShell 5.1 depending on the
        file's encoding, causing a 'Missing closing brace' parse error far
        from the actual mistake. This actually invokes PowerShell's own
        parser rather than trusting text search."""
        path = os.path.join(_REPO_ROOT, "build.ps1")
        script = (
            "$errors = $null; $tokens = $null; "
            f"[void][System.Management.Automation.Language.Parser]::ParseFile('{path}', [ref]$tokens, [ref]$errors); "
            "if ($errors) { $errors | ForEach-Object { Write-Output $_.Message }; exit 1 } else { exit 0 }"
        )
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", script],
            capture_output=True, text=True, timeout=30,
        )
        self.assertEqual(result.returncode, 0, f"build.ps1 failed to parse:\n{result.stdout}\n{result.stderr}")

    def test_build_ps1_excludes_test_and_check_scripts(self):
        src = self._build_ps1()
        self.assertIn("test_*.py", src)
        self.assertIn("check_inv.py", src)

    def test_build_ps1_excludes_db_files(self):
        src = self._build_ps1()
        self.assertIn("*.db", src)

    def test_build_ps1_supports_customer_profile_parameter(self):
        src = self._build_ps1()
        self.assertIn("$CustomerProfile", src)
        self.assertIn("customer-builds", src)

    def test_build_ps1_removes_staged_profile_on_success_and_failure(self):
        src = self._build_ps1()
        self.assertIn("Remove-StagedCustomerProfile", src)
        self.assertIn("trap", src)

    def test_build_ps1_default_run_does_not_force_a_profile(self):
        src = self._build_ps1()
        self.assertIn('[string]$CustomerProfile = ""', src)

    def test_backend_spec_includes_png_assets(self):
        src = self._backend_spec()
        self.assertIn("*.png", src)

    def test_backend_spec_excludes_test_and_check_scripts(self):
        src = self._backend_spec()
        self.assertIn("_EXCLUDE_PY_EXACT", src)
        self.assertIn("check_inv.py", src)
        self.assertIn("test_", src)

    def test_backend_spec_includes_cryptography_hiddenimports(self):
        src = self._backend_spec()
        self.assertIn("cryptography.hazmat.primitives.asymmetric.ed25519", src)

    def test_backend_spec_includes_customer_profiles_hiddenimport(self):
        src = self._backend_spec()
        self.assertIn("'customer_profiles'", src)


class TestBuildPs1DependencyFix(unittest.TestCase):
    """Static checks that build.ps1 contains the STEP 4C-1 fix for the
    missing-cryptography defect: a clean wipe before every embedded-Python
    setup, and hard (build-failing) verification of the dependency."""

    def _build_ps1(self) -> str:
        return _read(os.path.join(_REPO_ROOT, "build.ps1"))

    def test_wipes_embedded_python_dir_before_setup(self):
        src = self._build_ps1()
        self.assertIn("Remove-Item $EmbeddedPythonDir -Recurse -Force", src)

    def test_verifies_cryptography_importable(self):
        src = self._build_ps1()
        self.assertIn("import cryptography; print(cryptography.__version__)", src)

    def test_verifies_ed25519_importable(self):
        src = self._build_ps1()
        self.assertIn("Ed25519PublicKey; print('Ed25519 OK')", src)

    def test_verification_failure_throws_not_warns(self):
        """The old behavior silently downgraded a missing dependency to a
        warning ('fall back to system Python'); the fix must throw instead,
        which the script-level trap turns into an actual build failure."""
        src = self._build_ps1()
        self.assertIn('throw "Embedded Python cannot import', src)

    def test_verifies_packaged_backend_can_import_license_manager(self):
        src = self._build_ps1()
        self.assertIn("import license_manager", src)
        self.assertIn("_PUBLIC_KEY_B64", src)

    def test_pip_install_checks_exit_code(self):
        src = self._build_ps1()
        self.assertIn('throw "pip install -r requirements.txt failed', src)


@unittest.skipUnless(os.path.exists(_EMBEDDED_PYTHON), "embedded python.exe not staged on this machine")
class TestActualEmbeddedPythonHasCryptography(unittest.TestCase):
    """Inspects the REAL embedded Python runtime on this machine, if a build
    has already staged one — the definitive check requested in STEP 4C-1:
    does the exact python.exe that would ship actually have cryptography?"""

    def test_cryptography_importable_in_embedded_python(self):
        result = subprocess.run(
            [_EMBEDDED_PYTHON, "-c", "import cryptography; print(cryptography.__version__)"],
            capture_output=True, text=True, timeout=30,
        )
        self.assertEqual(result.returncode, 0,
                          f"embedded python cannot import cryptography:\n{result.stdout}\n{result.stderr}")

    def test_ed25519_importable_in_embedded_python(self):
        result = subprocess.run(
            [_EMBEDDED_PYTHON, "-c",
             "from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey; print('OK')"],
            capture_output=True, text=True, timeout=30,
        )
        self.assertEqual(result.returncode, 0,
                          f"embedded python cannot import Ed25519PublicKey:\n{result.stdout}\n{result.stderr}")

    def test_no_leftover_tilde_ip_corruption(self):
        """Regression guard for the exact root cause found in STEP 4C-1: a
        stale '~ip' directory left by an interrupted pip self-upgrade,
        corrupting that environment's package install state."""
        site_packages = os.path.join(os.path.dirname(_EMBEDDED_PYTHON), "Lib", "site-packages")
        if not os.path.isdir(site_packages):
            self.skipTest("no site-packages directory found")
        offenders = [n for n in os.listdir(site_packages) if n.startswith("~ip")]
        self.assertEqual(offenders, [], f"corrupted pip residue found: {offenders}")

    def test_license_manager_importable_with_packaged_backend(self):
        if not os.path.isdir(_RESOURCES_BACKEND):
            self.skipTest("resources/backend not staged")
        script = (
            f"import sys; sys.path.insert(0, r'{_RESOURCES_BACKEND}'); "
            "import license_manager; "
            "from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey; "
            "assert hasattr(license_manager, '_PUBLIC_KEY_B64'); "
            "assert 'REPLACE_WITH' not in license_manager._PUBLIC_KEY_B64; "
            "print('OK')"
        )
        result = subprocess.run([_EMBEDDED_PYTHON, "-c", script], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0,
                          f"packaged backend failed import check:\n{result.stdout}\n{result.stderr}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
