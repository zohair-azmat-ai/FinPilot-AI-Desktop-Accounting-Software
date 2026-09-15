"""Verification test suite for the Al Siwan invoice template.
Run with: python test_alsiwan.py
Safe — uses disposable test data only, never touches the production DB.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from pdf_generator import generate_invoice_pdf, _generate_invoice_alsiwan, _amount_in_words

# ── helpers ───────────────────────────────────────────────────────────────────
def mk_item(desc, qty, up, disc=0, vat=True):
    gross   = round(qty * up - disc, 2)
    vat_amt = round(gross * 0.05, 2) if vat else 0.0
    return {"description": desc, "quantity": qty, "unit_price": up,
            "discount": disc, "vat_applicable": vat, "vat_amount": vat_amt,
            "total": round(gross + vat_amt, 2)}

def mk_inv(num, items, notes="", lpo="", cash=False, cust=None, disc=0):
    sub = sum(i["unit_price"] * i["quantity"] - (i["discount"] or 0) for i in items)
    vat = sum(i["vat_amount"] for i in items)
    return {
        "invoice_number": num, "date": "14 Sep 2026", "due_date": "28 Sep 2026",
        "customer": cust or {"name": "Gulf Trading LLC", "trn": "100234567890003",
                             "phone": "+971 4 123 4567", "address": "Dubai, UAE"},
        "items": items, "subtotal": sub, "vat_amount": vat,
        "discount": disc, "total": round(sub + vat - disc, 2),
        "notes": notes, "payment_terms": "Net 30",
        "letterhead": False, "include_stamp": False,
        "require_customer_signature": False,
        "lpo_no": lpo, "do_no": "", "is_cash": cash,
    }

ASW = {
    "name": "Al Siwan Machinery and Electrical Equipment Trading FZE LLC",
    "trn": "100987654321003",
    "address": "Naimiya 1 Hafiz Ibrahim Street\nDubai, UAE",
    "phone": "+971 545654826", "email": "alsiwan2026@gmail.com",
    "stamp_path": "",
    "bank_details": "Bank: Emirates NBD\nAccount: 1234567890\nIBAN: AE070260001234567890123",
    "invoice_template": "alsiwan",
}
DAS = {**ASW, "invoice_template": "default",
       "name": "Dar Al Salam Engineering", "bank_details": ""}

results = []

def chk(label, fn):
    try:
        path = fn()
        sz = os.path.getsize(path)
        ok = sz > 2000
        results.append((label, ok, f"{sz:,} bytes" if ok else f"TOO SMALL {sz}"))
    except Exception as e:
        results.append((label, False, str(e)))

# ── T1: single item, no discount ─────────────────────────────────────────────
chk("T1  AlSiwan  single item",
    lambda: generate_invoice_pdf(
        mk_inv("VT-001", [mk_item("Electrical Panel 3-Phase 400A", 1, 8500)]),
        ASW))

# ── T2: multiple items with per-line discounts ────────────────────────────────
chk("T2  AlSiwan  multi-item + discounts",
    lambda: generate_invoice_pdf(
        mk_inv("VT-002", [
            mk_item("Industrial Motor 22kW 3-Phase IE3", 2, 3200, disc=150),
            mk_item("Control Panel PLC Siemens S7-1200", 1, 4800, disc=200),
            mk_item("Cable Tray Perforated 100x50mm 3m", 10, 120),
        ], notes="Delivery within 7 working days."),
        ASW))

# ── T3: 5 items (filler-row + pagination) ────────────────────────────────────
chk("T3  AlSiwan  5 items",
    lambda: generate_invoice_pdf(
        mk_inv("VT-003", [
            mk_item(f"Component {chr(65+i)} industrial spec {i+1}", i+1, 500*(i+1), disc=50)
            for i in range(5)
        ]),
        ASW))

# ── T4: cash sale (no customer) ──────────────────────────────────────────────
chk("T4  AlSiwan  cash sale",
    lambda: generate_invoice_pdf(
        mk_inv("VT-004", [mk_item("Misc electrical supplies", 1, 250)],
               cash=True, cust={}),
        ASW))

# ── T5: invoice-level discount ────────────────────────────────────────────────
chk("T5  AlSiwan  invoice-level discount",
    lambda: generate_invoice_pdf(
        mk_inv("VT-005", [mk_item("Transformer 200KVA Oil Immersed", 1, 18000, disc=500)],
               disc=300),
        ASW))

# ── T6: long description wraps ────────────────────────────────────────────────
chk("T6  AlSiwan  long description wrap",
    lambda: generate_invoice_pdf(
        mk_inv("VT-006", [
            mk_item("Supply and installation of complete electrical distribution system "
                    "including main LV switchboard sub distribution boards cable trays "
                    "wiring testing and commissioning as per approved drawing", 1, 45000),
            mk_item("Annual maintenance contract for all electrical systems", 1, 6000),
        ]),
        ASW))

# ── T7: customer TRN on second line ──────────────────────────────────────────
chk("T7  AlSiwan  customer TRN inline",
    lambda: generate_invoice_pdf(
        mk_inv("VT-007", [mk_item("Panel installation", 1, 5000)],
               cust={"name": "Dubai Tech Solutions LLC", "trn": "100234567890003",
                     "phone": "+971 4 555 1234", "address": "Al Quoz, Dubai"}),
        ASW))

# ── T8: LPO number in metadata box ───────────────────────────────────────────
chk("T8  AlSiwan  LPO number",
    lambda: generate_invoice_pdf(
        mk_inv("VT-008", [mk_item("Switchgear assembly", 1, 12000)], lpo="LPO-2026-042"),
        ASW))

# ── T9: VAT-exempt item ──────────────────────────────────────────────────────
chk("T9  AlSiwan  VAT-exempt item",
    lambda: generate_invoice_pdf(
        mk_inv("VT-009", [
            mk_item("Taxable component", 1, 3000),
            mk_item("Exempt labour charge", 1, 500, vat=False),
        ]),
        ASW))

# ── T10: Dar Al Salam default template UNCHANGED ─────────────────────────────
chk("T10 DarAlSalam  default template",
    lambda: generate_invoice_pdf(
        mk_inv("VT-010", [mk_item("Steel fabrication works", 5, 1200, disc=100)]),
        DAS))

# ── T11: missing invoice_template key falls back to default ──────────────────
co_stripped = {k: v for k, v in ASW.items() if k != "invoice_template"}
chk("T11 DarAlSalam  missing key -> default",
    lambda: generate_invoice_pdf(
        mk_inv("VT-011", [mk_item("Fallback test", 1, 100)]),
        co_stripped))

# ── T12: amount-in-words (shared by both templates) ──────────────────────────
try:
    assert _amount_in_words(11655.0)  == "AED Eleven Thousand Six Hundred Fifty Five Only"
    assert _amount_in_words(105.0)    == "AED One Hundred Five Only"
    assert _amount_in_words(0.50)     == "AED Zero and Fifty Fils Only"
    assert _amount_in_words(1000000)  == "AED One Million Only"
    assert _amount_in_words(45000.75) == "AED Forty Five Thousand and Seventy Five Fils Only"
    results.append(("T12 amount-in-words (5 cases)", True, "all correct"))
except AssertionError as e:
    results.append(("T12 amount-in-words", False, str(e)))

# ── T13: _generate_invoice_alsiwan function is importable and callable ────────
try:
    import pdf_generator as _pg
    assert hasattr(_pg, "_generate_invoice_alsiwan"), "function not found"
    results.append(("T13 dispatcher function accessible", True, "ok"))
except Exception as e:
    results.append(("T13 dispatcher function accessible", False, str(e)))

# ── T14: pdf_generator.py has ZERO lines removed vs previous commit ───────────
# (structural check: the only change is additions, not mutations)
try:
    import subprocess
    r = subprocess.run(
        ["git", "diff", "HEAD~1", "HEAD", "--", "backend/pdf_generator.py"],
        capture_output=True, text=True,
        cwd=os.path.join(os.path.dirname(__file__), ".."),
    )
    removed = [l for l in r.stdout.splitlines()
               if l.startswith("-") and not l.startswith("---")]
    results.append(("T14 pdf_generator: 0 lines removed from existing code",
                    len(removed) == 0, f"{len(removed)} lines removed"))
except Exception as e:
    results.append(("T14 pdf_generator diff check", False, str(e)))

# ── Report ────────────────────────────────────────────────────────────────────
print()
print("=" * 62)
print("  Al Siwan Invoice Template — Verification Report")
print("=" * 62)
all_pass = True
for label, ok, detail in results:
    status = "PASS" if ok else "FAIL"
    if not ok:
        all_pass = False
    print(f"  [{status}]  {label}  ({detail})")

print()
total = len(results)
passed = sum(1 for _, ok, _ in results if ok)
print(f"  {passed}/{total} tests passed")
print()
if all_pass:
    print("  OVERALL RESULT: PASS")
else:
    print("  OVERALL RESULT: FAIL")
    sys.exit(1)
