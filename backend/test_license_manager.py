"""
Automated tests for the Ed25519 offline licensing system.

These tests never touch the real %APPDATA%\\FinPilot AI\\license.dat — the
storage path and hardware-ID lookup are monkeypatched per-test.

Valid signed license fixtures are produced here using the real vendor
private key at tools/license_signer/keys/vendor_private_key.pem. That key
is gitignored and dev-machine-only; these tests are never bundled into the
customer application (PyInstaller only bundles main.py's import graph, and
nothing in the shipped app imports this test file). If the key is missing
(e.g. a fresh checkout with no vendor key yet), those specific tests are
skipped rather than failed.

Run with:  python -m unittest test_license_manager -v
"""
import base64
import datetime
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import license_manager as lm  # noqa: E402

_PRIVATE_KEY_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "tools", "license_signer", "keys", "vendor_private_key.pem"
)
_PRIVATE_KEY_PATH = os.path.normpath(_PRIVATE_KEY_PATH)

_HAS_VENDOR_KEY = os.path.exists(_PRIVATE_KEY_PATH)


def _load_private_key():
    from cryptography.hazmat.primitives import serialization
    with open(_PRIVATE_KEY_PATH, "rb") as f:
        return serialization.load_pem_private_key(f.read(), password=None)


def sign_payload(payload: dict) -> dict:
    """Produce a validly-signed response dict for the given payload, using
    the real vendor private key (test/dev-machine only)."""
    private_key = _load_private_key()
    signature = private_key.sign(lm._canonical_payload_bytes(payload))
    return {"payload": payload, "signature": base64.b64encode(signature).decode()}


def make_payload(customer_id="TESTCUST", hw_id="AAAAAAAAAAAAAAAA", expiry=None,
                  license_type="perpetual", license_version=1, product="FPAI"):
    return {
        "product": product,
        "customer_id": customer_id,
        "hw_id": hw_id,
        "issued_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "expiry": expiry,
        "license_type": license_type,
        "license_version": license_version,
    }


def encode_response(response: dict) -> str:
    return lm.RESPONSE_PREFIX + base64.b64encode(json.dumps(response).encode()).decode()


@unittest.skipUnless(_HAS_VENDOR_KEY, "vendor private key not present on this machine")
class TestSignatureVerification(unittest.TestCase):
    def test_valid_signed_license_verifies(self):
        payload = make_payload()
        response = sign_payload(payload)
        ok, err, verified_payload = lm.verify_response(response)
        self.assertTrue(ok, err)
        self.assertEqual(verified_payload, payload)

    def test_tampered_payload_fails(self):
        payload = make_payload(customer_id="TESTCUST")
        response = sign_payload(payload)
        # Tamper with the signed payload after signing — must invalidate the signature.
        response["payload"]["customer_id"] = "HACKED"
        ok, err, _ = lm.verify_response(response)
        self.assertFalse(ok)
        self.assertIn("tampered", err.lower())

    def test_tampered_hw_id_fails(self):
        payload = make_payload(hw_id="AAAAAAAAAAAAAAAA")
        response = sign_payload(payload)
        response["payload"]["hw_id"] = "BBBBBBBBBBBBBBBB"
        ok, err, _ = lm.verify_response(response)
        self.assertFalse(ok)

    def test_wrong_signature_fails(self):
        payload = make_payload()
        response = sign_payload(payload)
        # Flip the signature entirely — simulates an invalid/forged signature.
        bad_sig = bytearray(base64.b64decode(response["signature"]))
        bad_sig[0] ^= 0xFF
        response["signature"] = base64.b64encode(bytes(bad_sig)).decode()
        ok, err, _ = lm.verify_response(response)
        self.assertFalse(ok)
        self.assertIn("signature", err.lower())

    def test_wrong_product_rejected(self):
        payload = make_payload(product="OTHER-PRODUCT")
        response = sign_payload(payload)
        ok, err, _ = lm.verify_response(response)
        self.assertFalse(ok)
        self.assertIn("product", err.lower())


class TestMalformedResponses(unittest.TestCase):
    def test_not_a_dict(self):
        ok, err, payload = lm.verify_response("not-a-dict")
        self.assertFalse(ok)
        self.assertIsNone(payload)

    def test_missing_signature(self):
        ok, err, _ = lm.verify_response({"payload": make_payload()})
        self.assertFalse(ok)

    def test_missing_payload_fields(self):
        response = {"payload": {"product": "FPAI"}, "signature": "AAAA"}
        ok, err, _ = lm.verify_response(response)
        self.assertFalse(ok)
        self.assertIn("missing fields", err.lower())

    def test_bad_signature_encoding(self):
        response = {"payload": make_payload(), "signature": "not-valid-base64!!!"}
        ok, err, _ = lm.verify_response(response)
        self.assertFalse(ok)

    def test_import_garbage_blob(self):
        _isolate(self)
        result = lm.import_license_response("this is not a license blob at all")
        self.assertFalse(result["success"])

    def test_import_empty_blob(self):
        _isolate(self)
        result = lm.import_license_response("")
        self.assertFalse(result["success"])


class TestHardwareId(unittest.TestCase):
    def test_hw_id_deterministic_for_same_guid(self):
        with _patch(lm, "_read_machine_guid", lambda: "SOME-FAKE-GUID"):
            id1 = lm.get_hw_id()
            id2 = lm.get_hw_id()
        self.assertEqual(id1, id2)
        self.assertEqual(len(id1), 16)

    def test_machine_guid_unavailable_raises(self):
        def _boom():
            raise lm.HardwareIdError("registry key not found")
        with _patch(lm, "_read_machine_guid", _boom):
            with self.assertRaises(lm.HardwareIdError):
                lm.get_hw_id()

    def test_no_computername_fallback_exists(self):
        """The weak COMPUTERNAME fallback must be gone — failure must raise,
        never silently produce an ID from something other than MachineGuid."""
        def _boom():
            raise lm.HardwareIdError("boom")
        with _patch(lm, "_read_machine_guid", _boom):
            with self.assertRaises(lm.HardwareIdError):
                lm.get_hw_id()

    def test_get_status_reports_hw_id_error_cleanly(self):
        _isolate(self)

        def _boom():
            raise lm.HardwareIdError("Could not read Windows MachineGuid.")
        with _patch(lm, "_read_machine_guid", _boom):
            status = lm.get_status()
        self.assertEqual(status["status"], "hw_id_error")
        self.assertIn("error", status)


@unittest.skipUnless(_HAS_VENDOR_KEY, "vendor private key not present on this machine")
class TestActivationFlow(unittest.TestCase):
    def setUp(self):
        _isolate(self)

    def test_full_activation_flow_succeeds(self):
        with _patch(lm, "get_hw_id", lambda: "CCCCCCCCCCCCCCCC"):
            req = lm.generate_activation_request("TESTCUST")
            self.assertTrue(req["ok"], req)

            payload = make_payload(customer_id="TESTCUST", hw_id="CCCCCCCCCCCCCCCC")
            response = sign_payload(payload)
            blob = encode_response(response)

            result = lm.import_license_response(blob)
            self.assertTrue(result["success"], result)

            status = lm.get_status()
            self.assertEqual(status["status"], "licensed")
            self.assertEqual(status["customer_id"], "TESTCUST")

    def test_wrong_hw_id_rejected_at_import(self):
        with _patch(lm, "get_hw_id", lambda: "CCCCCCCCCCCCCCCC"):
            lm.generate_activation_request("TESTCUST")

        # A license was signed for a DIFFERENT machine.
        payload = make_payload(customer_id="TESTCUST", hw_id="DIFFERENT0000000")
        blob = encode_response(sign_payload(payload))

        with _patch(lm, "get_hw_id", lambda: "CCCCCCCCCCCCCCCC"):
            result = lm.import_license_response(blob)
        self.assertFalse(result["success"])
        self.assertIn("machine", result["error"].lower())

    def test_wrong_customer_id_rejected_at_import(self):
        with _patch(lm, "get_hw_id", lambda: "EEEEEEEEEEEEEEEE"):
            lm.generate_activation_request("REQUESTED-AS-THIS")

            payload = make_payload(customer_id="BUT-SIGNED-AS-THIS", hw_id="EEEEEEEEEEEEEEEE")
            blob = encode_response(sign_payload(payload))

            result = lm.import_license_response(blob)
        self.assertFalse(result["success"])
        self.assertIn("wrong customer", result["error"].lower())

    def test_expired_license_rejected(self):
        yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
        with _patch(lm, "get_hw_id", lambda: "FFFFFFFFFFFFFFFF"):
            lm.generate_activation_request("TESTCUST")
            payload = make_payload(customer_id="TESTCUST", hw_id="FFFFFFFFFFFFFFFF",
                                    expiry=yesterday, license_type="subscription")
            blob = encode_response(sign_payload(payload))
            result = lm.import_license_response(blob)
        self.assertFalse(result["success"])
        self.assertIn("expired", result["error"].lower())

    def test_status_reflects_expiry_after_activation(self):
        """A subscription license that expires AFTER activation must flip
        get_status() to 'expired' once the expiry date passes."""
        past_expiry = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
        with _patch(lm, "get_hw_id", lambda: "12345678ABCDEFAB"):
            # Bypass import's own expiry check by writing state directly,
            # simulating a license that was valid at activation time but
            # whose expiry has since passed.
            payload = make_payload(customer_id="TESTCUST", hw_id="12345678ABCDEFAB",
                                    expiry=past_expiry, license_type="subscription")
            response = sign_payload(payload)
            lm._write_state({"type": "licensed", "response": response})
            status = lm.get_status()
        self.assertEqual(status["status"], "expired")

    def test_status_invalid_when_license_moved_to_new_hardware(self):
        with _patch(lm, "get_hw_id", lambda: "ORIGINAL00000000"):
            lm.generate_activation_request("TESTCUST")
            payload = make_payload(customer_id="TESTCUST", hw_id="ORIGINAL00000000")
            blob = encode_response(sign_payload(payload))
            self.assertTrue(lm.import_license_response(blob)["success"])

        # Simulate the license.dat file being copied to different hardware.
        with _patch(lm, "get_hw_id", lambda: "DIFFERENTHARDWAR"):
            status = lm.get_status()
        self.assertEqual(status["status"], "invalid")

    def test_alsiwan_customer_scope(self):
        with _patch(lm, "get_hw_id", lambda: "ALSIWANHWID00000"):
            lm.generate_activation_request("ALSIWAN")
            payload = make_payload(customer_id="ALSIWAN", hw_id="ALSIWANHWID00000")
            blob = encode_response(sign_payload(payload))
            result = lm.import_license_response(blob)
            status = lm.get_status()
        self.assertTrue(result["success"])
        self.assertEqual(status["customer_id"], "ALSIWAN")

    def test_daralsalam_license_cannot_activate_alsiwan_deployment(self):
        # Al Siwan deployment requests activation as ALSIWAN...
        with _patch(lm, "get_hw_id", lambda: "SHARED0HWID00000"):
            lm.generate_activation_request("ALSIWAN")

            # ...but a Dar Al Salam license (different customer_id) is pasted in.
            daralsalam_payload = make_payload(customer_id="DARALSALAM", hw_id="SHARED0HWID00000")
            blob = encode_response(sign_payload(daralsalam_payload))
            result = lm.import_license_response(blob)
        self.assertFalse(result["success"])
        self.assertIn("wrong customer", result["error"].lower())

    def test_alsiwan_license_cannot_activate_daralsalam_deployment(self):
        with _patch(lm, "get_hw_id", lambda: "SHARED1HWID00000"):
            lm.generate_activation_request("DARALSALAM")

            alsiwan_payload = make_payload(customer_id="ALSIWAN", hw_id="SHARED1HWID00000")
            blob = encode_response(sign_payload(alsiwan_payload))
            result = lm.import_license_response(blob)
        self.assertFalse(result["success"])
        self.assertIn("wrong customer", result["error"].lower())

    def test_developer_machine_bypasses_everything(self):
        dev_hw = next(iter(lm._DEVELOPER_HW_IDS))
        with _patch(lm, "get_hw_id", lambda: dev_hw):
            status = lm.get_status()
        self.assertEqual(status["status"], "developer_unlimited")

    def test_is_active_true_for_trial(self):
        with _patch(lm, "get_hw_id", lambda: "TRIALHWID0000000"):
            self.assertTrue(lm.is_active())

    def test_is_active_false_when_expired(self):
        with _patch(lm, "get_hw_id", lambda: "EXPIREDHWID00000"):
            state = lm._ensure_state()
            state["start"] = (datetime.date.today() - datetime.timedelta(days=30)).isoformat()
            lm._write_state(state)
            self.assertFalse(lm.is_active())


# ── Test isolation helpers ──────────────────────────────────────────────────

def _isolate(testcase: unittest.TestCase) -> None:
    """Point license.dat storage at a throwaway temp file for the duration
    of a test, guaranteeing the real %APPDATA%\\FinPilot AI\\license.dat
    (Dar Al Salam's real license state) is never read or written."""
    tmp_dir = tempfile.mkdtemp(prefix="fpai_license_test_")
    tmp_path = os.path.join(tmp_dir, "license.dat")
    orig = lm._DAT
    lm._DAT = tmp_path

    def _restore():
        lm._DAT = orig
    testcase.addCleanup(_restore)


class _patch:
    """Minimal context-manager monkeypatch (avoids requiring unittest.mock
    for such a small, local need)."""
    def __init__(self, module, name, value):
        self.module, self.name, self.value = module, name, value

    def __enter__(self):
        self.orig = getattr(self.module, self.name)
        setattr(self.module, self.name, self.value)

    def __exit__(self, *exc):
        setattr(self.module, self.name, self.orig)


if __name__ == "__main__":
    unittest.main(verbosity=2)
