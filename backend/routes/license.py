from fastapi import APIRouter
from pydantic import BaseModel
import license_manager

router = APIRouter(prefix="/api/license", tags=["license"])


class RequestActivationBody(BaseModel):
    customer_id: str


class ImportResponseBody(BaseModel):
    response: str


@router.get("/status")
def status():
    return license_manager.get_status()


@router.get("/hwid")
def hwid():
    try:
        return {"hw_id": license_manager.get_hw_id()}
    except license_manager.HardwareIdError as e:
        return {"hw_id": "", "error": str(e)}


@router.post("/request")
def request_activation(body: RequestActivationBody):
    """Generate (and locally persist) an offline activation request for this
    machine. Contains no secret — safe to copy/paste/email to the vendor."""
    return license_manager.generate_activation_request(body.customer_id)


@router.post("/import-response")
def import_response(body: ImportResponseBody):
    """Verify and activate a vendor-signed license response. Fully offline —
    no network call is made."""
    return license_manager.import_license_response(body.response)
