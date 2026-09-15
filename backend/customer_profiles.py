"""
Customer-profile seed definitions for first-run company initialization.

A "customer profile" is a non-secret, source-controlled preset used ONLY to
seed a brand-new, EMPTY local database with a specific customer's public
company information (name/email/phone/address/invoice template) instead of
the generic blank "My Company" row that a fresh install gets today.

This never touches an existing database (it only runs the very first time
Company is queried and no row exists yet — see routes/company.py) and never
copies, reads, or references any other installation's data in any way.

The active profile is selected via the FINPILOT_CUSTOMER_PROFILE environment
variable. Unset (the default) -> no profile -> existing blank "My Company"
behavior, completely unchanged. This is intended to be set once, per
customer-specific build/deployment environment (a future packaging step) —
it must never be set for the shared Dar Al Salam production install.
"""
import os

CUSTOMER_PROFILES: dict[str, dict] = {
    "alsiwan": {
        "customer_id": "ALSIWAN",
        "name": "AL SIWAN MACHINERY AND ELECTRICA EQUIPMENT TRADING FZE LLC",
        "email": "alsiwan2026@gmail.com",
        "phone": "+971 545654826",
        "address": "Naimiya 1 Hafiz Ibrahim Street, Dubai, UAE, United Arab Emirates",
        "invoice_template": "alsiwan",
    },
}

_PROFILE_ENV_VAR = "FINPILOT_CUSTOMER_PROFILE"


def get_active_profile_key() -> str:
    """Return the lowercased active profile key, or '' if none is set."""
    return os.environ.get(_PROFILE_ENV_VAR, "").strip().lower()


def get_active_profile() -> dict | None:
    """Return the active customer profile dict, or None if no profile is
    configured — the default, existing (Dar Al Salam / generic) behavior."""
    key = get_active_profile_key()
    if not key:
        return None
    return CUSTOMER_PROFILES.get(key)
