from fastapi import APIRouter

router = APIRouter(prefix="/share", tags=["share"])


@router.get("/")
def list_shares():
    return {"items": []}
