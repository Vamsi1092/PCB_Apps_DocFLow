from dataclasses import asdict, dataclass
from enum import Enum

from app.services.priority_service import (
    FAILED_EXTRACTION_STATUSES,
    FINANCIAL_DOCUMENT_TYPES,
    PriorityFacts,
)


RECOMMENDATION_RULE_VERSION = "recommendation_v1"


class RecommendedActionCode(str, Enum):
    RETRY_EXTRACTION = "RETRY_EXTRACTION"
    RESOLVE_SUPPLIER = "RESOLVE_SUPPLIER"
    REQUEST_MISSING_PO = "REQUEST_MISSING_PO"
    REQUEST_MISSING_GRN = "REQUEST_MISSING_GRN"
    ESCALATE_DUPLICATE = "ESCALATE_DUPLICATE"
    REVIEW_AMOUNT_VARIANCE = "REVIEW_AMOUNT_VARIANCE"
    REVIEW_QUANTITY_VARIANCE = "REVIEW_QUANTITY_VARIANCE"
    REVIEW_CURRENCY_MISMATCH = "REVIEW_CURRENCY_MISMATCH"
    REVIEW_VALIDATION_EXCEPTION = "REVIEW_VALIDATION_EXCEPTION"
    REVIEW_AND_APPROVE = "REVIEW_AND_APPROVE"
    REVIEW_DOCUMENT = "REVIEW_DOCUMENT"


ACTION_LABELS = {
    RecommendedActionCode.RETRY_EXTRACTION: "Retry extraction",
    RecommendedActionCode.RESOLVE_SUPPLIER: "Resolve supplier",
    RecommendedActionCode.REQUEST_MISSING_PO: "Request missing PO",
    RecommendedActionCode.REQUEST_MISSING_GRN: "Request missing GRN",
    RecommendedActionCode.ESCALATE_DUPLICATE: "Escalate duplicate risk",
    RecommendedActionCode.REVIEW_AMOUNT_VARIANCE: "Review amount variance",
    RecommendedActionCode.REVIEW_QUANTITY_VARIANCE: "Review quantity variance",
    RecommendedActionCode.REVIEW_CURRENCY_MISMATCH: "Review currency mismatch",
    RecommendedActionCode.REVIEW_VALIDATION_EXCEPTION: (
        "Review validation exception"
    ),
    RecommendedActionCode.REVIEW_AND_APPROVE: "Review and approve",
    RecommendedActionCode.REVIEW_DOCUMENT: "Review document",
}


def get_action_label(code: RecommendedActionCode) -> str:
    return ACTION_LABELS[code]


@dataclass(frozen=True)
class RecommendedAction:
    code: RecommendedActionCode
    label: str
    description: str
    source: str = "rules"
    rule_version: str = RECOMMENDATION_RULE_VERSION

    def to_dict(self) -> dict:
        result = asdict(self)
        result["code"] = self.code.value
        return result


def _action(
    code: RecommendedActionCode,
    label: str,
    description: str,
) -> RecommendedAction:
    return RecommendedAction(
        code=code,
        label=label,
        description=description,
    )


def recommend_action(facts: PriorityFacts) -> RecommendedAction:
    """
    Select one canonical next action from deterministic pipeline facts.
    The ordering is deliberate: extraction and identity problems must be
    resolved before financial matching decisions.
    """

    failed_checks = set(facts.failed_checks)
    financial_document = (
        facts.document_type in FINANCIAL_DOCUMENT_TYPES
    )

    extraction_failed = (
        facts.extraction_status in FAILED_EXTRACTION_STATUSES
        or (
            facts.extraction_confidence is not None
            and facts.extraction_confidence <= 0.20
        )
    )

    if extraction_failed:
        return _action(
            RecommendedActionCode.RETRY_EXTRACTION,
            "Retry extraction",
            (
                "Retry document extraction or send the attachment for "
                "manual capture."
            ),
        )

    if financial_document and not facts.supplier_resolved:
        return _action(
            RecommendedActionCode.RESOLVE_SUPPLIER,
            "Resolve supplier",
            (
                "Resolve the supplier against the canonical supplier and "
                "alias records before continuing."
            ),
        )

    if facts.document_type == "invoice" and not facts.po_available:
        return _action(
            RecommendedActionCode.REQUEST_MISSING_PO,
            "Request missing PO",
            (
                "Request or identify the purchase order before invoice "
                "matching continues."
            ),
        )

    if facts.duplicate_risk or "duplicate_invoice" in failed_checks:
        return _action(
            RecommendedActionCode.ESCALATE_DUPLICATE,
            "Escalate duplicate risk",
            (
                "Escalate the potential duplicate invoice for AP review "
                "before approval or posting."
            ),
        )

    if "po_exists" in failed_checks:
        return _action(
            RecommendedActionCode.REQUEST_MISSING_PO,
            "Request missing PO",
            (
                "Locate or request the referenced purchase order before "
                "matching continues."
            ),
        )

    if (
        facts.three_way_required
        and (
            facts.grn_available is False
            or "grn_exists" in failed_checks
        )
    ):
        return _action(
            RecommendedActionCode.REQUEST_MISSING_GRN,
            "Request missing GRN",
            (
                "Locate or request the goods receipt required for 3-way "
                "matching."
            ),
        )

    if {
        "amount_match",
        "line_amount_match",
    }.intersection(failed_checks):
        return _action(
            RecommendedActionCode.REVIEW_AMOUNT_VARIANCE,
            "Review amount variance",
            (
                "Review the invoice and purchase-order amount variance "
                "before approval."
            ),
        )

    if {
        "quantity_match",
        "three_way_quantity_match",
    }.intersection(failed_checks):
        return _action(
            RecommendedActionCode.REVIEW_QUANTITY_VARIANCE,
            "Review quantity variance",
            (
                "Review ordered, received and invoiced quantities before "
                "approval."
            ),
        )

    if "currency_match" in failed_checks:
        return _action(
            RecommendedActionCode.REVIEW_CURRENCY_MISMATCH,
            "Review currency mismatch",
            (
                "Confirm the invoice and purchase-order currencies before "
                "approval."
            ),
        )

    if failed_checks:
        return _action(
            RecommendedActionCode.REVIEW_VALIDATION_EXCEPTION,
            "Review validation exception",
            (
                "Review the failed validation checks and resolve the "
                "document exception."
            ),
        )

    if facts.unavailable_checks:
        return _action(
            RecommendedActionCode.REVIEW_VALIDATION_EXCEPTION,
            "Review validation exception",
            (
                "Complete the unavailable validation data before "
                "continuing."
            ),
        )

    if facts.validation_completed:
        return _action(
            RecommendedActionCode.REVIEW_AND_APPROVE,
            "Review and approve",
            (
                "Review the completed matching evidence and approve the "
                "document if business controls are satisfied."
            ),
        )

    return _action(
        RecommendedActionCode.REVIEW_DOCUMENT,
        "Review document",
        (
            "Review the extracted document details before continuing the "
            "workflow."
        ),
    )
