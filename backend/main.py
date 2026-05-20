from fastapi import FastAPI, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import shutil, os
from datetime import datetime

from database import engine, DB_PATH
import models
import license_manager
import sync_engine
from routes import company, customers, suppliers, items, quotations, invoices, payments, ledger, reports, ai_command, bank_accounts, bank_transactions, cheques, expenses, delivery_notes, purchase_orders, supplier_bills, supplier_payments
from routes import license as license_router
from routes import cloud as cloud_router

# ── LAN access patch: override host regardless of what run.py was compiled with ──
try:
    import uvicorn as _uvicorn_mod
    _uvicorn_orig_run = _uvicorn_mod.run
    def _uvicorn_lan_run(app, **kw):
        kw['host'] = '0.0.0.0'
        return _uvicorn_orig_run(app, **kw)
    _uvicorn_mod.run = _uvicorn_lan_run
except Exception:
    pass
# ─────────────────────────────────────────────────────────────────────────────────

models.Base.metadata.create_all(bind=engine)


def _run_migrations():
    """Add columns that may be missing from databases created before the column existed."""
    migrations = [
        ("invoices",          "lpo_no",          "TEXT DEFAULT ''"),
        ("invoices",          "do_no",            "TEXT DEFAULT ''"),
        ("invoices",          "quotation_id",     "INTEGER"),
        ("customers",         "opening_balance",  "REAL DEFAULT 0.0"),
        ("suppliers",         "opening_balance",  "REAL DEFAULT 0.0"),
        ("payments",          "payment_direction","TEXT DEFAULT 'received'"),
        ("payments",          "supplier_id",      "INTEGER"),
        ("payments",          "bank_account_id",  "INTEGER"),
        ("payments",          "is_advance",       "INTEGER DEFAULT 0"),
        ("ledger_entries",    "entry_type",                   "TEXT DEFAULT 'invoice'"),
        ("ledger_entries",    "payment_id",                   "INTEGER"),
        ("invoices",          "is_cash",                      "INTEGER DEFAULT 0"),
        ("invoices",          "include_stamp",                "INTEGER DEFAULT 0"),
        ("invoices",          "require_customer_signature",   "INTEGER DEFAULT 0"),
        ("customers",         "po_box",                       "TEXT DEFAULT ''"),
        ("companies",         "invoice_prefix",               "TEXT DEFAULT ''"),
        ("companies",         "invoice_current_number",       "INTEGER DEFAULT 0"),
        ("quotations",        "payment_terms",                "TEXT DEFAULT ''"),
        ("quotations",        "delivery",                     "TEXT DEFAULT ''"),
        ("quotations",        "include_stamp",                "INTEGER DEFAULT 0"),
        ("quotations",        "letterhead",                   "INTEGER DEFAULT 1"),
        ("expenses",          "expense_type",                 "TEXT DEFAULT 'general'"),
        ("delivery_notes",    "status",                       "TEXT DEFAULT 'draft'"),
        ("delivery_notes",    "remarks",                      "TEXT DEFAULT ''"),
        ("delivery_notes",    "letterhead",                   "INTEGER DEFAULT 1"),
        ("delivery_note_items", "remarks",                    "TEXT DEFAULT ''"),
        ("companies",           "dn_prefix",                  "TEXT DEFAULT 'DN-'"),
        ("companies",           "dn_current_number",          "INTEGER DEFAULT 0"),
        ("companies",           "show_dn_stamp",              "INTEGER DEFAULT 0"),
        ("companies",           "quotation_prefix",           "TEXT DEFAULT 'QUO-'"),
        ("companies",           "quotation_current_number",   "INTEGER DEFAULT 0"),
        ("companies",           "po_prefix",                  "TEXT DEFAULT 'PO-'"),
        ("companies",           "po_current_number",          "INTEGER DEFAULT 0"),
        # purchase_orders table is created by create_all; these guard older DBs
        ("purchase_orders",     "delivery_terms",             "TEXT DEFAULT ''"),
        ("purchase_orders",     "include_stamp",              "INTEGER DEFAULT 0"),
        ("purchase_orders",     "letterhead",                 "INTEGER DEFAULT 1"),
        ("companies",           "show_lpo_in_statement",      "INTEGER DEFAULT 0"),
        # Supplier accounting tables are created by create_all; these guard older DBs
        ("supplier_bills",      "trn",                        "TEXT DEFAULT ''"),
        ("supplier_bills",      "lpo_no",                     "TEXT DEFAULT ''"),
        ("supplier_bills",      "amount_paid",                "REAL DEFAULT 0.0"),
        ("supplier_bills",      "balance_due",                "REAL DEFAULT 0.0"),
        ("supplier_bills",      "status",                     "TEXT DEFAULT 'unpaid'"),
        # Soft-delete column — added to parent entity tables and item tables
        ("invoice_items",   "deleted_at", "TEXT DEFAULT NULL"),
        ("invoices",        "deleted_at", "TEXT DEFAULT NULL"),
        ("quotations",      "deleted_at", "TEXT DEFAULT NULL"),
        ("delivery_notes",  "deleted_at", "TEXT DEFAULT NULL"),
        ("purchase_orders", "deleted_at", "TEXT DEFAULT NULL"),
        ("customers",       "deleted_at", "TEXT DEFAULT NULL"),
        ("suppliers",       "deleted_at", "TEXT DEFAULT NULL"),
        ("payments",        "deleted_at", "TEXT DEFAULT NULL"),
        ("supplier_bills",  "deleted_at", "TEXT DEFAULT NULL"),
        # Expense party name — added for party/supplier name saving on expenses
        ("expenses",        "party_name", "TEXT DEFAULT ''"),
        # Cloud sync columns — added to all tables
        *[col for tbl in [
            "companies", "bank_accounts", "customers", "suppliers", "items",
            "quotations", "quotation_items", "invoices", "invoice_items",
            "payments", "payment_allocations", "ledger_entries",
            "bank_transactions", "cheques", "delivery_notes", "delivery_note_items",
            "purchase_orders", "purchase_order_items",
            "supplier_bills", "supplier_bill_items",
            "supplier_payments", "supplier_payment_allocations", "expenses",
        ] for col in [
            (tbl, "sync_uuid",   "TEXT"),
            (tbl, "updated_at",  "TEXT"),
        ]],
    ]
    with engine.connect() as conn:
        for table, column, col_def in migrations:
            try:
                conn.execute(__import__("sqlalchemy").text(
                    f"ALTER TABLE {table} ADD COLUMN {column} {col_def}"
                ))
                conn.commit()
            except Exception:
                pass  # column already exists — safe to ignore

        # Backfill defaults for company fields that SQLite may leave NULL on existing rows
        _sa = __import__("sqlalchemy")
        _backfills = [
            ("UPDATE companies SET quotation_prefix = 'QUO-' WHERE quotation_prefix IS NULL OR quotation_prefix = ''"),
            ("UPDATE companies SET quotation_current_number = 0 WHERE quotation_current_number IS NULL"),
            ("UPDATE companies SET show_dn_stamp = 0 WHERE show_dn_stamp IS NULL"),
            ("UPDATE companies SET dn_prefix = 'DN-' WHERE dn_prefix IS NULL OR dn_prefix = ''"),
            ("UPDATE companies SET dn_current_number = 0 WHERE dn_current_number IS NULL"),
            ("UPDATE companies SET invoice_prefix = '' WHERE invoice_prefix IS NULL"),
            ("UPDATE companies SET invoice_current_number = 0 WHERE invoice_current_number IS NULL"),
            ("UPDATE companies SET po_prefix = 'PO-' WHERE po_prefix IS NULL OR po_prefix = ''"),
            ("UPDATE companies SET po_current_number = 0 WHERE po_current_number IS NULL"),
        ]
        for sql in _backfills:
            try:
                conn.execute(_sa.text(sql))
                conn.commit()
            except Exception:
                pass

_run_migrations()


def _backfill_sync_uuids():
    """One-time: assign sync_uuid + updated_at to all existing rows that lack them."""
    import uuid as _uuid
    from sync_engine import SYNC_TABLES
    _sa = __import__("sqlalchemy")
    with engine.connect() as conn:
        for table in SYNC_TABLES:
            try:
                rows = conn.execute(_sa.text(f"SELECT id FROM {table} WHERE sync_uuid IS NULL")).fetchall()
                for (row_id,) in rows:
                    conn.execute(_sa.text(
                        f"UPDATE {table} SET sync_uuid = :u, updated_at = :t WHERE id = :id"
                    ), {"u": str(_uuid.uuid4()), "t": datetime.utcnow().isoformat(), "id": row_id})
                if rows:
                    conn.commit()
            except Exception:
                pass


_backfill_sync_uuids()
sync_engine.start(DB_PATH)

app = FastAPI(title="FinPilot AI", version="1.0.0", description="UAE Accounting System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# License gate — block all non-license API calls if unlicensed / expired
_LICENSE_FREE = {"/", "/health", "/api/debug/runtime"}

@app.middleware("http")
async def license_gate(request: Request, call_next):
    path = request.url.path
    # Always allow: license endpoints, root, health, OPTIONS preflight
    if (path.startswith("/api/license") or
            path.startswith("/api/cloud") or
            path in _LICENSE_FREE or
            request.method == "OPTIONS"):
        return await call_next(request)
    if not license_manager.is_active():
        return JSONResponse(
            status_code=403,
            content={"detail": "License expired or not activated. Please activate FinPilot AI."},
        )
    return await call_next(request)

app.include_router(license_router.router)
app.include_router(company.router)
app.include_router(customers.router)
app.include_router(suppliers.router)
app.include_router(items.router)
app.include_router(quotations.router)
app.include_router(invoices.router)
app.include_router(payments.router)
app.include_router(ledger.router)
app.include_router(reports.router)
app.include_router(ai_command.router)
app.include_router(bank_accounts.router)
app.include_router(bank_transactions.router)
app.include_router(cheques.router)
app.include_router(expenses.router)
app.include_router(delivery_notes.router)
app.include_router(purchase_orders.router)
app.include_router(supplier_bills.router)
app.include_router(supplier_payments.router)
app.include_router(cloud_router.router)


@app.get("/")
def root():
    return {"message": "FinPilot AI API", "version": "1.0.0", "status": "running"}


@app.get("/health")
def health():
    return {"ok": True, "status": "ok", "service": "FinPilot AI", "host": "0.0.0.0", "port": 8001}


@app.get("/debug/pdf-test")
def debug_pdf_test():
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(
        "FinPilot PDF endpoint is reachable.\n"
        "Backend is running on 0.0.0.0:8001 — LAN accessible.\n"
        "If you see this, mobile can reach the backend.",
        media_type="text/plain",
    )


@app.get("/api/debug/runtime")
def debug_runtime():
    import sys
    exe = getattr(sys, "executable", "unknown")
    meipass = getattr(sys, "_MEIPASS", None)
    pdf_gen_path = os.path.join(meipass, "pdf_generator.py") if meipass else "not frozen"
    pdf_gen_mtime = None
    if os.path.exists(pdf_gen_path):
        pdf_gen_mtime = datetime.fromtimestamp(os.path.getmtime(pdf_gen_path)).strftime("%Y-%m-%d %H:%M:%S")
    dbg_log = os.path.join(os.path.expanduser("~"), "FinPilot", "pdf_debug.log")
    dbg_exists = os.path.exists(dbg_log)
    return {
        "pdf_generator_version": "v3",
        "exe_path": exe,
        "cwd": os.getcwd(),
        "_MEIPASS": meipass,
        "pdf_generator_path": pdf_gen_path,
        "pdf_generator_mtime": pdf_gen_mtime,
        "pdf_debug_log_exists": dbg_exists,
        "debug_log_path": dbg_log,
    }


@app.get("/api/backup")
def backup_database():
    from fastapi.responses import FileResponse as _FileResponse
    import zipfile, tempfile
    backup_dir = os.path.join(os.path.expanduser("~"), "FinPilot", "backups")
    os.makedirs(backup_dir, exist_ok=True)
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    zip_name = f"FinPilot_Backup_{ts}.zip"
    zip_path = os.path.join(backup_dir, zip_name)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(DB_PATH, "finpilot.db")
        # write a metadata file
        zf.writestr("backup_info.txt",
                    f"FinPilot AI Backup\nDate: {datetime.now().isoformat()}\nDB: finpilot.db\n")
    return _FileResponse(zip_path, media_type="application/zip", filename=zip_name)


@app.post("/api/restore")
async def restore_database(file: UploadFile = File(...)):
    import zipfile, io
    contents = await file.read()
    try:
        with zipfile.ZipFile(io.BytesIO(contents)) as zf:
            names = zf.namelist()
            if "finpilot.db" not in names:
                from fastapi import HTTPException as _H
                raise _H(status_code=400, detail="Invalid backup: finpilot.db not found in zip")
            # write to a temp file first, then replace
            tmp = DB_PATH + ".restore_tmp"
            with zf.open("finpilot.db") as src, open(tmp, "wb") as dst:
                dst.write(src.read())
        # Swap files
        bak = DB_PATH + f".pre_restore_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        shutil.copy2(DB_PATH, bak)
        shutil.move(tmp, DB_PATH)
    except Exception as e:
        from fastapi import HTTPException as _H
        raise _H(status_code=400, detail=f"Restore failed: {e}")
    return {"ok": True, "message": "Database restored. Please restart the app to reload data."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=False)
