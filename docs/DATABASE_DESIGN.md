# Document Management Module — Database Design (Phase 2)

Status: **PROPOSED — awaiting approval. No models, tables, or migrations have
been created or run.**

Supersedes the §3 (schema) and §4 (file storage) sections of
`docs/DOCUMENT_MANAGEMENT_PLAN.md`: this phase's design stores Markdown
content in the database instead of uploaded files on disk, so the storage
adapter and the docker volume proposal from Phase 1 are no longer needed.
They will be formally removed from the plan during implementation.

---

## 1. Entity overview and cardinalities

```
users (existing, auth module — untouched)
  1 ──< N workspaces            (a user owns many workspaces)

workspaces 1 ──< N folders        (folders live in one workspace)
folders   1 ──< N folders         (self-referencing tree, parent_id nullable)
workspaces 1 ──< N documents
folders   0..1 ──< N documents    (folder_id nullable → document can sit at root)
users     1 ──< N documents       (owner_id)

documents 1 ──< N document_versions   (immutable history, version_number >= 1)
documents 1 ──< N document_links      (source links; also target links)
documents N ──< N tags                (via document_tags)
documents 1 ──< N document_favorites  (one favorite per (user, document))
documents 1 ──< N document_permissions (one grant per (document, user))
```

Table names are generic (`workspaces`, `folders`, `documents`, `tags`).
See concern C1 before approving.

## 2. Model specification (SQLAlchemy 2.x typed mappings)

All models live in `service/docs/models/` and inherit from the existing
`service.core.database.Base`. Style follows `service/calendar/models/event.py`
exactly: `Mapped[...]` / `mapped_column`, `created_at`/`updated_at` with
`server_default=func.now()`, named indexes/constraints, `passive_deletes=True`
with DB-level `ondelete`.

### `service/docs/models/workspace.py`

```python
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, Index, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from ...auth.models import User


class Workspace(Base):
    __tablename__ = "workspaces"
    __table_args__ = (
        Index("ix_workspaces_owner_id", "owner_id"),
        CheckConstraint(
            "char_length(name) > 0", name="ck_workspaces_name_not_empty"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # One-directional link to the auth module's User. service/auth/models.py
    # is NOT modified (requirement: preserve existing authentication models),
    # so there is no back_populates on the User side.
    owner: Mapped["User"] = relationship("User")

    folders: Mapped[list["Folder"]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    documents: Mapped[list["Document"]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    tags: Mapped[list["Tag"]] = relationship(
        back_populates="workspace",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
```

### `service/docs/models/folder.py`

```python
from datetime import datetime

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, Index, String, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base


class Folder(Base):
    __tablename__ = "folders"
    __table_args__ = (
        Index("ix_folders_workspace_id", "workspace_id"),
        Index("ix_folders_workspace_parent", "workspace_id", "parent_id"),
        # NULL-safe name uniqueness is incomplete with this constraint:
        # two root folders (parent_id IS NULL) with the same name in the same
        # workspace are NOT rejected by it, because Postgres treats NULLs as
        # distinct. Migration 009 therefore adds two partial unique indexes
        # (see §3.3). This constraint still covers every non-null parent.
        Index(
            "uq_folders_workspace_parent_name",
            "workspace_id", "parent_id", "name",
            unique=True,
        ),
        CheckConstraint(
            "char_length(name) > 0", name="ck_folders_name_not_empty"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("folders.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    workspace: Mapped["Workspace"] = relationship(back_populates="folders")
    parent: Mapped["Folder | None"] = relationship(
        "Folder",
        back_populates="children",
        remote_side="Folder.id",   # self-referential tree
    )
    children: Mapped[list["Folder"]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    documents: Mapped[list["Document"]] = relationship(
        back_populates="folder",
    )
```

### `service/docs/models/document.py`

```python
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, Text,
    UniqueConstraint, func, text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from ...auth.models import User
    from .document_favorite import DocumentFavorite
    from .document_link import DocumentLink
    from .document_permission import DocumentPermission
    from .document_tag import DocumentTag
    from .document_version import DocumentVersion
    from .folder import Folder
    from .tag import Tag
    from .workspace import Workspace


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_documents_workspace_folder", "workspace_id", "folder_id"),
        Index("ix_documents_owner_id", "owner_id"),
        Index("ix_documents_workspace_archived", "workspace_id", "is_archived"),
        UniqueConstraint(
            "workspace_id", "slug", name="uq_documents_workspace_slug"
        ),
        CheckConstraint(
            "char_length(title) > 0", name="ck_documents_title_not_empty"
        ),
        CheckConstraint(
            "char_length(slug) > 0", name="ck_documents_slug_not_empty"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    folder_id: Mapped[int | None] = mapped_column(
        # SET NULL: hard-deleting a folder moves its documents to the
        # workspace root instead of destroying them (they use soft delete).
        ForeignKey("folders.id", ondelete="SET NULL"), nullable=True
    )
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_favorite: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    is_archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    is_deleted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    workspace: Mapped["Workspace"] = relationship(back_populates="documents")
    folder: Mapped["Folder | None"] = relationship(back_populates="documents")
    owner: Mapped["User"] = relationship("User")

    versions: Mapped[list["DocumentVersion"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="DocumentVersion.version_number.desc()",
    )
    tags: Mapped[list["Tag"]] = relationship(
        secondary="document_tags", viewonly=True
    )
    document_tags: Mapped[list["DocumentTag"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    links_out: Mapped[list["DocumentLink"]] = relationship(
        foreign_keys="DocumentLink.source_document_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    links_in: Mapped[list["DocumentLink"]] = relationship(
        foreign_keys="DocumentLink.target_document_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    favorites: Mapped[list["DocumentFavorite"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    permissions: Mapped[list["DocumentPermission"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
```

Notes:

- `tags` is a read-only (`viewonly=True`) convenience; writes go through the
  `DocumentTag` association object, which is the SQLAlchemy 2.0-recommended
  pattern when the association table is mapped and may grow extra columns.
- `links_out` / `links_in` need explicit `foreign_keys` because
  `DocumentLink` has two FKs to `documents`.

### `service/docs/models/document_link.py`

```python
from datetime import datetime

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, Index, String,
    UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

# Stable identifiers, like event categories: colors/labels live in the
# frontend mapping, never in the database.
LINK_TYPE_RELATED = "related"
LINK_TYPE_REFERENCE = "reference"
LINK_TYPE_DEPENDS_ON = "depends_on"


class DocumentLink(Base):
    __tablename__ = "document_links"
    __table_args__ = (
        UniqueConstraint(
            "source_document_id", "target_document_id", "link_type",
            name="uq_document_links_source_target_type",
        ),
        CheckConstraint(
            "source_document_id <> target_document_id",
            name="ck_document_links_not_self",
        ),
        CheckConstraint(
            "link_type IN ('related', 'reference', 'depends_on')",
            name="ck_document_links_link_type",
        ),
        Index("ix_document_links_target_document_id", "target_document_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    target_document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    link_type: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    source: Mapped["Document"] = relationship(
        foreign_keys=[source_document_id]
    )
    target: Mapped["Document"] = relationship(
        foreign_keys=[target_document_id]
    )
```

### `service/docs/models/tag.py`

```python
from sqlalchemy import (
    CheckConstraint, ForeignKey, Index, String, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (
        Index("ix_tags_workspace_id", "workspace_id"),
        UniqueConstraint("workspace_id", "name", name="uq_tags_workspace_name"),
        CheckConstraint("char_length(name) > 0", name="ck_tags_name_not_empty"),
        CheckConstraint(
            "color ~ '^#[0-9a-fA-F]{6}$'", name="ck_tags_color_hex"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False)

    workspace: Mapped["Workspace"] = relationship(back_populates="tags")
    document_tags: Mapped["DocumentTag"] = relationship(
        back_populates="tag",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
```

### `service/docs/models/document_tag.py`

```python
from sqlalchemy import ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base


class DocumentTag(Base):
    __tablename__ = "document_tags"
    __table_args__ = (
        Index("ix_document_tags_tag_id", "tag_id"),
    )

    # Composite primary key = duplicate (document_id, tag_id) rows are
    # impossible at the database level. The requirement lists no surrogate id
    # for this entity, so none is added.
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )

    document: Mapped["Document"] = relationship(
        back_populates="document_tags"
    )
    tag: Mapped["Tag"] = relationship(back_populates="document_tags")
```

### `service/docs/models/document_version.py`

```python
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, Index, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

if TYPE_CHECKING:
    from ...auth.models import User
    from .document import Document


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = (
        Index("ix_document_versions_document_id", "document_id"),
        UniqueConstraint(
            "document_id", "version_number",
            name="uq_document_versions_document_version",
        ),
        CheckConstraint(
            "version_number >= 1",
            name="ck_document_versions_version_number_positive",
        ),
        CheckConstraint(
            "char_length(title) > 0",
            name="ck_document_versions_title_not_empty",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # SET NULL (not CASCADE): version history must survive user deletion;
    # created_by becomes NULL and the snapshot is still valid.
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    document: Mapped["Document"] = relationship(back_populates="versions")
    creator: Mapped["User | None"] = relationship("User")
```

### `service/docs/models/document_favorite.py`

```python
from datetime import datetime

from sqlalchemy import (
    DateTime, ForeignKey, Index, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base


class DocumentFavorite(Base):
    __tablename__ = "document_favorites"
    __table_args__ = (
        Index("ix_document_favorites_user_id", "user_id"),
        UniqueConstraint(
            "user_id", "document_id",
            name="uq_document_favorites_user_document",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user: Mapped["User"] = relationship("User")
    document: Mapped["Document"] = relationship(back_populates="favorites")
```

### `service/docs/models/document_permission.py`

```python
from datetime import datetime

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ...core.database import Base

PERMISSION_VIEWER = "viewer"
PERMISSION_EDITOR = "editor"


class DocumentPermission(Base):
    __tablename__ = "document_permissions"
    __table_args__ = (
        Index("ix_document_permissions_user_id", "user_id"),
        UniqueConstraint(
            "document_id", "user_id",
            name="uq_document_permissions_document_user",
        ),
        CheckConstraint(
            "permission_level IN ('viewer', 'editor')",
            name="ck_document_permissions_level",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    permission_level: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    document: Mapped["Document"] = relationship(back_populates="permissions")
    user: Mapped["User"] = relationship("User")
```

## 3. Cross-cutting decisions

### 3.1 Timezone-aware timestamps
Every `DateTime` is `DateTime(timezone=True)` with
`server_default=func.now()`; mutable rows add `onupdate=func.now()`. This
matches `events`, `reminders`, and the rest of the codebase.

### 3.2 Cascading behavior (summary)

| Child FK | ondelete | Rationale |
|---|---|---|
| `workspaces.owner_id → users.id` | CASCADE | Matches the existing pattern: a user's data dies with the user. |
| `folders.workspace_id → workspaces.id` | CASCADE | Folder tree cannot outlive its workspace. |
| `folders.parent_id → folders.id` | CASCADE | Deleting a folder removes its subtree (service layer will refuse if you want archive-first behavior). |
| `documents.workspace_id → workspaces.id` | CASCADE | Documents cannot outlive their workspace. |
| `documents.folder_id → folders.id` | **SET NULL** | Hard-deleting a folder must not hard-delete documents (they are soft-deleted instead); they fall back to the workspace root. |
| `documents.owner_id → users.id` | CASCADE | Owner's documents are theirs. |
| `document_versions.document_id → documents.id` | CASCADE | Version history is meaningless without the document. |
| `document_versions.created_by → users.id` | **SET NULL** | History outlives users; the editor id becomes NULL. |
| `document_links.{source,target}_document_id` | CASCADE | A link cannot reference a non-existent document. |
| `document_tags.{document_id, tag_id}` | CASCADE | Pure association; either side going away removes the pair. |
| `document_favorites.{user_id, document_id}` | CASCADE | Favorite is meaningless without either side. |
| `document_permissions.{document_id, user_id}` | CASCADE | Grant is meaningless without either side. |

All of these only fire on **hard** deletes. Normal UI flows use the soft
flags (`is_deleted`, `is_archived`) on `documents`, so versions, links, tags,
favorites, and permissions are preserved for trash/restore.

### 3.3 NULL-safe folder-name uniqueness (migration detail)
The plain unique index `(workspace_id, parent_id, name)` cannot reject two
root folders with the same name (`parent_id IS NULL` rows compare as distinct
in Postgres). Migration 009 will add two partial unique indexes instead of
relying on the constraint alone:

```python
op.create_index(
    "uq_folders_child_name", "folders",
    ["workspace_id", "parent_id", "name"], unique=True,
    postgresql_where=sa.text("parent_id IS NOT NULL"),
)
op.create_index(
    "uq_folders_root_name", "folders", ["workspace_id", "name"], unique=True,
    postgresql_where=sa.text("parent_id IS NULL"),
)
```

(The `Index(..., unique=True)` in the model stays so that `alembic check` and
non-Postgres environments still see the intent; the partial indexes are the
authoritative Postgres enforcement.)

### 3.4 Enum-like string columns
Follows the existing convention (`events.category`): plain `String` columns
with named `CheckConstraint`s listing allowed values. Python constants are
exported from the model modules. No Postgres `ENUM` type (avoids a
migration-heavy rename path later).

### 3.5 Slug semantics
`slug` is generated in the service layer from `title`
(slugify + `-2`/`-3`… disambiguation per workspace); the DB only enforces
`uq_documents_workspace_slug`. Slugs are not reused from soft-deleted
documents unless the service explicitly frees them — trash keeps its slug.

---

## 4. Design concerns — read before approving

**C1 — Generic table names.** `workspaces`, `folders`, `documents`, `tags`
are un-prefixed. Only this module uses them today, but if another module ever
needs its own "folders" (e.g., task folders) the names collide. The Document
Management "Workspace" is also unrelated to the existing frontend
`web/app/workspace/` shell (that is just the app layout — no backend entity
exists for it). Options: keep the names as specified (my default), or prefix
all nine tables with `doc_` (`doc_workspaces`, `doc_folders`, …) for
long-term namespace safety. The requested API paths (`/documents/v1/...`) are
unaffected either way.

**C2 — `documents.is_favorite` vs. `document_favorites`.** Both were
requested, but they express the same concept at different scopes:
`is_favorite` is a single per-document flag (global — who is it for?), while
`document_favorites` is per-user. Recommended semantics: `document_favorites`
is the source of truth for "user X favorited document Y"; `is_favorite` is
the **owner's** denormalized flag, kept in sync by the service layer (set
when the owner favorites, cleared when they unfavorite) purely to make
default queries cheap. If you'd rather drop `is_favorite` entirely, the
schema gets simpler and the extra index cost disappears.

**C3 — `owner_id` meaning + DB-level workspace/ownership consistency.**
Pure FKs guarantee structural integrity but can't assert "a document's owner
is consistent with its workspace." Two options:
- *Option A (recommended, matches codebase conventions):* `owner_id` = the
  user who created the document; ownership consistency is enforced in
  `service/docs/service.py` (like every existing module scopes by
  `current_user.id`). Simple; works naturally with sharing.
- *Option B (stronger, database-level):* `documents.owner_id` = the
  workspace owner, enforced by a composite foreign key
  `(workspace_id, owner_id) → workspaces(id, owner_id)` plus a unique index
  on `workspaces(id, owner_id)`. The DB then *guarantees* a document can only
  belong to a workspace owned by its owner. Cost: collaborators who create
  documents in someone else's shared workspace can't be recorded as the
  document owner (actual editors remain visible via
  `document_versions.created_by` and `document_permissions`).

**C4 — Deleting a folder.** `folder_id` is `SET NULL` (documents survive at
the workspace root), but `folders.parent_id` is `CASCADE` (subfolders are
hard-deleted with the parent). If you want "delete folder" to soft-delete
documents too, that is a service-layer rule, not a schema rule — say so and
it will be included in the service spec.

**C5 — `link_type` vocabulary.** Proposed: `related`, `reference`,
`depends_on`. Confirm or change; changing later means altering a check
constraint.

**C6 — `permission_level` vocabulary.** Proposed: `viewer`, `editor` only.
The owner needs no row (implicit full control via `documents.owner_id`).
Confirm, or add e.g. `commenter` / `admin` now (cheap) rather than later.

**C7 — Version snapshots are full copies.** Every version stores the full
Markdown content (`Text`). Postgres TOAST compresses large values, but a
heavily-edited document accumulates full-size snapshots. Options: keep it
simple now (recommended — N versions × few-hundred-KB max each is fine) and
add delta storage only if sizes become a problem. A retention policy ("keep
last N versions") would be service-layer, not schema.

**C8 — Hard deletes bypass soft delete.** Cascades fire only on real
`DELETE`s. Trash/restore flows never hard-delete, so this is only reachable
via workspace deletion (cascade) or explicit admin operations. Documented so
nobody is surprised.

**C9 — `DocumentTag` has no surrogate `id`.** The requirement lists only
`document_id` + `tag_id`, so it gets a composite primary key (which also
satisfies "prevent duplicate document tags"). If you want a surrogate id for
ORM symmetry with the other tables, it's a one-line change + a unique
constraint on the pair.

---

## 5. What stays untouched

- `service/auth/models.py` and all auth infrastructure — docs-side
  relationships are one-directional (`relationship("User")` with
  `TYPE_CHECKING` imports), exactly the pattern `auth/models.py` itself uses
  toward other modules. No `back_populates` is added on the `User` side.
- `service/core/database.py` — models inherit the existing `Base`.
- All other modules' models, routers, and the existing migrations —
  `009_document_management` (created only after approval) appends after head
  `008` and owns these nine tables exclusively.

## 6. Approval checklist

Please confirm or adjust: C1 table naming, C2 favorite semantics,
C3 owner semantics (A or B), C4 folder-delete behavior, C5 link types,
C6 permission levels, C7 full-content snapshots, C9 composite PK on
`document_tags`. On approval the next steps are: create the model files,
add `import service.docs.models` to `alembic/env.py`, generate migration
`009`, and verify with `alembic upgrade head` + `alembic check` against the
dev database.
