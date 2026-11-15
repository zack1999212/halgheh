from fastapi import APIRouter

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/")
def list_events():
    return {"items": []}
