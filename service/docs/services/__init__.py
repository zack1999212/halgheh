"""Services: business logic.

Services receive a SQLAlchemy Session plus already-authenticated domain
objects, enforce the module's rules (ownership, access, versioning, slug
uniqueness), and own transactions: they commit on success and roll back on
failure, following the same pattern as service/notifications/service.py.

services/access.py is the single source of truth for "who may touch what":
- workspaces/folders/tags are structural → workspace owner only
- documents are readable by the owner or granted users, writable by the
  owner or granted editors, and manageable (permissions) by the owner only
- 404 is returned for objects the user cannot see, so private documents
  never leak their existence
"""
