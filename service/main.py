import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .agent.router import router as agent_router
from .auth.router import router as auth_router
from .ai.router import router as ai_router
from .calendar.router import router as calendar_router
from .discussions.router import router as discussions_router
from .notifications.router import router as notifications_router
import service.notifications.models  # noqa: F401
from .docs.router import router as docs_router
from .project.router import invitations_router as project_invitations_router
from .project.router import router as project_router
from .share.router import router as share_router
from .task.router import router as task_router

app = FastAPI(title="halgheh API", version="0.1.0")

logger = logging.getLogger("halgheh")

UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(ai_router)
app.include_router(agent_router)
app.include_router(docs_router)
app.include_router(calendar_router)
app.include_router(discussions_router)
app.include_router(notifications_router)
app.include_router(project_router)
app.include_router(project_invitations_router)
app.include_router(task_router)
app.include_router(share_router)


@app.get("/health")
def health():
    return {"status": "ok"}
