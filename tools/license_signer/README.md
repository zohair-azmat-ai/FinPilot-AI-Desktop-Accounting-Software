# FinPilot AI — Vendor License Signer

This tool is **vendor-only**. It must never be copied into `backend/`,
`frontend/`, the Tauri build, or any customer machine. It holds (or creates)
the Ed25519 **private** signing key — the one piece of secret material the
entire licensing system depends on.

## One-time setup

```
pip install cryptography
python keygen.py
```

This writes `keys/vendor_private_key.pem` (gitignored) and prints a public
key. Paste that public key into `backend/license_manager.py`'s
`_PUBLIC_KEY_B64` constant — that's the only thing that ever goes into the
customer application.

Run `keygen.py` once per vendor identity. If you ever need to rotate keys,
every previously issued license becomes unverifiable against the new public
key — plan accordingly (e.g. only if the private key were ever compromised).

## Signing a customer's activation request

1. Customer opens the Activation page in FinPilot AI, enters their
   Customer/Deployment ID (e.g. `ALSIWAN`), and copies the generated
   `FPAI-REQ-1-...` request blob to you.
2. Run:
   ```
   python sign_license.py --request "FPAI-REQ-1-...." --type perpetual
   ```
   or, for a time-limited license:
   ```
   python sign_license.py --request-file request.txt --type subscription --expiry 2027-09-15
   ```
3. Confirm the printed customer_id / hw_id match what you expect, confirm
   the prompt, and send the printed `FPAI-LIC-1-...` response blob back to
   the customer.
4. The customer pastes it into the Activation page. Verification happens
   entirely offline on their machine using only the public key.

No network call is made anywhere in this flow, by either side.

## Security notes

- `keys/` is gitignored at the repository root — never force-add it.
- The private key file is unencrypted PEM on disk; treat this machine/folder
  as sensitive, or move the `.pem` file to a password manager between uses.
- Each customer gets a distinct `customer_id` embedded in their signed
  license (e.g. `DARALSALAM`, `ALSIWAN`). A license signed for one
  customer_id will be refused by an installation that requested activation
  under a different customer_id — this is enforced locally in
  `backend/license_manager.py`, not by this tool.
