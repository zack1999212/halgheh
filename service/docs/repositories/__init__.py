"""Repositories: database operations only.

Every function receives the caller's SQLAlchemy Session and performs
queries or ORM changes. Repositories never commit or roll back — the
service layer owns transactions — and never contain HTTP or business
rules.
"""
