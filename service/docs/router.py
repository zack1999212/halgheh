from fastapi import APIRouter

router = APIRouter(prefix="/docs", tags=["docs"])


@router.get("/")
def list_docs():
    return {"items": []}
