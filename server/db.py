"""Thin, dialect-aware database adapter.

Defaults to a local SQLite file so the admin tool runs with zero setup and no
account. Set DATABASE_URL to a Postgres connection string (a Tiger Data /
Timescale instance is just managed Postgres) to point the same code at a real
cloud database instead - nothing else changes.

This is intentionally not an ORM. It is a ~60-line adapter because the app
only ever does a handful of statements against one table.
"""
from __future__ import annotations
import os
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATABASE_URL = os.environ.get("DATABASE_URL", "")
IS_POSTGRES = DATABASE_URL.startswith("postgres://") or DATABASE_URL.startswith("postgresql://")

SCHEMA_SQLITE = """
CREATE TABLE IF NOT EXISTS status_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL,
  status_field TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  reported_at TEXT NOT NULL,
  expected_end TEXT,
  source TEXT,
  confidence TEXT NOT NULL,
  known_asset INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
"""
SCHEMA_POSTGRES = """
CREATE TABLE IF NOT EXISTS status_reports (
  id SERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL,
  status_field TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  reported_at TEXT NOT NULL,
  expected_end TEXT,
  source TEXT,
  confidence TEXT NOT NULL,
  known_asset BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


class Database:
    """Runs `?`-style SQL against either backend. Postgres gets `?` -> `%s`
    rewritten at the call site, which is safe here because no query in this
    app ever needs a literal `?` character."""

    def __init__(self):
        self.is_postgres = IS_POSTGRES
        if self.is_postgres:
            import psycopg2  # imported lazily: only required when DATABASE_URL is set
            import psycopg2.extras
            self._psycopg2 = psycopg2
            self._extras = psycopg2.extras
            self.conn = psycopg2.connect(DATABASE_URL)
            self.conn.autocommit = True
            with self.conn.cursor() as cur:
                cur.execute(SCHEMA_POSTGRES)
        else:
            path = ROOT / "accesspath.db"
            self.conn = sqlite3.connect(str(path), check_same_thread=False)
            self.conn.row_factory = sqlite3.Row
            self.conn.execute(SCHEMA_SQLITE)
            self.conn.commit()

    def execute(self, sql, params=()):
        if self.is_postgres:
            # Not closed via `with`: query() below still needs to fetch from
            # this cursor after execute() returns.
            cur = self.conn.cursor(cursor_factory=self._extras.RealDictCursor)
            cur.execute(sql.replace("?", "%s"), params)
        else:
            cur = self.conn.execute(sql, params)
            self.conn.commit()
        return cur

    def query(self, sql, params=()):
        cur = self.execute(sql, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]

    def insert(self, table, row: dict):
        cols = list(row.keys())
        placeholders = ",".join("?" for _ in cols)
        sql = f"INSERT INTO {table} ({','.join(cols)}) VALUES ({placeholders})"
        self.execute(sql, [row[c] for c in cols])
