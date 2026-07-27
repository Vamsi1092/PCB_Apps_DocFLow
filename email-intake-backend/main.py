"""Backward-compatible ASGI entrypoint.

The implementation lives in :mod:`app.main`. Existing commands such as
``uvicorn main:app`` continue to work after the repository restructure.
"""

from app.main import *  # noqa: F401,F403
