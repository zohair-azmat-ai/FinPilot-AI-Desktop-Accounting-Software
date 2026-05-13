from fastapi import APIRouter
from pydantic import BaseModel
import sync_engine
from database import DB_PATH

router = APIRouter(prefix="/api/cloud", tags=["cloud"])


class ConnectRequest(BaseModel):
    url: str
    anon_key: str
    workspace_id: str


@router.get("/status")
def status():
    return sync_engine.get_status()


@router.post("/connect")
def connect(body: ConnectRequest):
    return sync_engine.connect(body.url.strip(), body.anon_key.strip(), body.workspace_id.strip())


@router.post("/disconnect")
def disconnect():
    return sync_engine.disconnect()


@router.post("/sync/now")
def sync_now():
    return sync_engine.sync_now()


@router.post("/restore")
def restore():
    return sync_engine.restore_from_cloud(DB_PATH)


@router.get("/restore-from-supabase")
def restore_from_supabase():
    """Non-destructive UPSERT restore from Supabase. Never deletes local data."""
    return sync_engine.restore_from_cloud(DB_PATH)


@router.get("/sync/log")
def sync_log():
    """Return the per-table pull log from the last sync run."""
    status = sync_engine.get_status()
    return {"pull_log": status.get("last_pull_log") or {}}


@router.get("/schema")
def schema():
    return {"sql": sync_engine.get_schema_sql(DB_PATH)}
