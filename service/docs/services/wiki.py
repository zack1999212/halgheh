"""Wiki link parsing and synchronization for document content.

Wiki syntax supported: ``[[Target Title]]`` and ``[[Target Title|Display]]``.
Only the target title (before ``|``) is used for resolution.

Resolution rules (same workspace, accessible to the acting user, not deleted):
- Exactly one matching non-deleted document with the same title => resolved.
- Zero matches => unresolved.
- More than one match => ambiguous (never linked to an arbitrary document).

Synchronization rules:
- Only outgoing ``reference`` links are synchronized from wiki content.
- ``related`` and ``depends_on`` links are never modified by sync.
- The synchronization is **add-only**: it only inserts missing references for
  targets that currently resolve and are writable. It never deletes an
  existing ``reference`` row, because without a schema marker (e.g. an
  origin column) there is no safe way to tell a wiki-generated reference
  from a manually created one, and a wrong guess would silently destroy a
  manual relationship (audit finding M1). Consequence (documented
  limitation): stale wiki references accumulate when a target is renamed,
  when the token is removed from the content, or when the target is later
  trashed/becomes inaccessible; users remove them by hand via the links UI.
  Note the soft-delete/restore asymmetry: a reference to a trashed target
  stays in the table while hidden (like a manual link) and reappears when
  the target is restored (audit finding M2).
- Targets must be writable by the acting user to create a stored reference
  edge (consistent with existing link creation permissions). Unwritable or
  inaccessible targets are treated as unresolved for sync.

Unicode matching: resolution compares ``str.casefold()`` in Python against
candidates fetched with SQL ``lower()``. Rare Unicode edge cases (e.g.
``ß`` vs ``ss``) can therefore differ between the candidate query and the
final comparison, and the frontend mirrors casefold with
``String.prototype.toLowerCase``. This is a known, accepted limitation.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from sqlalchemy import exists

from ...auth.models import User
from ..models import (
    Document,
    DocumentLink,
    DocumentPermission,
    Folder,
    LINK_TYPE_REFERENCE,
    PERMISSION_EDITOR,
    PERMISSION_VIEWER,
)
from ..schemas import WikiResolutionInfo
from ..repositories import documents as document_repository
from ..repositories import permissions as permission_repository

# [[target]] or [[target|display]]; target may contain spaces/punctuation
# except closing brackets and pipe delimiter.
_WIKI_LINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]")

# Fenced (```/~~~) and inline (`) code blocks/spans are masked before token
# extraction so wiki syntax inside code is ignored. The frontend Markdown
# renderer never links code spans, so backend parsing must match it (L7).
_FENCE_RE = re.compile(r"(```.*?```|~~~.*?~~~)", re.S)
_INLINE_CODE_RE = re.compile(r"`[^`\n]*`")


def _mask_code(content: str) -> str:
    """Blank out fenced/inline code, preserving every character offset.

    Masking with same-length spaces (instead of removing text) keeps token
    positions computed on the masked string identical to the original, so
    ``WikiToken.start``/``end`` stay valid for callers that slice content.
    """

    def _blank(match: re.Match) -> str:
        return " " * len(match.group(0))

    return _INLINE_CODE_RE.sub(_blank, _FENCE_RE.sub(_blank, content))


@dataclass(frozen=True)
class WikiToken:
    title: str
    start: int
    end: int


def extract_wiki_titles(content: str) -> list[str]:
    """Unique wiki target titles in order of first appearance.

    Wiki syntax inside fenced or inline code is ignored (see ``_mask_code``).
    """
    seen: set[str] = set()
    titles: list[str] = []
    for raw in _WIKI_LINK_RE.findall(_mask_code(content or "")):
        title = raw.strip()
        if not title:
            continue
        key = title.casefold()
        if key in seen:
            continue
        seen.add(key)
        titles.append(title)
    return titles


def parse_wiki_tokens(content: str) -> list[WikiToken]:
    """Wiki tokens with their offsets in the original ``content``.

    Offsets remain valid because ``_mask_code`` preserves positions; tokens
    inside fenced/inline code are not returned.
    """
    masked = _mask_code(content or "")
    tokens: list[WikiToken] = []
    for match in _WIKI_LINK_RE.finditer(masked):
        title = match.group(1).strip()
        if not title:
            continue
        tokens.append(WikiToken(title=title, start=match.start(), end=match.end()))
    return tokens


def _readable_permission_exists(user_id: int):
    return exists().where(
        DocumentPermission.document_id == Document.id,
        DocumentPermission.user_id == user_id,
        DocumentPermission.permission_level.in_(
            [PERMISSION_VIEWER, PERMISSION_EDITOR]
        ),
    )


def _accessible_condition(user_id: int):
    return (Document.owner_id == user_id) | _readable_permission_exists(user_id)


def resolve_titles(
    db: Session,
    user: User,
    workspace_id: int,
    titles: list[str],
    *,
    source_document_id: int | None = None,
) -> tuple[dict[str, Document], set[str], set[str]]:
    """Resolve wiki titles within a workspace.

    Returns (resolved, ambiguous, unresolved) where resolved maps the input
    title string to the matched accessible, non-deleted Document.
    """
    resolved: dict[str, Document] = {}
    ambiguous: set[str] = set()
    unresolved: set[str] = set()
    if not titles:
        return resolved, ambiguous, unresolved

    # Case-insensitive matching against titles in the same workspace.
    # Unicode note (L8): candidates are fetched with SQL ``lower()`` but
    # compared here with Python ``str.casefold()``. For rare code points
    # (e.g. ``ß`` vs ``ss``) the two normalizations can disagree, so a
    # candidate could be missed by the query or dropped by the comparison.
    # Accepted limitation; documented in the module docstring.
    lowered = [t.casefold() for t in titles]
    condition = (
        Document.workspace_id == workspace_id,
        Document.is_deleted.is_(False),
        func.lower(Document.title).in_(lowered),
        _accessible_condition(user.id),
    )
    stmt = select(Document).where(*condition)
    candidates = list(db.scalars(stmt).all())
    by_lower: dict[str, list[Document]] = {}
    for doc in candidates:
        by_lower.setdefault(doc.title.casefold(), []).append(doc)

    for title in titles:
        matches = by_lower.get(title.casefold(), [])
        if source_document_id is not None:
            matches = [d for d in matches if d.id != source_document_id]
        if len(matches) == 1:
            resolved[title] = matches[0]
        elif len(matches) > 1:
            ambiguous.add(title)
        else:
            unresolved.add(title)
    return resolved, ambiguous, unresolved


def content_resolutions(
    db: Session, user: User, source: Document
) -> dict[str, "WikiResolutionInfo"]:
    """Backend-authoritative resolution status for every wiki token in
    ``source.content``, keyed by the exact token title as written.

    Uses the very same rules as synchronization (``resolve_titles``): same
    workspace, acting user's access, non-deleted, self excluded, duplicates
    ambiguous. The frontend preview reads only this map, so preview state can
    never diverge from what sync would store (audit finding M3).

    Only minimal metadata of *resolved* targets is exposed (id, title,
    folder) — documents the acting user can already read in this workspace.
    Ambiguous/unresolved entries carry no document metadata at all.
    """
    resolutions: dict[str, WikiResolutionInfo] = {}
    titles = extract_wiki_titles(source.content or "")
    if not titles:
        return resolutions

    resolved, ambiguous, unresolved = resolve_titles(
        db, user, source.workspace_id, titles, source_document_id=source.id
    )

    folder_ids = {d.folder_id for d in resolved.values() if d.folder_id is not None}
    folder_names: dict[int, str] = {}
    if folder_ids:
        folder_names = {
            f.id: f.name
            for f in db.scalars(select(Folder).where(Folder.id.in_(folder_ids))).all()
        }

    for title in titles:
        if title in resolved:
            doc = resolved[title]
            resolutions[title] = WikiResolutionInfo(
                status="resolved",
                document_id=doc.id,
                title=doc.title,
                folder_id=doc.folder_id,
                folder_name=folder_names.get(doc.folder_id)
                if doc.folder_id is not None
                else None,
            )
        elif title in ambiguous:
            resolutions[title] = WikiResolutionInfo(status="ambiguous")
        else:
            resolutions[title] = WikiResolutionInfo(status="unresolved")
    return resolutions


def sync_wiki_reference_links(
    db: Session, user: User, source: Document
) -> None:
    """Synchronize wiki-generated outgoing ``reference`` links for ``source``.

    Must be called within an active transaction (caller commits). Does not
    touch ``related`` or ``depends_on`` links.

    Add-only by design (audit finding M1/M2): missing references for
    currently-resolved, writable targets are inserted, but no existing
    ``reference`` row is ever deleted, because without a schema marker the
    origin (wiki vs manual) of a row cannot be known. Stale wiki references
    therefore persist and must be removed manually; see the module
    docstring for the full limitation list.
    """
    content = source.content or ""
    titles = extract_wiki_titles(content)

    resolved, _ambiguous, _unresolved = resolve_titles(
        db, user, source.workspace_id, titles, source_document_id=source.id
    )
    desired_target_ids: set[int] = set()
    for doc in resolved.values():
        # Enforce existing permission semantics: only create a stored edge if
        # the acting user can write the target (same as manual link creation).
        level = None
        if doc.owner_id == user.id:
            level = "owner"
        else:
            level = permission_repository.readable_level(db, doc.id, user.id)
        if level == "editor" or doc.owner_id == user.id:
            desired_target_ids.add(doc.id)

    # Current outgoing reference links (targets only).
    current_target_ids = set(
        db.scalars(
            select(DocumentLink.target_document_id).where(
                DocumentLink.source_document_id == source.id,
                DocumentLink.link_type == LINK_TYPE_REFERENCE,
            )
        ).all()
    )

    # Add missing desired links (add-only: existing rows are never removed).
    for target_id in desired_target_ids - current_target_ids:
        # Re-check target is valid/writable in this workspace context.
        target = document_repository.get(db, target_id)
        if target is None or target.is_deleted or target.workspace_id != source.workspace_id:
            continue
        db.add(
            DocumentLink(
                source_document_id=source.id,
                target_document_id=target_id,
                link_type=LINK_TYPE_REFERENCE,
            )
        )
