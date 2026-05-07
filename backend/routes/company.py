from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from database import get_db
import models, schemas
import os, shutil

router = APIRouter(prefix="/api/company", tags=["company"])

_USER_STAMP_DIR = os.path.join(os.path.expanduser("~"), "FinPilot", "assets")


def _company_dict(company) -> dict:
    """Return company as a plain dict — bypasses Pydantic response_model filtering."""
    return {
        "id": company.id,
        "name": company.name or "",
        "trn": company.trn or "",
        "address": company.address or "",
        "phone": company.phone or "",
        "email": company.email or "",
        "letterhead_mode": bool(company.letterhead_mode) if company.letterhead_mode is not None else True,
        "vat_rate": company.vat_rate if company.vat_rate is not None else 5.0,
        "logo_path": company.logo_path or "",
        "invoice_prefix": company.invoice_prefix or "",
        "invoice_current_number": company.invoice_current_number or 0,
        "dn_prefix": company.dn_prefix or "DN-",
        "dn_current_number": company.dn_current_number or 0,
        "show_dn_stamp": bool(company.show_dn_stamp) if company.show_dn_stamp is not None else False,
        "quotation_prefix": company.quotation_prefix or "QUO-",
        "quotation_current_number": company.quotation_current_number or 0,
        "created_at": company.created_at.isoformat() if company.created_at else None,
    }


@router.get("/")
def get_company(db: Session = Depends(get_db)):
    company = db.query(models.Company).first()
    if not company:
        company = models.Company(name="My Company")
        db.add(company)
        db.commit()
        db.refresh(company)
    return _company_dict(company)


@router.post("/")
def save_company(data: schemas.CompanyCreate, db: Session = Depends(get_db)):
    company = db.query(models.Company).first()
    if company:
        for key, value in data.model_dump().items():
            setattr(company, key, value)
    else:
        company = models.Company(**data.model_dump())
        db.add(company)
    db.commit()
    db.refresh(company)
    return _company_dict(company)


@router.post("/stamp")
async def upload_stamp(file: UploadFile = File(...)):
    ALLOWED = {"image/png", "image/jpeg", "image/webp", "image/jpg"}
    MAX_BYTES = 2 * 1024 * 1024  # 2 MB

    if file.content_type not in ALLOWED:
        raise HTTPException(status_code=400, detail="Only PNG, JPG or WebP images are allowed")

    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large — maximum size is 2 MB")

    os.makedirs(_USER_STAMP_DIR, exist_ok=True)
    stamp_path = os.path.join(_USER_STAMP_DIR, "stamp.png")
    with open(stamp_path, "wb") as f:
        f.write(contents)
    return {"ok": True, "message": "Stamp uploaded", "path": stamp_path}
