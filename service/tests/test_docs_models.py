"""Model-level tests for the Document Management module.

These tests validate SQLAlchemy metadata only: table registration, keys,
constraints, foreign keys, timezone-aware timestamps, and relationship
configuration. They never touch a database, so they are safe to run
anywhere (see service/README.md for the database-backed test setup).
"""

from sqlalchemy import PrimaryKeyConstraint, UniqueConstraint
from sqlalchemy.orm import configure_mappers

import service.auth.models  # noqa: F401  (must stay importable/unchanged)
import service.docs.models  # noqa: F401
# User relationships added by origin/dev (ai, agent, calendar, notifications)
# require these models to be registered for configure_mappers().
import service.agent.models  # noqa: F401
import service.ai.models  # noqa: F401
import service.calendar.models  # noqa: F401
import service.notifications.models  # noqa: F401
from service.core.database import Base
from service.docs.models import (
    Document,
    DocumentFavorite,
    DocumentPermission,
    DocumentTag,
    DocumentVersion,
    Folder,
    Tag,
    Workspace,
)

DOC_TABLES = {
    "workspaces",
    "folders",
    "documents",
    "document_links",
    "tags",
    "document_tags",
    "document_versions",
    "document_favorites",
    "document_permissions",
}


def test_all_document_tables_registered_on_shared_base():
    """All nine tables land in the one shared Base.metadata; no second Base."""
    assert DOC_TABLES <= set(Base.metadata.tables)
    for name in DOC_TABLES:
        assert Base.metadata.tables[name].metadata is Base.metadata


def test_no_table_name_collisions_with_other_modules():
    """Docs table names must not collide with auth/calendar/notifications."""
    import service.calendar.models  # noqa: F401
    import service.notifications.models  # noqa: F401

    configured = set(Base.metadata.tables)
    assert len(configured) == len(set(configured))
    assert not (DOC_TABLES & {"users", "calendars", "events", "notifications"})


def test_relationships_configure_cleanly():
    """configure_mappers raises on any misconfigured relationship."""
    configure_mappers()


def test_auth_users_table_untouched():
    """Docs models must not alter the existing auth users table."""
    users = Base.metadata.tables["users"]
    assert set(users.columns.keys()) == {
        "id",
        "username",
        "name",
        "hashed_password",
        "avatar_url",
        "created_at",
    }
    # No user-side foreign keys into document tables were added.
    assert users.foreign_keys == set()


def _unique_constraint_names(table):
    return {c.name for c in table.constraints if isinstance(c, UniqueConstraint)}


def _check_constraint_names(table):
    return {c.name for c in table.constraints if c.name and c.name.startswith("ck_")}


def _fk_ondelete(table, column_name):
    fks = table.columns[column_name].foreign_keys
    assert len(fks) == 1, f"expected one FK on {table.name}.{column_name}"
    return next(iter(fks)).ondelete


def test_documents_unique_and_check_constraints():
    documents = Base.metadata.tables["documents"]
    assert "uq_documents_workspace_slug" in _unique_constraint_names(documents)
    checks = _check_constraint_names(documents)
    assert {
        "ck_documents_title_not_empty",
        "ck_documents_slug_not_empty",
    } <= checks
    # Soft-state booleans default to false server-side.
    for flag in ("is_favorite", "is_archived", "is_deleted"):
        assert documents.columns[flag].server_default is not None


def test_documents_foreign_key_delete_actions():
    documents = Base.metadata.tables["documents"]
    assert _fk_ondelete(documents, "workspace_id") == "CASCADE"
    assert _fk_ondelete(documents, "folder_id") == "SET NULL"
    assert _fk_ondelete(documents, "owner_id") == "CASCADE"


def test_folder_self_referential_and_unique_indexes():
    folders = Base.metadata.tables["folders"]
    assert _fk_ondelete(folders, "parent_id") == "CASCADE"
    assert _fk_ondelete(folders, "workspace_id") == "CASCADE"
    index_names = {i.name for i in folders.indexes}
    assert "uq_folders_workspace_parent_name" in index_names


def test_document_links_uniqueness_and_self_link_guard():
    links = Base.metadata.tables["document_links"]
    assert (
        "uq_document_links_source_target_type" in _unique_constraint_names(links)
    )
    assert "ck_document_links_not_self" in _check_constraint_names(links)
    assert "ck_document_links_link_type" in _check_constraint_names(links)
    assert _fk_ondelete(links, "source_document_id") == "CASCADE"
    assert _fk_ondelete(links, "target_document_id") == "CASCADE"


def test_document_tags_composite_primary_key_prevents_duplicates():
    document_tags = Base.metadata.tables["document_tags"]
    pks = [
        c for c in document_tags.constraints
        if isinstance(c, PrimaryKeyConstraint)
    ]
    assert len(pks) == 1
    assert set(pks[0].columns.keys()) == {"document_id", "tag_id"}
    assert _fk_ondelete(document_tags, "document_id") == "CASCADE"
    assert _fk_ondelete(document_tags, "tag_id") == "CASCADE"


def test_document_versions_unique_version_number():
    versions = Base.metadata.tables["document_versions"]
    assert (
        "uq_document_versions_document_version"
        in _unique_constraint_names(versions)
    )
    assert _fk_ondelete(versions, "document_id") == "CASCADE"
    # History must survive user deletion, so created_by is SET NULL.
    assert _fk_ondelete(versions, "created_by") == "SET NULL"
    assert versions.columns["created_by"].nullable is True


def test_favorites_and_permissions_unique_pairs():
    favorites = Base.metadata.tables["document_favorites"]
    assert "uq_document_favorites_user_document" in _unique_constraint_names(favorites)
    permissions = Base.metadata.tables["document_permissions"]
    assert (
        "uq_document_permissions_document_user"
        in _unique_constraint_names(permissions)
    )
    assert "ck_document_permissions_level" in _check_constraint_names(permissions)
    assert _fk_ondelete(permissions, "document_id") == "CASCADE"
    assert _fk_ondelete(permissions, "user_id") == "CASCADE"


def test_tags_scoped_to_workspace_with_hex_color():
    tags = Base.metadata.tables["tags"]
    assert "uq_tags_workspace_name" in _unique_constraint_names(tags)
    assert "ck_tags_color_hex" in _check_constraint_names(tags)
    assert tags.columns["color"].type.length == 7


def test_timestamps_are_timezone_aware_with_server_defaults():
    # tags and document_tags carry no timestamp columns.
    tables_with_timestamps = DOC_TABLES - {"tags", "document_tags"}
    for table_name in tables_with_timestamps:
        table = Base.metadata.tables[table_name]
        created_at = table.columns["created_at"]
        assert created_at.type.timezone is True, table_name
        assert created_at.server_default is not None, table_name
        assert created_at.nullable is False, table_name
        if "updated_at" in table.columns:
            assert table.columns["updated_at"].type.timezone is True, table_name
            assert table.columns["updated_at"].server_default is not None, table_name


def test_relationship_sides_pair_up():
    """Every back_populates pair resolves to the same mapper relationship."""
    assert Document.workspace.property.back_populates == "documents"
    assert Workspace.documents.property.back_populates == "workspace"
    assert Document.folder.property.back_populates == "documents"
    assert Folder.documents.property.back_populates == "folder"
    assert Folder.parent.property.back_populates == "children"
    assert Folder.children.property.back_populates == "parent"
    assert Document.versions.property.back_populates == "document"
    assert DocumentVersion.document.property.back_populates == "versions"
    assert Document.document_tags.property.back_populates == "document"
    assert DocumentTag.document.property.back_populates == "document_tags"
    assert Tag.document_tags.property.back_populates == "tag"
    assert DocumentTag.tag.property.back_populates == "document_tags"
    assert Document.favorites.property.back_populates == "document"
    assert DocumentFavorite.document.property.back_populates == "favorites"
    assert Document.permissions.property.back_populates == "document"
    assert DocumentPermission.document.property.back_populates == "permissions"


def test_document_links_out_and_in_foreign_keys_are_distinct():
    out_fk = {child.name for _, child in Document.links_out.property.synchronize_pairs}
    in_fk = {child.name for _, child in Document.links_in.property.synchronize_pairs}
    assert out_fk == {"source_document_id"}
    assert in_fk == {"target_document_id"}
