"""Isolated SQLite tests; no local .env or PostgreSQL server required."""
import os
os.environ.setdefault("DJANGO_SECRET_KEY", "local-tests-only-not-for-deployment")
os.environ["USE_SQLITE"] = "1"
from .settings import *  # noqa: F403
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
