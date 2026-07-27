from typing import Iterable, Mapping, Optional

from app.services.priority_service import (
    build_priority_facts,
    determine_priority,
)
from app.services.recommendation_service import recommend_action


def _normalized_document_type(value: Optional[str]) -> str:
    return (value or "others").strip().lower().replace(" ", "_")


def _missing_mandatory_fields(
    document_type: str,
    header: Mapping,
    document_number=None,
) -> list[str]:
    required_fields = {
        "invoice": {
            "invoice_number": (
                header.get("invoice_number")
                or document_number
            ),
            "currency": header.get("currency"),
            "total_amount": header.get("total_amount"),
        },
        "purchase_order": {
            "po_number": (
                header.get("po_number")
                or document_number
            ),
            "currency": header.get("currency"),
            "total_amount": header.get("total_amount"),
        },
        "grn": {
            "grn_number": (
                header.get("grn_number")
                or header.get("receipt_number")
                or header.get("delivery_note_number")
                or document_number
            ),
            "po_number": header.get("po_number"),
        },
        "acknowledgement": {
            "acknowledgement_number": (
                header.get("acknowledgement_number")
                or header.get("confirmation_number")
                or document_number
            ),
            "po_number": header.get("po_number"),
        },
    }

    fields = required_fields.get(document_type, {})

    return [
        name
        for name, value in fields.items()
        if value is None or value == ""
    ]


def _failed_check_types(
    validation_checks: Iterable[Mapping],
) -> list[str]:
    return [
        check.get("check_type")
        for check in validation_checks
        if (
            check.get("check_type")
            and check.get("passed") is False
        )
    ]


def _unavailable_check_types(
    validation_checks: Iterable[Mapping],
) -> list[str]:
    return [
        check.get("check_type")
        for check in validation_checks
        if (
            check.get("check_type")
            and (
                check.get("status") == "NOT_AVAILABLE"
                or (
                    "status" not in check
                    and check.get("passed") is None
                )
            )
        )
    ]


def build_workflow_facts(
    *,
    document_type: Optional[str],
    header: Optional[Mapping],
    supplier_resolved: bool,
    extraction_confidence=None,
    extraction_status: Optional[str] = None,
    document_number=None,
    validation_checks: Iterable[Mapping] = (),
    validation_completed: bool = False,
):
    """
    Normalize trusted extraction and validation results into the bounded facts
    that may be sent to the decision model.
    """

    header = header or {}
    checks = list(validation_checks or [])
    normalized_type = _normalized_document_type(document_type)
    failed_checks = _failed_check_types(checks)
    unavailable_checks = _unavailable_check_types(
        checks
    )

    po_available = bool(header.get("po_number"))

    grn_check = next(
        (
            check
            for check in checks
            if check.get("check_type") == "grn_exists"
        ),
        None,
    )

    if grn_check is not None:
        grn_available = grn_check.get("passed") is True
    else:
        grn_available = bool(
            header.get("grn_number")
            or header.get("receipt_number")
            or header.get("delivery_note_number")
        )

    three_way_required = any(
        str(check.get("check_type") or "").startswith("three_way_")
        for check in checks
    )

    if normalized_type == "invoice":
        if three_way_required:
            match_type = "3_WAY"
        elif po_available:
            match_type = "2_WAY"
        else:
            match_type = "NON_PO"
    else:
        match_type = None

    duplicate_risk = (
        "duplicate_invoice" in failed_checks
    )

    return build_priority_facts(
        document_type=normalized_type,
        supplier_resolved=supplier_resolved,
        po_available=po_available,
        grn_available=grn_available,
        match_type=match_type,
        failed_checks=failed_checks,
        unavailable_checks=unavailable_checks,
        missing_fields=_missing_mandatory_fields(
            normalized_type,
            header,
            document_number,
        ),
        extraction_confidence=extraction_confidence,
        extraction_status=extraction_status,
        due_date=header.get("due_date"),
        duplicate_risk=duplicate_risk,
        validation_completed=validation_completed,
        three_way_required=three_way_required,
    )


def build_workflow_decision(
    *,
    document_type: Optional[str],
    header: Optional[Mapping],
    supplier_resolved: bool,
    extraction_confidence=None,
    extraction_status: Optional[str] = None,
    document_number=None,
    validation_checks: Iterable[Mapping] = (),
    validation_completed: bool = False,
) -> dict:
    """
    Produce the deterministic fallback contract used only when an OCI decision
    is unavailable or invalid.
    """

    facts = build_workflow_facts(
        document_type=document_type,
        header=header,
        supplier_resolved=supplier_resolved,
        extraction_confidence=extraction_confidence,
        extraction_status=extraction_status,
        document_number=document_number,
        validation_checks=validation_checks,
        validation_completed=validation_completed,
    )

    priority = determine_priority(facts)
    action = recommend_action(facts)

    return {
        "priority": priority.priority,
        "ai_priority_reason": priority.reason,
        "recommended_action": action.description,
        "recommended_action_code": action.code.value,
        "recommended_action_label": action.label,
        "source": "rules",
        "confidence": priority.confidence,
        "rule_versions": {
            "priority": priority.rule_version,
            "recommendation": action.rule_version,
        },
        "facts": facts.to_dict(),
    }
