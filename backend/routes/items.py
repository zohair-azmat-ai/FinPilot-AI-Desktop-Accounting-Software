from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
import models, schemas

router = APIRouter(prefix="/api/items", tags=["items"])


@router.get("/", response_model=List[schemas.Item])
def list_items(db: Session = Depends(get_db)):
    return db.query(models.Item).order_by(models.Item.name).all()


@router.get("/{item_id}", response_model=schemas.Item)
def get_item(item_id: int, db: Session = Depends(get_db)):
    i = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Item not found")
    return i


@router.post("/", response_model=schemas.Item)
def create_item(data: schemas.ItemCreate, db: Session = Depends(get_db)):
    item = models.Item(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}", response_model=schemas.Item)
def update_item(item_id: int, data: schemas.ItemCreate, db: Session = Depends(get_db)):
    i = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Item not found")
    for key, value in data.model_dump().items():
        setattr(i, key, value)
    db.commit()
    db.refresh(i)
    return i


@router.delete("/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db)):
    i = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(i)
    db.commit()
    return {"ok": True}
