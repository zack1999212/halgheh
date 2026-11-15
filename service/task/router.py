from fastapi import APIRouter

router = APIRouter(prefix="/tasks", tags=["task"])


@router.get("/")
def list_tasks():
    return {"items": []}
