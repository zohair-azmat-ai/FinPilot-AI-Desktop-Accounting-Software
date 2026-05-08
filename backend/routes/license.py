from fastapi import APIRouter
from pydantic import BaseModel
import license_manager

router = APIRouter(prefix="/api/license", tags=["license"])


class ActivateRequest(BaseModel):
    key: str


@router.get("/status")
def status():
    return license_manager.get_status()


@router.get("/hwid")
def hwid():
    return {"hw_id": license_manager.get_hw_id()}


@router.post("/activate")
def activate(body: ActivateRequest):
    return license_manager.activate(body.key)
