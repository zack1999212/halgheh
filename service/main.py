from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth.router import router as auth_router
from .calendar.router import router as calendar_router
from .docs.router import router as docs_router
from .share.router import router as share_router
from .task.router import router as task_router

app = FastAPI(title="halgheh API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(docs_router)
app.include_router(calendar_router)
app.include_router(task_router)
app.include_router(share_router)


@app.get("/health")
def health():
    return {"status": "ok"}
