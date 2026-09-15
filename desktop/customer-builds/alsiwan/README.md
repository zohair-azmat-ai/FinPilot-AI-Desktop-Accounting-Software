# Al Siwan customer build configuration

This folder is a **staging area only** — nothing here is picked up
automatically by `build.ps1` or `cargo build`/`tauri build`. It exists so the
Al Siwan customer profile never becomes part of the default (Dar Al Salam)
build by accident.

## What this is

`customer_profile.txt` contains the single word `alsiwan`. When copied into
`desktop/src-tauri/resources/customer_profile.txt` *before* building, the
Rust launcher (`desktop/src-tauri/src/main.rs`) reads it at app startup and
sets `FINPILOT_CUSTOMER_PROFILE=alsiwan` when it spawns the Python backend —
which makes `backend/customer_profiles.py` seed a brand-new, empty database
with Al Siwan's company info (name, email, phone, address,
`invoice_template="alsiwan"`) instead of the generic blank "My Company".

This is a **build-time packaging decision**, not a runtime environment
variable the customer has to set. If the file is absent (the default state
of `desktop/src-tauri/resources/`), nothing changes — that's exactly how the
Dar Al Salam build already works today.

## How to build the Al Siwan installer (when you're ready — NOT done yet)

1. Copy this file into the live resources folder:
   ```
   Copy-Item desktop\customer-builds\alsiwan\customer_profile.txt `
             desktop\src-tauri\resources\customer_profile.txt
   ```
2. Run the normal build: `.\build.ps1` (or `cd desktop && npx tauri build`
   if you only need to re-run the Tauri packaging step).
3. **Immediately remove the staged file afterward** so the next routine
   Dar Al Salam build/deploy doesn't accidentally inherit it:
   ```
   Remove-Item desktop\src-tauri\resources\customer_profile.txt
   ```
4. The resulting installer in
   `desktop\src-tauri\target\release\bundle\` is the Al Siwan-specific
   build. Install it only on Al Siwan's own machine — never on this
   Dar Al Salam PC.

## Why not just set a Windows environment variable on the customer's PC?

Because that depends on the customer's machine state persisting correctly
forever (survives reinstalls, other software, user error, etc.) and requires
manual setup instructions for them. Baking the profile into the installer
itself means it works correctly the moment they double-click the installer,
with zero configuration steps required after installation.
