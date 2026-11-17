from pydantic import BaseModel, ConfigDict, Field, model_validator

from .common import Page

# Kept in sync with the ck_tags_color_hex database constraint.
HEX_COLOR_PATTERN = r"^#[0-9a-fA-F]{6}$"


class TagCreate(BaseModel):
    workspace_id: int
    name: str = Field(min_length=1, max_length=64)
    color: str = Field(pattern=HEX_COLOR_PATTERN)


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    color: str | None = Field(default=None, pattern=HEX_COLOR_PATTERN)

    @model_validator(mode="after")
    def validate_not_empty(self):
        if not self.model_fields_set:
            raise ValueError("Update body must not be empty")
        return self


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    name: str
    color: str


class TagListResponse(Page):
    items: list[TagResponse]
