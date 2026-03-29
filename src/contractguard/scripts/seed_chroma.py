"""Seed script for the high-risk clause corpus in ChromaDB."""

from __future__ import annotations

import os

import chromadb


def seed() -> None:
    """Create/get collection and upsert the canonical high-risk clause corpus."""
    chroma_url = os.getenv("CHROMA_URL", "./chroma_db")
    client = chromadb.PersistentClient(path=chroma_url)
    collection = client.get_or_create_collection("high_risk_clauses")

    documents = [
        "Payment shall be made within 90 days of invoice date",
        "Client may terminate with 7 days notice after supplier completes deliverables",
        "Supplier bears full liability for all consequential damages without any cap",
        "All IP created under this contract transfers to client upon creation",
        "Supplier indemnifies client against all third-party claims without limitation",
        "Client may reduce scope unilaterally without price adjustment",
        "Payment subject to client satisfaction at sole discretion of client",
        "Supplier must maintain insurance of not less than fifty lakh rupees",
        "Contract auto-renews for three years unless ninety days written notice given",
        "Exclusive jurisdiction vests solely in courts of client's choosing",
        "Force majeure excludes payment obligations — supplier still liable for penalties",
        "Client may assign this contract without supplier consent",
    ]
    ids = [f"hrc-{i:03d}" for i in range(1, 13)]

    collection.upsert(ids=ids, documents=documents)


if __name__ == "__main__":
    seed()
