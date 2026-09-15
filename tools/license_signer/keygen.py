"""
Vendor-only: generate the Ed25519 signing keypair.

Run this ONCE per vendor signing identity:
    python keygen.py

Output:
    keys/vendor_private_key.pem  — NEVER commit this. NEVER copy it into
                                    backend/, frontend/, or the Tauri build.
                                    This is the only file that can sign
                                    licenses.
    (printed to stdout)          — the public key, base64-encoded. Copy this
                                    into backend/license_manager.py's
                                    _PUBLIC_KEY_B64 constant. It is safe to
                                    ship this value to every customer — it
                                    can only verify signatures, never create
                                    them.
"""
import base64
import os
import sys

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

KEYS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "keys")
PRIVATE_KEY_PATH = os.path.join(KEYS_DIR, "vendor_private_key.pem")


def main() -> None:
    os.makedirs(KEYS_DIR, exist_ok=True)

    if os.path.exists(PRIVATE_KEY_PATH):
        print(f"A private key already exists at:\n  {PRIVATE_KEY_PATH}")
        print("\nRefusing to overwrite it. Generating a new key would invalidate")
        print("every license already signed with the existing one. Delete the")
        print("file manually first if you are certain you want a new identity.")
        sys.exit(1)

    private_key = Ed25519PrivateKey.generate()

    pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    with open(PRIVATE_KEY_PATH, "wb") as f:
        f.write(pem)

    public_key = private_key.public_key()
    raw_pub = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    pub_b64 = base64.b64encode(raw_pub).decode()

    print(f"Private key written to:\n  {PRIVATE_KEY_PATH}")
    print("\nThis file is gitignored. Keep it only on this machine (or move it")
    print("to a password manager / secure vault). It must NEVER be copied into")
    print("the customer application, the Tauri build, or any git commit.\n")
    print("Public key — paste this into backend/license_manager.py's")
    print("_PUBLIC_KEY_B64 constant:\n")
    print(pub_b64)


if __name__ == "__main__":
    main()
