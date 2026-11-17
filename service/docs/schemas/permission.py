from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

# Kept in sync with the ck_document_permissions_level database constraint.
PermissionLevel = Literal["viewer", "editor"]


class DocumentPermissionCreate(BaseModel):
    user_id: int
    permission_level: PermissionLevel


class DocumentPermissionUpdate(BaseModel):
    permission_level: PermissionLevel


class DocumentPermissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    user_id: int
    permission_level: str
    created_at: datetime
