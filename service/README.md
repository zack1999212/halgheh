# Backend (service/)

Single FastAPI app split into parts, each in its own folder:

- `docs/` – documents part
- `calendar/` – calendar part
- `task/` – tasks part
- `share/` – sharing part

`main.py` is the single entrypoint that mounts every part's router.

## Structure (per part)

```
<part>/
├── router.py      # API routes for this part
├── models/        # Pydantic schemas / DB models
```

Shared code goes in `common/`, tests in `tests/`.

## Setup

```bash
cd service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn main:app --reload --port 8000
```

Interactive API docs: http://localhost:8000/docs

## Docker

From the project root:

```bash
docker compose up
```
