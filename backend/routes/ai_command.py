from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from ai_parser import parse_ai_command
import models, schemas

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/command")
def process_command(req: schemas.AICommandRequest, db: Session = Depends(get_db)):
    result = parse_ai_command(req.command)

    if result["action"] == "show_ledger":
        customers = db.query(models.Customer).filter(
            models.Customer.name.ilike(f"%{result['customer_name']}%")
        ).all()
        if customers:
            result["customer_id"] = customers[0].id
            result["customer_name"] = customers[0].name
            result["page"] = f"/ledger?customer_id={customers[0].id}"
        else:
            result["message"] = f"Customer '{result['customer_name']}' not found in database."

    elif result["action"] == "show_statement":
        customers = db.query(models.Customer).filter(
            models.Customer.name.ilike(f"%{result['customer_name']}%")
        ).all()
        if customers:
            result["customer_id"] = customers[0].id
            result["page"] = f"/statements?customer_id={customers[0].id}"
        else:
            result["message"] = f"Customer '{result['customer_name']}' not found."

    elif result["action"] == "add_payment":
        inv = db.query(models.Invoice).filter(
            models.Invoice.invoice_number.ilike(f"%{result['invoice_number']}%")
        ).first()
        if inv:
            result["invoice_id"] = inv.id
            result["customer_id"] = inv.customer_id
            result["page"] = f"/payments/new?invoice_id={inv.id}&amount={result['amount']}"
        else:
            result["message"] = f"Invoice #{result['invoice_number']} not found."

    elif result["action"] == "create_invoice":
        customers = db.query(models.Customer).filter(
            models.Customer.name.ilike(f"%{result['customer_name']}%")
        ).all()
        if customers:
            result["customer_id"] = customers[0].id
            result["page"] = f"/invoices/new?customer_id={customers[0].id}&amount={result['amount']}"
        else:
            result["page"] = f"/invoices/new"
            result["message"] += f" — Note: Customer not found, please select manually."

    elif result["action"] == "show_report":
        report_map = {"sales": "/reports?tab=sales", "vat": "/reports?tab=vat", "outstanding": "/reports?tab=outstanding", "balance": "/reports?tab=balance"}
        result["page"] = report_map.get(result.get("report_type", ""), "/reports")

    elif result["action"] == "backup_database":
        import shutil, os
        from database import DB_PATH
        backup_dir = os.path.join(os.path.expanduser("~"), "FinPilot", "backups")
        os.makedirs(backup_dir, exist_ok=True)
        from datetime import datetime
        backup_name = f"finpilot_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
        shutil.copy2(DB_PATH, os.path.join(backup_dir, backup_name))
        result["message"] = f"Database backed up as '{backup_name}' in FinPilot/backups folder."

    return result
