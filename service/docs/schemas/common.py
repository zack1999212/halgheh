from pydantic import BaseModel


class Page(BaseModel):
    """Shared pagination envelope fields for list responses."""

    limit: int
    offset: int
    total: int
