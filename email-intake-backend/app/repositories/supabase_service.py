import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

from app.services.workflow_decision_service import (
    build_workflow_decision
)

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_KEY
)


def save_email(email_data):
    result = supabase.table("email_messages").insert(email_data).execute()
    return result


def save_attachment(attachment_data):
    result = supabase.table("email_attachments").insert(attachment_data).execute()
    return result


def store_attachment_file(
    attachment_id,
    filename,
    file_path,
    content_type=None,
):
    safe_filename = (
        str(filename or "attachment")
        .replace("\\", "_")
        .replace("/", "_")
        .replace("#", "_")
    )
    bucket = "ap-email-attachments"
    object_path = f"{attachment_id}/{safe_filename}"
    payload = Path(file_path).read_bytes()
    options = {"upsert": "true"}
    if content_type:
        options["content-type"] = content_type

    supabase.storage.from_(bucket).upload(
        object_path,
        payload,
        options,
    )
    (
        supabase.table("email_attachments")
        .update({
            "storage_bucket": bucket,
            "storage_path": object_path,
        })
        .eq("id", attachment_id)
        .execute()
    )
    return {
        "storage_bucket": bucket,
        "storage_path": object_path,
    }


def get_email_by_external_id(external_message_id):
    result = (
        supabase
        .table("email_messages")
        .select("*")
        .eq("external_message_id", external_message_id)
        .execute()
    )

    if result.data and len(result.data) > 0:
        return result.data[0]

    return None

def get_supplier_id_by_alias(supplier_name):

    if not supplier_name:
        print("Supplier lookup skipped: supplier name is empty")
        return None

    supplier_name = str(supplier_name).strip()

    result = (
        supabase
        .table("supplier_aliases")
        .select("supplier_id, alias")
        .ilike("alias", supplier_name)
        .limit(1)
        .execute()
    )

    if result.data:
        supplier_id = result.data[0].get("supplier_id")

        print(
            "Supplier matched:",
            supplier_name,
            "->",
            supplier_id
        )

        return supplier_id

    print(
        "Supplier alias not found:",
        supplier_name
    )

    return None

def save_ap_document(ap_document_data):
    result = supabase.table("ap_documents").insert(ap_document_data).execute()
    return result


def save_ai_run(ai_run_data):
    result = supabase.table("ai_runs").insert(ai_run_data).execute()
    return result


def save_invoice_header(invoice_header_data):
    result = supabase.table("invoice_headers").insert(invoice_header_data).execute()
    return result


def save_invoice_lines(invoice_lines_data):
    if not invoice_lines_data:
        return None

    result = supabase.table("invoice_lines").insert(invoice_lines_data).execute()
    return result


# -----------------------------
# Purchase Order
# -----------------------------

def save_purchase_order(po_data):
    result = (
        supabase
        .table("purchase_orders")
        .insert(po_data)
        .execute()
    )
    return result


def save_purchase_order_lines(po_line_data):
    if not po_line_data:
        return None

    result = (
        supabase
        .table("purchase_order_lines")
        .insert(po_line_data)
        .execute()
    )
    return result


def get_purchase_order_by_number(po_number):
    result = (
        supabase
        .table("purchase_orders")
        .select("*")
        .eq("po_number", po_number)
        .execute()
    )

    if result.data:
        return result.data[0]

    return None


# -----------------------------
# Reference Purchase Order
# -----------------------------

def save_reference_purchase_order(reference_po_data):
    result = (
        supabase
        .table("reference_purchase_orders")
        .insert(reference_po_data)
        .execute()
    )

    if result.data:
        return result.data[0]

    return None


def save_reference_purchase_order_lines(reference_po_lines_data):
    if not reference_po_lines_data:
        return []

    result = (
        supabase
        .table("reference_purchase_order_lines")
        .insert(reference_po_lines_data)
        .execute()
    )

    return result.data or []


def get_reference_purchase_order_by_number(po_number):
    if not po_number:
        return None

    result = (
        supabase
        .table("reference_purchase_orders")
        .select("*")
        .eq("po_number", po_number)
        .limit(1)
        .execute()
    )

    if result.data:
        return result.data[0]

    return None

# -----------------------------
# Goods Receipt
# -----------------------------

def save_goods_receipt(grn_data):
    result = (
        supabase
        .table("goods_receipts")
        .insert(grn_data)
        .execute()
    )
    return result


def save_goods_receipt_lines(grn_line_data):
    if not grn_line_data:
        return None

    result = (
        supabase
        .table("goods_receipt_lines")
        .insert(grn_line_data)
        .execute()
    )
    return result

# -----------------------------
# Reference Goods Receipt
# -----------------------------

def save_reference_goods_receipt(reference_grn_data):
    result = (
        supabase
        .table("reference_goods_receipts")
        .insert(reference_grn_data)
        .execute()
    )

    if result.data:
        return result.data[0]

    return None


def save_reference_goods_receipt_lines(reference_grn_lines_data):
    if not reference_grn_lines_data:
        return []

    result = (
        supabase
        .table("reference_goods_receipt_lines")
        .insert(reference_grn_lines_data)
        .execute()
    )

    return result.data or []


def get_reference_goods_receipt_by_number(grn_number):
    if not grn_number:
        return None

    result = (
        supabase
        .table("reference_goods_receipts")
        .select("*")
        .eq("grn_number", grn_number)
        .limit(1)
        .execute()
    )

    if result.data:
        return result.data[0]

    return None

def update_email_status(email_id, status):
    result = (
        supabase
        .table("email_messages")
        .update({
            "status": status
        })
        .eq("id", email_id)
        .execute()
    )

    return result


def update_email_ai_details(email_id, ai_intent, ai_understanding, suggested_action):
    result = (
        supabase
        .table("email_messages")
        .update({
            "ai_intent": ai_intent,
            "ai_understanding": ai_understanding,
            "suggested_action": suggested_action
        })
        .eq("id", email_id)
        .execute()
    )

    return result


def update_ap_document_workflow_decision(
    document_id,
    workflow_decision,
    recon_summary
):
    """
    Persist the current priority/recommendation decision and its provenance
    on the UI-facing document row.
    """

    result = (
        supabase
        .table("ap_documents")
        .update({
            "priority": workflow_decision.get("priority"),
            "ai_priority_reason": workflow_decision.get(
                "ai_priority_reason"
            ),
            "recommended_action": workflow_decision.get(
                "recommended_action"
            ),
            "recommended_action_code": workflow_decision.get(
                "recommended_action_code"
            ),
            "ai_decision_source": workflow_decision.get("source"),
            "ai_decision_model": workflow_decision.get("model"),
            "ai_decision_prompt_version": workflow_decision.get(
                "prompt_version"
            ),
            "ai_decision_confidence": workflow_decision.get(
                "confidence"
            ),
            "ai_decided_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "recon_summary": recon_summary
        })
        .eq("id", document_id)
        .execute()
    )

    return result


# Legacy functions kept temporarily.
# Do not use these in the new pipeline.

def save_work_item(work_item_data):
    result = supabase.table("work_items").insert(work_item_data).execute()
    return result


def save_extracted_document(extracted_data):
    result = supabase.table("extracted_documents").insert(extracted_data).execute()
    return result

def generate_display_id(
    supplier_name: str,
    document_type: str,
    document_reference: str
) -> str:
    """
    Generate a business-friendly document ID for UI display.

    Examples:
    HUL-GRN-200118
    HUL-ACK-800432
    CNG-PO-14191
    BST-INV-10614771
    """

    supplier_name = (supplier_name or "").strip()
    document_type = (document_type or "").strip().lower()
    document_reference = (document_reference or "").strip()

    supplier_code_map = {
        "hulamin operations proprietary limited": "HUL",
        "bluestar": "BST",
        "cng": "CNG"
    }

    supplier_code = supplier_code_map.get(
        supplier_name.lower()
    )

    if not supplier_code:
        supplier_words = supplier_name.split()

        if len(supplier_words) == 1 and supplier_words:
            supplier_code = supplier_words[0][:3].upper()

        elif supplier_words:
            supplier_code = "".join(
                word[0]
                for word in supplier_words[:3]
                if word
            ).upper()

        else:
            supplier_code = "UNK"

    document_type_map = {
        "invoice": "INV",
        "purchase_order": "PO",
        "purchase order": "PO",
        "acknowledgement": "ACK",
        "acknowledgment": "ACK",
        "grn": "GRN"
    }

    document_prefix = document_type_map.get(
        document_type,
        "DOC"
    )

    if not document_reference:
        document_reference = "UNKNOWN"

    # Avoid duplicate prefixes such as CNG-PO-PO-14191.
    normalized_reference = document_reference.upper()

    known_prefixes = {
        "INV": ["INV-"],
        "PO": ["PO-"],
        "ACK": ["ACK-"],
        "GRN": ["GRN-"]
    }

    for existing_prefix in known_prefixes.get(
        document_prefix,
        []
    ):
        if normalized_reference.startswith(existing_prefix):
            document_reference = document_reference[
                len(existing_prefix):
            ]
            break

    return (
        f"{supplier_code}-"
        f"{document_prefix}-"
        f"{document_reference}"
    )


def format_document_type(document_type: str) -> str:
    """
    Convert database document types into UI-friendly labels.
    """

    normalized_type = (
        document_type or ""
    ).strip().lower()

    document_type_map = {
        "invoice": "Invoice",
        "purchase_order": "Purchase Order",
        "purchase order": "Purchase Order",
        "acknowledgement": "Acknowledgement",
        "acknowledgment": "Acknowledgement",
        "grn": "GRN"
    }

    return document_type_map.get(
        normalized_type,
        normalized_type.replace("_", " ").title()
    )

def format_po_number(po_number: str) -> str:
    """
    Convert PO Number into a consistent UI-friendly format.

    Examples:
    6090191 OP  -> PO-6090191
    6090360 OP  -> PO-6090360
    PO-14191    -> PO-14191
    41323000    -> PO-41323000
    """

    if not po_number:
        return None

    po_number = po_number.strip()

    # Remove trailing " OP"
    if po_number.upper().endswith(" OP"):
        po_number = po_number[:-3].strip()

    # Already normalized
    if po_number.upper().startswith("PO-"):
        return po_number

    return f"PO-{po_number}"

def format_priority_reason(priority: str, priority_reason: str) -> str:
    """
    Convert technical priority reasons into business-friendly
    messages for UI display.
    """

    priority = (priority or "").strip().lower()
    priority_reason = (priority_reason or "").strip()

    # Historical records retain this placeholder. Do not represent it as an
    # AI assessment because no grounded decision was made for those records.
    if priority_reason == "Default priority assigned during AI document extraction.":

        mapping = {
            "critical": "Critical priority pending grounded workflow assessment.",
            "high": "High priority pending grounded workflow assessment.",
            "medium": "Medium priority pending grounded workflow assessment.",
            "low": "Low priority pending grounded workflow assessment."
        }

        return mapping.get(
            priority,
            "Priority pending grounded workflow assessment."
        )

    return priority_reason

def get_document_queue_records():
    """
    Fetch the base AP documents and the related records needed
    for the Document Queue UI.
    """

    documents_result = (
        supabase
        .table("ap_documents")
        .select("*")
        .eq("is_active", True)
        .order("created_at", desc=True)
        .limit(4)
        .execute()
    )

    documents = documents_result.data or []
    queue_records = []

    for document in documents:
        document_id = document.get("id")
        document_type = document.get("document_type")

        # Default values shared by all document types
        supplier_name = None
        document_reference = None
        po_number = None
        amount = None
        currency = None
        extraction_result = {}
        header = {}

        # Get the latest AI extraction result.
        ai_run_result = (
            supabase
            .table("ai_runs")
            .select("result, created_at")
            .eq("document_id", document_id)
            .eq("run_type", "extract")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        if ai_run_result.data:
            extraction_result = ai_run_result.data[0].get("result") or {}
            header = extraction_result.get("header") or {}

            supplier_name = header.get("supplier_name")
            po_number = header.get("po_number")
            currency = header.get("currency")
            document_reference = extraction_result.get("document_number")
            amount = header.get("total_amount")

        # Invoice-specific normalized values
        if document_type == "invoice":
            invoice_result = (
                supabase
                .table("invoice_headers")
                .select(
                    "invoice_number, po_number, "
                    "total_amount, currency, due_date, supplier_id"
                )
                .eq("document_id", document_id)
                .limit(1)
                .execute()
            )

            if invoice_result.data:
                invoice = invoice_result.data[0]

                document_reference = (
                    invoice.get("invoice_number")
                    or document_reference
                )

                po_number = (
                    invoice.get("po_number")
                    or po_number
                )

                amount = (
                    invoice.get("total_amount")
                    if invoice.get("total_amount") is not None
                    else amount
                )

                currency = (
                    invoice.get("currency")
                    or currency
                )

                header.update({
                    "invoice_number": invoice.get(
                        "invoice_number"
                    ),
                    "po_number": invoice.get("po_number"),
                    "total_amount": invoice.get(
                        "total_amount"
                    ),
                    "currency": invoice.get("currency"),
                    "due_date": invoice.get("due_date")
                })

        # Purchase Order-specific normalized values
        elif document_type == "purchase_order":
            po_result = (
                supabase
                .table("purchase_orders")
                .select(
                    "id, po_number, total_amount, currency"
                )
                .eq("po_number", document_reference)
                .limit(1)
                .execute()
            )

            if po_result.data:
                purchase_order = po_result.data[0]

                document_reference = (
                    purchase_order.get("po_number")
                    or document_reference
                )

                po_number = (
                    purchase_order.get("po_number")
                    or po_number
                )

                amount = (
                    purchase_order.get("total_amount")
                    if purchase_order.get("total_amount") is not None
                    else amount
                )

                currency = (
                    purchase_order.get("currency")
                    or currency
                )

        # GRN-specific normalized values
        elif document_type == "grn":
            grn_result = (
                supabase
                .table("goods_receipts")
                .select(
                    "grn_number, po_id, received_date, status"
                )
                .eq("grn_number", document_reference)
                .limit(1)
                .execute()
            )

            if grn_result.data:
                goods_receipt = grn_result.data[0]

                document_reference = (
                    goods_receipt.get("grn_number")
                    or document_reference
                )

                po_id = goods_receipt.get("po_id")

                if po_id:
                    related_po_result = (
                        supabase
                        .table("purchase_orders")
                        .select("po_number")
                        .eq("id", po_id)
                        .limit(1)
                        .execute()
                    )

                    if related_po_result.data:
                        po_number = (
                            related_po_result.data[0].get("po_number")
                            or po_number
                        )

        # Exception engine has not yet been connected.
        exception_count = 0

        recon_summary = document.get("recon_summary") or {}
        persisted_workflow_decision = (
            recon_summary.get("workflow_decision") or {}
            if isinstance(recon_summary, dict)
            else {}
        )

        extraction_workflow_decision = (
            extraction_result.get("workflow_decision") or {}
            if isinstance(extraction_result, dict)
            else {}
        )

        workflow_decision = persisted_workflow_decision

        if not workflow_decision:
            workflow_decision = extraction_workflow_decision

        decision_storage = None

        if persisted_workflow_decision:
            decision_storage = "ap_documents.recon_summary"
        elif extraction_workflow_decision:
            decision_storage = "ai_runs.result"

        if not workflow_decision:
            validation_result = (
                supabase
                .table("validation_results")
                .select("check_type, passed")
                .eq("document_id", document_id)
                .execute()
            )

            validation_checks = validation_result.data or []

            workflow_decision = build_workflow_decision(
                document_type=document_type,
                header=header,
                supplier_resolved=(
                    document.get("supplier_id") is not None
                ),
                extraction_confidence=document.get(
                    "ai_confidence"
                ),
                extraction_status=extraction_result.get(
                    "extraction_status"
                ),
                document_number=document_reference,
                validation_checks=validation_checks,
                validation_completed=bool(validation_checks)
            )
            decision_storage = "computed_read_only"

        recommended_action = workflow_decision.get(
            "recommended_action"
        )
        recommended_action_code = workflow_decision.get(
            "recommended_action_code"
        )
        recommended_action_label = workflow_decision.get(
            "recommended_action_label"
        )

        if not recommended_action and document.get("email_id"):
            email_result = (
                supabase
                .table("email_messages")
                .select("suggested_action")
                .eq("id", document.get("email_id"))
                .limit(1)
                .execute()
            )

            if email_result.data:
                recommended_action = (
                    email_result.data[0].get("suggested_action")
                )

        displayed_priority = (
            workflow_decision.get("priority")
            or document.get("priority")
        )
        displayed_priority_reason = (
            workflow_decision.get("ai_priority_reason")
            or format_priority_reason(
                document.get("priority"),
                document.get("ai_priority_reason")
            )
        )

        # SLA calculation has not yet been configured.
        sla = {
            "status": "Not Configured",
            "remaining_minutes": None,
            "due_at": None
        }

        queue_records.append({
            "document_id": document_id,
            "display_id": generate_display_id(
                supplier_name=supplier_name,
                document_type=document_type,
                document_reference=document_reference
            ),
            "priority": displayed_priority,
            "ai_priority_reason": displayed_priority_reason,
            "priority_reason": displayed_priority_reason,
            "recommended_action": recommended_action,
            "recommended_action_code": (
                recommended_action_code
            ),
            "recommended_action_label": (
                recommended_action_label
            ),
            "decision_source": workflow_decision.get(
                "source"
            ),
            "decision_mode": workflow_decision.get(
                "decision_mode"
            ),
            "decision_model": workflow_decision.get(
                "model"
            ),
            "decision_prompt_version": (
                workflow_decision.get("prompt_version")
            ),
            "decision_fallback_used": (
                workflow_decision.get("fallback_used")
            ),
            "decision_storage": decision_storage,
            "match_type": (
                (workflow_decision.get("facts") or {})
                .get("match_type")
            ),
            "supplier": supplier_name,
            "document_reference": document_reference,
            "po_number": format_po_number(
                po_number
            ),
            "document_type": format_document_type(
                document_type
            ),
            "amount": amount,
            "currency": currency,
            "stage": document.get("stage"),
            "confidence": document.get("ai_confidence"),
            "exception_count": exception_count,
            "sla": sla
        })

    return queue_records

from datetime import datetime, timedelta, timezone
from typing import Optional


def get_dashboard_kpis(
    date_filter: str = "last100",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Return KPI counts required by the DocFlow dashboard.

    Current POC implementation:
    - Uses the latest four clean AP document records.
    - Returns real counts for active invoices and pending review.
    - Returns zero for modules that are not yet implemented.
    """

    query = (
        supabase
        .table("ap_documents")
        .select(
            "id, document_type, stage, is_active, created_at"
        )
        .eq("is_active", True)
        .order("created_at", desc=True)
    )

    # Temporary safeguard:
    # Supabase contains older test records with bad values.
    # Use the latest four clean final records for the current POC.
    query = query.limit(4)

    documents_result = query.execute()
    documents = documents_result.data or []

    active_invoice_count = sum(
        1
        for document in documents
        if str(document.get("document_type", "")).lower() == "invoice"
    )

    pending_review_count = sum(
        1
        for document in documents
        if str(document.get("stage", "")).lower() == "review"
    )

    return {
        "dateFilter": date_filter,
        "startDate": start_date,
        "endDate": end_date,

        "activeInvoices": {
            "count": active_invoice_count,
            "change": 0.0
        },

        "pendingReview": {
            "count": pending_review_count,
            "change": 0.0
        },

        "openExceptions": {
            "count": 0,
            "change": 0.0
        },

        "pendingApprovals": {
            "count": 0,
            "change": 0.0
        },

        "postingReady": {
            "count": 0,
            "change": 0.0
        },

        "slaBreached": {
            "count": 0,
            "change": 0.0
        }
    }

from typing import Optional


def get_dashboard_pipeline(
    date_filter: str = "last100",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Return document counts for each DocFlow pipeline stage.

    Current POC behavior:
    - Uses the latest four clean AP documents.
    - Ingested = all selected AP documents.
    - Extracted = documents having an extraction AI run.
    - Matched, Coded, Approved and Posted remain 0
      until those backend modules are implemented.
    """

    documents_result = (
        supabase
        .table("ap_documents")
        .select("id, stage, created_at")
        .eq("is_active", True)
        .order("created_at", desc=True)
        .limit(4)
        .execute()
    )

    documents = documents_result.data or []

    document_ids = [
        document.get("id")
        for document in documents
        if document.get("id")
    ]

    total_ingested = len(documents)
    extracted_count = 0

    if document_ids:
        ai_runs_result = (
            supabase
            .table("ai_runs")
            .select("document_id, run_type")
            .in_("document_id", document_ids)
            .eq("run_type", "extract")
            .execute()
        )

        extracted_document_ids = {
            run.get("document_id")
            for run in (ai_runs_result.data or [])
            if run.get("document_id")
        }

        extracted_count = len(extracted_document_ids)

    label_map = {
        "today": "Today",
        "week": "This Week",
        "month": "This Month",
        "last100": "Latest Records",
        "custom": "Custom Range"
    }

    return {
        "dateFilter": date_filter,
        "startDate": start_date,
        "endDate": end_date,
        "label": label_map.get(date_filter, "Latest Records"),
        "totalIngested": total_ingested,
        "stages": [
            {
                "name": "Ingested",
                "count": total_ingested
            },
            {
                "name": "Extracted",
                "count": extracted_count
            },
            {
                "name": "Matched",
                "count": 0
            },
            {
                "name": "Coded",
                "count": 0
            },
            {
                "name": "Approved",
                "count": 0
            },
            {
                "name": "Posted",
                "count": 0
            }
        ]
    }

from typing import Optional


def get_exceptions_by_severity(
    date_filter: str = "last100",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Return exception counts grouped by severity.

    Current POC behavior:
    - Exception detection is not implemented yet.
    - Returns zero counts while preserving the final UI response contract.
    """

    return {
        "dateFilter": date_filter,
        "startDate": start_date,
        "endDate": end_date,
        "severities": [
            {
                "level": "Critical",
                "count": 0,
                "slaLabel": "needs action now"
            },
            {
                "level": "High",
                "count": 0,
                "slaLabel": "within 4h"
            },
            {
                "level": "Medium",
                "count": 0,
                "slaLabel": "within 1 day"
            },
            {
                "level": "Low",
                "count": 0,
                "slaLabel": "within 3 days"
            }
        ]
    }
