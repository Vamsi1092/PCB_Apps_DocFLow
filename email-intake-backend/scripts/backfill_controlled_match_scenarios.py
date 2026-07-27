import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.repositories.supabase_service import (
    store_attachment_file,
    supabase,
)
from app.services.validation_service import validate_document
from scripts.controlled_match_scenarios import (
    SOURCE_BATCH,
    build_scenario_payload,
    select_scenarios,
)


PDF_DIR = Path(
    "output/pdf/controlled_match_scenarios"
)


def _one(table, column, value):
    result = (
        supabase.table(table)
        .select("*")
        .eq(column, value)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _invoice_data(document_id):
    document = _one("ap_documents", "id", document_id)
    header = _one(
        "invoice_headers",
        "document_id",
        document_id,
    )
    lines = (
        supabase.table("invoice_lines")
        .select("*")
        .eq("invoice_id", header["id"])
        .order("line_number")
        .execute()
        .data
        or []
    )
    supplier = _one(
        "suppliers",
        "id",
        document.get("supplier_id"),
    )
    return document, header, lines, supplier


def _apply_invoice_corrections(
    *,
    scenario,
    document,
    header,
    lines,
):
    header_overrides = (
        scenario.get("invoice_header_overrides") or {}
    )
    if header_overrides:
        (
            supabase.table("invoice_headers")
            .update(header_overrides)
            .eq("id", header["id"])
            .execute()
        )
        header.update(header_overrides)

    line_overrides = (
        scenario.get("invoice_line_overrides") or {}
    )
    for line in lines:
        override = line_overrides.get(
            int(line.get("line_number") or 0)
        )
        if not override:
            continue
        (
            supabase.table("invoice_lines")
            .update(override)
            .eq("id", line["id"])
            .execute()
        )
        line.update(override)

    recon_summary = document.get("recon_summary") or {}
    recon_summary["scenario"] = {
        "code": scenario["code"],
        "name": scenario["name"],
        "expected_match_type": scenario[
            "expected_match_type"
        ],
        "expected_match_status": scenario[
            "expected_match_status"
        ],
    }
    (
        supabase.table("ap_documents")
        .update({
            "source_batch": SOURCE_BATCH,
            "recon_summary": recon_summary,
            "is_active": True,
        })
        .eq("id", document["id"])
        .execute()
    )
    document["source_batch"] = SOURCE_BATCH
    document["recon_summary"] = recon_summary


def _ensure_email(
    *,
    scenario,
    document_type,
    document_number,
    supplier_name,
    extraction,
):
    external_id = (
        f"{SOURCE_BATCH}:{scenario['code']}:"
        f"{document_type}"
    )
    email = _one(
        "email_messages",
        "external_message_id",
        external_id,
    )
    now = datetime.now(timezone.utc).isoformat()
    data = {
        "external_message_id": external_id,
        "internet_message_id": external_id,
        "from_name": supplier_name,
        "from_email": (
            f"{document_number.lower()}@controlled-demo.invalid"
        ),
        "subject": (
            f"Controlled demo {document_type}: "
            f"{document_number}"
        ),
        "body_preview": (
            "Controlled scenario source document for AP "
            "matching validation."
        ),
        "received_at": now,
        "has_attachments": True,
        "category": document_type,
        "classification_confidence": 1,
        "status": "processed",
        "ai_understanding": extraction,
        "ai_intent": (
            "Controlled source document ingestion."
        ),
    }
    if email:
        (
            supabase.table("email_messages")
            .update(data)
            .eq("id", email["id"])
            .execute()
        )
        email.update(data)
        return email
    return (
        supabase.table("email_messages")
        .insert(data)
        .execute()
        .data[0]
    )


def _ensure_attachment(
    *,
    email_id,
    filename,
    path,
    detected_type,
):
    result = (
        supabase.table("email_attachments")
        .select("*")
        .eq("email_id", email_id)
        .eq("filename", filename)
        .limit(1)
        .execute()
    )
    if result.data:
        attachment = result.data[0]
    else:
        attachment = (
            supabase.table("email_attachments")
            .insert({
                "email_id": email_id,
                "filename": filename,
                "file_type": "application/pdf",
                "size_kb": int(
                    max(path.stat().st_size / 1024, 1)
                ),
                "detected_type": detected_type,
                "storage_bucket": None,
                "storage_path": None,
            })
            .execute()
            .data[0]
        )
    store_attachment_file(
        attachment["id"],
        filename,
        str(path),
        "application/pdf",
    )
    return _one(
        "email_attachments",
        "id",
        attachment["id"],
    )


def _ensure_document(
    *,
    scenario,
    email,
    attachment,
    document_type,
    supplier_id,
    extraction,
):
    result = (
        supabase.table("ap_documents")
        .select("*")
        .eq("email_id", email["id"])
        .eq("document_type", document_type)
        .limit(1)
        .execute()
    )
    now = datetime.now(timezone.utc)
    data = {
        "email_id": email["id"],
        "attachment_id": attachment["id"],
        "document_type": document_type,
        "supplier_id": supplier_id,
        "stage": "extracted",
        "pipeline_stage": "extracted",
        "extraction_status": "extracted",
        "received_at": now.isoformat(),
        "priority": "medium",
        "ai_priority_reason": (
            "Controlled scenario source document."
        ),
        "recommended_action": (
            "Use as a source document for matching."
        ),
        "sla_due_at": (
            now + timedelta(days=3)
        ).isoformat(),
        "sla_breached": False,
        "ai_confidence": 1,
        "is_active": True,
        "source_batch": SOURCE_BATCH,
        "recon_summary": {
            "source": "controlled_demo_document",
            "scenario": {
                "code": scenario["code"],
                "name": scenario["name"],
            },
        },
    }
    if result.data:
        document = result.data[0]
        (
            supabase.table("ap_documents")
            .update(data)
            .eq("id", document["id"])
            .execute()
        )
        document.update(data)
    else:
        document = (
            supabase.table("ap_documents")
            .insert(data)
            .execute()
            .data[0]
        )

    ai_result = (
        supabase.table("ai_runs")
        .select("id")
        .eq("document_id", document["id"])
        .eq("run_type", "extract")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    ai_data = {
        "document_id": document["id"],
        "email_id": email["id"],
        "run_type": "extract",
        "model": "controlled_demo_document_v1",
        "confidence": 1,
        "result": extraction,
        "mock_mode": True,
    }
    if ai_result.data:
        (
            supabase.table("ai_runs")
            .update(ai_data)
            .eq("id", ai_result.data[0]["id"])
            .execute()
        )
    else:
        supabase.table("ai_runs").insert(ai_data).execute()

    # Updating ai_understanding invokes the deployed chain refresh
    # trigger after the AP document exists.
    (
        supabase.table("email_messages")
        .update({"ai_understanding": extraction})
        .eq("id", email["id"])
        .execute()
    )
    (
        supabase.rpc(
            "refresh_document_chain",
            {"target_document_id": document["id"]},
        ).execute()
    )
    return _one("ap_documents", "id", document["id"])


def _source_extraction(
    *,
    document_type,
    header,
    lines,
):
    document_number = (
        header.get("po_number")
        if document_type == "Purchase Order"
        else header.get("grn_number")
    )
    return {
        "document_type": document_type,
        "document_number": document_number,
        "header": header,
        "line_items": lines,
        "extraction_status": "completed",
        "ai_status": "success",
        "source": "controlled_demo_document",
    }


def _ensure_source_document(
    *,
    scenario,
    payload,
    document_type,
):
    if document_type == "purchase_order":
        header = payload["po_header"]
        lines = payload["po_lines"]
        label = "Purchase Order"
        filename = f"PO_{header['po_number']}.pdf"
        number = header["po_number"]
    else:
        header = payload["grn_header"]
        lines = payload["grn_lines"]
        label = "GRN"
        filename = f"{header['grn_number']}.pdf"
        number = header["grn_number"]
    extraction = _source_extraction(
        document_type=label,
        header=header,
        lines=lines,
    )
    email = _ensure_email(
        scenario=scenario,
        document_type=document_type,
        document_number=number,
        supplier_name=header.get("supplier_name"),
        extraction=extraction,
    )
    attachment = _ensure_attachment(
        email_id=email["id"],
        filename=filename,
        path=PDF_DIR / filename,
        detected_type=label,
    )
    return _ensure_document(
        scenario=scenario,
        email=email,
        attachment=attachment,
        document_type=document_type,
        supplier_id=header.get("supplier_id"),
        extraction=extraction,
    )


def main():
    results = []
    scenarios = select_scenarios(
        os.getenv("CONTROLLED_MATCH_SCENARIO_CODE")
    )
    for scenario in scenarios:
        document, header, lines, supplier = _invoice_data(
            scenario["invoice_document_id"]
        )
        _apply_invoice_corrections(
            scenario=scenario,
            document=document,
            header=header,
            lines=lines,
        )
        payload = build_scenario_payload(
            scenario=scenario,
            invoice_header=header,
            invoice_lines=lines,
            supplier_name=supplier.get("name"),
        )

        po_document = None
        grn_document = None
        if payload["po_header"]:
            po_document = _ensure_source_document(
                scenario=scenario,
                payload=payload,
                document_type="purchase_order",
            )
        if payload["grn_header"]:
            grn_document = _ensure_source_document(
                scenario=scenario,
                payload=payload,
                document_type="grn",
            )

        (
            supabase.rpc(
                "refresh_document_chain",
                {"target_document_id": document["id"]},
            ).execute()
        )
        validation = validate_document(header["id"])
        record = validation["document_match_record"]
        result = {
            "scenario_code": scenario["code"],
            "invoice_number": header["invoice_number"],
            "po_document_id": (
                po_document.get("id")
                if po_document
                else None
            ),
            "grn_document_id": (
                grn_document.get("id")
                if grn_document
                else None
            ),
            "actual_match_type": record[
                "overall_match_type"
            ],
            "actual_match_status": record[
                "overall_match_status"
            ],
            "expected_match_type": scenario[
                "expected_match_type"
            ],
            "expected_match_status": scenario[
                "expected_match_status"
            ],
            "ai_decision_source": record[
                "ai_decision_source"
            ],
        }
        results.append(result)

    failures = [
        result
        for result in results
        if (
            result["actual_match_type"]
            != result["expected_match_type"]
            or result["actual_match_status"]
            != result["expected_match_status"]
            or result["ai_decision_source"] != "oci"
        )
    ]
    print(json.dumps(results, indent=2))
    if failures:
        raise RuntimeError(
            "Controlled scenario verification failed: "
            + json.dumps(failures)
        )


if __name__ == "__main__":
    main()
