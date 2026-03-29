"""Central constants for ContractGuard — single source of truth."""

# Full agent names used for logging, audit trails, and pipeline stages.
AGENTS: list[str] = [
    "A1_doc_intelligence",
    "A2_business_profiler",
    "A3_risk_scorer",
    "A4_compliance_guard",
    "A5_negotiation_agent",
    "A6_audit_trail",
    "A7_lifecycle_monitor",
    # Autonomy loop is the 8th stage: email → simulation → re-scoring → final decision.
    "autonomy_loop",
]

AGENT_COUNT: int = len(AGENTS)

# Abbreviated agent labels used in model-routing metadata (API response).
# These align with the test contract: {"A3", "A5", "autonomy_loop"}.
LLM_AGENTS: list[str] = ["A3", "A5", "autonomy_loop"]
DETERMINISTIC_AGENTS: list[str] = ["A1", "A2", "A4", "A6", "A7"]
