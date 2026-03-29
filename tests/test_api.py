"""Tests for the FastAPI endpoints."""

from pathlib import Path
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

import contractguard.api as api_module
from contractguard.api import app


@pytest.mark.asyncio
async def test_health_check():
    """GET /health returns ok."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_health_detailed_endpoint_shape(monkeypatch):
    """GET /health/detailed returns expected observability fields."""
    async def _groq_false():
        return False

    monkeypatch.setattr(api_module, "_check_groq", _groq_false)
    monkeypatch.setattr(api_module, "_check_chroma", lambda: False)

    async def _db_false():
        return False

    monkeypatch.setattr(api_module, "_check_db", _db_false)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health/detailed")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["agents"] == 8
    assert set(data["model_routing"]["llm_agents"]) == {"A3", "A5", "autonomy_loop"}


@pytest.mark.asyncio
async def test_analyze_endpoint():
    """POST /analyze with textile profile returns analysis."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/analyze",
            json={
                "business_profile": {
                    "sector": "textiles",
                    "gross_margin_pct": 8.0,
                    "payment_cycle_days": 15,
                    "monthly_revenue": 500000.0,
                    "contract_value": 2000000.0,
                },
                "contract_text": "",
            },
        )
    assert response.status_code == 200
    data = response.json()
    assert data["analysis_id"].startswith("CG-")
    assert len(data["risk_scores"]) > 0
    assert len(data["compliance_results"]) > 0
    assert isinstance(data["handoff_log"], list)
    assert data["audit_event_count"] > 0


@pytest.mark.asyncio
async def test_analyze_file_passes_document_path_and_cleans_tmp(monkeypatch):
    """POST /analyze-file should pass document_path and delete temp file after run."""
    captured: dict = {}

    async def _fake_ainvoke(state):
        captured["state"] = state
        tmp_path = state["document_path"]
        assert Path(tmp_path).exists()
        assert Path(tmp_path).read_bytes() == b"%PDF-1.4 fake content"
        return {
            "risk_scores": [],
            "compliance_results": [],
            "negotiation_rewrites": [],
            "alerts": [],
            "gate_flags": {},
            "audit_events": [],
            "handoff_log": [],
        }

    monkeypatch.setattr(api_module, "pipeline", SimpleNamespace(ainvoke=_fake_ainvoke))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/analyze-file",
            data={
                "sector": "textiles",
                "gross_margin_pct": "8",
                "payment_cycle_days": "15",
                "monthly_revenue": "500000",
                "contract_value": "2000000",
            },
            files={
                "file": ("contract.pdf", b"%PDF-1.4 fake content", "application/pdf"),
            },
        )

    assert response.status_code == 200
    state = captured["state"]
    assert state["ocr_text"] == ""
    assert "document_path" in state
    assert not Path(state["document_path"]).exists()


@pytest.mark.asyncio
async def test_analyze_file_cleans_tmp_when_pipeline_fails(monkeypatch):
    """Temporary upload file should be cleaned even if pipeline invocation fails."""
    captured: dict = {}

    async def _failing_ainvoke(state):
        captured["document_path"] = state["document_path"]
        assert Path(state["document_path"]).exists()
        raise RuntimeError("forced pipeline failure")

    monkeypatch.setattr(api_module, "pipeline", SimpleNamespace(ainvoke=_failing_ainvoke))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/analyze-file",
            data={
                "sector": "textiles",
                "gross_margin_pct": "8",
                "payment_cycle_days": "15",
                "monthly_revenue": "500000",
                "contract_value": "2000000",
            },
            files={
                "file": ("contract.pdf", b"%PDF-1.4 fake content", "application/pdf"),
            },
        )

    assert response.status_code == 500
    assert "Pipeline execution failed. Error ID:" in response.json()["detail"]
    assert not Path(captured["document_path"]).exists()


@pytest.mark.asyncio
async def test_analyze_file_rejects_unsupported_mime_type():
    """Upload should reject unsupported MIME types with clear 400 message."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/analyze-file",
            data={
                "sector": "textiles",
                "gross_margin_pct": "8",
                "payment_cycle_days": "15",
                "monthly_revenue": "500000",
                "contract_value": "2000000",
            },
            files={
                "file": ("contract.exe", b"MZ", "application/octet-stream"),
            },
        )
    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported file type. Upload PDF, DOCX, or TXT only."


@pytest.mark.asyncio
async def test_analyze_file_enforces_streaming_size_limit():
    """Upload >10MB should return 413 from streaming chunk-size guard."""
    payload = b"a" * (10 * 1024 * 1024 + 1)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/analyze-file",
            data={
                "sector": "textiles",
                "gross_margin_pct": "8",
                "payment_cycle_days": "15",
                "monthly_revenue": "500000",
                "contract_value": "2000000",
            },
            files={
                "file": ("contract.txt", payload, "text/plain"),
            },
        )
    assert response.status_code == 413
    assert response.json()["detail"] == "File too large. Maximum 10MB."


@pytest.mark.asyncio
async def test_analyze_returns_sanitized_error_id(monkeypatch):
    """POST /analyze should not leak raw exception detail."""
    async def _failing_ainvoke(_state):
        raise RuntimeError("secret internals")

    monkeypatch.setattr(api_module, "pipeline", SimpleNamespace(ainvoke=_failing_ainvoke))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/analyze",
            json={
                "business_profile": {
                    "sector": "textiles",
                    "gross_margin_pct": 8.0,
                    "payment_cycle_days": 15,
                    "monthly_revenue": 500000.0,
                    "contract_value": 2000000.0,
                },
                "contract_text": "",
            },
        )
    assert response.status_code == 500
    assert "Pipeline execution failed. Error ID:" in response.json()["detail"]
    assert "secret internals" not in response.json()["detail"]


@pytest.mark.asyncio
async def test_workflow_meeting_to_action_endpoint(monkeypatch):
    """Meeting workflow endpoint should return extracted output and audit event."""
    async def _fake_extract(_transcript: str):
        return {
            "action_items": [
                {
                    "task": "Share revised draft",
                    "owner": "Riya",
                    "deadline": "Friday",
                    "priority": "high",
                    "flagged": False,
                    "flag_reason": "",
                }
            ],
            "summary": "One action item agreed",
            "participant_count": 3,
            "ambiguous_count": 0,
        }

    monkeypatch.setattr(api_module, "extract_meeting_actions", _fake_extract)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/workflow/meeting-to-action",
            json={
                "transcript": "Riya will share revised draft by Friday.",
                "project_tracker": "contractguard",
            },
        )
    assert response.status_code == 200
    data = response.json()
    assert data["action_items"][0]["owner"] == "Riya"
    assert data["audit_event"]["agent_name"] == "workflow_meeting_agent"
