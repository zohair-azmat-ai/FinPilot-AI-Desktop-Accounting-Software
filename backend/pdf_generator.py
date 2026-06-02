from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable, Image, Flowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.pdfgen import canvas
from datetime import datetime
from xml.sax.saxutils import escape as _xe   # XML-escape dynamic values inside Paragraph markup
import os

# ── Runtime debug log — confirms which pdf_generator is actually loaded ───────
_DBG_LOG = os.path.join(os.path.expanduser("~"), "FinPilot", "pdf_debug.log")
os.makedirs(os.path.dirname(_DBG_LOG), exist_ok=True)

def _dbg(msg: str) -> None:
    from datetime import datetime as _dt
    with open(_DBG_LOG, "a", encoding="utf-8") as _f:
        _f.write(f"[{_dt.now().strftime('%H:%M:%S')}] {msg}\n")

_BUILD = "FP_NAVY_V22"
_dbg(f">>> ACTIVE PDF GENERATOR BUILD={_BUILD} LOADED <<<")


def _amount_in_words(amount: float) -> str:
    """Convert a numeric AED amount to English words."""
    ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
            'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
            'Seventeen', 'Eighteen', 'Nineteen']
    tens_w = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

    def below_1000(n: int) -> str:
        if n == 0:
            return ''
        if n < 20:
            return ones[n]
        if n < 100:
            return tens_w[n // 10] + (' ' + ones[n % 10] if n % 10 else '')
        return ones[n // 100] + ' Hundred' + (' ' + below_1000(n % 100) if n % 100 else '')

    integer_part = int(amount)
    fils = round((amount - integer_part) * 100)

    if integer_part == 0:
        words = 'Zero'
    elif integer_part < 1_000:
        words = below_1000(integer_part)
    elif integer_part < 1_000_000:
        high, low = divmod(integer_part, 1_000)
        words = below_1000(high) + ' Thousand' + (' ' + below_1000(low) if low else '')
    else:
        high, low = divmod(integer_part, 1_000_000)
        words = below_1000(high) + ' Million' + (' ' + _amount_in_words(low).replace('AED ', '').replace(' Only', '') if low else '')

    result = f'AED {words} Only'
    if fils:
        result = f'AED {words} and {below_1000(fils)} Fils Only'
    return result

EXPORT_DIR = os.path.join(os.path.expanduser("~"), "FinPilot", "exports")
os.makedirs(EXPORT_DIR, exist_ok=True)

# Resolve assets/ relative to this file (works both from source and PyInstaller bundle)
_HERE = os.path.dirname(os.path.abspath(__file__))

# Letterhead: user-writable location first, fallback to bundle assets
_USER_LH    = os.path.join(os.path.expanduser("~"), "FinPilot", "assets", "letterhead.jpg")
_BUNDLE_LH  = os.path.join(_HERE, "assets", "letterhead.jpg")
LETTERHEAD_PATH = _USER_LH if (os.path.exists(_USER_LH) and os.path.getsize(_USER_LH) > 0) else _BUNDLE_LH
_dbg(f"letterhead resolved: {LETTERHEAD_PATH} exists={os.path.exists(LETTERHEAD_PATH)}")

# Stamp: user-writable location first, fallback to bundle assets
_USER_STAMP  = os.path.join(os.path.expanduser("~"), "FinPilot", "assets", "stamp.png")
_BUNDLE_STAMP = os.path.join(_HERE, "assets", "stamp.png")


def _get_stamp_path(company_stamp: str = "") -> str:
    """Return the first existing stamp path, or empty string if none.
    Priority: company_stamp (DB/Company Tab) → user FinPilot/assets → bundle assets."""
    candidates = [p for p in (company_stamp, _USER_STAMP, _BUNDLE_STAMP) if p]
    for p in candidates:
        if os.path.exists(p) and os.path.getsize(p) > 0:
            _dbg(f"stamp resolved: source={p}")
            return p
    _dbg(f"stamp NOT FOUND (checked {len(candidates)} paths)")
    return ""


def _qty_label(qty: float) -> str:
    """Format quantity as '1-NO' or 'N-NOS' (UAE unit style, plain ASCII hyphen)."""
    n = int(qty) if qty == float(int(qty)) else qty
    return f"{n}-NO" if qty <= 1.0 else f"{n}-NOS"

# Letterhead-matched navy blue palette (sampled from letterhead.jpg TRN box: #1B35A0)
PRIMARY    = colors.HexColor("#1B35A0")   # letterhead navy blue — all headers, titles, borders
ACCENT     = colors.HexColor("#1B35A0")   # same — used everywhere for consistent branding
LIGHT_GRAY = colors.HexColor("#F8FAFC")
LIGHT_BLUE = colors.HexColor("#E8F0FF")   # soft navy tint for cell fill
ROW_STRIPE = colors.HexColor("#EBF2FF")   # very light navy row stripe
MED_GRAY   = colors.HexColor("#94A3B8")
DARK       = colors.HexColor("#0F172A")
WHITE      = colors.white

# A4 content width with 15 mm left/right margins
_CONTENT_W = A4[0] - 30 * mm   # ≈ 180 mm


def _letterhead_flowable():
    """Return a content-width letterhead Image if the file exists, else None."""
    if not os.path.exists(LETTERHEAD_PATH):
        return None
    from PIL import Image as PILImage
    with PILImage.open(LETTERHEAD_PATH) as img:
        orig_w, orig_h = img.size
    height = _CONTENT_W * orig_h / orig_w
    return Image(LETTERHEAD_PATH, width=_CONTENT_W, height=height)


def _lh_page_height() -> float:
    """Height (in points) for the letterhead drawn at full A4 page width."""
    if not os.path.exists(LETTERHEAD_PATH):
        return 0.0
    from PIL import Image as PILImage
    with PILImage.open(LETTERHEAD_PATH) as img:
        orig_w, orig_h = img.size
    return A4[0] * orig_h / orig_w


def _doc_info_block(title, doc_number, doc_date, due_date=None):
    """Compact right-aligned document title / number / date block."""
    doc_style = ParagraphStyle("di_title", fontName="Helvetica-Bold", fontSize=20,
                               textColor=ACCENT, alignment=TA_RIGHT)
    num_style  = ParagraphStyle("di_num",   fontName="Helvetica",      fontSize=9,
                               textColor=DARK,  alignment=TA_RIGHT)
    items = [Paragraph(title, doc_style), Spacer(1, 3)]
    items.append(Paragraph(f"<b>No:</b> {doc_number}", num_style))
    items.append(Paragraph(f"<b>Date:</b> {doc_date}", num_style))
    if due_date:
        items.append(Paragraph(f"<b>Due:</b> {due_date}", num_style))
    # Right-aligned wrapper table
    t = Table([[Spacer(1, 1), items]], colWidths=[_CONTENT_W * 0.5, _CONTENT_W * 0.5])
    t.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


# ── Legacy text-based header (fallback when no letterhead image) ──────────────
def _header_table(company, title, doc_number, doc_date, due_date=None, customer=None, letterhead=True):
    comp_style = ParagraphStyle("comp", fontName="Helvetica-Bold", fontSize=16, textColor=PRIMARY)
    sub_style  = ParagraphStyle("sub",  fontName="Helvetica",      fontSize=8,  textColor=MED_GRAY)
    doc_style  = ParagraphStyle("doc",  fontName="Helvetica-Bold", fontSize=22, textColor=ACCENT, alignment=TA_RIGHT)
    num_style  = ParagraphStyle("num",  fontName="Helvetica",      fontSize=9,  textColor=DARK,   alignment=TA_RIGHT)

    if letterhead and company:
        left_cell = [
            Paragraph(company.get("name", "Company Name"), comp_style),
            Spacer(1, 2),
            Paragraph(company.get("address", "").replace("\n", "<br/>"), sub_style),
            Paragraph(f"Tel: {company.get('phone', '')}  Email: {company.get('email', '')}", sub_style),
            Paragraph(f"TRN: {company.get('trn', '')}", sub_style) if company.get("trn") else Spacer(1, 1),
        ]
    else:
        left_cell = [Spacer(1, 1)]

    right_cell = [
        Paragraph(title, doc_style),
        Spacer(1, 4),
        Paragraph(f"<b>No:</b> {doc_number}", num_style),
        Paragraph(f"<b>Date:</b> {doc_date}", num_style),
    ]
    if due_date:
        right_cell.append(Paragraph(f"<b>Due:</b> {due_date}", num_style))

    data = [[left_cell, right_cell]]
    t = Table(data, colWidths=[100 * mm, 70 * mm])
    t.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def _customer_block(customer):
    label_style = ParagraphStyle("lbl", fontName="Helvetica-Bold", fontSize=8, textColor=MED_GRAY)
    val_style   = ParagraphStyle("val", fontName="Helvetica",      fontSize=9, textColor=DARK)
    items = [Paragraph("BILL TO", label_style), Spacer(1, 2)]
    if customer:
        items.append(Paragraph(f"<b>{customer.get('name', '')}</b>", val_style))
        if customer.get("attn"):
            items.append(Paragraph(f"Attn: {customer['attn']}", val_style))
        if customer.get("trn"):
            items.append(Paragraph(f"TRN: {customer['trn']}", val_style))
        if customer.get("phone"):
            items.append(Paragraph(f"Tel: {customer['phone']}", val_style))
        if customer.get("address"):
            items.append(Paragraph(customer["address"].replace("\n", "<br/>"), val_style))
    return items


def _items_table(line_items, vat_rate=5.0):
    headers    = ["#", "Description", "Qty", "Unit Price", "VAT", "Amount"]
    col_widths = [8 * mm, 72 * mm, 15 * mm, 25 * mm, 20 * mm, 25 * mm]

    style_h  = ParagraphStyle("h",  fontName="Helvetica-Bold", fontSize=8, textColor=WHITE)
    style_r  = ParagraphStyle("r",  fontName="Helvetica",      fontSize=8, textColor=DARK)
    style_rc = ParagraphStyle("rc", fontName="Helvetica",      fontSize=8, textColor=DARK, alignment=TA_RIGHT)

    data = [[Paragraph(h, style_h) for h in headers]]
    for i, item in enumerate(line_items, 1):
        vat_text = f"AED {item.get('vat_amount', 0):.2f}" if item.get("vat_applicable") else "Exempt"
        data.append([
            Paragraph(str(i), style_r),
            Paragraph(item.get("description", ""), style_r),
            Paragraph(f"{item.get('quantity', 1):.2f}", style_rc),
            Paragraph(f"AED {item.get('unit_price', 0):.2f}", style_rc),
            Paragraph(vat_text, style_rc),
            Paragraph(f"AED {item.get('total', 0):.2f}", style_rc),
        ])

    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0),  PRIMARY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [LIGHT_GRAY, WHITE]),
        ("FONTNAME",     (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",     (0, 0), (-1, -1), 8),
        ("GRID",         (0, 0), (-1, -1), 0.3, colors.HexColor("#CBD5E1")),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("LEFTPADDING",  (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _totals_table(subtotal, vat_amount, discount, total):
    style_l     = ParagraphStyle("sl", fontName="Helvetica",      fontSize=9,  textColor=DARK,    alignment=TA_RIGHT)
    style_v     = ParagraphStyle("sv", fontName="Helvetica",      fontSize=9,  textColor=DARK,    alignment=TA_RIGHT)
    style_total = ParagraphStyle("st", fontName="Helvetica-Bold", fontSize=11, textColor=WHITE,   alignment=TA_RIGHT)

    data = [[Paragraph("Subtotal:", style_l), Paragraph(f"AED {subtotal:.2f}", style_v)]]
    if discount > 0:
        data.append([Paragraph("Discount:", style_l), Paragraph(f"- AED {discount:.2f}", style_v)])
    data.append([Paragraph("VAT (5%):",  style_l), Paragraph(f"AED {vat_amount:.2f}", style_v)])
    data.append([Paragraph("TOTAL DUE:", style_total), Paragraph(f"AED {total:.2f}", style_total)])

    t = Table(data, colWidths=[50 * mm, 35 * mm])
    t.setStyle(TableStyle([
        ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEABOVE",     (0, -1), (-1, -1), 1, PRIMARY),
        ("BACKGROUND",    (0, -1), (-1, -1), PRIMARY),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    return t


# ── Shared helper: add letterhead + doc-info or fall back to text header ──────
def _build_top(story, company, title, doc_number, doc_date, due_date=None):
    lh = _letterhead_flowable()
    if lh:
        story.append(lh)
        story.append(Spacer(1, 3 * mm))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#CBD5E1")))
        story.append(Spacer(1, 3 * mm))
        story.append(_doc_info_block(title, doc_number, doc_date, due_date))
    else:
        story.append(_header_table(company, title, doc_number, doc_date, due_date, letterhead=True))


# ── Invoice (UAE TAX INVOICE — industrial layout) ─────────────────────────
def generate_invoice_pdf(invoice_data: dict, company: dict) -> str:
    from reportlab.platypus import KeepTogether

    _CW = A4[0] - 20 * mm   # V14: 10 mm margins each side → ≈ 190 mm content width

    filename = f"Invoice_{invoice_data['invoice_number']}_{datetime.now().strftime('%Y%m%d%H%M%S')}.pdf"
    filepath = os.path.join(EXPORT_DIR, filename)

    page_w, page_h = A4

    # ── Letterhead ───────────────────────────────────────────────────────────
    lh_file_ok = os.path.exists(LETTERHEAD_PATH)
    _dbg(f"LETTERHEAD_PATH={LETTERHEAD_PATH} exists={lh_file_ok}")
    _dbg(f"stamp_path={_get_stamp_path() or 'NOT FOUND'}")
    use_letterhead = invoice_data.get("letterhead", True) and lh_file_ok
    _dbg(f"use_letterhead={use_letterhead} (flag={invoice_data.get('letterhead', True)} file={lh_file_ok})")
    LH_MAX_H  = 70 * mm
    LH_MIN_H  = 62 * mm
    raw_lh_h  = _lh_page_height() if use_letterhead else 0.0
    lh_draw_h = max(LH_MIN_H, min(raw_lh_h, LH_MAX_H)) if raw_lh_h > 0 else 0.0
    top_margin = (lh_draw_h + 2 * mm) if lh_draw_h else 63 * mm   # 2mm gap: heading closer to letterhead

    def _draw_header(canv, _doc):
        if not lh_draw_h:
            return
        canv.saveState()
        canv.drawImage(LETTERHEAD_PATH, 0, page_h - lh_draw_h,
                       width=page_w, height=lh_draw_h,
                       preserveAspectRatio=False, mask='auto')
        canv.restoreState()

    def _draw_later(_canv, _doc):
        pass

    doc = SimpleDocTemplate(
        filepath, pagesize=A4,
        leftMargin=10 * mm, rightMargin=10 * mm,
        topMargin=top_margin, bottomMargin=4 * mm,
    )
    story = []

    # ── Data ─────────────────────────────────────────────────────────────────
    is_cash       = invoice_data.get("is_cash", False)
    _stamp_raw    = invoice_data.get("include_stamp")
    include_stamp = bool(_stamp_raw) if _stamp_raw is not None else False
    inv_no   = invoice_data.get("invoice_number", "")
    inv_date = invoice_data.get("date", "")
    lpo_no   = invoice_data.get("lpo_no", "") or ""
    do_no    = invoice_data.get("do_no",  "") or ""
    customer = invoice_data.get("customer") or {}
    subtotal   = invoice_data.get("subtotal",   0)
    vat_amount = invoice_data.get("vat_amount", 0)
    discount   = invoice_data.get("discount",   0)
    total      = invoice_data.get("total",      0)
    # Defensive filter: strip stale/deleted/blank items even if route passed them through
    _comp_stamp = (company or {}).get("stamp_path", "") or ""
    actual_items = [
        it for it in invoice_data.get("items", [])
        if not it.get("deleted_at") and (it.get("description") or "").strip()
    ]
    _dbg(f"generate_invoice_pdf: invoice={inv_no} pdf_render_count={len(actual_items)}")
    _dbg(f"stamp_enabled={include_stamp}")
    print(f"[invoice pdf_generator] invoice={inv_no} "
          f"pdf_render_count={len(actual_items)} "
          f"company_stamp_exists={bool(_comp_stamp and os.path.exists(_comp_stamp))}")

    # ── FinPilot blue palette (restored) ─────────────────────────────────────
    HDR_BG  = ACCENT                        # royal blue table header
    ROW_A   = ROW_STRIPE                    # #EEF4FF blue-tinted odd row
    ROW_B   = WHITE                         # even row
    GRID_C  = colors.HexColor("#CBD5E1")    # blue-gray cell border
    CAP_BG  = LIGHT_BLUE                    # clean end-cap fill
    INK     = DARK                          # #0F172A body text
    MUTED   = MED_GRAY                      # #94A3B8 label / secondary text

    # ── Shared styles ─────────────────────────────────────────────────────────
    _ti    = ParagraphStyle("_ti",   fontName="Helvetica-Bold", fontSize=18, textColor=ACCENT, alignment=TA_CENTER)
    _lbl   = ParagraphStyle("_lbl",  fontName="Helvetica",      fontSize=7.5, textColor=MED_GRAY)
    _val   = ParagraphStyle("_val",  fontName="Helvetica-Bold", fontSize=10,  textColor=PRIMARY)
    _lblr  = ParagraphStyle("_lblr", fontName="Helvetica",      fontSize=7.5, textColor=MED_GRAY, alignment=TA_RIGHT)
    _valr  = ParagraphStyle("_valr", fontName="Helvetica-Bold", fontSize=9,   textColor=DARK,    alignment=TA_RIGHT)
    _sub   = ParagraphStyle("_sub",  fontName="Helvetica",      fontSize=8.5, textColor=DARK)
    _ih    = ParagraphStyle("_ih",   fontName="Helvetica-Bold", fontSize=7.5, textColor=colors.white, alignment=TA_CENTER)
    _ir    = ParagraphStyle("_ir",   fontName="Helvetica",      fontSize=8,   textColor=DARK)
    _irc   = ParagraphStyle("_irc",  fontName="Helvetica",      fontSize=8,   textColor=DARK, alignment=TA_RIGHT)
    _icc   = ParagraphStyle("_icc",  fontName="Helvetica",      fontSize=8,   textColor=DARK, alignment=TA_CENTER)
    _slbl  = ParagraphStyle("_slbl", fontName="Helvetica-Bold", fontSize=7.5, textColor=MED_GRAY)
    _sval  = ParagraphStyle("_sval", fontName="Helvetica-Bold", fontSize=8,   textColor=DARK)
    _bh    = ParagraphStyle("_bh",   fontName="Helvetica-Bold", fontSize=8,   textColor=WHITE,  alignment=TA_CENTER)

    # ── 1. TAX INVOICE title — spacer decided after full height measurement ───
    _many_items  = len(actual_items) >= 3
    _title_para  = Paragraph("TAX INVOICE", _ti)
    # story.append deferred — adaptive spacer chosen in layout block below

    # ── 2. Bill To (left box) | Invoice Details (right box) ──────────────────
    _cn  = ParagraphStyle("_cn",  fontName="Helvetica-Bold", fontSize=10, textColor=INK)
    _sub2 = ParagraphStyle("_sub2", fontName="Helvetica", fontSize=8.5, textColor=DARK)

    if is_cash:
        cust_rows_inner = [[Paragraph("CASH SALE", _cn)]]
    else:
        cust_rows_inner = []
        if customer.get("name"):
            cust_rows_inner.append([Paragraph(f"<b>{_xe(customer.get('name', ''))}</b>", _cn)])
        if customer.get("attn"):
            cust_rows_inner.append([Paragraph(f"Attn: {_xe(customer['attn'])}", _sub2)])
        if customer.get("trn"):
            cust_rows_inner.append([Paragraph(f"TRN: {_xe(str(customer['trn']))}", _sub2)])
        if customer.get("phone"):
            cust_rows_inner.append([Paragraph(f"Tel: {_xe(str(customer['phone']))}", _sub2)])
        if customer.get("po_box"):
            cust_rows_inner.append([Paragraph(f"P.O Box: {_xe(str(customer['po_box']))}", _sub2)])
        if customer.get("address"):
            cust_rows_inner.append([Paragraph(_xe(customer["address"].replace("\n", ", ")), _sub2)])
    if not cust_rows_inner:
        cust_rows_inner = [[Paragraph("—", _sub2)]]

    # Tighter info-box padding for 3+ items to leave more room for long items + footer
    _bp = 3 if _many_items else 5   # outer box vertical padding (points)
    _cp = 1 if _many_items else 2   # inner cell vertical padding (points)

    cust_inner_t = Table(cust_rows_inner, colWidths=[96 * mm])
    cust_inner_t.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING",    (0, 0), (-1, -1), _cp),
        ("BOTTOMPADDING", (0, 0), (-1, -1), _cp),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
    ]))

    bill_to_box = Table([[Paragraph("BILL TO", _bh)], [cust_inner_t]], colWidths=[110 * mm])
    bill_to_box.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 0.8, ACCENT),
        ("LINEBELOW",     (0, 0), (-1, 0),  0.8, ACCENT),
        ("BACKGROUND",    (0, 0), (-1, 0),  ACCENT),
        ("BACKGROUND",    (0, 1), (-1, 1),  LIGHT_BLUE),
        ("TOPPADDING",    (0, 0), (-1, -1), _bp),
        ("BOTTOMPADDING", (0, 0), (-1, -1), _bp),
        ("LEFTPADDING",   (0, 0), (-1, -1), 7),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 7),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))

    due_date_str      = invoice_data.get("due_date", "") or ""
    payment_terms_str = invoice_data.get("payment_terms", "") or ""
    _dbg(f"[invoice pdf] payment_terms_received={repr(payment_terms_str)} will_render={bool(payment_terms_str)}")
    inv_det_rows = [
        [Paragraph("INVOICE NO:",    _slbl), Paragraph(_xe(inv_no),   _sval)],
        [Paragraph("INVOICE DATE:",  _slbl), Paragraph(_xe(inv_date), _sval)],
        [Paragraph("DATE OF SUPPLY:", _slbl), Paragraph(_xe(inv_date), _sval)],
    ]
    if due_date_str:
        inv_det_rows.append([Paragraph("DUE DATE:",      _slbl), Paragraph(_xe(due_date_str),      _sval)])
    if lpo_no:
        inv_det_rows.append([Paragraph("LPO NO:",  _slbl), Paragraph(_xe(lpo_no), _sval)])
    if do_no:
        inv_det_rows.append([Paragraph("DO NO:",   _slbl), Paragraph(_xe(do_no),  _sval)])
    if payment_terms_str:
        inv_det_rows.append([Paragraph("PAYMENT TERMS:", _slbl), Paragraph(_xe(payment_terms_str), _sval)])

    inv_det_inner = Table(inv_det_rows, colWidths=[28 * mm, 34 * mm])
    inv_det_inner.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING",    (0, 0), (-1, -1), _cp),
        ("BOTTOMPADDING", (0, 0), (-1, -1), _cp),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
    ]))

    inv_det_box = Table([[Paragraph("INVOICE DETAILS", _bh)], [inv_det_inner]], colWidths=[76 * mm])
    inv_det_box.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 0.8, ACCENT),
        ("LINEBELOW",     (0, 0), (-1, 0),  0.8, ACCENT),
        ("BACKGROUND",    (0, 0), (-1, 0),  ACCENT),
        ("BACKGROUND",    (0, 1), (-1, 1),  LIGHT_BLUE),
        ("TOPPADDING",    (0, 0), (-1, -1), _bp),
        ("BOTTOMPADDING", (0, 0), (-1, -1), _bp),
        ("LEFTPADDING",   (0, 0), (-1, -1), 7),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 7),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))

    # 110 + 4 + 76 = 190mm = _CW
    info_wrap = Table([[bill_to_box, Spacer(4 * mm, 1), inv_det_box]],
                      colWidths=[110 * mm, 4 * mm, 76 * mm])
    info_wrap.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    # story.append(info_wrap) deferred — adaptive spacer chosen in layout block
    # ── 4. Items table ───────────────────────────────────────────────────────
    stamp_path_check = _get_stamp_path(_comp_stamp) if include_stamp else ""
    _dbg(f"stamp_enabled={include_stamp}")
    _dbg(f"resolved_stamp_path={stamp_path_check or 'none'}")
    _dbg(f"stamp_exists={bool(stamp_path_check)}")
    _dbg(f"stamp_rendered={bool(stamp_path_check)}")

    # 9 columns: SR NO | DESCRIPTION | QTY | UNIT PRICE | DISCOUNT | TAXABLE AMT | TAX RATE | TAX AMT | TOTAL
    # 8+50+18+24+16+24+11+19+20 = 190mm  (QTY=18mm so '20-NOS' never wraps)
    col_w = [8*mm, 50*mm, 18*mm, 24*mm, 16*mm, 24*mm, 11*mm, 19*mm, 20*mm]
    hdrs  = ["SR\nNO", "DESCRIPTION", "QTY", "UNIT PRICE\n(AED)",
             "DISCOUNT\n(AED)", "TAXABLE\nAMT (AED)", "TAX\nRATE", "TAX AMT\n(AED)", "TOTAL\n(AED)"]

    def _item_row(idx, item):
        qty    = item.get("quantity",   1)
        up     = item.get("unit_price", 0)
        taxable = round(qty * up, 2)          # taxable amount = qty × unit price (no per-item discount)
        vat_ok = item.get("vat_applicable", True)
        tax_a  = item.get("vat_amount", 0)
        tot_a  = item.get("total", round(taxable + tax_a, 2))
        return [
            Paragraph(str(idx),                        _icc),
            Paragraph(_xe(item.get("description", "")), _ir),
            Paragraph(_qty_label(qty),                 _icc),
            Paragraph(f"{up:.2f}",                     _irc),
            Paragraph("0.00",                          _irc),   # DISCOUNT (AED)
            Paragraph(f"{taxable:.2f}",                _irc),   # TAXABLE AMOUNT (AED)
            Paragraph("5%" if vat_ok else "0%",        _icc),
            Paragraph(f"{tax_a:.2f}",                  _irc),
            Paragraph(f"{tot_a:.2f}",                  _irc),
        ]

    base_rows = [[Paragraph(h, _ih) for h in hdrs]]
    for i, item in enumerate(actual_items, 1):
        base_rows.append(_item_row(i, item))

    def _make_items_tbl(rows, pad_t=8, pad_b=8, n_filler=0, filler_pad=6):
        """n_filler: last N rows are filler — override their padding to filler_pad (pt)."""
        t = Table(rows, colWidths=col_w)
        cmds = [
            ("BACKGROUND",    (0, 0),  (-1, 0),  HDR_BG),
            ("ROWBACKGROUNDS",(0, 1),  (-1, -1), [ROW_A, ROW_B]),
            ("GRID",          (0, 0),  (-1, -1), 0.5, GRID_C),
            ("VALIGN",        (0, 0),  (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0),  (-1, 0),  5),
            ("BOTTOMPADDING", (0, 0),  (-1, 0),  5),
            ("TOPPADDING",    (0, 1),  (-1, -1), pad_t),
            ("BOTTOMPADDING", (0, 1),  (-1, -1), pad_b),
            ("LEFTPADDING",   (0, 0),  (-1, -1), 4),
            ("RIGHTPADDING",  (0, 0),  (-1, -1), 4),
        ]
        if n_filler > 0 and len(rows) > 0:
            fs = max(1, len(rows) - n_filler)   # filler start row (never row 0/header)
            cmds += [
                ("TOPPADDING",    (0, fs), (-1, -1), filler_pad),
                ("BOTTOMPADDING", (0, fs), (-1, -1), filler_pad),
            ]
        t.setStyle(TableStyle(cmds))
        return t

    # ── 5. Build footer elements first to measure actual height ──────────────
    tl_s = ParagraphStyle("_tl", fontName="Helvetica",      fontSize=8.5, textColor=INK,          alignment=TA_RIGHT)
    tv_s = ParagraphStyle("_tv", fontName="Helvetica",      fontSize=8.5, textColor=INK,          alignment=TA_RIGHT)
    tb_s = ParagraphStyle("_tb", fontName="Helvetica-Bold", fontSize=10,  textColor=colors.white, alignment=TA_RIGHT)

    tot_rows = [[Paragraph("Amount Excl. VAT:", tl_s), Paragraph(f"AED {subtotal:.2f}", tv_s)]]
    if discount > 0:
        tot_rows.append([Paragraph("Discount:", tl_s), Paragraph(f"- AED {discount:.2f}", tv_s)])
    tot_rows.append([Paragraph("VAT (5%):",     tl_s), Paragraph(f"AED {vat_amount:.2f}", tv_s)])
    tot_rows.append([Paragraph("TOTAL AMOUNT:", tb_s), Paragraph(f"AED {total:.2f}",      tb_s)])

    tot_t = Table(tot_rows, colWidths=[55 * mm, 35 * mm])
    tot_t.setStyle(TableStyle([
        ("ALIGN",         (0, 0),  (-1, -1), "RIGHT"),
        ("VALIGN",        (0, 0),  (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0),  (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("GRID",          (0, 0),  (-1, -2), 0.3, GRID_C),
        ("LINEABOVE",     (0, -1), (-1, -1), 1,   HDR_BG),
        ("BACKGROUND",    (0, -1), (-1, -1), HDR_BG),
    ]))
    tot_wrap = Table([[Spacer(1, 1), tot_t]], colWidths=[_CW - 90 * mm, 90 * mm])
    tot_wrap.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))

    ws_s   = ParagraphStyle("_ws",  fontName="Helvetica-Bold", fontSize=7.5, textColor=INK)
    wv_s   = ParagraphStyle("_wv",  fontName="Helvetica",      fontSize=7.5, textColor=INK)
    bk_lbl = ParagraphStyle("_bkl", fontName="Helvetica-Bold", fontSize=7.5, textColor=MUTED)
    bk_val = ParagraphStyle("_bkv", fontName="Helvetica",      fontSize=7.5, textColor=INK)

    words_items = [Paragraph("Amount in Words:", ws_s), Spacer(1, 1 * mm),
                   Paragraph(_amount_in_words(total), wv_s)]
    if invoice_data.get("notes"):
        words_items += [Spacer(1, 1.5 * mm),
                        Paragraph(f"<b>Note:</b> {_xe(invoice_data['notes'])}",
                                  ParagraphStyle("_nt", fontName="Helvetica", fontSize=7, textColor=MUTED))]

    bank_items = [
        Paragraph("Bank Details:", bk_lbl), Spacer(1, 1 * mm),
        Paragraph("Bank: ADCB",                                        bk_val),
        Paragraph("A/C Title: DAR AL SALAM ENG TURNING WKS W SH LLC", bk_val),
        Paragraph("Account No: 949382292001",                          bk_val),
        Paragraph("IBAN: AE080030000949382292001",                     bk_val),
        Paragraph("Currency: AED  |  Swift: ADCBAEAA",                bk_val),
    ]

    wb_t = Table([[words_items, bank_items]], colWidths=[95 * mm, 95 * mm])
    wb_t.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0), ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LINEAFTER",     (0, 0), (0, 0),   0.3, GRID_C),
        ("LEFTPADDING",   (1, 0), (1, 0),   6),
    ]))

    tc_hdr  = ParagraphStyle("_tch",  fontName="Helvetica-Bold", fontSize=4.6, textColor=INK)
    tc_body = ParagraphStyle("_tcb",  fontName="Helvetica",      fontSize=4.6, textColor=INK, leading=6)
    sig_ln  = ParagraphStyle("_sgln", fontName="Helvetica",      fontSize=8,   textColor=INK, alignment=TA_CENTER)
    sig_sub = ParagraphStyle("_sgsb", fontName="Helvetica",      fontSize=7,   textColor=INK, alignment=TA_CENTER)
    sig_lbl = ParagraphStyle("_sgll", fontName="Helvetica-Bold", fontSize=7.5, textColor=INK, alignment=TA_CENTER)
    ft_s    = ParagraphStyle("_ft",   fontName="Helvetica",      fontSize=6.5, textColor=MUTED, alignment=TA_CENTER)

    terms_block = [
        Paragraph("Terms &amp; Conditions:", tc_hdr),
        Paragraph("1)  Goods once sold will not be taken back.", tc_body),
        Paragraph("2)  Material delivered at customer's risk.", tc_body),
        Paragraph("3)  Machining work once approved cannot be reversed.", tc_body),
    ]

    require_cust_sig = bool(invoice_data.get("require_customer_signature", False))
    _dbg(f"generate_invoice_pdf: require_cust_sig={require_cust_sig} stamp={include_stamp} path={stamp_path_check or 'none'}")

    auth_sig = []
    if include_stamp and stamp_path_check:
        try:
            from PIL import Image as PILImage
            with PILImage.open(stamp_path_check) as img:
                sw, sh = img.size
            STAMP_W = 38 * mm
            STAMP_H = min(STAMP_W * sh / sw, 16 * mm)
            auth_sig.append(Image(stamp_path_check, width=STAMP_W, height=STAMP_H))
            auth_sig.append(Spacer(1, 0.5 * mm))
            _dbg(f"stamp rendered: {STAMP_W:.1f}x{STAMP_H:.1f} from {stamp_path_check}")
        except Exception as _se:
            _dbg(f"stamp render ERROR: {_se}")
            auth_sig.append(Spacer(1, 2 * mm))
    else:
        _dbg(f"stamp skipped: include_stamp={include_stamp} path={stamp_path_check or 'none'}")
        auth_sig.append(Spacer(1, 2 * mm))

    auth_sig += [
        Paragraph("________________________", sig_ln),
        Spacer(1, 2 * mm),
        Paragraph("Authorized Signature", sig_sub),
    ]

    if require_cust_sig:
        recv_sig = [Spacer(1, 2 * mm),
                    Paragraph("________________________", sig_ln),
                    Spacer(1, 4 * mm),
                    Paragraph("Receiver's Name &amp; Signature", sig_lbl)]
        sig_t = Table([[recv_sig, auth_sig]], colWidths=[95 * mm, 95 * mm])
        sig_t.setStyle(TableStyle([
            ("VALIGN",       (0, 0), (-1, -1), "BOTTOM"), ("ALIGN",  (0, 0), (-1, -1), "CENTER"),
            ("LEFTPADDING",  (0, 0), (-1, -1), 4),        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING",   (0, 0), (-1, -1), 0),        ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
            ("LINEAFTER",    (0, 0), (0, 0),   0.3, GRID_C),
        ]))
    else:
        sig_t = Table([[[], auth_sig]], colWidths=[95 * mm, 95 * mm])
        sig_t.setStyle(TableStyle([
            ("VALIGN",       (0, 0), (-1, -1), "BOTTOM"), ("ALIGN",  (0, 0), (-1, -1), "CENTER"),
            ("LEFTPADDING",  (0, 0), (-1, -1), 4),        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING",   (0, 0), (-1, -1), 0),        ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
        ]))

    footer_block = [
        Spacer(1, 1 * mm),
        tot_wrap,
        Spacer(1, 1 * mm),
        HRFlowable(width="100%", thickness=0.4, color=GRID_C),
        Spacer(1, 1 * mm),
        wb_t,
        Spacer(1, 1 * mm),
        HRFlowable(width="100%", thickness=0.4, color=GRID_C),
    ] + terms_block + [
        Spacer(1, 0.5 * mm),
        HRFlowable(width="100%", thickness=0.3, color=GRID_C),
        sig_t,
        HRFlowable(width="100%", thickness=0.3, color=MUTED),
        Spacer(1, 0.5 * mm),
        Paragraph("This is a computer generated TAX INVOICE. Thank you for your business.", ft_s),
    ]

    # ── V20: measure everything first, then pick spacers adaptively ──────────
    _footer_h_actual = sum(f.wrap(_CW, 9999 * mm)[1] for f in footer_block)
    _title_h_inv     = _title_para.wrap(_CW, 9999 * mm)[1]
    _info_wrap_h     = info_wrap.wrap(_CW, 9999 * mm)[1]
    _usable_h        = A4[1] - top_margin - 4 * mm
    # 15 mm = conservative rendering overhead for pre_items (nested tables + frame borders)
    _OVERHEAD        = 15 * mm
    _RENDER_SAFE     = 15 * mm  # budget guard

    _blank = [Paragraph("", _icc), Paragraph("", _ir),  Paragraph("", _icc),
              Paragraph("", _irc), Paragraph("", _irc), Paragraph("", _irc),
              Paragraph("", _icc), Paragraph("", _irc), Paragraph("", _irc)]

    # Build initial items table (tight padding for 3+ items)
    _init_pt, _init_pb = (4, 3) if _many_items else (8, 8)
    items_tbl = _make_items_tbl(base_rows, _init_pt, _init_pb)
    items_h   = items_tbl.wrap(_CW, 9999 * mm)[1]

    # Adaptive spacers: use comfortable gaps where possible, tighten only when needed.
    # Formula: spacer budget = usable - items - footer - rendering_overhead - title - info_wrap
    _sp_max     = _usable_h - items_h - _footer_h_actual - _OVERHEAD - _title_h_inv - _info_wrap_h
    _sp_prefer  = (7 if _many_items else 8) * mm  # preferred total (5+2 or 6+2)
    _sp_total   = min(_sp_prefer, max(2 * mm, _sp_max))  # clamp: min 2mm, preferred if fits
    # Split: title gets ~65%, info gap gets ~35%; ensure at least 2mm/1mm each
    _sp_title   = max(2 * mm, min(_sp_total * 0.65, (5 if _many_items else 6) * mm))
    _sp_info    = max(1 * mm, _sp_total - _sp_title)
    _pre_items_h = _title_h_inv + _sp_title + _info_wrap_h + _sp_info

    # Graduated filler: fill blank rows to reduce bottom white gap on short invoices
    _n_actual = len(actual_items)
    _max_fill = 3 if _n_actual <= 1 else (2 if _n_actual <= 2 else (1 if _n_actual <= 3 else 0))
    _filler_n = 0
    for _fn in range(1, _max_fill + 1):
        _cand   = _make_items_tbl(base_rows + [_blank] * _fn, _init_pt, _init_pb,
                                  n_filler=_fn, filler_pad=6)
        _cand_h = _cand.wrap(_CW, 9999 * mm)[1]
        if _pre_items_h + _cand_h + _footer_h_actual <= _usable_h - _RENDER_SAFE:
            items_tbl, items_h, _filler_n = _cand, _cand_h, _fn
        else:
            break

    # Safety compression: shrink items table if needed.
    # Uses freshly-constructed rows to avoid ReportLab Paragraph cache returning
    # stale heights from the previous table wrap call.
    def _fresh_rows():
        fr = [[Paragraph(h, _ih) for h in hdrs]]
        for _fi, _fit in enumerate(actual_items, 1):
            fr.append(_item_row(_fi, _fit))
        return fr

    _budget = _usable_h - _pre_items_h - _footer_h_actual - _RENDER_SAFE
    if items_h > _budget:
        for _cpt, _cpb in [(3, 2), (2, 2), (1, 1)]:
            _t = _make_items_tbl(_fresh_rows(), _cpt, _cpb)
            _h = _t.wrap(_CW, 9999 * mm)[1]
            _dbg(f"compress ({_cpt},{_cpb}): {_h/mm:.1f}mm vs budget {_budget/mm:.1f}mm")
            if _h <= _budget:
                items_tbl, items_h, _filler_n = _t, _h, 0
                break
        else:
            items_tbl = _make_items_tbl(_fresh_rows(), 2, 2)
            items_h   = items_tbl.wrap(_CW, 9999 * mm)[1]
            _filler_n = 0

    _content_total = _pre_items_h + items_h + _footer_h_actual
    _dbg(f"invoice V20: sp_title={_sp_title/mm:.1f}mm sp_info={_sp_info/mm:.1f}mm "
         f"pre={_pre_items_h/mm:.1f}mm items={items_h/mm:.1f}mm "
         f"footer={_footer_h_actual/mm:.1f}mm total={_content_total/mm:.1f}mm "
         f"usable={_usable_h/mm:.1f}mm budget={_budget/mm:.1f}mm filler={_filler_n} "
         f"generator={__file__}")
    print(f"[pdf V20] invoice={inv_no} items={len(actual_items)} "
          f"sp={_sp_title/mm:.1f}+{_sp_info/mm:.1f}mm "
          f"pre={_pre_items_h/mm:.1f}mm items_h={items_h/mm:.1f}mm "
          f"footer={_footer_h_actual/mm:.1f}mm total={_content_total/mm:.1f}mm filler={_filler_n}")

    # Build story in order now that all measurements are known
    story.append(_title_para)
    story.append(Spacer(1, _sp_title))
    story.append(info_wrap)
    story.append(Spacer(1, _sp_info))
    story.append(items_tbl)
    story.append(KeepTogether(footer_block))

    doc.build(story, onFirstPage=_draw_header, onLaterPages=_draw_later)
    _dbg(f"invoice V20: PDF built -> {filepath}")
    return filepath


# ── Account Statement ─────────────────────────────────────────────────────────
def generate_statement_pdf(customer: dict, entries: list, date_from, date_to,
                           opening_balance: float, closing_balance: float, company: dict,
                           show_lpo: bool = False, lpo_number: str = "") -> str:

    # ── Date helpers ──────────────────────────────────────────────────────────
    def _parse_ds(s):
        if not s:
            return None
        try:
            return datetime.fromisoformat(str(s).split("T")[0])
        except Exception:
            return None

    def _fmt_d(d):
        return d.strftime("%d %b %Y") if d else ""

    def _period_str(df, dt):
        d1, d2 = _parse_ds(df), _parse_ds(dt)
        if not d1 and not d2:
            return "All Dates"
        if not d1:
            return f"Up to {_fmt_d(d2)}"
        if not d2:
            return f"From {_fmt_d(d1)}"
        if d1.month == d2.month and d1.year == d2.year:
            return d1.strftime("%B %Y")
        return f"{_fmt_d(d1)} to {_fmt_d(d2)}"

    filename = (f"Statement_{_safe_fn(customer.get('name', 'Customer'))}_"
                f"{datetime.now().strftime('%Y%m%d%H%M%S')}.pdf")
    filepath = os.path.join(EXPORT_DIR, filename)

    page_w, page_h = A4
    use_lh    = os.path.exists(LETTERHEAD_PATH)
    LH_MAX_H  = 70 * mm
    LH_MIN_H  = 62 * mm
    raw_lh_h  = _lh_page_height() if use_lh else 0.0
    lh_draw_h = max(LH_MIN_H, min(raw_lh_h, LH_MAX_H)) if raw_lh_h > 0 else 0.0
    top_margin = (lh_draw_h + 6 * mm) if lh_draw_h else 15 * mm

    stamp_path = _get_stamp_path()

    # Sig block is now in the story; only a small bottom margin needed
    _BOT = 15 * mm

    def _draw_stmt_page(canv, _doc):
        canv.saveState()
        if lh_draw_h:
            canv.drawImage(LETTERHEAD_PATH, 0, page_h - lh_draw_h,
                           width=page_w, height=lh_draw_h,
                           preserveAspectRatio=False, mask='auto')
        canv.restoreState()

    doc = SimpleDocTemplate(
        filepath, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=top_margin, bottomMargin=_BOT,
    )

    # ── Styles ─────────────────────────────────────────────────────────────────
    title_s  = ParagraphStyle("st_ti",  fontName="Helvetica-Bold", fontSize=18,
                               textColor=PRIMARY, alignment=TA_CENTER)
    lbl_s    = ParagraphStyle("st_lb",  fontName="Helvetica-Bold", fontSize=8.5,
                               textColor=MED_GRAY)
    val_s    = ParagraphStyle("st_vl",  fontName="Helvetica",      fontSize=9,  textColor=DARK)
    val_b    = ParagraphStyle("st_vb",  fontName="Helvetica-Bold", fontSize=9,  textColor=DARK)
    lbl_r    = ParagraphStyle("st_lr",  fontName="Helvetica-Bold", fontSize=8.5,
                               textColor=MED_GRAY, alignment=TA_RIGHT)
    val_r    = ParagraphStyle("st_vr",  fontName="Helvetica",      fontSize=9,
                               textColor=DARK, alignment=TA_RIGHT)
    val_rb   = ParagraphStyle("st_vrb", fontName="Helvetica-Bold", fontSize=9,
                               textColor=DARK, alignment=TA_RIGHT)
    style_h  = ParagraphStyle("st_h",   fontName="Helvetica-Bold", fontSize=8,  textColor=WHITE)
    style_r  = ParagraphStyle("st_r",   fontName="Helvetica",      fontSize=8,  textColor=DARK)
    style_rc = ParagraphStyle("st_rc",  fontName="Helvetica",      fontSize=8,
                               textColor=DARK, alignment=TA_RIGHT)
    style_rb = ParagraphStyle("st_rb",  fontName="Helvetica-Bold", fontSize=8,
                               textColor=DARK, alignment=TA_RIGHT)
    style_wh = ParagraphStyle("st_wh",  fontName="Helvetica-Bold", fontSize=8,
                               textColor=WHITE, alignment=TA_RIGHT)

    story = []

    # ── 1. Centered title — tight to letterhead, breathing room below before customer block
    story.append(Paragraph("ACCOUNT STATEMENT", title_s))
    story.append(Spacer(1, 10 * mm))

    # ── 2. Info block (2 columns) ─────────────────────────────────────────────
    period    = _period_str(date_from, date_to)
    today_str = datetime.now().strftime("%d %b %Y")

    # Outer padding is 6mm each side; inner cols must fit within available content width
    # Left cell: 180*0.56=100.8mm - 12mm padding = 88.8mm available
    # Right cell: 180*0.44=79.2mm - 12mm padding = 67.2mm available
    left_rows = [
        [Paragraph("Customer:", lbl_s),
         Paragraph(_xe(customer.get("name", "")), val_b)],
        [Paragraph("Period:",   lbl_s),
         Paragraph(period, val_s)],
    ]
    if customer.get("trn"):
        left_rows.append([Paragraph("TRN:", lbl_s),
                          Paragraph(_xe(customer["trn"]), val_s)])
    if show_lpo and lpo_number:
        left_rows.append([Paragraph("LPO No:", lbl_s),
                          Paragraph(_xe(lpo_number), val_b)])

    right_rows = [
        [Paragraph("Statement Date:", lbl_r),
         Paragraph(today_str, val_rb)],
    ]

    left_inner  = Table(left_rows,  colWidths=[22 * mm, 66 * mm])   # 88mm total
    right_inner = Table(right_rows, colWidths=[30 * mm, 36 * mm])   # 66mm total
    for t_inner in (left_inner, right_inner):
        t_inner.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",    (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ]))

    info_outer = Table([[left_inner, right_inner]],
                       colWidths=[_CONTENT_W * 0.56, _CONTENT_W * 0.44])
    info_outer.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("BACKGROUND",    (0, 0), (-1, -1), LIGHT_GRAY),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
    ]))
    story.append(info_outer)
    story.append(Spacer(1, 15 * mm))

    # ── 3. Ledger table ───────────────────────────────────────────────────────
    headers    = ["Date", "Description", "Debit (AED)", "Credit (AED)", "Balance (AED)"]
    col_widths = [25 * mm, 75 * mm, 25 * mm, 25 * mm, 25 * mm]
    data       = [[Paragraph(h, style_h) for h in headers]]

    # Opening balance row
    ob_date = _fmt_d(_parse_ds(date_from))
    data.append([
        Paragraph(ob_date, style_r),
        Paragraph("<b>Opening Balance</b>", style_r),
        Paragraph("", style_rc), Paragraph("", style_rc),
        Paragraph(f"{opening_balance:.2f}", style_rb),
    ])

    for entry in entries:
        date_str = entry.get("date", "")
        if isinstance(date_str, datetime):
            date_str = date_str.strftime("%d %b %Y")
        data.append([
            Paragraph(str(date_str), style_r),
            Paragraph(_xe(entry.get("description", "")), style_r),
            Paragraph(f"{entry.get('debit', 0):.2f}"  if entry.get("debit",  0) else "—", style_rc),
            Paragraph(f"{entry.get('credit', 0):.2f}" if entry.get("credit", 0) else "—", style_rc),
            Paragraph(f"{entry.get('balance', 0):.2f}", style_rc),
        ])

    # Filler rows — explicit rowHeights so table EXACTLY fills calculated space
    # Actual row render: 8pt text + 4+4pt pad ≈ 6.2mm — use 8mm so rows are taller/visible
    _ROW_H    = 8 * mm
    _HDR_H    = 8 * mm
    _lh_story = 0 if lh_draw_h else 20 * mm
    # Overhead above table: Spacer(2)+title(8)+Spacer(4)+info(13)+Spacer(15) ≈ 42mm; +1mm margin
    # _below: Spacer(3)+HR+Spacer(4)+sig_tbl(38mm stamp ≈ 55mm) ≈ 62mm; +1mm margin
    _OVER     = _lh_story + 43 * mm
    _below    = 62 * mm
    _avail    = page_h - top_margin - _BOT - _OVER - _below
    _n_data   = len(entries) + 2   # OB + entries + CB
    _fill     = max(0, int((_avail - _HDR_H) / _ROW_H) - _n_data)
    for _ in range(_fill):
        data.append([Paragraph("", style_r)] * 5)

    # Closing balance — highlighted row; all text WHITE on dark blue background
    _cb_label = "Closing Balance (Dr)" if closing_balance >= 0 else "Closing Balance (Cr)"
    style_wc = ParagraphStyle("st_wc", fontName="Helvetica-Bold", fontSize=8, textColor=WHITE, alignment=TA_CENTER)
    style_wl = ParagraphStyle("st_wl", fontName="Helvetica-Bold", fontSize=8, textColor=WHITE)
    data.append([
        Paragraph("", style_wl),
        Paragraph(f"<b>{_cb_label}</b>", style_wl),
        Paragraph("", style_wh), Paragraph("", style_wh),
        Paragraph(f"<b>{abs(closing_balance):.2f}</b>", style_wh),
    ])

    t = Table(data, colWidths=col_widths,
              rowHeights=[_HDR_H] + [_ROW_H] * (len(data) - 1))
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0),  (-1, 0),  PRIMARY),
        ("ROWBACKGROUNDS",(0, 1),  (-1, -2), [LIGHT_GRAY, WHITE]),
        ("BACKGROUND",    (0, -1), (-1, -1), PRIMARY),
        ("FONTSIZE",      (0, 0),  (-1, -1), 8),
        ("GRID",          (0, 0),  (-1, -1), 0.3, colors.HexColor("#CBD5E1")),
        ("VALIGN",        (0, 0),  (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0),  (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0),  (-1, -1), 4),
        ("LEFTPADDING",   (0, 0),  (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0),  (-1, -1), 4),
        ("BACKGROUND",    (0, 1),  (-1, 1),  colors.HexColor("#F1F5F9")),
        ("FONTNAME",      (0, 1),  (-1, 1),  "Helvetica-Bold"),
    ]))
    story.append(t)

    from reportlab.platypus import KeepTogether

    _cb_abs   = abs(closing_balance)
    _cb_words = _amount_in_words(_cb_abs)
    _cr_dr    = "Credit" if closing_balance < 0 else "Debit"
    aiw_s    = ParagraphStyle("st_aiw", fontName="Helvetica",      fontSize=7.5, textColor=DARK)
    sig_ln_s = ParagraphStyle("st_sln", fontName="Helvetica",      fontSize=8,   textColor=DARK, alignment=TA_CENTER)
    sig_lb_s = ParagraphStyle("st_slb", fontName="Helvetica-Bold", fontSize=8,   textColor=DARK, alignment=TA_CENTER)

    aiw_para = Paragraph(
        f"<b>Amount in Words:</b><br/>{_xe(_cb_words)} ({_cr_dr})", aiw_s)

    sig_right = []
    if stamp_path:
        try:
            from PIL import Image as PILImage
            with PILImage.open(stamp_path) as _simg:
                _sw, _sh = _simg.size
            _st_w = 38 * mm
            _st_h = min(_st_w, _st_w * _sh / _sw)
            sig_right.append(Image(stamp_path, width=_st_w, height=_st_h))
            sig_right.append(Spacer(1, 2 * mm))
        except Exception:
            pass
    sig_right.append(Paragraph("_" * 36, sig_ln_s))
    sig_right.append(Spacer(1, 1 * mm))
    sig_right.append(Paragraph("Authorized Signature", sig_lb_s))

    sig_tbl = Table(
        [[aiw_para, sig_right]],
        colWidths=[_CONTENT_W * 0.55, _CONTENT_W * 0.45],
    )
    sig_tbl.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",         (1, 0), (1,  0),  "CENTER"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEAFTER",     (0, 0), (0,  0),  0.3, colors.HexColor("#CBD5E1")),
    ]))

    story.append(KeepTogether([
        Spacer(1, 3 * mm),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#CBD5E1")),
        Spacer(1, 4 * mm),
        sig_tbl,
    ]))

    doc.build(story, onFirstPage=_draw_stmt_page, onLaterPages=_draw_stmt_page)
    return filepath


# ── Quotation ─────────────────────────────────────────────────────────────────
def generate_quotation_pdf(quotation_data: dict, company: dict) -> str:
    from reportlab.platypus import KeepTogether

    _CW = A4[0] - 20 * mm   # V14: 10 mm margins each side → ≈ 190 mm content width

    filename  = f"Quotation_{quotation_data['quotation_number']}_{datetime.now().strftime('%Y%m%d%H%M%S')}.pdf"
    filepath  = os.path.join(EXPORT_DIR, filename)

    lh_file_ok_q = os.path.exists(LETTERHEAD_PATH)
    _dbg(f"[quotation] LETTERHEAD_PATH={LETTERHEAD_PATH} exists={lh_file_ok_q}")
    use_lh        = quotation_data.get("letterhead", True) and lh_file_ok_q
    _dbg(f"[quotation] use_lh={use_lh} flag={quotation_data.get('letterhead', True)}")
    page_w, page_h = A4

    LH_MAX_H  = 70 * mm
    LH_MIN_H  = 62 * mm
    raw_lh_h  = _lh_page_height() if use_lh else 0.0
    lh_draw_h = max(LH_MIN_H, min(raw_lh_h, LH_MAX_H)) if raw_lh_h > 0 else 0.0
    top_margin = (lh_draw_h + 6 * mm) if lh_draw_h else 63 * mm

    def _draw_lh_q(canv, _doc):
        if not lh_draw_h:
            return
        canv.saveState()
        canv.drawImage(LETTERHEAD_PATH, 0, page_h - lh_draw_h,
                       width=page_w, height=lh_draw_h,
                       preserveAspectRatio=False, mask='auto')
        canv.restoreState()

    doc = SimpleDocTemplate(
        filepath, pagesize=A4,
        leftMargin=10 * mm, rightMargin=10 * mm,
        topMargin=top_margin, bottomMargin=4 * mm,
    )
    story = []

    quo_no        = quotation_data.get("quotation_number", "")
    quo_date      = quotation_data.get("date", "")
    valid_until   = quotation_data.get("valid_until", "") or ""
    customer      = quotation_data.get("customer") or {}
    subtotal      = quotation_data.get("subtotal",    0)
    vat_amount    = quotation_data.get("vat_amount",  0)
    discount      = quotation_data.get("discount",    0)
    total         = quotation_data.get("total",       0)
    notes         = quotation_data.get("notes",          "") or ""
    payment_terms = quotation_data.get("payment_terms",  "") or ""
    delivery      = quotation_data.get("delivery",       "") or ""
    comp_trn      = (company or {}).get("trn", "") or ""
    _comp_stamp_q = (company or {}).get("stamp_path", "") or ""
    # Defensive item filter — strip any stale/deleted/blank items
    _raw_items_q = [
        it for it in quotation_data.get("items", [])
        if not it.get("deleted_at") and (it.get("description") or "").strip()
    ]
    _dbg(f"[quotation] generate_quotation_pdf: quo={quo_no} pdf_render_count={len(_raw_items_q)}")
    print(f"[quotation pdf_generator] quo={quo_no} pdf_render_count={len(_raw_items_q)}")

    title_s  = ParagraphStyle("qt",   fontName="Helvetica-Bold", fontSize=18,  textColor=ACCENT,    alignment=TA_CENTER)
    box_hdr  = ParagraphStyle("qbh",  fontName="Helvetica-Bold", fontSize=8.5, textColor=WHITE,     alignment=TA_CENTER)
    lbl_s    = ParagraphStyle("ql",   fontName="Helvetica-Bold", fontSize=8,   textColor=MED_GRAY)
    val_s    = ParagraphStyle("qv",   fontName="Helvetica",      fontSize=8.5, textColor=DARK)
    val_b    = ParagraphStyle("qvb",  fontName="Helvetica-Bold", fontSize=9,   textColor=DARK)
    ih_s     = ParagraphStyle("qih",  fontName="Helvetica-Bold", fontSize=8,   textColor=WHITE,     alignment=TA_CENTER)
    ir_s     = ParagraphStyle("qir",  fontName="Helvetica",      fontSize=8,   textColor=DARK)
    irc_s    = ParagraphStyle("qirc", fontName="Helvetica",      fontSize=8,   textColor=DARK,      alignment=TA_RIGHT)
    icc_s    = ParagraphStyle("qicc", fontName="Helvetica",      fontSize=8,   textColor=DARK,      alignment=TA_CENTER)
    tl_s     = ParagraphStyle("qtl",  fontName="Helvetica",      fontSize=8.5, textColor=DARK,      alignment=TA_RIGHT)
    tv_s     = ParagraphStyle("qtv",  fontName="Helvetica",      fontSize=8.5, textColor=DARK,      alignment=TA_RIGHT)
    tb_s     = ParagraphStyle("qtb",  fontName="Helvetica-Bold", fontSize=10,  textColor=WHITE,     alignment=TA_RIGHT)
    tc_hdr_s = ParagraphStyle("qtch", fontName="Helvetica-Bold", fontSize=7.5, textColor=PRIMARY)
    tc_val_s = ParagraphStyle("qtcv", fontName="Helvetica",      fontSize=7,   textColor=DARK,      leading=9)
    sig_ln_s = ParagraphStyle("qsl",  fontName="Helvetica",      fontSize=8,   textColor=DARK,      alignment=TA_CENTER)
    sig_sb_s = ParagraphStyle("qss",  fontName="Helvetica",      fontSize=7,   textColor=DARK,      alignment=TA_CENTER)
    ft_s     = ParagraphStyle("qft",  fontName="Helvetica",      fontSize=6.5, textColor=MED_GRAY,  alignment=TA_CENTER)

    # ── 1. Title — defer append until adaptive spacers are computed ──────────
    _title_para_q = Paragraph("QUOTATION", title_s)

    # ── 2. Two bordered boxes: Customer (left) | Quotation Info (right) ───────
    cust_rows = [[Paragraph("TO:", lbl_s), Paragraph(_xe(customer.get("name", "")), val_b)]]
    if customer.get("attn"):
        cust_rows.append([Paragraph("ATTN:", lbl_s), Paragraph(_xe(customer["attn"]), val_s)])
    if customer.get("trn"):
        cust_rows.append([Paragraph("TRN:", lbl_s), Paragraph(_xe(customer["trn"]), val_s)])
    if customer.get("phone"):
        cust_rows.append([Paragraph("TEL:", lbl_s), Paragraph(_xe(customer["phone"]), val_s)])
    if customer.get("address"):
        cust_rows.append([Paragraph("ADD:", lbl_s),
                          Paragraph(_xe(customer["address"].replace("\n", ", ")), val_s)])

    # inner table fits inside 90mm box with 4mm l+r padding → 82mm wide
    cust_inner = Table(cust_rows, colWidths=[10 * mm, 72 * mm])
    cust_inner.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING",   (0, 0), (-1, -1), 2),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 2),
    ]))
    cust_box = Table([[Paragraph("CUSTOMER DETAILS", box_hdr)], [cust_inner]], colWidths=[90 * mm])
    cust_box.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 0.8, ACCENT),
        ("LINEBELOW",     (0, 0), (-1, 0),  0.8, ACCENT),
        ("BACKGROUND",    (0, 0), (-1, 0),  ACCENT),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
    ]))

    info_rows = [
        [Paragraph("REF NO:", lbl_s), Paragraph(_xe(quo_no), val_b)],
        [Paragraph("DATE:",   lbl_s), Paragraph(_xe(quo_date), val_s)],
    ]
    if valid_until:
        info_rows.append([Paragraph("VALID:", lbl_s), Paragraph(_xe(valid_until), val_s)])
    if payment_terms:
        info_rows.append([Paragraph("TERMS:", lbl_s), Paragraph(_xe(payment_terms), val_s)])
    if delivery:
        info_rows.append([Paragraph("DELIVERY:", lbl_s), Paragraph(_xe(delivery), val_s)])

    info_inner = Table(info_rows, colWidths=[18 * mm, 64 * mm])
    info_inner.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING",   (0, 0), (-1, -1), 2),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 2),
    ]))
    info_box = Table([[Paragraph("QUOTATION DETAILS", box_hdr)], [info_inner]], colWidths=[90 * mm])
    info_box.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 0.8, ACCENT),
        ("LINEBELOW",     (0, 0), (-1, 0),  0.8, ACCENT),
        ("BACKGROUND",    (0, 0), (-1, 0),  ACCENT),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
    ]))

    # 90 + 10 + 90 = 190mm = _CW
    top_t = Table([[cust_box, Spacer(10 * mm, 1), info_box]], colWidths=[90 * mm, 10 * mm, 90 * mm])
    top_t.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    # story appends deferred — adaptive spacers chosen in V22 layout block below

    # ── 3. Items table (5 cols: SR NO | DESCRIPTION | QTY | UNIT PRICE | AMOUNT)
    _actual_n = len(_raw_items_q)
    _HDR_H_Q  = 8 * mm
    _FILLER_H = 8 * mm

    # 14+94+18+32+32 = 190mm
    q_col_w = [14 * mm, 94 * mm, 18 * mm, 32 * mm, 32 * mm]
    q_hdrs  = ["SR\nNO", "DESCRIPTION", "QTY", "UNIT PRICE\n(AED)", "AMOUNT\n(AED)"]
    q_data  = [[Paragraph(h, ih_s) for h in q_hdrs]]

    for idx, item in enumerate(_raw_items_q, 1):
        qty = item.get("quantity", 1)
        up  = item.get("unit_price", 0)
        amt = round(qty * up, 2)
        q_data.append([
            Paragraph(str(idx), icc_s),
            Paragraph(_xe(item.get("description", "")), ir_s),
            Paragraph(_qty_label(qty), icc_s),
            Paragraph(f"{up:.2f}", irc_s),
            Paragraph(f"{amt:.2f}", irc_s),
        ])

    _style_cmds = [
        ("BACKGROUND",    (0, 0),  (-1, 0),  ACCENT),
        ("ROWBACKGROUNDS",(0, 1),  (-1, -1), [ROW_STRIPE, WHITE]),
        ("GRID",          (0, 0),  (-1, -1), 0.5, colors.HexColor("#C0C8D8")),
        ("VALIGN",        (0, 0),  (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0),  (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0),  (-1, -1), 4),
        ("LEFTPADDING",   (0, 0),  (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0),  (-1, -1), 4),
        ("LEFTPADDING",   (1, 1),  (1, -1),  6),
        ("RIGHTPADDING",  (1, 1),  (1, -1),  6),
    ]

    # Measure actual rows with auto-heights so long descriptions wrap freely (no clipping)
    _temp_t = Table(q_data, colWidths=q_col_w)
    _temp_t.setStyle(TableStyle(_style_cmds))
    _, _real_h = _temp_t.wrap(_CW, 9999 * mm)
    _real_row_heights = list(_temp_t._rowHeights)
    _real_row_heights[0] = max(_real_row_heights[0], _HDR_H_Q)  # enforce min header height

    # ── 3b. Build footer first to measure actual height for filler budget ──────
    tot_rows_q = []
    tot_rows_q.append([Paragraph("Subtotal (AED):", tl_s), Paragraph(f"{subtotal:.2f}", tv_s)])
    tot_rows_q.append([Paragraph("VAT 5% (AED):",   tl_s), Paragraph(f"{vat_amount:.2f}", tv_s)])
    if discount > 0:
        tot_rows_q.append([Paragraph("Discount (AED):", tl_s), Paragraph(f"- {discount:.2f}", tv_s)])
    tot_rows_q.append([Paragraph("GRAND TOTAL (AED):", tb_s), Paragraph(f"{total:.2f}", tb_s)])
    tot_t_q = Table(tot_rows_q, colWidths=[55 * mm, 35 * mm])
    tot_t_q.setStyle(TableStyle([
        ("ALIGN",         (0, 0),  (-1, -1), "RIGHT"),
        ("VALIGN",        (0, 0),  (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0),  (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0),  (-1, -1), 3),
        ("GRID",          (0, 0),  (-1, -2), 0.3, colors.HexColor("#CBD5E1")),
        ("LINEABOVE",     (0, -1), (-1, -1), 1, ACCENT),
        ("BACKGROUND",    (0, -1), (-1, -1), ACCENT),
    ]))
    tot_wrap_q = Table([[Spacer(1, 1), tot_t_q]], colWidths=[_CW - 90 * mm, 90 * mm])
    tot_wrap_q.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))

    _words_raw   = _amount_in_words(total)
    _words_upper = (_words_raw[4:] if _words_raw.startswith("AED ") else _words_raw).upper()
    _aiw_s = ParagraphStyle("qaiw", fontName="Helvetica-Bold", fontSize=8, textColor=DARK)
    _aiw_text = f"TOTAL :-   {_words_upper}   {'*' * 25}"
    _aiw_t = Table([[Paragraph(_aiw_text, _aiw_s)]], colWidths=[_CW])
    _aiw_t.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 0.8, ACCENT),
        ("BACKGROUND",    (0, 0), (-1, -1), colors.HexColor("#EFF6FF")),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
    ]))

    terms_cell = [Paragraph("Terms &amp; Conditions:", tc_hdr_s)]
    terms_cell += [
        Paragraph("1) Delivery as agreed.", tc_val_s),
        Paragraph("2) Prices valid for limited period.", tc_val_s),
        Paragraph("3) Material/work once approved cannot be returned.", tc_val_s),
    ]
    if notes:
        terms_cell.append(Paragraph(f"Note: {_xe(notes)}", tc_val_s))

    # Check include_stamp first; fall back to show_stamp; default True (show stamp)
    _inc_q       = quotation_data.get("include_stamp")
    _show_q      = quotation_data.get("show_stamp")
    _stamp_raw_q = _inc_q if _inc_q is not None else (_show_q if _show_q is not None else None)
    include_stamp_q = True if _stamp_raw_q is None else bool(_stamp_raw_q)
    stamp_path_q = _get_stamp_path(_comp_stamp_q) if include_stamp_q else ""
    _dbg(f"[quotation] stamp_enabled={include_stamp_q} inc={_inc_q} show={_show_q}")
    _dbg(f"[quotation] resolved_stamp_path={stamp_path_q or 'none'}")
    _dbg(f"[quotation] stamp_exists={bool(stamp_path_q)}")
    sig_cell = []
    if stamp_path_q:
        try:
            from PIL import Image as PILImage
            with PILImage.open(stamp_path_q) as img:
                sw, sh = img.size
            STAMP_W = 38 * mm
            stamp_h = min(STAMP_W * sh / sw, 16 * mm)
            sig_cell.append(Image(stamp_path_q, width=STAMP_W, height=stamp_h))
            sig_cell.append(Spacer(1, 1 * mm))
            _dbg(f"[quotation] stamp rendered: {STAMP_W:.1f}x{stamp_h:.1f} from {stamp_path_q}")
        except Exception as _se:
            _dbg(f"[quotation] stamp render ERROR: {_se}")
            sig_cell.append(Spacer(1, 4 * mm))
    else:
        _dbg(f"[quotation] stamp skipped: include_stamp={include_stamp_q} path={stamp_path_q or 'none'}")
        sig_cell.append(Spacer(1, 4 * mm))
    sig_cell += [
        Paragraph("________________________", sig_ln_s),
        Spacer(1, 2 * mm),
        Paragraph("Authorized Signature", sig_sb_s),
    ]

    # 105 + 85 = 190mm — no fixed rowHeights so table auto-sizes to content
    bottom_t = Table([[terms_cell, sig_cell]], colWidths=[105 * mm, 85 * mm])
    bottom_t.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "BOTTOM"),
        ("ALIGN",         (1, 0), (1, 0),   "CENTER"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LINEAFTER",     (0, 0), (0, 0),   0.3, colors.HexColor("#CBD5E1")),
    ]))

    bottom_block = [
        Spacer(1, 2 * mm),
        HRFlowable(width="100%", thickness=0.4, color=colors.HexColor("#CBD5E1")),
        Spacer(1, 1 * mm),
        bottom_t,
        Spacer(1, 1 * mm),
        HRFlowable(width="100%", thickness=0.3, color=MED_GRAY),
        Spacer(1, 0.5 * mm),
        Paragraph("This is a computer generated quotation. Thank you for the opportunity to be of service.", ft_s),
    ]

    # ── V22: measure first, then pick balanced spacers + smart filler ────────
    _post_measure = [Spacer(1, 0.5 * mm), tot_wrap_q, Spacer(1, 1 * mm), _aiw_t] + bottom_block
    _footer_h_q   = sum(f.wrap(_CW, 9999 * mm)[1] for f in _post_measure)
    _title_h_q    = _title_para_q.wrap(_CW, 9999 * mm)[1]
    _top_t_h      = top_t.wrap(_CW, 9999 * mm)[1]
    _usable_h     = page_h - top_margin - 4 * mm
    _OVERHEAD     = 12 * mm
    _RENDER_SAFE  = 12 * mm

    # Adaptive spacers: prefer 5mm top + 6mm after title + 4mm after boxes = 15mm total
    _sp_budget = _usable_h - _real_h - _footer_h_q - _OVERHEAD - _title_h_q - _top_t_h
    _sp_prefer = (5 + 6 + 4) * mm
    _sp_total  = min(_sp_prefer, max(4 * mm, _sp_budget))
    _sp_top    = min(5 * mm, max(2 * mm, _sp_total * 0.34))
    _sp_title  = max(3 * mm, min(6 * mm, _sp_total - _sp_top - 2 * mm))
    _sp_info   = max(2 * mm, _sp_total - _sp_top - _sp_title)

    _pre_h  = _sp_top + _title_h_q + _sp_title + _top_t_h + _sp_info
    _budget = _usable_h - _pre_h - _footer_h_q - _RENDER_SAFE

    # V22 smart filler: prefer more rows for short quotations, reduce until safe
    _prefer_fill = (6 if _actual_n <= 1 else
                    5 if _actual_n == 2 else
                    4 if _actual_n == 3 else
                    3 if _actual_n == 4 else
                    2 if _actual_n == 5 else
                    1 if _actual_n == 6 else 0)
    empty_row_q = [Paragraph("", ir_s)] * 5
    _filler_n   = 0
    for _fn in range(_prefer_fill, 0, -1):
        _cand_heights = _real_row_heights + [_FILLER_H] * _fn
        _cand_t = Table(q_data + [empty_row_q] * _fn, colWidths=q_col_w, rowHeights=_cand_heights)
        _cand_t.setStyle(TableStyle(_style_cmds))
        _cand_h = _cand_t.wrap(_CW, 9999 * mm)[1]
        if _cand_h <= _budget:
            _filler_n = _fn
            break

    _final_row_heights = _real_row_heights + [_FILLER_H] * _filler_n
    items_t = Table(q_data + [empty_row_q] * _filler_n, colWidths=q_col_w, rowHeights=_final_row_heights)
    items_t.setStyle(TableStyle(_style_cmds))

    # Safety compression: if real items exceed budget, tighten row padding
    if _real_h > _budget:
        def _make_quo_tbl(top_pad, bot_pad):
            cmds = [c for c in _style_cmds if c[0] not in ("TOPPADDING", "BOTTOMPADDING")]
            cmds += [("TOPPADDING",    (0, 0), (-1, -1), top_pad),
                     ("BOTTOMPADDING", (0, 0), (-1, -1), bot_pad)]
            t = Table(q_data, colWidths=q_col_w)
            t.setStyle(TableStyle(cmds))
            return t

        for _cpt, _cpb in [(3, 2), (2, 2), (1, 1)]:
            _t = _make_quo_tbl(_cpt, _cpb)
            _h = _t.wrap(_CW, 9999 * mm)[1]
            _dbg(f"[quotation] compress ({_cpt},{_cpb}): {_h/mm:.1f}mm vs budget {_budget/mm:.1f}mm")
            if _h <= _budget:
                items_t, _filler_n = _t, 0
                break
        else:
            items_t = _make_quo_tbl(2, 2)
            _filler_n = 0

    _dbg(f"[quotation V22] n={_actual_n} sp_title={_sp_title/mm:.1f}mm sp_info={_sp_info/mm:.1f}mm "
         f"pre={_pre_h/mm:.1f}mm items={_real_h/mm:.1f}mm footer={_footer_h_q/mm:.1f}mm "
         f"budget={_budget/mm:.1f}mm filler={_filler_n}")
    print(f"[quo V22] quo={quo_no} n={_actual_n} filler={_filler_n} "
          f"pre={_pre_h/mm:.1f}mm footer={_footer_h_q/mm:.1f}mm budget={_budget/mm:.1f}mm")

    # Build story in order now that all measurements are known
    story.append(Spacer(1, _sp_top))
    story.append(_title_para_q)
    story.append(Spacer(1, _sp_title))
    story.append(top_t)
    story.append(Spacer(1, _sp_info))
    story.append(items_t)
    story.append(Spacer(1, 0.5 * mm))
    story.append(tot_wrap_q)
    story.append(Spacer(1, 1 * mm))
    story.append(_aiw_t)
    story.append(KeepTogether(bottom_block))

    doc.build(story, onFirstPage=_draw_lh_q, onLaterPages=lambda c, d: None)
    _dbg(f"[quotation V22] PDF built -> {filepath}")
    return filepath


# ── Payment Voucher ───────────────────────────────────────────────────────────
def generate_payment_voucher_pdf(payment_data: dict, company: dict) -> str:
    filename = f"Payment_{payment_data['payment_number']}_{datetime.now().strftime('%Y%m%d%H%M%S')}.pdf"
    filepath = os.path.join(EXPORT_DIR, filename)

    top_margin = 5 * mm if os.path.exists(LETTERHEAD_PATH) else 15 * mm
    doc = SimpleDocTemplate(
        filepath, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=top_margin, bottomMargin=20 * mm,
    )

    story = []
    _build_top(
        story, company, "PAYMENT VOUCHER",
        payment_data["payment_number"],
        payment_data.get("date", datetime.now().strftime("%d %b %Y")),
    )
    story.append(Spacer(1, 8 * mm))

    label_style  = ParagraphStyle("lbl", fontName="Helvetica-Bold", fontSize=9,  textColor=MED_GRAY)
    val_style    = ParagraphStyle("val", fontName="Helvetica",      fontSize=10, textColor=DARK)
    amount_style = ParagraphStyle("amt", fontName="Helvetica-Bold", fontSize=20, textColor=ACCENT, alignment=TA_CENTER)

    info_data = [
        ["Received From:",   payment_data.get("customer_name", "")],
        ["Payment Method:",  payment_data.get("method", "Cash").title()],
        ["Reference:",       payment_data.get("reference", "-")],
        ["Invoice No:",      payment_data.get("invoice_number", "General Payment")],
    ]
    for row in info_data:
        t = Table([[Paragraph(row[0], label_style), Paragraph(str(row[1]), val_style)]],
                  colWidths=[45 * mm, 125 * mm])
        t.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LINEBELOW",     (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
        ]))
        story.append(t)
        story.append(Spacer(1, 2 * mm))

    story.append(Spacer(1, 8 * mm))
    amount_box = Table(
        [[Paragraph("AMOUNT RECEIVED", label_style)],
         [Paragraph(f"AED {payment_data.get('amount', 0):,.2f}", amount_style)]],
        colWidths=[170 * mm]
    )
    amount_box.setStyle(TableStyle([
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("BOX",           (0, 0), (-1, -1), 1, PRIMARY),
        ("BACKGROUND",    (0, 0), (-1, -1), LIGHT_GRAY),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(amount_box)

    if payment_data.get("notes"):
        story.append(Spacer(1, 6 * mm))
        note_style = ParagraphStyle("note", fontName="Helvetica", fontSize=8, textColor=MED_GRAY)
        story.append(Paragraph(f"<b>Notes:</b> {payment_data['notes']}", note_style))

    story.append(Spacer(1, 15 * mm))
    sig_table = Table([["_______________________", "_______________________"]], colWidths=[85 * mm, 85 * mm])
    sig_table.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("FONTSIZE", (0, 0), (-1, -1), 8), ("TEXTCOLOR", (0, 0), (-1, -1), MED_GRAY)]))
    story.append(sig_table)
    sig_labels = Table([["Received By", "Authorized Signature"]], colWidths=[85 * mm, 85 * mm])
    sig_labels.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("FONTSIZE", (0, 0), (-1, -1), 8), ("TEXTCOLOR", (0, 0), (-1, -1), MED_GRAY)]))
    story.append(sig_labels)

    doc.build(story)
    return filepath


# ── Receipt Voucher ───────────────────────────────────────────────────────────
def generate_receipt_voucher_pdf(payment_data: dict, company: dict) -> str:
    from reportlab.platypus import KeepTogether

    filename  = f"Receipt_{payment_data['payment_number']}_{datetime.now().strftime('%Y%m%d%H%M%S')}.pdf"
    filepath  = os.path.join(EXPORT_DIR, filename)

    page_w, page_h = A4
    use_lh = os.path.exists(LETTERHEAD_PATH)

    LH_MAX_H  = 70 * mm
    LH_MIN_H  = 62 * mm
    raw_lh_h  = _lh_page_height() if use_lh else 0.0
    lh_draw_h = max(LH_MIN_H, min(raw_lh_h, LH_MAX_H)) if raw_lh_h > 0 else 0.0
    top_margin = (lh_draw_h + 6 * mm) if lh_draw_h else 15 * mm

    def _draw_lh_rv(canv, _doc):
        if not lh_draw_h:
            return
        canv.saveState()
        canv.drawImage(LETTERHEAD_PATH, 0, page_h - lh_draw_h,
                       width=page_w, height=lh_draw_h,
                       preserveAspectRatio=False, mask='auto')
        canv.restoreState()

    doc = SimpleDocTemplate(
        filepath, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=top_margin, bottomMargin=10 * mm,
    )
    story = []

    is_advance  = payment_data.get("is_advance", False)
    pay_no      = payment_data["payment_number"]
    pay_date    = payment_data.get("date", datetime.now().strftime("%d %b %Y"))
    cust_name   = payment_data.get("customer_name", "") or ""
    method      = (payment_data.get("method", "cash") or "cash").replace("_", " ").title()
    reference   = payment_data.get("reference", "") or ""
    amount      = payment_data.get("amount", 0)
    notes       = payment_data.get("notes", "") or ""
    allocations = payment_data.get("allocations", [])

    title_label = "ADVANCE RECEIPT VOUCHER" if is_advance else "RECEIPT VOUCHER"
    GREEN       = colors.HexColor("#059669")
    LIGHT_GREEN = colors.HexColor("#F0FDF4")

    title_s  = ParagraphStyle("rvt",  fontName="Helvetica-Bold", fontSize=18,  textColor=PRIMARY,  alignment=TA_CENTER)
    lbl_s    = ParagraphStyle("rvl",  fontName="Helvetica-Bold", fontSize=8.5, textColor=MED_GRAY)
    val_s    = ParagraphStyle("rvv",  fontName="Helvetica",      fontSize=9,   textColor=DARK)
    val_b    = ParagraphStyle("rvvb", fontName="Helvetica-Bold", fontSize=9,   textColor=DARK)
    amt_lbl  = ParagraphStyle("ral",  fontName="Helvetica-Bold", fontSize=9,   textColor=GREEN,    alignment=TA_CENTER)
    amt_val  = ParagraphStyle("rav",  fontName="Helvetica-Bold", fontSize=22,  textColor=GREEN,    alignment=TA_CENTER)
    words_s  = ParagraphStyle("rw",   fontName="Helvetica",      fontSize=8,   textColor=DARK,     alignment=TA_CENTER)
    sig_ln_s = ParagraphStyle("rsl",  fontName="Helvetica",      fontSize=8,   textColor=DARK,     alignment=TA_CENTER)
    sig_sb_s = ParagraphStyle("rss",  fontName="Helvetica",      fontSize=7,   textColor=DARK,     alignment=TA_CENTER)
    ft_s     = ParagraphStyle("rft",  fontName="Helvetica",      fontSize=6.5, textColor=MED_GRAY, alignment=TA_CENTER)

    # ── 1. Title ──────────────────────────────────────────────────────────────
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(title_label, title_s))
    story.append(Spacer(1, 5 * mm))

    # ── 2. Bordered details block ─────────────────────────────────────────────
    # 4 cols: label(30) | value(60) | label(30) | value(60) = 180mm
    d_rows = [
        [Paragraph("Receipt No:", lbl_s), Paragraph(_xe(pay_no), val_b),
         Paragraph("Date:", lbl_s),       Paragraph(_xe(str(pay_date)[:11]), val_b)],
        [Paragraph("Payment Method:", lbl_s), Paragraph(_xe(method), val_s),
         Paragraph("Reference:", lbl_s),      Paragraph(_xe(reference) if reference else "-", val_s)],
    ]
    if cust_name:
        d_rows.insert(1, [Paragraph("Received From:", lbl_s), Paragraph(_xe(cust_name), val_s),
                          Paragraph("", lbl_s), Paragraph("", val_s)])

    details_t = Table(d_rows, colWidths=[30 * mm, 60 * mm, 30 * mm, 60 * mm])
    details_t.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("LINEBELOW",     (0, 0), (-1, -2), 0.3, colors.HexColor("#E2E8F0")),
        ("BOX",           (0, 0), (-1, -1), 0.8, PRIMARY),
    ]))
    story.append(details_t)

    # ── 3. Amount box (green, large) ─────────────────────────────────────────
    story.append(Spacer(1, 5 * mm))
    amount_box = Table(
        [[Paragraph("AMOUNT RECEIVED", amt_lbl)],
         [Paragraph(f"AED {amount:,.2f}", amt_val)],
         [Paragraph(_amount_in_words(amount), words_s)]],
        colWidths=[_CONTENT_W]
    )
    amount_box.setStyle(TableStyle([
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("BOX",           (0, 0), (-1, -1), 1.5, GREEN),
        ("BACKGROUND",    (0, 0), (-1, -1), LIGHT_GREEN),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(amount_box)

    # ── 4. Allocations table (if any) ────────────────────────────────────────
    if allocations:
        story.append(Spacer(1, 5 * mm))
        al_hdr = ParagraphStyle("alh", fontName="Helvetica-Bold", fontSize=8.5, textColor=DARK)
        ah_s   = ParagraphStyle("ahs", fontName="Helvetica-Bold", fontSize=8, textColor=WHITE)
        ar_s   = ParagraphStyle("ars", fontName="Helvetica",      fontSize=8, textColor=DARK)
        arc_s  = ParagraphStyle("arc", fontName="Helvetica",      fontSize=8, textColor=DARK, alignment=TA_RIGHT)
        story.append(Paragraph("Allocated Against Invoices:", al_hdr))
        story.append(Spacer(1, 2 * mm))
        alloc_data = [[Paragraph("Invoice No.", ah_s), Paragraph("Amount (AED)", ah_s)]]
        for a in allocations:
            alloc_data.append([
                Paragraph(_xe(str(a.get("invoice_number", ""))), ar_s),
                Paragraph(f"{a.get('amount', 0):.2f}", arc_s),
            ])
        alloc_t = Table(alloc_data, colWidths=[130 * mm, 50 * mm])
        alloc_t.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0),  PRIMARY),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [LIGHT_GRAY, WHITE]),
            ("GRID",          (0, 0), (-1, -1), 0.3, colors.HexColor("#CBD5E1")),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING",   (0, 0), (-1, -1), 6),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ]))
        story.append(alloc_t)

    # ── 5. Notes ─────────────────────────────────────────────────────────────
    if notes:
        story.append(Spacer(1, 4 * mm))
        note_s = ParagraphStyle("rn", fontName="Helvetica", fontSize=8, textColor=MED_GRAY)
        story.append(Paragraph(f"<b>Notes:</b> {_xe(notes)}", note_s))

    # ── 6. Signatures + Footer (KeepTogether) ────────────────────────────────
    stamp_path_rv = _get_stamp_path()
    auth_cell = []
    if stamp_path_rv:
        try:
            from PIL import Image as PILImage
            with PILImage.open(stamp_path_rv) as img:
                sw, sh = img.size
            STAMP_W = 30 * mm
            stamp_h = min(STAMP_W * sh / sw, 10 * mm)
            auth_cell.append(Image(stamp_path_rv, width=STAMP_W, height=stamp_h))
            auth_cell.append(Spacer(1, 1 * mm))
        except Exception:
            auth_cell.append(Spacer(1, 2 * mm))
    else:
        auth_cell.append(Spacer(1, 2 * mm))
    auth_cell += [
        Paragraph("________________________", sig_ln_s),
        Spacer(1, 3 * mm),
        Paragraph("Authorized Signature", sig_sb_s),
    ]

    recv_cell = [
        Spacer(1, 2 * mm),
        Paragraph("________________________", sig_ln_s),
        Spacer(1, 3 * mm),
        Paragraph("Received By", sig_sb_s),
    ]

    sig_t = Table([[recv_cell, auth_cell]], colWidths=[90 * mm, 90 * mm], rowHeights=[22 * mm])
    sig_t.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "BOTTOM"),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LINEAFTER",     (0, 0), (0, 0),   0.3, colors.HexColor("#CBD5E1")),
    ]))

    bottom_block = [
        Spacer(1, 8 * mm),
        HRFlowable(width="100%", thickness=0.4, color=colors.HexColor("#CBD5E1")),
        Spacer(1, 1 * mm),
        sig_t,
        HRFlowable(width="100%", thickness=0.3, color=MED_GRAY),
        Spacer(1, 1 * mm),
        Paragraph("This is a computer generated receipt voucher.", ft_s),
    ]
    story.append(KeepTogether(bottom_block))

    doc.build(story, onFirstPage=_draw_lh_rv, onLaterPages=lambda c, d: None)
    return filepath


# ── Bank Statement ────────────────────────────────────────────────────────────
def _safe_fn(name: str) -> str:
    """Strip characters invalid in Windows filenames from a name string."""
    import re
    return re.sub(r'[\\/:*?"<>|]', '_', name).replace(' ', '_')


def generate_bank_statement_pdf(stmt: dict, company: dict) -> str:
    acct = stmt["account"]
    filename = f"BankStatement_{_safe_fn(acct['name'])}_{datetime.now().strftime('%Y%m%d%H%M%S')}.pdf"
    filepath = os.path.join(EXPORT_DIR, filename)

    top_margin = 5 * mm if os.path.exists(LETTERHEAD_PATH) else 15 * mm
    doc = SimpleDocTemplate(
        filepath, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=top_margin, bottomMargin=20 * mm,
    )

    story = []
    _build_top(
        story, company, "BANK STATEMENT",
        f"BS-{datetime.now().strftime('%Y%m%d')}",
        datetime.now().strftime("%d %b %Y"),
    )
    story.append(Spacer(1, 5 * mm))

    info_style = ParagraphStyle("inf", fontName="Helvetica", fontSize=9, textColor=DARK)
    story.append(Paragraph(f"<b>Account:</b> {acct['name']}", info_style))
    if acct.get("bank_name"):
        story.append(Paragraph(f"<b>Bank:</b> {acct['bank_name']}", info_style))
    if acct.get("account_number"):
        story.append(Paragraph(f"<b>Account No:</b> {acct['account_number']}", info_style))
    if acct.get("iban"):
        story.append(Paragraph(f"<b>IBAN:</b> {acct['iban']}", info_style))
    period = f"{stmt.get('date_from', 'All')} to {stmt.get('date_to', 'Present')}"
    story.append(Paragraph(f"<b>Period:</b> {period}", info_style))
    story.append(Spacer(1, 4 * mm))

    summary_data = [[
        Paragraph("<b>Opening Balance</b>",  ParagraphStyle("s",  fontName="Helvetica-Bold", fontSize=9, textColor=DARK)),
        Paragraph(f"AED {stmt['opening_balance']:.2f}", ParagraphStyle("sv",  fontName="Helvetica", fontSize=9, textColor=DARK, alignment=TA_RIGHT)),
        Paragraph("<b>Total In</b>",  ParagraphStyle("s2", fontName="Helvetica-Bold", fontSize=9, textColor=colors.HexColor("#10B981"))),
        Paragraph(f"AED {stmt['total_in']:.2f}",  ParagraphStyle("sv2", fontName="Helvetica", fontSize=9, textColor=colors.HexColor("#10B981"), alignment=TA_RIGHT)),
        Paragraph("<b>Total Out</b>", ParagraphStyle("s3", fontName="Helvetica-Bold", fontSize=9, textColor=colors.HexColor("#EF4444"))),
        Paragraph(f"AED {stmt['total_out']:.2f}", ParagraphStyle("sv3", fontName="Helvetica", fontSize=9, textColor=colors.HexColor("#EF4444"), alignment=TA_RIGHT)),
        Paragraph("<b>Closing Balance</b>", ParagraphStyle("s4", fontName="Helvetica-Bold", fontSize=9, textColor=PRIMARY)),
        Paragraph(f"AED {stmt['closing_balance']:.2f}", ParagraphStyle("sv4", fontName="Helvetica-Bold", fontSize=9, textColor=PRIMARY, alignment=TA_RIGHT)),
    ]]
    st = Table(summary_data, colWidths=[25 * mm, 22 * mm, 18 * mm, 22 * mm, 18 * mm, 22 * mm, 25 * mm, 22 * mm])
    st.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND",    (0, 0), (-1, -1), LIGHT_GRAY),
        ("BOX",           (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
    ]))
    story.append(st)
    story.append(Spacer(1, 5 * mm))

    style_h     = ParagraphStyle("h",  fontName="Helvetica-Bold", fontSize=8, textColor=WHITE)
    style_r     = ParagraphStyle("r",  fontName="Helvetica",      fontSize=8, textColor=DARK)
    style_rc    = ParagraphStyle("rc", fontName="Helvetica",      fontSize=8, textColor=DARK, alignment=TA_RIGHT)
    style_green = ParagraphStyle("rg", fontName="Helvetica",      fontSize=8, textColor=colors.HexColor("#10B981"), alignment=TA_RIGHT)
    style_red   = ParagraphStyle("rr", fontName="Helvetica",      fontSize=8, textColor=colors.HexColor("#EF4444"), alignment=TA_RIGHT)

    headers    = ["Date", "Description", "Party", "Method", "Money In", "Money Out", "Balance"]
    col_widths = [20 * mm, 52 * mm, 28 * mm, 22 * mm, 20 * mm, 18 * mm, 20 * mm]  # sum=180mm=_CONTENT_W
    data = [[Paragraph(h, style_h) for h in headers]]

    data.append([
        Paragraph("", style_r),
        Paragraph("<b>Opening Balance</b>", style_r),
        Paragraph("", style_r), Paragraph("", style_r),
        Paragraph("", style_rc), Paragraph("", style_rc),
        Paragraph(f"{stmt['opening_balance']:.2f}", ParagraphStyle("rb", fontName="Helvetica-Bold", fontSize=8, textColor=DARK, alignment=TA_RIGHT)),
    ])

    for entry in stmt.get("entries", []):
        data.append([
            Paragraph(str(entry.get("date", ""))[:11], style_r),
            Paragraph(entry.get("description", ""), style_r),
            Paragraph(entry.get("party_name", ""), style_r),
            Paragraph(entry.get("method", "").replace("_", " ").title(), style_r),
            Paragraph(f"{entry['money_in']:.2f}"  if entry.get("money_in",  0) else "—", style_green),
            Paragraph(f"{entry['money_out']:.2f}" if entry.get("money_out", 0) else "—", style_red),
            Paragraph(f"{entry.get('balance', 0):.2f}", style_rc),
        ])

    closing_style = ParagraphStyle("cs", fontName="Helvetica-Bold", fontSize=8, textColor=PRIMARY, alignment=TA_RIGHT)
    data.append([
        Paragraph("", style_r),
        Paragraph("<b>Closing Balance</b>", ParagraphStyle("cb", fontName="Helvetica-Bold", fontSize=8, textColor=PRIMARY)),
        Paragraph("", style_r), Paragraph("", style_r),
        Paragraph("", style_rc), Paragraph("", style_rc),
        Paragraph(f"<b>{stmt['closing_balance']:.2f}</b>", closing_style),
    ])

    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0),  (-1, 0),  PRIMARY),
        ("ROWBACKGROUNDS",(0, 1),  (-1, -2), [LIGHT_GRAY, WHITE]),
        ("BACKGROUND",    (0, -1), (-1, -1), colors.HexColor("#EFF6FF")),
        ("GRID",          (0, 0),  (-1, -1), 0.3, colors.HexColor("#CBD5E1")),
        ("VALIGN",        (0, 0),  (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0),  (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0),  (-1, -1), 4),
        ("LEFTPADDING",   (0, 0),  (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0),  (-1, -1), 4),
    ]))
    story.append(t)

    story.append(Spacer(1, 8 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=MED_GRAY))
    footer_style = ParagraphStyle("footer", fontName="Helvetica", fontSize=7, textColor=MED_GRAY, alignment=TA_CENTER)
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph("This is a computer generated bank statement.", footer_style))

    doc.build(story)
    return filepath


# ── Delivery Note (UAE Workshop Style) ────────────────────────────────────────
def generate_delivery_note_pdf(dn_data: dict, company: dict) -> str:
    filename = f"DeliveryNote_{dn_data['dn_number']}_{datetime.now().strftime('%Y%m%d%H%M%S')}.pdf"
    filepath = os.path.join(EXPORT_DIR, filename)

    use_lh     = dn_data.get("letterhead", True) and os.path.exists(LETTERHEAD_PATH)
    show_stamp = bool(dn_data.get("show_stamp", False))
    page_w, page_h = A4

    LH_MAX_H  = 70 * mm
    LH_MIN_H  = 62 * mm
    raw_lh_h  = _lh_page_height() if use_lh else 0.0
    lh_draw_h = max(LH_MIN_H, min(raw_lh_h, LH_MAX_H)) if raw_lh_h > 0 else 0.0
    top_margin = (lh_draw_h + 2 * mm) if lh_draw_h else 63 * mm

    # Signature box is now in the story (not fixed on canvas) — only need footer space.
    _BOT = 15 * mm

    def _draw_dn_page(canv, _doc):
        canv.saveState()
        if lh_draw_h:
            canv.drawImage(LETTERHEAD_PATH, 0, page_h - lh_draw_h,
                           width=page_w, height=lh_draw_h,
                           preserveAspectRatio=False, mask='auto')
        canv.setFont("Helvetica", 7)
        canv.setFillColor(MED_GRAY)
        canv.drawCentredString(page_w / 2, 8 * mm,
                               "This is a computer generated delivery note.")
        canv.restoreState()

    doc = SimpleDocTemplate(
        filepath, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=top_margin, bottomMargin=_BOT,
    )

    # ── Styles ─────────────────────────────────────────────────────────────────
    title_s = ParagraphStyle("dn_title", fontName="Helvetica-Bold", fontSize=18,
                              textColor=ACCENT, alignment=TA_CENTER,
                              spaceAfter=0, spaceBefore=0)
    lbl_s   = ParagraphStyle("dn_lbl",   fontName="Helvetica-Bold", fontSize=8, textColor=DARK)
    val_s   = ParagraphStyle("dn_val",   fontName="Helvetica",      fontSize=9, textColor=DARK)
    val_r   = ParagraphStyle("dn_val_r", fontName="Helvetica",      fontSize=9, textColor=DARK,
                              alignment=TA_RIGHT)
    hdr_s   = ParagraphStyle("dn_hdr",   fontName="Helvetica-Bold", fontSize=8,
                              textColor=WHITE, alignment=TA_CENTER)
    row_c   = ParagraphStyle("dn_rc",    fontName="Helvetica",      fontSize=8,
                              textColor=DARK, alignment=TA_CENTER)
    row_l   = ParagraphStyle("dn_rl",    fontName="Helvetica",      fontSize=8, textColor=DARK)
    sig_lbl = ParagraphStyle("dn_sl",    fontName="Helvetica-Bold", fontSize=8, textColor=DARK,
                              alignment=TA_CENTER)
    sig_ln  = ParagraphStyle("dn_sln",   fontName="Helvetica",      fontSize=10, textColor=PRIMARY,
                              alignment=TA_CENTER)

    story = []

    # ── Optional text company header (when no letterhead image) ───────────────
    if not lh_draw_h:
        comp_s = ParagraphStyle("dn_comp", fontName="Helvetica-Bold", fontSize=14,
                                 textColor=PRIMARY, alignment=TA_CENTER)
        addr_s = ParagraphStyle("dn_addr", fontName="Helvetica",      fontSize=8,
                                 textColor=MED_GRAY, alignment=TA_CENTER)
        story.append(Paragraph(company.get("name", "Company Name"), comp_s))
        story.append(Spacer(1, 1 * mm))
        if company.get("address"):
            story.append(Paragraph(company["address"].replace("\n", "  |  "), addr_s))
        if company.get("phone") or company.get("email"):
            story.append(Paragraph(
                f"Tel: {company.get('phone', '')}   Email: {company.get('email', '')}", addr_s))
        story.append(Spacer(1, 3 * mm))
        story.append(HRFlowable(width="100%", thickness=0.8, color=PRIMARY))
        story.append(Spacer(1, 2 * mm))

    # ── Title ─────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph("DELIVERY NOTE", title_s))
    story.append(Spacer(1, 12 * mm))

    # ── Customer / DN info block ──────────────────────────────────────────────
    customer  = dn_data.get("customer") or {}
    dn_number = dn_data.get("dn_number", "")
    dn_date   = dn_data.get("date", datetime.now().strftime("%d %b %Y"))
    remarks   = dn_data.get("remarks", "")

    left_cell = [
        Paragraph("<b>To:</b>", lbl_s),
        Paragraph(f"<b>{_xe(customer.get('name', '—'))}</b>", val_s),
    ]
    if customer.get("address"):
        left_cell.append(Paragraph(_xe(customer["address"].replace("\n", "<br/>")), val_s))
    if customer.get("phone"):
        left_cell.append(Paragraph(f"Tel: {_xe(customer['phone'])}", val_s))
    if customer.get("trn"):
        left_cell.append(Paragraph(f"TRN: {_xe(customer['trn'])}", val_s))

    right_cell = [
        Paragraph(f"<b>DN No:</b>   {_xe(dn_number)}", val_r),
        Paragraph(f"<b>Date:</b>    {_xe(str(dn_date))}", val_r),
    ]
    if remarks:
        right_cell.append(Spacer(1, 2))
        right_cell.append(Paragraph(f"<b>Remarks:</b> {_xe(remarks)}", val_r))

    info_t = Table([[left_cell, right_cell]], colWidths=[100 * mm, 80 * mm])
    info_t.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("BOX",           (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (0,  0),  8),
        ("RIGHTPADDING",  (1, 0), (1,  0),  8),
    ]))
    story.append(info_t)
    story.append(Spacer(1, 6 * mm))

    # ── Items table ───────────────────────────────────────────────────────────
    items_data = dn_data.get("items", [])
    _actual_n  = len(items_data)
    _HDR_H     = 8 * mm
    _ROW_H     = 9 * mm

    # Filler rows: compact — give room to write but no huge blank waste
    if _actual_n <= 3:
        _filler_n = 2
    elif _actual_n <= 6:
        _filler_n = 1
    else:
        _filler_n = 0
    MIN_ROWS = _actual_n + _filler_n

    dn_col_w   = [14 * mm, 90 * mm, 20 * mm, 56 * mm]
    table_data = [[
        Paragraph("S.NO",        hdr_s),
        Paragraph("DESCRIPTION", hdr_s),
        Paragraph("QTY",         hdr_s),
        Paragraph("REMARKS",     hdr_s),
    ]]

    for idx in range(MIN_ROWS):
        if idx < _actual_n:
            it = items_data[idx]
            table_data.append([
                Paragraph(str(it.get("sno", idx + 1)), row_c),
                Paragraph(_xe(str(it.get("description", ""))), row_l),
                Paragraph(_qty_label(float(it.get("quantity", 1) or 1)), row_c),
                Paragraph(_xe(str(it.get("remarks", ""))), row_l),
            ])
        else:
            table_data.append([Paragraph("", row_c), Paragraph("", row_l),
                                Paragraph("", row_c), Paragraph("", row_l)])

    dn_table = Table(table_data, colWidths=dn_col_w,
                     rowHeights=[_HDR_H] + [_ROW_H] * MIN_ROWS)
    dn_table.setStyle(TableStyle([
        ("BACKGROUND",     (0, 0), (-1, 0),  ACCENT),
        ("FONTSIZE",       (0, 0), (-1, -1), 8),
        ("ALIGN",          (0, 0), (-1, -1), "CENTER"),
        ("ALIGN",          (1, 1), (1, -1),  "LEFT"),
        ("ALIGN",          (3, 1), (3, -1),  "LEFT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [LIGHT_GRAY, WHITE]),
        ("GRID",           (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("VALIGN",         (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",     (0, 0), (-1, 0),  5),
        ("BOTTOMPADDING",  (0, 0), (-1, 0),  5),
        ("TOPPADDING",     (0, 1), (-1, -1), 4),
        ("BOTTOMPADDING",  (0, 1), (-1, -1), 4),
        ("LEFTPADDING",    (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",   (0, 0), (-1, -1), 4),
        ("LEFTPADDING",    (1, 1), (1, -1),  6),
        ("LEFTPADDING",    (3, 1), (3, -1),  6),
    ]))
    story.append(dn_table)
    story.append(Spacer(1, 4 * mm))

    # ── Signature block (in story — follows table, no fixed canvas position) ──
    sig_content_w = page_w - 30 * mm   # matches doc left+right margins
    half_w        = sig_content_w / 2

    # Resolve stamp path for DN
    stamp_path_dn = _get_stamp_path() if show_stamp else ""

    # LEFT cell — Receiver's Signature
    left_sig = [
        Spacer(1, 8 * mm),
        Paragraph("________________________", sig_ln),
        Spacer(1, 2 * mm),
        Paragraph("Receiver's Signature", sig_lbl),
    ]

    # RIGHT cell — Authorized Signature (+ stamp image when enabled)
    right_sig = []
    if show_stamp and stamp_path_dn:
        try:
            from PIL import Image as PILImage
            with PILImage.open(stamp_path_dn) as _img:
                _sw, _sh = _img.size
            STAMP_W = 38 * mm
            STAMP_H = min(STAMP_W * _sh / _sw, 16 * mm)
            right_sig.append(Image(stamp_path_dn, width=STAMP_W, height=STAMP_H))
            right_sig.append(Spacer(1, 1 * mm))
        except Exception as _se:
            _dbg(f"[DN] stamp render error: {_se}")
            right_sig.append(Spacer(1, 8 * mm))
    else:
        right_sig.append(Spacer(1, 8 * mm))

    right_sig += [
        Paragraph("________________________", sig_ln),
        Spacer(1, 2 * mm),
        Paragraph("Authorized Signature", sig_lbl),
    ]

    sig_table = Table([[left_sig, right_sig]], colWidths=[half_w, half_w])
    sig_table.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 0.6, colors.HexColor("#94A3B8")),
        ("LINEBEFORE",    (1, 0), (1,  0),  0.6, colors.HexColor("#94A3B8")),
        ("VALIGN",        (0, 0), (-1, -1), "BOTTOM"),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
    ]))
    story.append(sig_table)

    doc.build(story, onFirstPage=_draw_dn_page, onLaterPages=lambda c, d: None)
    return filepath


# ── Purchase Order PDF ────────────────────────────────────────────────────────
def generate_po_pdf(po_data: dict, company: dict) -> str:
    filename = f"PO_{po_data['po_number']}_{datetime.now().strftime('%Y%m%d%H%M%S')}.pdf"
    filepath = os.path.join(EXPORT_DIR, filename)

    use_lh    = po_data.get("letterhead", True) and os.path.exists(LETTERHEAD_PATH)
    page_w, page_h = A4

    LH_MAX_H  = 70 * mm
    LH_MIN_H  = 62 * mm
    raw_lh_h  = _lh_page_height() if use_lh else 0.0
    lh_draw_h = max(LH_MIN_H, min(raw_lh_h, LH_MAX_H)) if raw_lh_h > 0 else 0.0
    top_margin = (lh_draw_h + 6 * mm) if lh_draw_h else 63 * mm

    # Stamp always shown if file exists (regardless of include_stamp checkbox)
    stamp_path = _get_stamp_path()
    _BOT       = 15 * mm

    def _draw_po_page(canv, _doc):
        canv.saveState()
        if lh_draw_h:
            canv.drawImage(LETTERHEAD_PATH, 0, page_h - lh_draw_h,
                           width=page_w, height=lh_draw_h,
                           preserveAspectRatio=False, mask='auto')
        canv.setFont("Helvetica", 7)
        canv.setFillColor(MED_GRAY)
        canv.drawCentredString(page_w / 2, 8 * mm,
                               "This is a computer generated purchase order.")
        canv.restoreState()

    doc = SimpleDocTemplate(
        filepath, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=top_margin, bottomMargin=_BOT,
    )

    # ── Styles ──────────────────────────────────────────────────────────────
    title_s = ParagraphStyle("po_ti", fontName="Helvetica-Bold", fontSize=18,
                              textColor=ACCENT, alignment=TA_CENTER)
    box_hdr = ParagraphStyle("po_bh", fontName="Helvetica-Bold", fontSize=8.5,
                              textColor=WHITE, alignment=TA_CENTER)
    lbl_s   = ParagraphStyle("po_lb", fontName="Helvetica-Bold", fontSize=8, textColor=MED_GRAY)
    val_s   = ParagraphStyle("po_vl", fontName="Helvetica",      fontSize=8.5, textColor=DARK)
    val_b   = ParagraphStyle("po_vb", fontName="Helvetica-Bold", fontSize=9,  textColor=DARK)
    lbl_r   = ParagraphStyle("po_lr", fontName="Helvetica-Bold", fontSize=8,  textColor=MED_GRAY, alignment=TA_RIGHT)
    val_r   = ParagraphStyle("po_vr", fontName="Helvetica",      fontSize=8.5, textColor=DARK, alignment=TA_RIGHT)
    ih_s    = ParagraphStyle("po_ih", fontName="Helvetica-Bold", fontSize=8,  textColor=WHITE, alignment=TA_CENTER)
    ir_s    = ParagraphStyle("po_ir", fontName="Helvetica",      fontSize=8,  textColor=DARK)
    irc_s   = ParagraphStyle("po_ic", fontName="Helvetica",      fontSize=8,  textColor=DARK, alignment=TA_RIGHT)
    icc_s   = ParagraphStyle("po_cc", fontName="Helvetica",      fontSize=8,  textColor=DARK, alignment=TA_CENTER)
    tl_s    = ParagraphStyle("po_tl", fontName="Helvetica",      fontSize=8.5, textColor=DARK, alignment=TA_RIGHT)
    tb_s    = ParagraphStyle("po_tb", fontName="Helvetica-Bold", fontSize=10,  textColor=WHITE, alignment=TA_RIGHT)
    ft_s    = ParagraphStyle("po_ft", fontName="Helvetica",      fontSize=7,   textColor=MED_GRAY, alignment=TA_CENTER)

    story = []

    if not lh_draw_h:
        comp_s = ParagraphStyle("po_cp", fontName="Helvetica-Bold", fontSize=14,
                                 textColor=PRIMARY, alignment=TA_CENTER)
        addr_s = ParagraphStyle("po_ad", fontName="Helvetica", fontSize=8,
                                 textColor=MED_GRAY, alignment=TA_CENTER)
        story.append(Paragraph(company.get("name", "Company Name"), comp_s))
        story.append(Spacer(1, 1 * mm))
        if company.get("address"):
            story.append(Paragraph(company["address"].replace("\n", "  |  "), addr_s))
        story.append(Spacer(1, 3 * mm))
        story.append(HRFlowable(width="100%", thickness=0.8, color=PRIMARY))
        story.append(Spacer(1, 2 * mm))

    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph("PURCHASE ORDER", title_s))
    story.append(Spacer(1, 12 * mm))

    supplier = po_data.get("supplier") or {}
    po_no    = po_data.get("po_number", "")
    po_date  = po_data.get("date", "")
    del_date = po_data.get("delivery_date", "")

    sup_rows = [[Paragraph("TO:", lbl_s), Paragraph(_xe(supplier.get("name", "—")), val_b)]]
    if supplier.get("trn"):
        sup_rows.append([Paragraph("TRN:",  lbl_s), Paragraph(_xe(supplier["trn"]), val_s)])
    if supplier.get("phone"):
        sup_rows.append([Paragraph("TEL:",  lbl_s), Paragraph(_xe(supplier["phone"]), val_s)])
    if supplier.get("address"):
        sup_rows.append([Paragraph("ADD:",  lbl_s),
                         Paragraph(_xe(supplier["address"].replace("\n", ", ")), val_s)])

    sup_inner = Table(sup_rows, colWidths=[10 * mm, 68 * mm])
    sup_inner.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    sup_box = Table([[Paragraph("SUPPLIER DETAILS", box_hdr)], [sup_inner]], colWidths=[88 * mm])
    sup_box.setStyle(TableStyle([
        ("BOX",        (0, 0), (-1, -1), 0.8, ACCENT),
        ("LINEBELOW",  (0, 0), (-1, 0),  0.8, ACCENT),
        ("BACKGROUND", (0, 0), (-1, 0),  ACCENT),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))

    info_rows = [[Paragraph("PO NO:",    lbl_r), Paragraph(_xe(po_no), val_b)],
                 [Paragraph("DATE:",     lbl_r), Paragraph(_xe(po_date), val_s)]]
    if del_date:
        info_rows.append([Paragraph("DEL DATE:", lbl_r), Paragraph(_xe(del_date), val_s)])
    if po_data.get("payment_terms"):
        info_rows.append([Paragraph("PAYMENT:", lbl_r),
                          Paragraph(_xe(po_data["payment_terms"]), val_s)])
    if po_data.get("delivery_terms"):
        info_rows.append([Paragraph("DELIVERY:", lbl_r),
                          Paragraph(_xe(po_data["delivery_terms"]), val_s)])

    info_inner = Table(info_rows, colWidths=[22 * mm, 60 * mm])
    info_inner.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    info_box = Table([[Paragraph("ORDER DETAILS", box_hdr)], [info_inner]], colWidths=[88 * mm])
    info_box.setStyle(TableStyle([
        ("BOX",        (0, 0), (-1, -1), 0.8, ACCENT),
        ("LINEBELOW",  (0, 0), (-1, 0),  0.8, ACCENT),
        ("BACKGROUND", (0, 0), (-1, 0),  ACCENT),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))

    header_t = Table([[sup_box, info_box]], colWidths=[_CONTENT_W * 0.49, _CONTENT_W * 0.49])
    header_t.setStyle(TableStyle([
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("ALIGN",        (1, 0), (1, 0),   "RIGHT"),
    ]))
    story.append(header_t)
    story.append(Spacer(1, 10 * mm))

    # Items table
    col_w  = [9 * mm, 70 * mm, 15 * mm, 26 * mm, 26 * mm, 26 * mm]
    hdrs   = ["#", "DESCRIPTION", "QTY", "UNIT PRICE\n(AED)", "VAT\n(AED)", "TOTAL\n(AED)"]
    tbl    = [[Paragraph(h, ih_s) for h in hdrs]]

    items_list = po_data.get("items", [])
    for idx, it in enumerate(items_list, 1):
        tbl.append([
            Paragraph(str(idx), icc_s),
            Paragraph(_xe(it.get("description", "")), ir_s),
            Paragraph(_qty_label(float(it.get("quantity", 1) or 1)), icc_s),
            Paragraph(f"{it.get('unit_price', 0):.2f}", irc_s),
            Paragraph(f"{it.get('vat_amount', 0):.2f}" if it.get("vat_applicable") else "Exempt", irc_s),
            Paragraph(f"{it.get('total', 0):.2f}", irc_s),
        ])

    # Filler rows — explicit rowHeights so table fills available space without overflowing to page 2.
    # _OVER = fixed story height above+below items table (conservative, stamp-aware).
    # above(~53mm): title+spacers+header_boxes+spacer
    # below(~27mm): spacer+totals_table+spacer+notes
    # sig block: KeepTogether(spacers+HR+sig_tbl) — height depends on stamp presence
    _HDR_H    = 9 * mm
    _ROW_H    = 8 * mm
    _lh_story = 0 if lh_draw_h else 25 * mm
    _sig_h    = 60 * mm if stamp_path else 25 * mm
    _OVER     = _lh_story + 80 * mm + _sig_h
    _avail    = page_h - top_margin - _BOT - _OVER
    _max      = max(len(items_list), int((_avail - _HDR_H) / _ROW_H))
    _fill     = max(0, _max - len(items_list))
    for _ in range(_fill):
        tbl.append([Paragraph("", ir_s)] * 6)

    items_t = Table(tbl, colWidths=col_w,
                    rowHeights=[_HDR_H] + [_ROW_H] * _max)
    items_t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  ACCENT),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [ROW_STRIPE, WHITE]),
        ("GRID",          (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, 0),  5),
        ("BOTTOMPADDING", (0, 0), (-1, 0),  5),
        ("TOPPADDING",    (0, 1), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 7),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (1, 1), (1, -1),  6),
    ]))
    story.append(items_t)
    story.append(Spacer(1, 1 * mm))

    # Totals block (right-aligned)
    tl_data = [
        [Paragraph("Subtotal:", tl_s),
         Paragraph(f"AED {po_data.get('subtotal', 0):.2f}", tl_s)],
        [Paragraph("VAT (5%):", tl_s),
         Paragraph(f"AED {po_data.get('vat_amount', 0):.2f}", tl_s)],
        [Paragraph("TOTAL:", tb_s),
         Paragraph(f"AED {po_data.get('total', 0):.2f}", tb_s)],
    ]
    tl_t = Table(tl_data, colWidths=[35 * mm, 35 * mm])
    tl_t.setStyle(TableStyle([
        ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEABOVE",     (0, -1), (-1, -1), 1, ACCENT),
        ("BACKGROUND",    (0, -1), (-1, -1), ACCENT),
    ]))

    align_t = Table([[Spacer(1, 1), tl_t]],
                    colWidths=[_CONTENT_W - 70 * mm, 70 * mm])
    align_t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(align_t)

    from reportlab.platypus import KeepTogether

    _notes_text = po_data.get("notes") or \
        "Please supply the above materials/services as per agreed price, quality, and delivery terms."
    story.append(Spacer(1, 2 * mm))
    note_s = ParagraphStyle("po_ns", fontName="Helvetica", fontSize=8, textColor=DARK)
    story.append(Paragraph(f"<b>Notes:</b> {_xe(_notes_text)}", note_s))

    po_tc_s  = ParagraphStyle("po_tc",  fontName="Helvetica",      fontSize=7.5, textColor=DARK)
    po_sln_s = ParagraphStyle("po_sln", fontName="Helvetica",      fontSize=8,   textColor=DARK, alignment=TA_CENTER)
    po_slb_s = ParagraphStyle("po_slb", fontName="Helvetica-Bold", fontSize=8,   textColor=DARK, alignment=TA_CENTER)

    po_terms = [
        Paragraph("<b>Terms &amp; Conditions:</b>", po_tc_s),
        Paragraph("1) Delivery as per agreed schedule.", po_tc_s),
        Paragraph("2) Prices are subject to prevailing taxes.", po_tc_s),
        Paragraph("3) Goods once approved cannot be returned.", po_tc_s),
    ]

    po_sig_right = []
    if stamp_path:
        try:
            from PIL import Image as PILImage
            with PILImage.open(stamp_path) as _simg:
                _sw, _sh = _simg.size
            _st_w = 36 * mm
            _st_h = min(_st_w, _st_w * _sh / _sw)
            po_sig_right.append(Image(stamp_path, width=_st_w, height=_st_h))
            po_sig_right.append(Spacer(1, 2 * mm))
        except Exception:
            pass
    po_sig_right.append(Paragraph("_" * 36, po_sln_s))
    po_sig_right.append(Spacer(1, 1 * mm))
    po_sig_right.append(Paragraph("Authorized Signature", po_slb_s))

    po_sig_tbl = Table(
        [[po_terms, po_sig_right]],
        colWidths=[_CONTENT_W * 0.55, _CONTENT_W * 0.45],
    )
    po_sig_tbl.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "BOTTOM"),
        ("ALIGN",         (1, 0), (1,  0),  "CENTER"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEAFTER",     (0, 0), (0,  0),  0.3, colors.HexColor("#CBD5E1")),
    ]))

    story.append(KeepTogether([
        Spacer(1, 3 * mm),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#CBD5E1")),
        Spacer(1, 3 * mm),
        po_sig_tbl,
    ]))

    doc.build(story, onFirstPage=_draw_po_page, onLaterPages=lambda c, d: None)
    return filepath


# ── Supplier Bill PDF ─────────────────────────────────────────────────────────

def generate_supplier_bill_pdf(bill_data: dict, company: dict) -> str:
    filepath = os.path.join(EXPORT_DIR, f"supplier_bill_{bill_data['bill_number']}.pdf")

    lh = _letterhead_flowable()
    _lh_h = _lh_page_height()
    top_margin = (_lh_h + 4 * mm) if lh else 20 * mm

    doc = SimpleDocTemplate(
        filepath, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=top_margin, bottomMargin=15 * mm,
    )

    def _draw_page(canvas_obj, doc_obj):
        canvas_obj.saveState()
        if lh:
            canvas_obj.drawImage(
                LETTERHEAD_PATH, 0, A4[1] - _lh_h, width=A4[0], height=_lh_h,
                preserveAspectRatio=True, mask="auto",
            )
        canvas_obj.restoreState()

    label_s = ParagraphStyle("sb_lbl", fontName="Helvetica-Bold", fontSize=8, textColor=DARK)
    val_s   = ParagraphStyle("sb_val", fontName="Helvetica",      fontSize=8, textColor=DARK)
    title_s = ParagraphStyle("sb_title", fontName="Helvetica-Bold", fontSize=18,
                              textColor=ACCENT, alignment=TA_RIGHT)
    hdr_s   = ParagraphStyle("sb_hdr", fontName="Helvetica-Bold", fontSize=8,
                              textColor=WHITE, alignment=TA_CENTER)
    row_s   = ParagraphStyle("sb_row", fontName="Helvetica", fontSize=8, textColor=DARK)
    row_rc  = ParagraphStyle("sb_rrc", fontName="Helvetica", fontSize=8, textColor=DARK, alignment=TA_RIGHT)
    tot_lbl = ParagraphStyle("sb_tl",  fontName="Helvetica-Bold", fontSize=9,
                              textColor=PRIMARY, alignment=TA_RIGHT)
    tot_val = ParagraphStyle("sb_tv",  fontName="Helvetica-Bold", fontSize=9, textColor=PRIMARY)

    story = []
    if lh:
        story.append(Spacer(1, 2 * mm))

    # Header: supplier info left, document info right
    supplier = bill_data.get("supplier", {})
    supp_lines = [Paragraph(f"<b>TO:</b> {_xe(supplier.get('name', ''))}", label_s)]
    if supplier.get("trn"):
        supp_lines.append(Paragraph(f"TRN: {_xe(supplier['trn'])}", val_s))
    if supplier.get("address"):
        for ln in supplier["address"].split("\n"):
            supp_lines.append(Paragraph(_xe(ln), val_s))
    if supplier.get("phone"):
        supp_lines.append(Paragraph(f"Tel: {_xe(supplier['phone'])}", val_s))

    doc_lines = [
        Paragraph("SUPPLIER BILL", title_s),
        Spacer(1, 2),
        Paragraph(f"<b>Bill No:</b> {_xe(bill_data['bill_number'])}", ParagraphStyle(
            "sb_nr", fontName="Helvetica", fontSize=8, textColor=DARK, alignment=TA_RIGHT)),
        Paragraph(f"<b>Date:</b> {bill_data['date']}", ParagraphStyle(
            "sb_dr", fontName="Helvetica", fontSize=8, textColor=DARK, alignment=TA_RIGHT)),
    ]
    if bill_data.get("due_date"):
        doc_lines.append(Paragraph(f"<b>Due:</b> {bill_data['due_date']}", ParagraphStyle(
            "sb_ddr", fontName="Helvetica", fontSize=8, textColor=DARK, alignment=TA_RIGHT)))
    if bill_data.get("lpo_no"):
        doc_lines.append(Paragraph(f"<b>LPO:</b> {_xe(bill_data['lpo_no'])}", ParagraphStyle(
            "sb_lor", fontName="Helvetica", fontSize=8, textColor=DARK, alignment=TA_RIGHT)))
    if bill_data.get("trn"):
        doc_lines.append(Paragraph(f"<b>TRN:</b> {_xe(bill_data['trn'])}", ParagraphStyle(
            "sb_trn", fontName="Helvetica", fontSize=8, textColor=DARK, alignment=TA_RIGHT)))

    hdr_tbl = Table(
        [[supp_lines, doc_lines]],
        colWidths=[_CONTENT_W * 0.55, _CONTENT_W * 0.45],
    )
    hdr_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(hdr_tbl)
    story.append(Spacer(1, 5 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY))
    story.append(Spacer(1, 4 * mm))

    # Items table
    col_w = [8 * mm, 80 * mm, 18 * mm, 26 * mm, 18 * mm, 30 * mm]
    hdrs = ["#", "Description", "Qty", "Unit Price", "VAT", "Total"]
    rows = [[Paragraph(h, hdr_s) for h in hdrs]]
    for idx, item in enumerate(bill_data.get("items", []), 1):
        rows.append([
            Paragraph(str(idx), row_s),
            Paragraph(_xe(item.get("description", "")), row_s),
            Paragraph(f"{item.get('quantity', 0):.2f}", row_rc),
            Paragraph(f"{item.get('unit_price', 0):.2f}", row_rc),
            Paragraph(f"{item.get('vat_amount', 0):.2f}" if item.get("vat_applicable") else "—", row_rc),
            Paragraph(f"{item.get('total', 0):.2f}", row_rc),
        ])

    items_tbl = Table(rows, colWidths=col_w)
    items_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  PRIMARY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [LIGHT_GRAY, WHITE]),
        ("GRID",          (0, 0), (-1, -1), 0.5, colors.HexColor("#C0C8D8")),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
    ]))
    story.append(items_tbl)
    story.append(Spacer(1, 5 * mm))

    # Totals
    subtotal  = bill_data.get("subtotal", 0.0)
    vat_amt   = bill_data.get("vat_amount", 0.0)
    total     = bill_data.get("total", 0.0)
    tot_rows = [
        [Paragraph("Subtotal:", tot_lbl), Paragraph(f"AED {subtotal:.2f}", tot_val)],
        [Paragraph("VAT (5%):", tot_lbl), Paragraph(f"AED {vat_amt:.2f}", tot_val)],
        [Paragraph("TOTAL:", ParagraphStyle("sb_tb", fontName="Helvetica-Bold", fontSize=11,
                                             textColor=ACCENT, alignment=TA_RIGHT)),
         Paragraph(f"AED {total:.2f}", ParagraphStyle("sb_tbb", fontName="Helvetica-Bold",
                                                        fontSize=11, textColor=ACCENT))],
    ]
    tot_w = [_CONTENT_W - 60 * mm, 60 * mm]
    tot_tbl = Table(tot_rows, colWidths=tot_w)
    tot_tbl.setStyle(TableStyle([
        ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEABOVE",     (0, 2), (-1, 2),  1, PRIMARY),
    ]))
    story.append(tot_tbl)

    if bill_data.get("notes"):
        story.append(Spacer(1, 5 * mm))
        story.append(Paragraph(f"<b>Notes:</b> {_xe(bill_data['notes'])}", val_s))

    doc.build(story, onFirstPage=_draw_page, onLaterPages=_draw_page)
    return filepath


# ── Supplier Payment Receipt PDF ──────────────────────────────────────────────

def generate_supplier_payment_pdf(pay_data: dict, company: dict) -> str:
    filepath = os.path.join(EXPORT_DIR, f"supplier_payment_{pay_data['payment_number']}.pdf")

    lh = _letterhead_flowable()
    _lh_h = _lh_page_height()
    top_margin = (_lh_h + 4 * mm) if lh else 20 * mm

    doc = SimpleDocTemplate(
        filepath, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=top_margin, bottomMargin=15 * mm,
    )

    def _draw_page(canvas_obj, doc_obj):
        canvas_obj.saveState()
        if lh:
            canvas_obj.drawImage(
                LETTERHEAD_PATH, 0, A4[1] - _lh_h, width=A4[0], height=_lh_h,
                preserveAspectRatio=True, mask="auto",
            )
        canvas_obj.restoreState()

    label_s = ParagraphStyle("sp_lbl", fontName="Helvetica-Bold", fontSize=8, textColor=DARK)
    val_s   = ParagraphStyle("sp_val", fontName="Helvetica",      fontSize=8, textColor=DARK)
    title_s = ParagraphStyle("sp_title", fontName="Helvetica-Bold", fontSize=18,
                              textColor=ACCENT, alignment=TA_RIGHT)
    row_s   = ParagraphStyle("sp_row", fontName="Helvetica", fontSize=9, textColor=DARK)
    row_b   = ParagraphStyle("sp_rowb", fontName="Helvetica-Bold", fontSize=10,
                              textColor=PRIMARY, alignment=TA_RIGHT)

    story = []
    if lh:
        story.append(Spacer(1, 2 * mm))

    supplier = pay_data.get("supplier", {})
    supp_lines = [Paragraph(f"<b>PAID TO:</b> {_xe(supplier.get('name', ''))}", label_s)]
    if supplier.get("address"):
        for ln in supplier["address"].split("\n"):
            supp_lines.append(Paragraph(_xe(ln), val_s))
    if supplier.get("phone"):
        supp_lines.append(Paragraph(f"Tel: {_xe(supplier['phone'])}", val_s))

    doc_lines = [
        Paragraph("PAYMENT RECEIPT", title_s),
        Spacer(1, 2),
        Paragraph(f"<b>Ref No:</b> {_xe(pay_data['payment_number'])}", ParagraphStyle(
            "sp_nr", fontName="Helvetica", fontSize=8, textColor=DARK, alignment=TA_RIGHT)),
        Paragraph(f"<b>Date:</b> {pay_data['date']}", ParagraphStyle(
            "sp_dr", fontName="Helvetica", fontSize=8, textColor=DARK, alignment=TA_RIGHT)),
    ]

    hdr_tbl = Table([[supp_lines, doc_lines]],
                    colWidths=[_CONTENT_W * 0.55, _CONTENT_W * 0.45])
    hdr_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(hdr_tbl)
    story.append(Spacer(1, 5 * mm))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY))
    story.append(Spacer(1, 8 * mm))

    details = [
        ["Payment Amount", f"AED {pay_data['amount']:.2f}"],
        ["Payment Method", pay_data.get("method", "Cash").replace("_", " ").title()],
        ["Reference No",   pay_data.get("reference", "") or "—"],
        ["Notes",          pay_data.get("notes", "") or "—"],
    ]
    det_rows = [[Paragraph(r[0], label_s), Paragraph(_xe(str(r[1])), row_s)] for r in details]
    det_tbl = Table(det_rows, colWidths=[50 * mm, _CONTENT_W - 50 * mm])
    det_tbl.setStyle(TableStyle([
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [LIGHT_GRAY, WHITE]),
        ("GRID",           (0, 0), (-1, -1), 0.5, colors.HexColor("#C0C8D8")),
        ("TOPPADDING",     (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",  (0, 0), (-1, -1), 6),
        ("LEFTPADDING",    (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",   (0, 0), (-1, -1), 6),
        ("VALIGN",         (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(det_tbl)
    story.append(Spacer(1, 8 * mm))

    # Amount in words box
    words = _amount_in_words(pay_data["amount"])
    amt_box = Table(
        [[Paragraph(f"<b>Amount in Words:</b> {words}", ParagraphStyle(
            "sp_words", fontName="Helvetica", fontSize=8, textColor=DARK))]],
        colWidths=[_CONTENT_W],
    )
    amt_box.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), LIGHT_GRAY),
        ("BOX",           (0, 0), (-1, -1), 1, PRIMARY),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    story.append(amt_box)

    doc.build(story, onFirstPage=_draw_page, onLaterPages=_draw_page)
    return filepath


# ─────────────────────────────────────────────────────────────────────────────
# VAT Report PDF
# ─────────────────────────────────────────────────────────────────────────────

def generate_vat_report_pdf(data: dict, company: dict) -> str:
    """UAE FTA-friendly VAT Return Report PDF."""
    ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
    filepath = os.path.join(EXPORT_DIR, f"VAT_Report_{ts}.pdf")

    doc = SimpleDocTemplate(
        filepath, pagesize=A4,
        leftMargin=15*mm, rightMargin=15*mm,
        topMargin=15*mm, bottomMargin=15*mm,
    )
    story = []

    lh = _letterhead_flowable()
    if lh:
        story.append(lh)
        story.append(Spacer(1, 4*mm))

    title_s  = ParagraphStyle("vt",  fontName="Helvetica-Bold", fontSize=16, textColor=PRIMARY, alignment=TA_CENTER)
    sub_s    = ParagraphStyle("vs",  fontName="Helvetica",      fontSize=9,  textColor=MED_GRAY, alignment=TA_CENTER)
    story.append(Paragraph("VAT RETURN REPORT", title_s))
    story.append(Spacer(1, 2*mm))

    period_from = (data.get("period") or {}).get("from") or ""
    period_to   = (data.get("period") or {}).get("to")   or ""
    if period_from or period_to:
        story.append(Paragraph(f"Period: {period_from or 'All'} — {period_to or 'All'}", sub_s))
    comp_trn = company.get("trn", "")
    if comp_trn:
        story.append(Paragraph(f"Supplier TRN: {comp_trn}", sub_s))
    story.append(Spacer(1, 4*mm))

    # Summary box
    sl_s = ParagraphStyle("sl", fontName="Helvetica-Bold", fontSize=9,  textColor=DARK)
    sv_s = ParagraphStyle("sv", fontName="Helvetica-Bold", fontSize=12, textColor=PRIMARY, alignment=TA_RIGHT)
    total_taxable = data.get("total_taxable", 0)
    total_vat     = data.get("total_vat", 0)
    sum_rows = [
        [Paragraph("Taxable Sales (AED)",            sl_s), Paragraph(f"{total_taxable:,.2f}", sv_s)],
        [Paragraph("VAT Collected — 5% (AED)",       sl_s), Paragraph(f"{total_vat:,.2f}",     sv_s)],
        [Paragraph("Total Invoiced incl. VAT (AED)", sl_s), Paragraph(f"{total_taxable + total_vat:,.2f}", sv_s)],
    ]
    sum_t = Table(sum_rows, colWidths=[_CONTENT_W * 0.62, _CONTENT_W * 0.38])
    sum_t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), LIGHT_BLUE),
        ("BOX",           (0, 0), (-1, -1), 1,   PRIMARY),
        ("LINEBELOW",     (0, 0), (-1, -2), 0.3, colors.HexColor("#CBD5E1")),
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
    ]))
    story.append(sum_t)
    story.append(Spacer(1, 5*mm))

    # Invoice detail table
    h_s  = ParagraphStyle("vh",  fontName="Helvetica-Bold", fontSize=7.5, textColor=WHITE)
    r_s  = ParagraphStyle("vr",  fontName="Helvetica",      fontSize=7.5, textColor=DARK)
    rr_s = ParagraphStyle("vrr", fontName="Helvetica",      fontSize=7.5, textColor=DARK,  alignment=TA_RIGHT)

    col_w = [25*mm, 22*mm, 48*mm, 28*mm, 25*mm, 23*mm, 24*mm]
    hdrs  = ["Invoice #", "Date", "Customer", "Customer TRN", "Taxable (AED)", "VAT 5% (AED)", "Total (AED)"]
    tbl_data = [[Paragraph(h, h_s) for h in hdrs]]
    for inv in data.get("invoices", []):
        tbl_data.append([
            Paragraph(_xe(str(inv.get("invoice_number", ""))), r_s),
            Paragraph(str(inv.get("date", "")), r_s),
            Paragraph(_xe(str(inv.get("customer_name", "CASH SALE"))), r_s),
            Paragraph(_xe(str(inv.get("customer_trn") or "—")), r_s),
            Paragraph(f"{inv.get('subtotal', 0):,.2f}", rr_s),
            Paragraph(f"{inv.get('vat_amount', 0):,.2f}", rr_s),
            Paragraph(f"{inv.get('total', 0):,.2f}", rr_s),
        ])

    tbl = Table(tbl_data, colWidths=col_w, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), PRIMARY),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, ROW_STRIPE]),
        ("GRID",          (0, 0), (-1, -1), 0.3, colors.HexColor("#CBD5E1")),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 6*mm))

    note_s = ParagraphStyle("vn", fontName="Helvetica", fontSize=7.5, textColor=MED_GRAY, alignment=TA_CENTER)
    story.append(Paragraph(
        "This report is generated for UAE Federal Tax Authority (FTA) filing purposes. "
        "Please verify all figures with your accountant before submission.",
        note_s,
    ))
    story.append(Paragraph(f"Generated: {datetime.now().strftime('%d %b %Y  %H:%M')}", note_s))

    doc.build(story)
    return filepath


# ─────────────────────────────────────────────────────────────────────────────
# Profit & Loss Report PDF
# ─────────────────────────────────────────────────────────────────────────────

def generate_pl_pdf(data: dict, company: dict) -> str:
    """Professional UAE-style Profit & Loss Report PDF."""
    ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
    filepath = os.path.join(EXPORT_DIR, f"PL_Report_{ts}.pdf")

    RED   = colors.HexColor("#EF4444")
    GREEN = colors.HexColor("#059669")
    AMBER = colors.HexColor("#D97706")

    doc = SimpleDocTemplate(
        filepath, pagesize=A4,
        leftMargin=15*mm, rightMargin=15*mm,
        topMargin=15*mm, bottomMargin=15*mm,
    )
    story = []

    lh = _letterhead_flowable()
    if lh:
        story.append(lh)
        story.append(Spacer(1, 4*mm))

    title_s = ParagraphStyle("pt", fontName="Helvetica-Bold", fontSize=16, textColor=PRIMARY, alignment=TA_CENTER)
    sub_s   = ParagraphStyle("ps", fontName="Helvetica",      fontSize=9,  textColor=MED_GRAY, alignment=TA_CENTER)
    story.append(Paragraph("PROFIT & LOSS REPORT", title_s))
    story.append(Spacer(1, 2*mm))

    period_from = (data.get("period") or {}).get("from") or ""
    period_to   = (data.get("period") or {}).get("to")   or ""
    if period_from or period_to:
        story.append(Paragraph(f"Period: {period_from or 'All'} — {period_to or 'All'}", sub_s))
    story.append(Paragraph(f"Generated: {datetime.now().strftime('%d %b %Y  %H:%M')}", sub_s))
    story.append(Spacer(1, 5*mm))

    # ── KPI summary cards (2×2) ──────────────────────────────────────────────
    net_profit = data.get("net_profit", 0)
    net_color  = GREEN if net_profit >= 0 else RED

    cl_s = ParagraphStyle("cl", fontName="Helvetica", fontSize=8, textColor=MED_GRAY)

    def _card_cell(label: str, value: float, val_color):
        vs = ParagraphStyle("cv_", fontName="Helvetica-Bold", fontSize=13, textColor=val_color)
        return [Paragraph(label, cl_s), Paragraph(f"AED {value:,.2f}", vs)]

    cards = Table([
        [_card_cell("TOTAL SALES",    data.get("total_sales", 0),         PRIMARY),
         _card_cell("TOTAL EXPENSES", data.get("total_expenses", 0),      RED)],
        [_card_cell("NET PROFIT",     net_profit,                         net_color),
         _card_cell("VAT COLLECTED",  data.get("total_vat_collected", 0), AMBER)],
    ], colWidths=[_CONTENT_W / 2 - 2*mm, _CONTENT_W / 2 - 2*mm])
    cards.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), LIGHT_BLUE),
        ("BOX",           (0, 0), (-1, -1), 1,   PRIMARY),
        ("INNERGRID",     (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("TOPPADDING",    (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(cards)
    story.append(Spacer(1, 5*mm))

    # ── P&L statement table ──────────────────────────────────────────────────
    h_s    = ParagraphStyle("ph",   fontName="Helvetica-Bold", fontSize=9, textColor=WHITE)
    r_s    = ParagraphStyle("pr",   fontName="Helvetica",      fontSize=9, textColor=DARK)
    rr_s   = ParagraphStyle("prr",  fontName="Helvetica",      fontSize=9, textColor=DARK,  alignment=TA_RIGHT)
    rb_s   = ParagraphStyle("prb",  fontName="Helvetica-Bold", fontSize=9, textColor=DARK,  alignment=TA_RIGHT)
    hw_s   = ParagraphStyle("phw",  fontName="Helvetica-Bold", fontSize=9, textColor=WHITE, alignment=TA_RIGHT)

    COL_DARK2 = colors.HexColor("#1e3a8a")
    pl_rows = [
        [Paragraph("INCOME",                        h_s),  Paragraph("AED",  h_s)],
        [Paragraph("  Total Sales (excl. VAT)",      r_s),  Paragraph(f"{data.get('total_sales', 0):,.2f}", rr_s)],
        [Paragraph("",                               r_s),  Paragraph("", r_s)],
        [Paragraph("EXPENSES",                       h_s),  Paragraph("", h_s)],
        [Paragraph("  Daily / Operating Expenses",   r_s),  Paragraph(f"{data.get('total_daily_expenses', 0):,.2f}", rr_s)],
        [Paragraph("  Supplier Bills / Purchases",   r_s),  Paragraph(f"{data.get('total_supplier_bills', 0):,.2f}", rr_s)],
        [Paragraph("  Total Expenses",               r_s),  Paragraph(f"{data.get('total_expenses', 0):,.2f}", rb_s)],
        [Paragraph("",                               r_s),  Paragraph("", r_s)],
        [Paragraph("NET PROFIT / (LOSS)",            h_s),  Paragraph(f"{net_profit:,.2f}", hw_s)],
        [Paragraph("VAT Collected (5%)",             r_s),  Paragraph(f"{data.get('total_vat_collected', 0):,.2f}", rr_s)],
    ]

    pl_tbl = Table(pl_rows, colWidths=[_CONTENT_W * 0.65, _CONTENT_W * 0.35])
    pl_cmds = [
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [LIGHT_BLUE, WHITE]),
        ("GRID",           (0, 0), (-1, -1), 0.3, colors.HexColor("#CBD5E1")),
        ("TOPPADDING",     (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",  (0, 0), (-1, -1), 6),
        ("LEFTPADDING",    (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",   (0, 0), (-1, -1), 10),
        ("BACKGROUND",     (0, 0), (-1, 0), PRIMARY),
        ("BACKGROUND",     (0, 3), (-1, 3), PRIMARY),
        ("BACKGROUND",     (0, 8), (-1, 8), COL_DARK2),
        ("TEXTCOLOR",      (0, 0), (-1, 0), WHITE),
        ("TEXTCOLOR",      (0, 3), (-1, 3), WHITE),
        ("TEXTCOLOR",      (0, 8), (-1, 8), WHITE),
    ]
    pl_tbl.setStyle(TableStyle(pl_cmds))
    story.append(pl_tbl)

    # ── Monthly breakdown ────────────────────────────────────────────────────
    monthly = data.get("monthly_breakdown", [])
    if monthly:
        story.append(Spacer(1, 6*mm))
        story.append(Paragraph(
            "Monthly Breakdown",
            ParagraphStyle("mh", fontName="Helvetica-Bold", fontSize=10, textColor=PRIMARY),
        ))
        story.append(Spacer(1, 2*mm))

        m_hdrs = ["Month", "Sales (AED)", "Expenses (AED)", "Net Profit (AED)"]
        m_data = [[Paragraph(h, h_s) for h in m_hdrs]]
        for row in monthly:
            net = row.get("net", 0)
            ns  = ParagraphStyle("mn", fontName="Helvetica", fontSize=8.5,
                                 textColor=GREEN if net >= 0 else RED, alignment=TA_RIGHT)
            m_data.append([
                Paragraph(row.get("month", ""), r_s),
                Paragraph(f"{row.get('sales', 0):,.2f}", rr_s),
                Paragraph(f"{row.get('expenses', 0):,.2f}", rr_s),
                Paragraph(f"{net:,.2f}", ns),
            ])

        m_tbl = Table(m_data, colWidths=[40*mm, 47*mm, 47*mm, 44*mm], repeatRows=1)
        m_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), PRIMARY),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, ROW_STRIPE]),
            ("GRID",          (0, 0), (-1, -1), 0.3, colors.HexColor("#CBD5E1")),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING",   (0, 0), (-1, -1), 6),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(m_tbl)

    # ── Expense categories ───────────────────────────────────────────────────
    cats = data.get("expense_categories", [])
    if cats:
        story.append(Spacer(1, 6*mm))
        story.append(Paragraph(
            "Expense Breakdown by Category",
            ParagraphStyle("ch", fontName="Helvetica-Bold", fontSize=10, textColor=PRIMARY),
        ))
        story.append(Spacer(1, 2*mm))

        c_data = [[Paragraph("Category", h_s), Paragraph("Amount (AED)", h_s)]]
        for cat in cats:
            c_data.append([
                Paragraph(cat.get("category", "").replace("_", " ").title(), r_s),
                Paragraph(f"{cat.get('total', 0):,.2f}", rr_s),
            ])

        c_tbl = Table(c_data, colWidths=[_CONTENT_W * 0.6, _CONTENT_W * 0.4], repeatRows=1)
        c_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), PRIMARY),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, ROW_STRIPE]),
            ("GRID",          (0, 0), (-1, -1), 0.3, colors.HexColor("#CBD5E1")),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING",   (0, 0), (-1, -1), 10),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(c_tbl)

    doc.build(story)
    return filepath
