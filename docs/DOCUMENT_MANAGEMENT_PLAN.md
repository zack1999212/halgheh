# Document Management Module — Development Plan

Status: **PROPOSED — awaiting approval. No code has been changed yet.**

This plan is based on analysis of the existing repository. It proposes changes
only inside the module boundaries assigned to the Document Management module,
plus the two shared files the project's own README and `alembic/env.py`
explicitly require new modules to touch.

---

## 1. Current state (what the analysis found)

### Module skeleton already exists

| Location | State today |
|---|---|
| `service/docs/` | Placeholder only: `router.py` defines `APIRouter(prefix="/docs", tags=["docs"])` with a single `GET /docs/` returning `{"items": []}`. `models/` is an empty package. Registered in `service/main.py` as `docs_router`. |
| `web/app/docs/` | Placeholder only: `DocumentsPage.jsx` renders "Documents will be built here." Route `/documents` already wired in `src/App.jsx`; sidebar item already exists in `workspace/navigation.js`. |

So routing, navigation, and app-entry wiring for a Documents feature already
exist; this plan fills in the real functionality behind them.

### Conventions observed in the mature modules (calendar, notifications)

**Backend layering** (`service/notifications/` as the cleanest reference):

```
<module>/
├── router.py      # thin HTTP layer: Depends(get_db), Depends(get_current_user), response models
├── schemas.py     # Pydantic request/response models
├── repository.py  # SQLAlchemy queries only
├── service.py     # business rules, raises HTTPException
└── models/        # SQLAlchemy ORM models on service.core.database.Base
```

**Model style**: `Mapped[...]`/`mapped_column`, `created_at`/`updated_at` with
`server_default=func.now()`, explicit named indexes and check constraints,
`ondelete="CASCADE"` foreign keys, no `create_all()` anywhere.

**Auth**: every protected endpoint takes `current_user: User =
Depends(get_current_user)` from `service/auth/dependencies.py`. Ownership is
always scoped by `current_user.id` in the query — this is the existing
multi-user isolation pattern and it is what the documents module will use.

**Migrations**: numbered files `alembic/versions/0NN_*.py`, linear history
(current head is `008_event_category`), `down_revision` chain,
`upgrade()`/`downgrade()` pairs. `alembic/env.py` imports every model package
explicitly and its comment says: *"New backend modules with models must be
added here."*

**Frontend feature area** (`web/app/calendar/`, `web/app/notifications/`):

```
<feature>/
├── api.js         # per-feature endpoint wrappers around src/api.js `apiRequest`
├── <Feature>Page.jsx
├── components / hooks (use*.js) / <feature>.css
```

Shared frontend infra: `src/api.js` (`apiRequest`, bearer token from
`localStorage.token`), `auth/ProtectedRoute.jsx`, `workspace/` layout.

---

## 2. Module boundary (proposed)

### Backend — `service/docs/` owns everything document-related

```
service/docs/
├── __init__.py          (exists)
├── router.py            (rewritten: versioned document endpoints)
├── schemas.py           (new: Pydantic request/response models)
├── repository.py        (new: DB queries)
├── service.py           (new: business rules — upload, versioning, ownership, storage)
├── storage.py           (new: file-on-disk storage adapter, isolated here)
└── models/
    ├── __init__.py      (rewritten: exports Document, DocumentVersion)
    ├── document.py      (new)
    └── document_version.py (new)
```

### Frontend — dedicated feature area inside `web/app/features/documents/`

```
web/app/features/documents/
├── api/client.js           (new: wrappers around src/api.js; mirrors backend routes)
├── DocumentsPage.jsx       (rewritten from placeholder)
├── components/             (feature-local components + layout)
├── hooks/                  (use*.js data hooks)
└── utils/                  (formatting / markdown helpers)
```

UI rules for this feature area follow `AGENT.md` at the repo root: shadcn/ui
components from `src/components/ui/`, shared components from
`src/components/shared/`, and Tailwind utilities on the central theme tokens
(`src/styles/theme.css`) — no feature-scoped token system.

### Files outside the boundary — and why each is sanctioned or forbidden

| File | Change | Justification |
|---|---|---|
| `alembic/env.py` | Add `import service.docs.models` | The file's own instruction: new modules with models must be registered here. Touching other modules' model imports is forbidden. |
| `alembic/versions/009_*.py` | New migration | Owned by this module, follows the shared numbered convention. |
| `service/main.py` | **None.** `docs_router` is already included. | No other developers' routers, middleware, or CORS config are modified. |
| `service/auth/*`, `service/core/database.py`, `docker-compose.yml` | **None.** Consumed read-only via imports. | Shared infrastructure is reused, not modified. |
| `web/app/src/App.jsx`, `workspace/*` | **None.** `/documents` route, `ProtectedRoute`, and nav item already exist. | No dashboard/navigation changes. |
| `calendar/`, `task/`, `share/`, `notifications/` (backend and frontend) | **None.** | Other developers' modules are not touched. |

Out of scope (explicitly not implemented): Calendar, Task Management, the main
Dashboard/Workspace page, and any sharing-permission UI (the `share/` module
owns sharing; see §8 for the integration seam).

---

## 3. Database design

Two tables, following the observed style (`server_default=func.now()`,
CASCADE FKs to `users.id`, named indexes/constraints):

```python
# service/docs/models/document.py
class Document(Base):
    __tablename__ = "documents"
    id                      # PK
    owner_user_id           # FK users.id, ondelete=CASCADE, indexed
    title                   # String, nullable=False, check: char_length(title) > 0
    description             # Text, nullable=True
    current_version_number  # Integer, default 1
    file_name               # denormalized from current version (fast list views)
    file_size               # Integer (bytes)
    mime_type               # String(128)
    is_deleted              # Boolean, default false (soft delete)
    created_at / updated_at # as elsewhere

    versions -> relationship(DocumentVersion, cascade="all, delete-orphan", passive_deletes=True)

# service/docs/models/document_version.py
class DocumentVersion(Base):
    __tablename__ = "document_versions"
    id                      # PK
    document_id             # FK documents.id, ondelete=CASCADE, indexed
    version_number          # Integer, nullable=False
    file_name               # original upload name
    stored_path             # server-side storage path (relative to storage root)
    file_size               # Integer
    mime_type               # String(128)
    checksum_sha256         # String(64), indexed — dedupe/integrity
    note                    # Text, nullable — "what changed in this version"
    uploaded_by_user_id     # FK users.id
    created_at
    # unique(document_id, version_number)
```

**Migration `009_document_management`**: `down_revision = "008"`, creates both
tables, indexes, unique constraint, check constraint; `downgrade()` drops them
in reverse order. Never edits existing migrations.

## 4. File storage (backend-only concern)

Files are stored on disk, not in the DB (large blobs in Postgres would hurt the
shared database every module uses). `service/docs/storage.py` encapsulates:

- Root: `service/docs/storage/` (created on demand, `.gitignore`d —
  gitignoring is a metadata-only change inside the module boundary).
- Layout: `{document_id}/{version_number}_{safe_filename}`.
- Writes are: save temp file → verify size/sha256 → move into place → insert
  DB row (DB is the source of truth; orphaned files are tolerated and can be
  cleaned later).
- Deletes remove the version directory; a failure to delete a file never
  blocks the DB transaction.
- Upload limits: max size 20 MB per file (enforced in `service.py` before
  disk write); empty files rejected.

⚠️ **Decision point (needs approval)**: under Docker, files written inside the
`backend` container are lost on rebuild. To persist them, one line must be
added to `docker-compose.yml` under the `backend` service volumes:

```yaml
  - ./service/docs/storage:/app/service/docs/storage
```

`docker-compose.yml` is shared configuration, so this line is only applied
after approval, and it only adds a volume — it does not modify anyone else's
service definition.

## 5. API design — versioned, integration-ready

The user requirement is a **clean, versioned API**. The existing placeholder
uses prefix `/docs`, which **collides with FastAPI's built-in Swagger UI at
`/docs`** (today `GET /docs` shows Swagger and only `GET /docs/` with a slash
reaches the placeholder). The proposal therefore moves the resource path to
`/documents` under an explicit version segment:

```
APIRouter(prefix="/documents/v1", tags=["documents"])
```

This is versioned (per the requirement), avoids the `/docs` Swagger collision,
and is scoped entirely inside `service/docs/router.py` — `main.py` needs no
change because it already imports this router object.

### Endpoints (all require `get_current_user`; every query scoped to owner)

| Method & path | Purpose | Notes |
|---|---|---|
| `POST /documents/v1` | Upload (multipart `file` + `title`, optional `description`) | `201` + `DocumentResponse` |
| `GET /documents/v1` | List own documents | `?q=&limit=&offset=&sort=`; default limit 50 (max 200), like notifications |
| `GET /documents/v1/{id}` | Metadata of one document | `404` if not owned / soft-deleted |
| `PATCH /documents/v1/{id}` | Rename / edit description | metadata only — content changes are **version uploads**, not PATCHes |
| `DELETE /documents/v1/{id}` | Soft-delete (sets `is_deleted`) | `204`; delete is reversible via restore |
| `POST /documents/v1/{id}/restore` | Undo soft delete | `200` |
| `GET /documents/v1/{id}/download` | Stream current version file | `FileResponse`, original filename + mime type |
| `GET /documents/v1/{id}/versions` | Version history | newest first |
| `POST /documents/v1/{id}/versions` | Upload a new version (multipart) | bumps `current_version_number`, `201` |
| `GET /documents/v1/{id}/versions/{version_number}/download` | Download a specific version | `FileResponse` |

Error contract: identical to existing modules — `HTTPException` with `detail`;
401 unauthenticated, 404 not-owned/not-found, 413 too large, 422 validation.

### Integration surface for other modules (forward-compatibility)

- Versioned paths guarantee stability for future consumers.
- All responses are explicit Pydantic models (`DocumentResponse`,
  `DocumentVersionResponse`) — other modules can code against these shapes.
- `service/docs/service.py` exposes plain functions (`create_document`,
  `get_owned_document`, ...) so a future integration (e.g., Task attaching a
  document) imports the service layer instead of calling HTTP.
- Ownership rules are centralized in one `require_owned_document` helper in
  `service.py`; a future sharing integration extends that single place.
- No document tables are referenced by other modules' migrations.

## 6. Frontend design

`web/app/features/documents/` reuses the shared frontend infrastructure:

- `api/client.js`: mirrors `router.py` one-to-one; `apiRequest` from
  `src/api.js` supplies the bearer token. Uploads are sent as `FormData` (a
  small `apiRequestUpload` wrapper in **this feature's** api client, not a
  change to shared `src/api.js`).
- `DocumentsPage.jsx`: three-pane layout; toolbar (upload, search input,
  sort), list (title, size, current version, updated), empty state, loading
  and error states consistent with existing pages.
- Dialogs use the shared `DialogShell` / `ConfirmDialog` components, loading
  uses the `Skeleton` primitive, and states reuse `EmptyState`, `ErrorState`
  and `LoadingState` from `src/components/shared/`.
- Styling uses Tailwind utility classes on the central theme tokens — no
  feature-local `--docs-*` token system.

No changes to `App.jsx` routing behavior, `workspace/`, or `src/api.js`.

## 7. Tests

`service/tests/test_docs_*.py` (new files; existing tests untouched), run the
established way from the repo root (`service/.venv/bin/python -m pytest`,
dedicated test DB, dev DB never touched):

- ownership isolation (user B cannot read/list/patch/delete/download user A's
  document),
- upload + download round-trip with checksum,
- version upload bumps `current_version_number` and history,
- 404 for unknown ids, 413 for oversized uploads,
- soft delete + restore,
- migration sanity: `alembic upgrade head` then `alembic check`.

## 8. Implementation order (each step independently verifiable)

1. **Models + migration**: `models/`, `alembic/env.py` import, migration
   `009`; verify `alembic upgrade head` + `alembic check`.
2. **Service + repository + schemas**: ownership helper, storage adapter,
   business rules.
3. **Router**: endpoints above, wired to the existing router object.
4. **Tests** for step 1–3 behavior.
5. **Frontend `api.js` + `useDocuments.js`**, then list page, then dialogs/
   panels/CSS.
6. **Docs**: update `service/README.md` module list only if the team wants the
   one-line description refreshed (it already lists `docs/ – documents part`).

## 9. Risks / open decisions for approval

1. **API prefix** — `/documents/v1` proposed (versioned, avoids the `/docs`
   Swagger-UI collision). Alternative: keep `/docs` and break Swagger UI.
2. **Docker volume line** in `docker-compose.yml` for storage persistence
   (only shared file touched; listed explicitly in §4).
3. **Storage backend** — local disk proposed; switching to object storage
   later only requires rewriting `storage.py`.
4. **Max upload size** — 20 MB proposed; configurable via a constant in
   `service.py` (no new shared config).
5. **`share/` module** — a placeholder today; this plan keeps sharing out of
   scope but defines the seam (§5) so it can be added later without breaking
   the versioned API.
