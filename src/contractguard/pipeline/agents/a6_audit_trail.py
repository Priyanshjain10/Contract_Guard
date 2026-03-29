"""A6 — Audit Trail Agent.

Persists every AuditEvent to PostgreSQL via asyncpg.
Append-only table — no UPDATE or DELETE ever.

Tables created on first run (idempotent CREATE IF NOT EXISTS).
Gracefully skips persistence if DATABASE_URL is not set.
"""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime

import asyncpg

from contractguard.models.audit import AuditEvent
from contractguard.models.state import ContractState

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS audit_events (
    id          BIGSERIAL PRIMARY KEY,
    agent_name  TEXT        NOT NULL,
    action      TEXT        NOT NULL,
    input_snap  JSONB       NOT NULL DEFAULT '{}',
    output_snap JSONB       NOT NULL DEFAULT '{}',
    reasoning   TEXT        NOT NULL DEFAULT '',
    error       TEXT,
    ts          TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

_INSERT_SQL = """
INSERT INTO audit_events
    (agent_name, action, input_snap, output_snap, reasoning, error, ts)
VALUES
    ($1, $2, $3, $4, $5, $6, $7)
"""


def _db_url() -> str:
    """Return asyncpg-compatible URL (strip +asyncpg if SQLAlchemy-style)."""
    raw = os.getenv("DATABASE_URL", "")
    return raw.replace("+asyncpg", "").replace("postgresql+psycopg2", "postgresql")


async def _persist_events(events: list[AuditEvent], url: str) -> tuple[int, str | None]:
    """Open a single asyncpg connection, ensure schema, bulk-insert events.

    Returns (rows_inserted, error_message_or_None).
    """
    try:
        conn = await asyncpg.connect(url, timeout=10)
    except Exception as exc:  # noqa: BLE001
        return 0, f"asyncpg connect failed: {exc}"

    try:
        await conn.execute(_CREATE_TABLE_SQL)
        rows = 0
        for ev in events:
            await conn.execute(
                _INSERT_SQL,
                ev.agent_name,
                ev.action,
                json.dumps(ev.input_snapshot),   # JSONB param as string
                json.dumps(ev.output_snapshot),
                ev.reasoning_trace,
                ev.error,
                ev.timestamp,
            )
            rows += 1
        return rows, None
    except Exception as exc:  # noqa: BLE001
        return 0, f"asyncpg insert failed: {exc}"
    finally:
        await conn.close()


async def audit_trail(state: ContractState) -> dict:
    """Persist all accumulated AuditEvents to PostgreSQL.

    If DATABASE_URL is not configured, logs a warning in the AuditEvent and
    continues — the pipeline never fails due to missing DB.
    """
    existing_events: list[AuditEvent] = state.get("audit_events", [])
    url = _db_url()
    rows_inserted = 0
    db_error: str | None = None

    if url:
        rows_inserted, db_error = await _persist_events(existing_events, url)
    else:
        db_error = "DATABASE_URL not set — persistence skipped."

    self_audit = AuditEvent(
        agent_name="A6_audit_trail",
        action="persist_audit_log",
        input_snapshot={
            "events_to_persist": len(existing_events),
            "db_configured": bool(url),
        },
        output_snapshot={
            "rows_inserted": rows_inserted,
            "success": db_error is None,
        },
        reasoning_trace=(
            f"Persisted {rows_inserted}/{len(existing_events)} audit events to PostgreSQL. "
            f"{'OK' if db_error is None else ('WARN: ' + db_error)}"
        ),
        error=db_error,
        timestamp=datetime.now(UTC),
    )

    return {
        "audit_events": [self_audit],
        "execution_logs": [
            {
                "agent": "A6_audit_trail",
                "action": "audit_trail_recorded",
                "events_recorded": len(existing_events),
                "storage": "postgresql" if (db_error is None and url) else "in_memory",
            }
        ],
        "handoff_log": [
            f"A6 → A7/user: audit trail recorded ({len(existing_events)} events)"
        ],
    }
