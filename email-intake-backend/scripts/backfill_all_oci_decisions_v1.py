import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from app.repositories.supabase_service import supabase
from app.services.ai_decision_service import (
    get_workflow_decision_with_oci,
)


PROMPT_VERSION = "oci_priority_recommendation_v1"


def _load_targets(limit):
    documents = (
        supabase.table("ap_documents")
        .select(
            "id,email_id,document_type,supplier_id,"
            "email_messages(ai_understanding)"
        )
        .order("created_at")
        .execute()
        .data
        or []
    )
    existing = (
        supabase.table("ai_runs")
        .select("document_id")
        .eq("run_type", "priority_recommendation")
        .contains("result", {
            "source": "oci",
            "prompt_version": PROMPT_VERSION,
        })
        .execute()
        .data
        or []
    )
    completed = {
        row["document_id"]
        for row in existing
        if row.get("document_id")
    }
    targets = [
        document for document in documents
        if document["id"] not in completed
    ]
    return targets[:limit] if limit else targets


def _load_invoice_headers(document_ids):
    if not document_ids:
        return {}
    rows = (
        supabase.table("invoice_headers")
        .select("*")
        .in_("document_id", document_ids)
        .execute()
        .data
        or []
    )
    return {row["document_id"]: row for row in rows}


def _load_validation_checks(document_ids):
    if not document_ids:
        return {}
    rows = (
        supabase.table("validation_results")
        .select("*")
        .in_("document_id", document_ids)
        .execute()
        .data
        or []
    )
    current_documents = {
        row["document_id"]
        for row in rows
        if row.get("is_current") is True
    }
    grouped = {}
    for row in rows:
        if (
            row["document_id"] in current_documents
            and row.get("is_current") is not True
        ):
            continue
        grouped.setdefault(row["document_id"], []).append(row)
    return grouped


def _email_facts(document):
    relation = document.get("email_messages")
    if isinstance(relation, list):
        relation = relation[0] if relation else {}
    relation = relation or {}
    understanding = relation.get("ai_understanding") or {}
    return understanding if isinstance(understanding, dict) else {}


def _decision_input(document, invoice_headers, checks):
    stored_facts = _email_facts(document)
    header = (
        invoice_headers.get(document["id"])
        or stored_facts.get("header")
        or {}
    )
    if not isinstance(header, dict):
        header = {}
    validation_checks = checks.get(document["id"], [])
    return {
        "document_type": (
            stored_facts.get("document_type")
            or document.get("document_type")
        ),
        "header": header,
        "supplier_resolved": document.get("supplier_id") is not None,
        "extraction_confidence": (
            stored_facts.get("confidence_score")
            or stored_facts.get("confidence")
        ),
        "extraction_status": stored_facts.get("extraction_status"),
        "document_number": stored_facts.get("document_number"),
        "validation_checks": validation_checks,
        "validation_completed": bool(validation_checks),
    }


def _persist(document, decision):
    decided_at = datetime.now(timezone.utc).isoformat()
    (
        supabase.table("ap_documents")
        .update({
            "priority": decision["priority"],
            "ai_priority_reason": decision["ai_priority_reason"],
            "recommended_action": decision["recommended_action"],
            "recommended_action_code": decision[
                "recommended_action_code"
            ],
            "ai_decision_source": decision["source"],
            "ai_decision_model": decision.get("model"),
            "ai_decision_prompt_version": decision.get(
                "prompt_version"
            ),
            "ai_decision_confidence": decision.get("confidence"),
            "ai_decided_at": decided_at,
        })
        .eq("id", document["id"])
        .execute()
    )
    if document.get("email_id"):
        (
            supabase.table("email_messages")
            .update({
                "suggested_action": decision["recommended_action"],
            })
            .eq("id", document["email_id"])
            .execute()
        )
    (
        supabase.table("ai_runs")
        .insert({
            "document_id": document["id"],
            "email_id": document.get("email_id"),
            "run_type": "priority_recommendation",
            "model": decision.get("model"),
            "confidence": decision.get("confidence"),
            "result": decision,
            "mock_mode": False,
        })
        .execute()
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    targets = _load_targets(args.limit)
    print(f"targets={len(targets)}", flush=True)
    if not args.apply:
        for target in targets:
            print(target["id"], target["document_type"], flush=True)
        print("dry_run=true", flush=True)
        return

    document_ids = [target["id"] for target in targets]
    invoice_headers = _load_invoice_headers(document_ids)
    checks = _load_validation_checks(document_ids)
    failures = []

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(
                get_workflow_decision_with_oci,
                **_decision_input(
                    document,
                    invoice_headers,
                    checks,
                ),
            ): document
            for document in targets
        }
        for future in as_completed(futures):
            document = futures[future]
            decision = future.result()
            if decision.get("source") != "oci":
                failures.append({
                    "document_id": document["id"],
                    "reason": decision.get("fallback_reason"),
                })
                continue
            _persist(document, decision)
            print(
                document["id"],
                decision["priority"],
                decision["recommended_action_code"],
                "oci",
                flush=True,
            )

    if failures:
        raise RuntimeError(f"OCI failures: {failures}")


if __name__ == "__main__":
    main()
