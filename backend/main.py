from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import shutil, os
from datetime import datetime

from database import engine, DB_PATH
import models
from routes import company, customers, suppliers, items, quotations, invoices, payments, ledger, reports, ai_command, bank_accounts, bank_transactions, cheques, expenses

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

_run_migrations()

app = FastAPI(title="FinPilot AI", version="1.0.0", description="UAE Accounting System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.get("/")
def root():
    return {"message": "FinPilot AI API", "version": "1.0.0", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "FinPilot AI"}


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
    backup_dir = os.path.join(os.path.expanduser("~"), "FinPilot", "backups")
    os.makedirs(backup_dir, exist_ok=True)
    backup_name = f"finpilot_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    backup_path = os.path.join(backup_dir, backup_name)
    shutil.copy2(DB_PATH, backup_path)
    return {"message": f"Backup created: {backup_name}", "path": backup_path}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=False)
