import re
from typing import Dict, Any, Optional


def parse_ai_command(command: str) -> Dict[str, Any]:
    cmd = command.lower().strip()

    # Create invoice: "create invoice for Gulf Extrusion 1000 AED"
    invoice_create = re.search(
        r'create\s+invoice\s+for\s+(.+?)\s+([\d,]+(?:\.\d+)?)\s*(?:aed|usd|dhs?)?',
        cmd
    )
    if invoice_create:
        return {
            "action": "create_invoice",
            "customer_name": invoice_create.group(1).strip().title(),
            "amount": float(invoice_create.group(2).replace(",", "")),
            "message": f"Ready to create invoice for {invoice_create.group(1).title()} — AED {invoice_create.group(2)}"
        }

    # Show ledger: "show ledger for Ahmed LLC"
    ledger_show = re.search(r'show\s+ledger\s+for\s+(.+)', cmd)
    if ledger_show:
        return {
            "action": "show_ledger",
            "page": "/ledger",
            "customer_name": ledger_show.group(1).strip().title(),
            "message": f"Opening ledger for {ledger_show.group(1).title()}"
        }

    # Statement: "make statement for may" or "statement for Ahmed LLC"
    stmt_month = re.search(
        r'(?:make|show|generate)?\s*statement\s+for\s+(january|february|march|april|may|june|july|august|september|october|november|december)',
        cmd
    )
    if stmt_month:
        return {
            "action": "show_statement_month",
            "page": "/statements",
            "month": stmt_month.group(1).title(),
            "message": f"Generating account statements for {stmt_month.group(1).title()}"
        }

    stmt_customer = re.search(r'(?:make|show|generate)?\s*statement\s+for\s+(.+)', cmd)
    if stmt_customer:
        return {
            "action": "show_statement",
            "page": "/statements",
            "customer_name": stmt_customer.group(1).strip().title(),
            "message": f"Opening statement for {stmt_customer.group(1).title()}"
        }

    # Add payment: "add payment 500 AED to invoice 1001"
    payment_add = re.search(
        r'add\s+payment\s+([\d,]+(?:\.\d+)?)\s*(?:aed|usd|dhs?)?\s+to\s+invoice\s+(\w+)',
        cmd
    )
    if payment_add:
        return {
            "action": "add_payment",
            "amount": float(payment_add.group(1).replace(",", "")),
            "invoice_number": payment_add.group(2),
            "message": f"Ready to add payment AED {payment_add.group(1)} to Invoice #{payment_add.group(2)}"
        }

    # Show reports
    if re.search(r'(show|open|view)\s+(sales|vat|outstanding|balance)\s+report', cmd):
        report_type = re.search(r'(sales|vat|outstanding|balance)', cmd).group(1)
        return {
            "action": "show_report",
            "report_type": report_type,
            "message": f"Opening {report_type.title()} Report"
        }

    # Show customers
    if re.search(r'(show|list|view)\s+customers?', cmd):
        return {"action": "navigate", "page": "/customers", "message": "Opening Customers list"}

    # Show invoices
    if re.search(r'(show|list|view)\s+invoices?', cmd):
        return {"action": "navigate", "page": "/invoices", "message": "Opening Invoices list"}

    # New invoice
    if re.search(r'new\s+invoice|create\s+invoice', cmd):
        return {"action": "navigate", "page": "/invoices/new", "message": "Opening new Invoice form"}

    # Dashboard
    if re.search(r'dashboard|home', cmd):
        return {"action": "navigate", "page": "/", "message": "Opening Dashboard"}

    # Backup
    if re.search(r'backup|export\s+database', cmd):
        return {"action": "backup_database", "message": "Starting database backup..."}

    # Delivery note commands
    dn_create = re.search(r'create\s+delivery\s+note\s+for\s+(.+)', cmd)
    if dn_create:
        return {
            "action": "navigate",
            "page": "/delivery-notes",
            "customer_name": dn_create.group(1).strip().title(),
            "message": f"Opening Delivery Notes — create a note for {dn_create.group(1).title()}"
        }

    if re.search(r'(show|list|view|open)\s+delivery\s+notes?', cmd):
        return {"action": "navigate", "page": "/delivery-notes", "message": "Opening Delivery Notes"}

    if re.search(r'delivery\s+note', cmd):
        return {"action": "navigate", "page": "/delivery-notes", "message": "Opening Delivery Notes"}

    # Statement with date range
    stmt_range = re.search(
        r'(?:generate|show|make)\s+statement\s+for\s+(.+?)\s+from\s+(\w+)\s+to\s+(\w+)', cmd
    )
    if stmt_range:
        return {
            "action": "navigate",
            "page": "/statements",
            "customer_name": stmt_range.group(1).strip().title(),
            "message": f"Opening Statement for {stmt_range.group(1).title()} ({stmt_range.group(2).title()} to {stmt_range.group(3).title()})"
        }

    # Show customer ledger (generic navigate)
    if re.search(r'(show|open|view)\s+(customer\s+)?ledger', cmd):
        return {"action": "navigate", "page": "/ledger", "message": "Opening Customer Ledger"}

    return {
        "action": "unknown",
        "message": (
            f"I couldn't understand: '{command}'. "
            "Try: 'Create invoice for [Customer] [Amount] AED', "
            "'Show ledger for [Customer]', 'Make statement for [Month]', "
            "'Add payment [Amount] AED to invoice [Number]', "
            "'Create delivery note for [Customer]', 'Show delivery notes'"
        )
    }
