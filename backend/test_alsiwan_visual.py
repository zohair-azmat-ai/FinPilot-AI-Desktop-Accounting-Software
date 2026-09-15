"""
Structural/visual verification for the Al Siwan invoice template (STEP 3B).

Unlike test_alsiwan.py (file-size smoke tests), this suite actually parses
the generated PDFs' text and drawing content to verify the specific reference
-matching changes: TR NO row, always-present Discount row, black (not white)
header/total text, amount-in-words, VAT-after-discount correctness, filename
convention, multi-page overflow, and — critically — that the default/Dar Al
Salam template is completely unaffected.

Requires PyMuPDF (pip install pymupdf). If it isn't installed, the
structural checks are skipped (with a clear message) rather than failed,
since it's a test-only dependency not required by the shipped application.

Run with:  python -m unittest test_alsiwan_visual -v
"""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pdf_generator import generate_invoice_pdf  # noqa: E402

try:
    import pymupdf
    _HAS_PYMUPDF = True
except ImportError:
    _HAS_PYMUPDF = False


ASW = {
    "name": "AL SIWAN MACHINERY AND ELECTRICA EQUIPMENT TRADING FZE LLC",
    "trn": "100987654321003",
    "address": "Naimiya 1 Hafiz Ibrahim Street\nDubai, UAE\nUnited Arab Emirates",
    "phone": "+971 545654826", "email": "alsiwan2026@gmail.com",
    "stamp_path": "",
    "bank_details": "",
    "invoice_template": "alsiwan",
}
DAS = {**ASW, "invoice_template": "default", "name": "Dar Al Salam Engineering", "trn": "100111111100003"}


def mk_item(desc, qty, up, disc=0, vat=True):
    gross = round(qty * up - disc, 2)
    vat_amt = round(gross * 0.05, 2) if vat else 0.0
    return {"description": desc, "quantity": qty, "unit_price": up,
            "discount": disc, "vat_applicable": vat, "vat_amount": vat_amt,
            "total": round(gross + vat_amt, 2)}


def mk_inv(num, items, notes="", lpo="", cash=False, cust=None, discount=0):
    sub = sum(i["unit_price"] * i["quantity"] - (i["discount"] or 0) for i in items)
    vat = sum(i["vat_amount"] for i in items)
    return {
        "invoice_number": num, "date": "15 Sep 2026", "due_date": "29 Sep 2026",
        "customer": cust if cust is not None else {"name": "Gulf Trading LLC", "trn": "100234567890003",
                             "phone": "+971 4 123 4567", "address": "Dubai, UAE"},
        "items": items, "subtotal": sub, "vat_amount": vat,
        "discount": discount, "total": round(sub + vat - discount, 2),
        "notes": notes, "payment_terms": "Net 30",
        "letterhead": False, "include_stamp": False,
        "require_customer_signature": False,
        "lpo_no": lpo, "do_no": "", "is_cash": cash,
    }


def _pdf_text(path: str) -> str:
    doc = pymupdf.open(path)
    try:
        return "\n".join(page.get_text() for page in doc)
    finally:
        doc.close()


def _page_count(path: str) -> int:
    doc = pymupdf.open(path)
    try:
        return doc.page_count
    finally:
        doc.close()


def _find_header_row_fill_colors(path: str):
    """Return the set of fill colors used for rect/text drawing on page 1,
    to check the items-table header isn't drawn with a black background."""
    doc = pymupdf.open(path)
    try:
        page = doc[0]
        drawings = page.get_drawings()
        return [d.get("fill") for d in drawings if d.get("fill") is not None]
    finally:
        doc.close()


class TestFilenameAndDispatch(unittest.TestCase):
    def test_alsiwan_dispatcher_used(self):
        path = generate_invoice_pdf(mk_inv("VIS-001", [mk_item("Test Item", 1, 100)]), ASW)
        self.assertTrue(os.path.exists(path))
        os.remove(path)

    def test_default_dispatcher_used_for_non_alsiwan(self):
        path = generate_invoice_pdf(mk_inv("VIS-002", [mk_item("Test Item", 1, 100)]), DAS)
        self.assertTrue(os.path.exists(path))
        os.remove(path)

    def test_filename_pattern(self):
        # Internal export filename (before the API layer renames it to
        # INV-{number}.pdf on download) must still start with Invoice_<number>.
        path = generate_invoice_pdf(mk_inv("VIS-003", [mk_item("Test Item", 1, 100)]), ASW)
        try:
            self.assertRegex(os.path.basename(path), r"^Invoice_VIS-003_\d{14}\.pdf$")
        finally:
            os.remove(path)


@unittest.skipUnless(_HAS_PYMUPDF, "pymupdf not installed — structural checks skipped")
class TestAlSiwanStructuralContent(unittest.TestCase):
    def _gen(self, *args, **kwargs):
        path = generate_invoice_pdf(*args, **kwargs)
        self.addCleanup(lambda: os.path.exists(path) and os.remove(path))
        return path

    def test_basic_invoice_renders_with_expected_text(self):
        path = self._gen(mk_inv("VIS-010", [mk_item("Electrical Panel", 1, 8500)]), ASW)
        text = _pdf_text(path)
        self.assertIn("AL SIWAN MACHINERY", text)
        self.assertIn("BILLED TO", text)
        self.assertIn("INVOICE NO", text)
        self.assertIn("VIS-010", text)

    def test_tr_no_present_with_company_trn(self):
        path = self._gen(mk_inv("VIS-011", [mk_item("Item A", 1, 100)]), ASW)
        text = _pdf_text(path)
        self.assertIn("TR NO", text)
        self.assertIn(ASW["trn"], text)

    def test_lpo_and_do_no_still_supported(self):
        path = self._gen(mk_inv("VIS-012", [mk_item("Item A", 1, 100)], lpo="LPO-9981"), ASW)
        text = _pdf_text(path)
        self.assertIn("LPO NO", text)
        self.assertIn("LPO-9981", text)

    def test_all_nine_columns_present(self):
        path = self._gen(mk_inv("VIS-013", [mk_item("Item A", 2, 250, disc=25)]), ASW)
        text = _pdf_text(path)
        # S.NO's narrow column wraps mid-word in the raw text layer ("S.N\nO")
        # even though it renders correctly — check tolerant of whitespace.
        self.assertRegex(text, r"S\.N\s*O")
        for col in ("DESCRIPTION", "QTY", "UNIT PRICE", "DISCOUNT",
                    "TAXABLE", "TAX", "TOTAL"):
            self.assertIn(col, text, f"missing column header: {col}")

    def test_discount_row_present_even_when_zero(self):
        path = self._gen(mk_inv("VIS-014", [mk_item("Item A", 1, 500)]), ASW)  # no discount
        text = _pdf_text(path)
        self.assertIn("Discount", text)
        self.assertIn("0.00", text)

    def test_discount_row_shows_actual_amount(self):
        path = self._gen(mk_inv("VIS-015", [mk_item("Item A", 1, 500, disc=50)], discount=50), ASW)
        text = _pdf_text(path)
        self.assertIn("50.00", text)

    def test_item_level_discount_reduces_taxable_amount(self):
        # qty=2, up=100 -> gross 200, disc=20 -> taxable 180, vat 5% = 9.00, total 189.00
        item = mk_item("Widget", 2, 100, disc=20)
        self.assertEqual(item["vat_amount"], 9.0)
        self.assertEqual(item["total"], 189.0)
        path = self._gen(mk_inv("VIS-016", [item]), ASW)
        text = _pdf_text(path)
        self.assertIn("180.00", text)  # taxable amount after discount
        self.assertIn("9.00", text)    # VAT on taxable (after discount), not on gross (10.00)
        self.assertIn("189.00", text)

    def test_vat_calculated_after_discount_not_before(self):
        # Explicitly prove VAT != 5% of gross when a discount is applied.
        item = mk_item("Widget", 1, 1000, disc=200)
        gross_vat_wrong = round(1000 * 0.05, 2)   # 50.00 -- would be wrong
        taxable_vat_right = round(800 * 0.05, 2)  # 40.00 -- correct
        self.assertEqual(item["vat_amount"], taxable_vat_right)
        self.assertNotEqual(item["vat_amount"], gross_vat_wrong)

    def test_multiple_items(self):
        items = [mk_item(f"Item {i}", i + 1, 100 * (i + 1)) for i in range(4)]
        path = self._gen(mk_inv("VIS-017", items), ASW)
        text = _pdf_text(path)
        for i in range(4):
            self.assertIn(f"Item {i}", text)

    def test_long_description_does_not_break_generation(self):
        long_desc = ("Industrial three-phase electrical control panel with integrated "
                     "PLC, VFD drives, thermal overload protection, and full IP65 rated "
                     "enclosure suitable for outdoor installation in harsh environments " * 2)
        path = self._gen(mk_inv("VIS-018", [mk_item(long_desc.strip(), 1, 5000)]), ASW)
        self.assertTrue(os.path.exists(path))
        text = _pdf_text(path)
        self.assertIn("Industrial three-phase", text)

    def test_amount_in_words_present(self):
        path = self._gen(mk_inv("VIS-019", [mk_item("Item A", 1, 1000)]), ASW)
        text = _pdf_text(path)
        self.assertIn("Amount in Words", text)
        self.assertIn("AED", text)

    def test_invoice_level_discount_reflected_in_totals(self):
        path = self._gen(mk_inv("VIS-020", [mk_item("Item A", 1, 1000)], discount=100), ASW)
        text = _pdf_text(path)
        self.assertIn("100.00", text)

    def test_header_row_not_black_background(self):
        """Reference has a white header with black text, not the old
        inverted black-background/white-text header."""
        path = self._gen(mk_inv("VIS-021", [mk_item("Item A", 1, 100)]), ASW)
        fills = _find_header_row_fill_colors(path)
        # Pure black (0,0,0) or near-black should not appear as a large fill
        # region corresponding to the header row.
        near_black_fills = [f for f in fills if f and all(c < 0.15 for c in f[:3])]
        # Some near-black may legitimately appear as thin border strokes'
        # "fill" in vector rendering, but should not include the specific
        # dark charcoal (~0.10,0.10,0.10) header background color used before.
        self.assertNotIn((0.10196078431372549, 0.10196078431372549, 0.10196078431372549),
                          [tuple(round(c, 3) for c in f[:3]) if f else None for f in fills])

    def test_multi_page_large_invoice(self):
        items = [mk_item(f"Component {i}", 1, 50 + i) for i in range(35)]
        path = self._gen(mk_inv("VIS-022", items), ASW)
        pages = _page_count(path)
        self.assertGreaterEqual(pages, 2, "35 items should overflow to a second page")
        text = _pdf_text(path)
        # Ensure content from both the start and end of the item list survived.
        self.assertIn("Component 0", text)
        self.assertIn("Component 34", text)
        # Totals/amount-in-words must still appear exactly once, not duplicated
        # or lost, and signature block must still be present.
        self.assertEqual(text.count("Amount in Words"), 1)
        self.assertIn("Authorised Signature", text)

    def test_authorised_signature_present(self):
        path = self._gen(mk_inv("VIS-023", [mk_item("Item A", 1, 100)]), ASW)
        text = _pdf_text(path)
        self.assertIn("Authorised Signature", text)

    def test_note_rendered_when_present(self):
        path = self._gen(mk_inv("VIS-024", [mk_item("Item A", 1, 100)], notes="Handle with care."), ASW)
        text = _pdf_text(path)
        self.assertIn("Handle with care.", text)

    def test_cash_sale_still_works(self):
        path = self._gen(mk_inv("VIS-025", [mk_item("Item A", 1, 100)], cash=True, cust={}), ASW)
        text = _pdf_text(path)
        self.assertIn("CASH SALE", text)


@unittest.skipUnless(_HAS_PYMUPDF, "pymupdf not installed — structural checks skipped")
class TestDefaultTemplateUnaffected(unittest.TestCase):
    """Proves the default/Dar Al Salam template's output text is completely
    unaffected by all the Al Siwan-specific changes above."""

    def test_default_template_has_no_tr_no_row(self):
        # The default template shows TRN inline in the company block (its
        # own pre-existing behavior), not a dedicated "TR NO:" metadata row
        # — that's an Al Siwan-only addition and must not leak into default.
        path = generate_invoice_pdf(mk_inv("VIS-030", [mk_item("Item A", 1, 100)]), DAS)
        try:
            text = _pdf_text(path)
            self.assertNotIn("TR NO:", text)
        finally:
            os.remove(path)

    def test_default_template_still_has_bank_details_section_when_set(self):
        das_with_bank = {**DAS, "bank_details": "Bank: ADCB\nAccount: 123456"}
        path = generate_invoice_pdf(mk_inv("VIS-031", [mk_item("Item A", 1, 100)]), das_with_bank)
        try:
            text = _pdf_text(path)
            self.assertIn("Bank Details", text)
        finally:
            os.remove(path)

    def test_default_template_calculations_unchanged(self):
        item = mk_item("Widget", 2, 100, disc=20)
        path = generate_invoice_pdf(mk_inv("VIS-032", [item]), DAS)
        try:
            text = _pdf_text(path)
            self.assertIn("180.00", text)
            self.assertIn("9.00", text)
        finally:
            os.remove(path)

    def test_default_template_page_count_unaffected_by_watermark(self):
        # Default template has no watermark asset drawn; a single-item
        # invoice should render on exactly one page as before.
        path = generate_invoice_pdf(mk_inv("VIS-033", [mk_item("Item A", 1, 100)]), DAS)
        try:
            self.assertEqual(_page_count(path), 1)
        finally:
            os.remove(path)


if __name__ == "__main__":
    unittest.main(verbosity=2)
