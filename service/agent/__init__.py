"""Reusable, page-specific agent backend.

Importing this package performs the explicit Calendar tool registration. Tools
are never discovered dynamically.
"""

from . import calendar_tools as _calendar_tools  # noqa: F401
