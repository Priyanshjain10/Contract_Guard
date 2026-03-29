"""Meeting transcript to structured action items workflow agent."""

from __future__ import annotations

import json
import os
from typing import Any

try:
    from groq import Groq
except ImportError:  # pragma: no cover - optional in test/local environments
    Groq = None  # type: ignore[assignment]

_SYSTEM_PROMPT = """
You are an enterprise workflow agent. Given a meeting transcript,
extract all action items with these rules:
1. Each action item must have: task, owner, deadline (if mentioned),
   priority (high/medium/low)
2. If the owner is ambiguous (no clear person mentioned), set
   owner to "UNASSIGNED" and flagged=true
3. Respond ONLY in this JSON format, no other text:
{
  "action_items": [
    {
      "task": "...",
      "owner": "...",
      "deadline": "...",
      "priority": "high|medium|low",
      "flagged": false,
      "flag_reason": ""
    }
  ],
  "summary": "...",
  "participant_count": N,
  "ambiguous_count": N
}
""".strip()


def _normalize_output(payload: dict[str, Any]) -> dict[str, Any]:
    action_items = payload.get("action_items")
    if not isinstance(action_items, list):
        action_items = []

    normalized_items: list[dict[str, Any]] = []
    ambiguous_count = 0
    for item in action_items:
        if not isinstance(item, dict):
            continue
        owner = str(item.get("owner", "UNASSIGNED") or "UNASSIGNED")
        flagged = bool(item.get("flagged", owner == "UNASSIGNED"))
        if owner == "UNASSIGNED":
            flagged = True
        if flagged:
            ambiguous_count += 1
        normalized_items.append(
            {
                "task": str(item.get("task", "")).strip(),
                "owner": owner,
                "deadline": str(item.get("deadline", "")).strip(),
                "priority": str(item.get("priority", "medium")).lower(),
                "flagged": flagged,
                "flag_reason": str(item.get("flag_reason", "")).strip(),
            }
        )

    return {
        "action_items": normalized_items,
        "summary": str(payload.get("summary", "")).strip(),
        "participant_count": int(payload.get("participant_count", 0) or 0),
        "ambiguous_count": int(payload.get("ambiguous_count", ambiguous_count) or ambiguous_count),
    }


def _fallback(transcript: str) -> dict[str, Any]:
    return {
        "action_items": [
            {
                "task": "Review transcript manually and assign action items",
                "owner": "UNASSIGNED",
                "deadline": "",
                "priority": "medium",
                "flagged": True,
                "flag_reason": "LLM unavailable: GROQ_API_KEY not set or Groq client missing",
            }
        ],
        "summary": transcript[:200].strip(),
        "participant_count": 0,
        "ambiguous_count": 1,
    }


async def extract_meeting_actions(transcript: str) -> dict[str, Any]:
    """Extract action items from meeting transcript via Qwen3-32B."""
    groq_key = os.getenv("GROQ_API_KEY", "")
    if not groq_key or Groq is None:
        return _fallback(transcript)

    client = Groq(api_key=groq_key)
    response = client.chat.completions.create(
        model="qwen/qwen3-32b",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": transcript},
        ],
        temperature=0.1,
        max_tokens=1024,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return _fallback(transcript)
    return _normalize_output(parsed)
