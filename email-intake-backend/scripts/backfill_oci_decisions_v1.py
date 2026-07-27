import argparse

from app.repositories.supabase_service import supabase
from app.services.ai_decision_service import (
    get_workflow_decision_with_oci,
)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    runs = (
        supabase
        .table("validation_runs")
        .select("document_id,created_at")
        .eq("engine_version", "presence_matching_v2")
        .eq("is_current", True)
        .execute()
    )
    current_runs = {
        row["document_id"]: row["created_at"]
        for row in (runs.data or [])
    }
    document_ids = []
    for document_id, validation_created_at in current_runs.items():
        existing = (
            supabase.table("ai_runs")
            .select("id")
            .eq("document_id", document_id)
            .eq("run_type", "priority_recommendation")
            .gte("created_at", validation_created_at)
            .contains("result", {
                "prompt_version": "oci_priority_recommendation_v1",
                "source": "oci",
            })
            .limit(1)
            .execute()
        )
        if not existing.data:
            document_ids.append(document_id)
    document_ids.sort()
    print(f"targets={len(document_ids)}")

    if not args.apply:
        for document_id in document_ids:
            print(document_id)
        print("dry_run=true")
        return

    if len(current_runs) != 7:
        raise RuntimeError(
            f"Expected exactly 7 current validation targets, found {len(current_runs)}"
        )

    for document_id in document_ids:
        document = (
            supabase.table("ap_documents")
            .select("id,email_id,supplier_id")
            .eq("id", document_id)
            .single()
            .execute()
            .data
        )
        header = (
            supabase.table("invoice_headers")
            .select("*")
            .eq("document_id", document_id)
            .single()
            .execute()
            .data
        )
        checks = (
            supabase.table("validation_results")
            .select("*")
            .eq("document_id", document_id)
            .eq("is_current", True)
            .execute()
            .data
        )

        decision = get_workflow_decision_with_oci(
            document_type="Invoice",
            header=header,
            supplier_resolved=document.get("supplier_id") is not None,
            document_number=header.get("invoice_number"),
            validation_checks=checks,
            validation_completed=True,
        )
        if decision.get("source") != "oci":
            raise RuntimeError(
                f"OCI decision failed for {header.get('invoice_number')}: "
                f"{decision.get('fallback_reason')}"
            )

        (
            supabase.table("ap_documents")
            .update({
                "priority": decision["priority"],
                "ai_priority_reason": decision["ai_priority_reason"],
            })
            .eq("id", document_id)
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
                "document_id": document_id,
                "email_id": document.get("email_id"),
                "run_type": "priority_recommendation",
                "model": decision.get("model"),
                "confidence": decision.get("confidence"),
                "result": decision,
                "mock_mode": False,
            })
            .execute()
        )
        print({
            "invoice_number": header.get("invoice_number"),
            "priority": decision["priority"],
            "action": decision["recommended_action_code"],
            "source": decision["source"],
        })


if __name__ == "__main__":
    main()
