"""Application configuration loaded from environment variables."""

from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


def _get(key: str, default: str | None = None) -> str:
    """Return env var or raise if missing and no default."""
    val = os.getenv(key, default)
    if val is None:
        msg = f"Missing required environment variable: {key}"
        raise RuntimeError(msg)
    return val


# -- Groq (primary LLM provider) --
GROQ_API_KEY: str = _get("GROQ_API_KEY")

# -- Anthropic (installed but not actively called; any non-empty string works) --
ANTHROPIC_API_KEY: str = _get("ANTHROPIC_API_KEY")

# -- Database --
DATABASE_URL: str = _get("DATABASE_URL", "sqlite+aiosqlite:///contractguard.db")

# -- ChromaDB (local persistent store; CHROMA_URL should be a local path) --
CHROMA_URL: str = _get("CHROMA_URL", "./chroma_db")

# -- Twilio (WhatsApp alerts; all three are optional — silent fallback when absent) --
TWILIO_ACCOUNT_SID: str = _get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN: str = _get("TWILIO_AUTH_TOKEN", "")
# TWILIO_WHATSAPP_FROM is what a7_lifecycle_monitor.py reads.
# TWILIO_FROM_NUMBER kept as alias for backwards compatibility.
TWILIO_WHATSAPP_FROM: str = _get(
    "TWILIO_WHATSAPP_FROM",
    _get("TWILIO_FROM_NUMBER", "whatsapp:+14155238886"),
)
TWILIO_FROM_NUMBER: str = TWILIO_WHATSAPP_FROM

# -- RBI rate for MSME Act interest calculation (MSME_LIMIT_DAYS = 45 is law, not config) --
RBI_RATE: float = float(_get("RBI_RATE", "6.5"))
