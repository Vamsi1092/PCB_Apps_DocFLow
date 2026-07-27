from dataclasses import asdict, dataclass
from datetime import date, datetime
from typing import Iterable, Optional


PRIORITY_RULE_VERSION = "priority_v1"

FINANCIAL_DOCUMENT_TYPES = {
    "invoice",
    "purchase_order",
    "grn",
}

HIGH_IMPACT_CHECKS = {
    "amount_match",
    "currency_match",
    "duplicate_invoice",
    "po_exists",
    "quantity_match",
    "supplier_match",
    "three_way_quantity_match",
}

REVIEW_EXTRACTION_STATUSES = {
    "needs_review",
    "review_required",
}

FAILED_EXTRACTION_STATUSES = {
    "error",
    "failed",
}


def _normalize_document_type(value: Optional[str]) -> str:
    return (value or "others").strip().lower().replace(" ", "_")


def _normalize_check_types(values: Iterable[str]) -> tuple[str, ...]:
    return tuple(
        sorted({
            str(value).strip().lower()
            for value in values
            if value
        })
    )


def _normalize_missing_fields(values: Iterable[str]) -> tuple[str, ...]:
    return tuple(
        sorted({
            str(value).strip()
            for value in values
            if value
        })
    )


def _parse_date(value) -> Optional[date]:
    if value is None or value == "":
        return None

    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, date):
        return value

    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError:
        return None


def _normalize_confidence(value) -> Optional[float]:
    if value is None or value == "":
        return None

    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return None

    return max(0.0, min(confidence, 1.0))


@dataclass(frozen=True)
class PriorityFacts:
    document_type: str
    supplier_resolved: bool
    po_available: bool
    grn_available: Optional[bool]
    match_type: Optional[str]
    failed_checks: tuple[str, ...]
    unavailable_checks: tuple[str, ...]
    missing_fields: tuple[str, ...]
    extraction_confidence: Optional[float]
    extraction_status: Optional[str]
    due_date: Optional[date]
    duplicate_risk: bool
    validation_completed: bool
    three_way_required: bool

    def to_dict(self) -> dict:
        result = asdict(self)
        result["failed_checks"] = list(self.failed_checks)
        result["unavailable_checks"] = list(
            self.unavailable_checks
        )
        result["missing_fields"] = list(self.missing_fields)
        result["due_date"] = (
            self.due_date.isoformat()
            if self.due_date
            else None
        )
        return result


@dataclass(frozen=True)
class PriorityDecision:
    priority: str
    reason: str
    source: str = "rules"
    rule_version: str = PRIORITY_RULE_VERSION
    confidence: float = 1.0

    def to_dict(self) -> dict:
        return asdict(self)


def build_priority_facts(
    *,
    document_type: Optional[str],
    supplier_resolved: bool,
    po_available: bool,
    grn_available: Optional[bool] = None,
    match_type: Optional[str] = None,
    failed_checks: Iterable[str] = (),
    unavailable_checks: Iterable[str] = (),
    missing_fields: Iterable[str] = (),
    extraction_confidence=None,
    extraction_status: Optional[str] = None,
    due_date=None,
    duplicate_risk: bool = False,
    validation_completed: bool = False,
    three_way_required: bool = False,
) -> PriorityFacts:
    normalized_match_type = (
        str(match_type).strip().upper()
        if match_type
        else None
    )

    normalized_status = (
        str(extraction_status).strip().lower()
        if extraction_status
        else None
    )

    return PriorityFacts(
        document_type=_normalize_document_type(document_type),
        supplier_resolved=bool(supplier_resolved),
        po_available=bool(po_available),
        grn_available=grn_available,
        match_type=normalized_match_type,
        failed_checks=_normalize_check_types(failed_checks),
        unavailable_checks=_normalize_check_types(
            unavailable_checks
        ),
        missing_fields=_normalize_missing_fields(missing_fields),
        extraction_confidence=_normalize_confidence(
            extraction_confidence
        ),
        extraction_status=normalized_status,
        due_date=_parse_date(due_date),
        duplicate_risk=bool(duplicate_risk),
        validation_completed=bool(validation_completed),
        three_way_required=bool(three_way_required),
    )


def determine_priority(
    facts: PriorityFacts,
    *,
    today: Optional[date] = None,
) -> PriorityDecision:
    """
    Assign a deterministic priority from facts already established by the
    pipeline. These baseline rules are intentionally independent from OCI.
    """

    today = today or date.today()
    days_until_due = (
        (facts.due_date - today).days
        if facts.due_date
        else None
    )

    extraction_failed = (
        facts.extraction_status in FAILED_EXTRACTION_STATUSES
        or (
            facts.extraction_confidence is not None
            and facts.extraction_confidence <= 0.20
        )
    )

    financial_document = (
        facts.document_type in FINANCIAL_DOCUMENT_TYPES
    )

    failed_checks = set(facts.failed_checks)
    high_impact_failures = sorted(
        failed_checks.intersection(HIGH_IMPACT_CHECKS)
    )

    if extraction_failed:
        return PriorityDecision(
            priority="critical",
            reason=(
                "Critical priority because extraction failed or produced "
                "insufficient confidence for safe processing."
            ),
        )

    if facts.duplicate_risk:
        return PriorityDecision(
            priority="critical",
            reason=(
                "Critical priority because the document has a duplicate "
                "invoice risk that requires immediate review."
            ),
        )

    if (
        days_until_due is not None
        and days_until_due < 0
        and failed_checks
    ):
        return PriorityDecision(
            priority="critical",
            reason=(
                "Critical priority because the document is overdue and has "
                "failed validation checks."
            ),
        )

    if financial_document and not facts.supplier_resolved:
        return PriorityDecision(
            priority="high",
            reason=(
                "High priority because the supplier could not be resolved "
                "to a canonical supplier record."
            ),
        )

    if facts.document_type == "invoice" and not facts.po_available:
        return PriorityDecision(
            priority="high",
            reason=(
                "High priority because the invoice does not contain an "
                "available purchase order reference."
            ),
        )

    if high_impact_failures:
        return PriorityDecision(
            priority="high",
            reason=(
                "High priority because validation failed for: "
                f"{', '.join(high_impact_failures)}."
            ),
        )

    if (
        facts.extraction_confidence is not None
        and facts.extraction_confidence < 0.60
    ):
        return PriorityDecision(
            priority="high",
            reason=(
                "High priority because extraction confidence is below 60%."
            ),
        )

    if days_until_due is not None and days_until_due < 0:
        return PriorityDecision(
            priority="high",
            reason="High priority because the document is overdue.",
        )

    if failed_checks:
        return PriorityDecision(
            priority="medium",
            reason=(
                "Medium priority because validation requires review for: "
                f"{', '.join(sorted(failed_checks))}."
            ),
        )

    if facts.unavailable_checks:
        return PriorityDecision(
            priority="medium",
            reason=(
                "Medium priority because validation data is unavailable "
                f"for: {', '.join(facts.unavailable_checks)}."
            ),
        )

    if facts.missing_fields:
        return PriorityDecision(
            priority="medium",
            reason=(
                "Medium priority because mandatory fields are missing: "
                f"{', '.join(facts.missing_fields)}."
            ),
        )

    if facts.extraction_status in REVIEW_EXTRACTION_STATUSES:
        return PriorityDecision(
            priority="medium",
            reason=(
                "Medium priority because extraction marked the document "
                "for human review."
            ),
        )

    if (
        facts.extraction_confidence is not None
        and facts.extraction_confidence < 0.85
    ):
        return PriorityDecision(
            priority="medium",
            reason=(
                "Medium priority because extraction confidence is below 85%."
            ),
        )

    if days_until_due is not None and days_until_due <= 2:
        return PriorityDecision(
            priority="medium",
            reason=(
                "Medium priority because the due date is within two days."
            ),
        )

    if facts.document_type == "invoice" and not facts.validation_completed:
        return PriorityDecision(
            priority="medium",
            reason=(
                "Medium priority while supplier and matching validation "
                "are pending."
            ),
        )

    if facts.validation_completed:
        return PriorityDecision(
            priority="low",
            reason=(
                "Low priority because all completed validation checks passed "
                "and no urgent risk was identified."
            ),
        )

    return PriorityDecision(
        priority="low",
        reason=(
            "Low priority because extraction completed without an identified "
            "exception or urgent due date."
        ),
    )
