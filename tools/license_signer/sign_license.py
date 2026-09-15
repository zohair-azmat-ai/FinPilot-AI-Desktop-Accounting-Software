"""
Vendor-only: sign a customer's activation request into a license response.

This tool requires keys/vendor_private_key.pem (see keygen.py). It is never
shipped with the customer application and must never be run on a customer
machine.

Usage:
    python sign_license.py --request "FPAI-REQ-1-...."  --type perpetual
    python sign_license.py --request-file request.txt --type subscription --expiry 2027-09-15
    python sign_license.py --request-file request.txt --out response.txt

The customer pastes the printed "FPAI-LIC-1-..." blob into their Activation
page. No network call is made anywhere in this flow.
"""
import argparse
import base64
import datetime
import json
import os
import sys

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey  # noqa: F401 (type hint only)
from cryptography.hazmat.primitives import serialization

KEYS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "keys")
PRIVATE_KEY_PATH = os.path.join(KEYS_DIR, "vendor_private_key.pem")

PRODUCT_ID = "FPAI"
REQUEST_PREFIX = "FPAI-REQ-1-"
RESPONSE_PREFIX = "FPAI-LIC-1-"


def _load_private_key():
    if not os.path.exists(PRIVATE_KEY_PATH):
        print(f"ERROR: private key not found at {PRIVATE_KEY_PATH}")
        print("Run keygen.py first.")
        sys.exit(1)
    with open(PRIVATE_KEY_PATH, "rb") as f:
        return serialization.load_pem_private_key(f.read(), password=None)


def _decode_request(blob: str) -> dict:
    blob = blob.strip()
    if blob.startswith(REQUEST_PREFIX):
        blob = blob[len(REQUEST_PREFIX):]
    raw = base64.b64decode(blob)
    return json.loads(raw.decode())


def _canonical_payload_bytes(payload: dict) -> bytes:
    """Must exactly match backend/license_manager.py's canonicalization."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--request", help="Activation request blob, pasted directly")
    ap.add_argument("--request-file", help="Path to a file containing the activation request blob")
    ap.add_argument("--type", choices=["perpetual", "subscription"], default="perpetual",
                     help="License type (default: perpetual)")
    ap.add_argument("--expiry", help="YYYY-MM-DD — required when --type subscription")
    ap.add_argument("--license-version", type=int, default=1)
    ap.add_argument("--out", help="Also write the response blob to this file")
    ap.add_argument("--yes", action="store_true", help="Skip the confirmation prompt")
    args = ap.parse_args()

    if not args.request and not args.request_file:
        ap.error("Provide --request or --request-file")

    blob = args.request
    if args.request_file:
        with open(args.request_file, encoding="utf-8") as f:
            blob = f.read()

    try:
        req = _decode_request(blob)
    except Exception as e:
        print(f"ERROR: could not parse activation request: {e}")
        sys.exit(1)

    print("Activation request contents:")
    print(json.dumps(req, indent=2))
    print()

    if req.get("product") != PRODUCT_ID:
        print(f"ERROR: unexpected product '{req.get('product')}' — refusing to sign.")
        sys.exit(1)
    if not req.get("customer_id") or not req.get("hw_id"):
        print("ERROR: request is missing customer_id or hw_id — refusing to sign.")
        sys.exit(1)

    if not args.yes:
        confirm = input(
            f"Sign a {args.type} license for customer_id='{req['customer_id']}' "
            f"hw_id='{req['hw_id']}'? [y/N] "
        )
        if confirm.strip().lower() != "y":
            print("Aborted.")
            sys.exit(1)

    expiry = None
    if args.type == "subscription":
        if not args.expiry:
            print("ERROR: --expiry YYYY-MM-DD is required for subscription licenses.")
            sys.exit(1)
        try:
            datetime.date.fromisoformat(args.expiry)
        except ValueError:
            print("ERROR: --expiry must be in YYYY-MM-DD format.")
            sys.exit(1)
        expiry = args.expiry

    payload = {
        "product": PRODUCT_ID,
        "customer_id": req["customer_id"],
        "hw_id": req["hw_id"],
        "issued_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "expiry": expiry,
        "license_type": args.type,
        "license_version": args.license_version,
    }

    private_key = _load_private_key()
    signature = private_key.sign(_canonical_payload_bytes(payload))
    response = {"payload": payload, "signature": base64.b64encode(signature).decode()}

    out_blob = RESPONSE_PREFIX + base64.b64encode(json.dumps(response).encode()).decode()

    print("\nSigned license response — send this back to the customer:\n")
    print(out_blob)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(out_blob)
        print(f"\nAlso written to {args.out}")


if __name__ == "__main__":
    main()
