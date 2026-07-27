import json
from decimal import Decimal, InvalidOperation
from enum import Enum
from typing import Iterable, Mapping, Optional

from app.repositories.supabase_service import supabase
from app.services.tolerance_service import (
    is_within_tolerance,
    load_active_tolerance_rules,
    resolve_tolerance_rule,
)

VALIDATION_ENGINE_VERSION = "real_chain_matching_v3"


class MatchType(str, Enum):
    UNMATCHED = "UNMATCHED"
    TWO_WAY = "2_WAY"
    THREE_WAY = "3_WAY"


class CheckStatus(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    NOT_AVAILABLE = "NOT_AVAILABLE"
    NOT_APPLICABLE = "NOT_APPLICABLE"


def _decimal(value) -> Optional[Decimal]:
    if value is None or value == "":
        return None

    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _json_number(value: Optional[Decimal]):
    if value is None:
        return None

    return float(value)


def calculate_deviation(actual, expected):
    actual_value = _decimal(actual)
    expected_value = _decimal(expected)

    if actual_value is None or expected_value is None:
        return None, None

    absolute = abs(actual_value - expected_value)

    if expected_value == 0:
        percentage = (
            Decimal("0")
            if actual_value == 0
            else None
        )
    else:
        percentage = (
            absolute
            / abs(expected_value)
            * Decimal("100")
        )

    return absolute, percentage


class ValidationResult:
    def __init__(
        self,
        *,
        status: CheckStatus,
        check_type: str,
        matched_value=None,
        expected_value=None,
        confidence=1.0,
        deviation_abs: Optional[Decimal] = None,
        deviation_pct: Optional[Decimal] = None,
        note: Optional[str] = None,
        tolerance_rule_id: Optional[str] = None,
        tolerance_threshold_pct: Optional[Decimal] = None,
        tolerance_threshold_amt: Optional[Decimal] = None,
    ):
        self.status = CheckStatus(status)
        self.check_type = check_type
        self.matched_value = matched_value
        self.expected_value = expected_value
        self.confidence = confidence
        self.deviation_abs = deviation_abs
        self.deviation_pct = deviation_pct
        self.note = note
        self.tolerance_rule_id = tolerance_rule_id
        self.tolerance_threshold_pct = (
            tolerance_threshold_pct
        )
        self.tolerance_threshold_amt = (
            tolerance_threshold_amt
        )

    @property
    def passed(self):
        if self.status == CheckStatus.PASS:
            return True
        if self.status == CheckStatus.FAIL:
            return False
        return None

    def to_dict(self):
        return {
            "status": self.status.value,
            "passed": self.passed,
            "check_type": self.check_type,
            "matched_value": self.matched_value,
            "expected_value": self.expected_value,
            "confidence": self.confidence,
            "deviation_abs": _json_number(
                self.deviation_abs
            ),
            "deviation_pct": _json_number(
                self.deviation_pct
            ),
            "note": self.note,
            "tolerance_rule_id": self.tolerance_rule_id,
            "tolerance_threshold_pct": _json_number(
                self.tolerance_threshold_pct
            ),
            "tolerance_threshold_amt": _json_number(
                self.tolerance_threshold_amt
            ),
        }


class ValidationSummary:
    def __init__(
        self,
        match_type: MatchType,
        *,
        match_type_source: str,
    ):
        self.match_type = MatchType(match_type)
        self.match_type_source = match_type_source
        self.results = []

    def add(self, validation_result: ValidationResult):
        self.results.append(validation_result)

    def get(self, check_type: str):
        return next(
            (
                result
                for result in self.results
                if result.check_type == check_type
            ),
            None,
        )

    def passed(self):
        return bool(self.results) and all(
            result.status in {
                CheckStatus.PASS,
                CheckStatus.NOT_APPLICABLE,
            }
            for result in self.results
        )

    def failed(self):
        return not self.passed()

    def overall_status(self):
        if self.match_type == MatchType.UNMATCHED:
            return "UNMATCHED"

        if any(
            result.status in {
                CheckStatus.FAIL,
                CheckStatus.NOT_AVAILABLE,
            }
            for result in self.results
        ):
            return "VARIANCE"

        return "MATCHED"

    @staticmethod
    def _status_for(results):
        applicable = [
            result
            for result in results
            if result.status != CheckStatus.NOT_APPLICABLE
        ]
        if any(
            result.status in {
                CheckStatus.FAIL,
                CheckStatus.NOT_AVAILABLE,
            }
            for result in applicable
        ):
            return "VARIANCE"
        return "MATCHED"

    def two_way_status(self):
        if self.match_type == MatchType.UNMATCHED:
            return "UNMATCHED"
        return self._status_for([
            result
            for result in self.results
            if not result.check_type.startswith("three_way_")
            and result.check_type != "grn_exists"
        ])

    def three_way_status(self):
        if self.match_type != MatchType.THREE_WAY:
            return None
        return self.overall_status()

    def exception_summary(self):
        problems = []
        for result in self.results:
            if result.status not in {
                CheckStatus.FAIL,
                CheckStatus.NOT_AVAILABLE,
            }:
                continue
            label = result.check_type.replace("_", " ")
            if label not in problems:
                problems.append(label)
        if not problems:
            return None
        return "Review required: " + ", ".join(problems) + "."

    def to_list(self):
        return [
            result.to_dict()
            for result in self.results
        ]

    def to_dict(self):
        return {
            "match_type": self.match_type.value,
            "match_type_source": self.match_type_source,
            "overall_status": self.overall_status(),
            "two_way_status": self.two_way_status(),
            "three_way_status": self.three_way_status(),
            "exception_summary": self.exception_summary(),
            "passed": self.passed(),
            "checks": self.to_list(),
        }


def select_match_type(
    invoice_header: Mapping,
    reference_po: Optional[Mapping],
    reference_grn: Optional[Mapping],
) -> MatchType:
    if reference_po is None:
        return MatchType.UNMATCHED
    if reference_grn is not None:
        return MatchType.THREE_WAY
    return MatchType.TWO_WAY


def _match_type_source(
    match_type: MatchType,
    reference_po: Optional[Mapping],
    reference_grn: Optional[Mapping],
) -> str:
    if reference_po is None:
        return "real_po_document_not_found"
    if reference_grn is not None:
        return "real_chain_po_and_grn_presence"
    return "real_chain_po_presence_without_grn"


def _sum_required(lines: Iterable[Mapping], field: str):
    values = list(lines or [])
    if not values:
        return None

    total = Decimal("0")
    for line in values:
        value = _decimal(line.get(field))
        if value is None:
            return None
        total += value
    return total


def _status_result(
    *,
    status: CheckStatus,
    check_type: str,
    matched_value=None,
    expected_value=None,
    note: str,
) -> ValidationResult:
    return ValidationResult(
        status=status,
        check_type=check_type,
        matched_value=matched_value,
        expected_value=expected_value,
        note=note,
    )


def _text_check(
    *,
    check_type: str,
    actual,
    expected,
    matched_note: str,
    mismatch_note: str,
) -> ValidationResult:
    if actual is None or expected is None:
        return _status_result(
            status=CheckStatus.NOT_AVAILABLE,
            check_type=check_type,
            matched_value=actual,
            expected_value=expected,
            note=(
                "Comparison unavailable because one or both "
                "values are missing."
            ),
        )

    actual_text = " ".join(str(actual).split()).strip()
    expected_text = " ".join(str(expected).split()).strip()

    if not actual_text or not expected_text:
        return _status_result(
            status=CheckStatus.NOT_AVAILABLE,
            check_type=check_type,
            matched_value=actual,
            expected_value=expected,
            note=(
                "Comparison unavailable because one or both "
                "values are empty."
            ),
        )

    passed = (
        actual_text.upper()
        == expected_text.upper()
    )

    return _status_result(
        status=(
            CheckStatus.PASS
            if passed
            else CheckStatus.FAIL
        ),
        check_type=check_type,
        matched_value=actual,
        expected_value=expected,
        note=matched_note if passed else mismatch_note,
    )


def _numeric_check(
    *,
    check_type: str,
    actual,
    expected,
    currency: Optional[str],
    tolerance_rules: Iterable[Mapping],
    matched_note: str,
    mismatch_note: str,
) -> ValidationResult:
    actual_value = _decimal(actual)
    expected_value = _decimal(expected)

    if actual_value is None or expected_value is None:
        return ValidationResult(
            status=CheckStatus.NOT_AVAILABLE,
            check_type=check_type,
            matched_value=actual,
            expected_value=expected,
            note=(
                "Comparison unavailable because one or both "
                "numeric values are missing or invalid."
            ),
        )

    deviation_abs, deviation_pct = (
        calculate_deviation(
            actual_value,
            expected_value,
        )
    )

    tolerance_rule = resolve_tolerance_rule(
        tolerance_rules,
        check_type=check_type,
        currency=currency,
    )

    exact_match = deviation_abs == 0
    tolerance_match = is_within_tolerance(
        tolerance_rule,
        deviation_abs=deviation_abs,
        deviation_pct=deviation_pct,
    )
    passed = exact_match or tolerance_match

    note = matched_note if passed else mismatch_note

    if tolerance_match and not exact_match:
        note = (
            f"{note} Accepted by tolerance rule "
            f"'{tolerance_rule.rule_name or tolerance_rule.id}'."
        )

    return ValidationResult(
        status=(
            CheckStatus.PASS
            if passed
            else CheckStatus.FAIL
        ),
        check_type=check_type,
        matched_value=actual,
        expected_value=expected,
        deviation_abs=deviation_abs,
        deviation_pct=deviation_pct,
        note=note,
        tolerance_rule_id=(
            tolerance_rule.id
            if tolerance_rule
            else None
        ),
        tolerance_threshold_pct=(
            tolerance_rule.threshold_pct
            if tolerance_rule
            else None
        ),
        tolerance_threshold_amt=(
            tolerance_rule.threshold_amt
            if tolerance_rule
            else None
        ),
    )


def _three_way_numeric_check(
    *,
    check_type: str,
    invoice_value,
    po_value,
    grn_value,
    tolerance_rules: Iterable[Mapping],
) -> ValidationResult:
    values = [
        _decimal(invoice_value),
        _decimal(po_value),
        _decimal(grn_value),
    ]

    if any(value is None for value in values):
        return ValidationResult(
            status=CheckStatus.NOT_AVAILABLE,
            check_type=check_type,
            matched_value=invoice_value,
            expected_value=grn_value,
            note=(
                "3-way comparison unavailable because an "
                "invoice, PO or GRN value is missing."
            ),
        )

    invoice_decimal, po_decimal, grn_decimal = values
    maximum_deviation = max(values) - min(values)

    if grn_decimal == 0:
        deviation_pct = (
            Decimal("0")
            if maximum_deviation == 0
            else None
        )
    else:
        deviation_pct = (
            maximum_deviation
            / abs(grn_decimal)
            * Decimal("100")
        )

    tolerance_rule = resolve_tolerance_rule(
        tolerance_rules,
        check_type=check_type,
        currency=None,
    )
    tolerance_match = is_within_tolerance(
        tolerance_rule,
        deviation_abs=maximum_deviation,
        deviation_pct=deviation_pct,
    )
    passed = (
        invoice_decimal
        == po_decimal
        == grn_decimal
    ) or tolerance_match

    return ValidationResult(
        status=(
            CheckStatus.PASS
            if passed
            else CheckStatus.FAIL
        ),
        check_type=check_type,
        matched_value=invoice_value,
        expected_value=grn_value,
        deviation_abs=maximum_deviation,
        deviation_pct=deviation_pct,
        note=(
            "Quantity matched across Invoice, PO and GRN."
            if passed
            else (
                "Quantity mismatch across Invoice, PO and GRN."
            )
        ),
        tolerance_rule_id=(
            tolerance_rule.id
            if tolerance_rule
            else None
        ),
        tolerance_threshold_pct=(
            tolerance_rule.threshold_pct
            if tolerance_rule
            else None
        ),
        tolerance_threshold_amt=(
            tolerance_rule.threshold_amt
            if tolerance_rule
            else None
        ),
    )


def _add_match_strategy(
    summary: ValidationSummary,
):
    summary.add(
        _status_result(
            status=CheckStatus.PASS,
            check_type="match_strategy",
            matched_value=summary.match_type.value,
            expected_value=summary.match_type.value,
            note=(
                f"{summary.match_type.value} strategy selected "
                f"from {summary.match_type_source}."
            ),
        )
    )


def _validate_non_po(
    invoice_header: Mapping,
    summary: ValidationSummary,
):
    _add_match_strategy(summary)

    summary.add(
        _status_result(
            status=CheckStatus.NOT_APPLICABLE,
            check_type="po_exists",
            note=(
                "Purchase order is not applicable to a NON_PO "
                "invoice."
            ),
        )
    )
    summary.add(
        _status_result(
            status=(
                CheckStatus.PASS
                if invoice_header.get("supplier_id")
                else CheckStatus.NOT_AVAILABLE
            ),
            check_type="supplier_resolved",
            matched_value=invoice_header.get("supplier_id"),
            note=(
                "Supplier is resolved."
                if invoice_header.get("supplier_id")
                else "Supplier resolution is required."
            ),
        )
    )

    coding_available = bool(
        invoice_header.get("gl_account")
        and invoice_header.get("cost_center")
    )
    summary.add(
        _status_result(
            status=(
                CheckStatus.PASS
                if coding_available
                else CheckStatus.NOT_AVAILABLE
            ),
            check_type="non_po_coding",
            matched_value={
                "gl_account": invoice_header.get(
                    "gl_account"
                ),
                "cost_center": invoice_header.get(
                    "cost_center"
                ),
            },
            note=(
                "Required non-PO coding is available."
                if coding_available
                else (
                    "GL account and cost center are required "
                    "for non-PO processing."
                )
            ),
        )
    )
    summary.add(
        _status_result(
            status=CheckStatus.NOT_APPLICABLE,
            check_type="grn_exists",
            note=(
                "Goods receipt is not applicable to a NON_PO "
                "invoice."
            ),
        )
    )


def _perform_two_way_header_matching(
    invoice_header: Mapping,
    reference_po: Mapping,
    summary: ValidationSummary,
    tolerance_rules: Iterable[Mapping],
):
    summary.add(
        _text_check(
            check_type="supplier_match",
            actual=invoice_header.get("supplier_id"),
            expected=reference_po.get("supplier_id"),
            matched_note="Supplier matched.",
            mismatch_note="Supplier mismatch.",
        )
    )
    summary.add(
        _text_check(
            check_type="currency_match",
            actual=invoice_header.get("currency"),
            expected=reference_po.get("currency"),
            matched_note="Currency matched.",
            mismatch_note="Currency mismatch.",
        )
    )
    summary.add(
        _numeric_check(
            check_type="amount_match",
            actual=invoice_header.get("total_amount"),
            expected=reference_po.get("total_amount"),
            currency=reference_po.get("currency"),
            tolerance_rules=tolerance_rules,
            matched_note="Invoice amount matched.",
            mismatch_note=(
                "Invoice amount differs from Reference PO."
            ),
        )
    )
    summary.add(
        _text_check(
            check_type="payment_terms_match",
            actual=invoice_header.get("payment_terms"),
            expected=reference_po.get("payment_terms"),
            matched_note="Payment terms matched.",
            mismatch_note="Payment terms mismatch.",
        )
    )


def _perform_two_way_line_matching(
    invoice_lines: Iterable[Mapping],
    reference_po_lines: Iterable[Mapping],
    summary: ValidationSummary,
    tolerance_rules: Iterable[Mapping],
    currency: Optional[str],
):
    invoice_lines = list(invoice_lines or [])
    reference_po_lines = list(
        reference_po_lines or []
    )

    summary.add(
        _numeric_check(
            check_type="total_quantity_match",
            actual=_sum_required(invoice_lines, "quantity"),
            expected=_sum_required(
                reference_po_lines,
                "ordered_quantity",
            ),
            currency=None,
            tolerance_rules=tolerance_rules,
            matched_note="Summed invoice and PO quantities matched.",
            mismatch_note="Summed invoice and PO quantities differ.",
        )
    )

    if not invoice_lines:
        summary.add(
            _status_result(
                status=CheckStatus.NOT_AVAILABLE,
                check_type="invoice_lines_available",
                note="Invoice lines are unavailable.",
            )
        )
        return

    reference_lookup = {
        line.get("line_number"): line
        for line in reference_po_lines
        if line.get("line_number") is not None
    }

    for invoice_line in invoice_lines:
        line_number = invoice_line.get("line_number")
        reference_line = reference_lookup.get(
            line_number
        )

        if reference_line is None:
            summary.add(
                _status_result(
                    status=CheckStatus.FAIL,
                    check_type="po_line_exists",
                    matched_value=None,
                    expected_value=line_number,
                    note=(
                        f"Reference PO line {line_number} "
                        "was not found."
                    ),
                )
            )
            continue

        summary.add(
            _numeric_check(
                check_type="quantity_match",
                actual=invoice_line.get("quantity"),
                expected=reference_line.get(
                    "ordered_quantity"
                ),
                currency=None,
                tolerance_rules=tolerance_rules,
                matched_note="Quantity matched.",
                mismatch_note="Quantity mismatch.",
            )
        )
        summary.add(
            _numeric_check(
                check_type="unit_price_match",
                actual=invoice_line.get("unit_price"),
                expected=reference_line.get("unit_price"),
                currency=currency,
                tolerance_rules=tolerance_rules,
                matched_note="Unit price matched.",
                mismatch_note="Unit price mismatch.",
            )
        )
        summary.add(
            _numeric_check(
                check_type="line_amount_match",
                actual=invoice_line.get("amount"),
                expected=reference_line.get("line_amount"),
                currency=currency,
                tolerance_rules=tolerance_rules,
                matched_note="Line amount matched.",
                mismatch_note="Line amount mismatch.",
            )
        )
        summary.add(
            _text_check(
                check_type="description_match",
                actual=invoice_line.get("description"),
                expected=reference_line.get(
                    "description"
                ),
                matched_note="Description matched.",
                mismatch_note="Description mismatch.",
            )
        )


def _perform_three_way_matching(
    invoice_lines: Iterable[Mapping],
    reference_po_lines: Iterable[Mapping],
    reference_grn_lines: Iterable[Mapping],
    summary: ValidationSummary,
    tolerance_rules: Iterable[Mapping],
):
    invoice_lines = list(invoice_lines or [])
    reference_po_lines = list(reference_po_lines or [])
    reference_grn_lines = list(reference_grn_lines or [])

    summary.add(
        _three_way_numeric_check(
            check_type="three_way_total_quantity_match",
            invoice_value=_sum_required(
                invoice_lines,
                "quantity",
            ),
            po_value=_sum_required(
                reference_po_lines,
                "ordered_quantity",
            ),
            grn_value=_sum_required(
                reference_grn_lines,
                "received_quantity",
            ),
            tolerance_rules=tolerance_rules,
        )
    )

    po_lookup = {
        line.get("line_number"): line
        for line in (reference_po_lines or [])
        if line.get("line_number") is not None
    }
    grn_lookup = {
        line.get("line_number"): line
        for line in (reference_grn_lines or [])
        if line.get("line_number") is not None
    }

    for invoice_line in invoice_lines or []:
        line_number = invoice_line.get("line_number")
        po_line = po_lookup.get(line_number)
        grn_line = grn_lookup.get(line_number)

        if po_line is None or grn_line is None:
            summary.add(
                _status_result(
                    status=CheckStatus.FAIL,
                    check_type="three_way_line_exists",
                    matched_value=line_number,
                    expected_value=line_number,
                    note=(
                        "PO or GRN line is missing for "
                        f"line {line_number}."
                    ),
                )
            )
            continue

        summary.add(
            _three_way_numeric_check(
                check_type="three_way_quantity_match",
                invoice_value=invoice_line.get(
                    "quantity"
                ),
                po_value=po_line.get(
                    "ordered_quantity"
                ),
                grn_value=grn_line.get(
                    "received_quantity"
                ),
                tolerance_rules=tolerance_rules,
            )
        )

        descriptions = [
            invoice_line.get("description"),
            po_line.get("description"),
            grn_line.get("description"),
        ]

        if any(
            value is None or not str(value).strip()
            for value in descriptions
        ):
            status = CheckStatus.NOT_AVAILABLE
        else:
            normalized = [
                str(value).strip().upper()
                for value in descriptions
            ]
            status = (
                CheckStatus.PASS
                if normalized[0] == normalized[1] == normalized[2]
                else CheckStatus.FAIL
            )

        summary.add(
            _status_result(
                status=status,
                check_type="three_way_description_match",
                matched_value=descriptions[0],
                expected_value=descriptions[2],
                note=(
                    "Description matched across all documents."
                    if status == CheckStatus.PASS
                    else (
                        "3-way description comparison is "
                        f"{status.value.lower()}."
                    )
                ),
            )
        )


def validate_invoice_data(
    *,
    invoice_header: Mapping,
    invoice_lines: Iterable[Mapping],
    reference_po: Optional[Mapping],
    reference_po_lines: Iterable[Mapping],
    reference_grn: Optional[Mapping],
    reference_grn_lines: Iterable[Mapping],
    tolerance_rules: Iterable[Mapping],
) -> ValidationSummary:
    match_type = select_match_type(
        invoice_header,
        reference_po,
        reference_grn,
    )
    summary = ValidationSummary(
        match_type,
        match_type_source=_match_type_source(
            match_type,
            reference_po,
            reference_grn,
        ),
    )

    if match_type == MatchType.UNMATCHED:
        _add_match_strategy(summary)
        summary.add(
            _status_result(
                status=CheckStatus.FAIL,
                check_type="po_exists",
                matched_value=None,
                expected_value=invoice_header.get("po_number"),
                note="Referenced Purchase Order was not found.",
            )
        )
        return summary

    _add_match_strategy(summary)

    summary.add(
        _status_result(
            status=CheckStatus.PASS,
            check_type="po_exists",
            matched_value=reference_po.get("po_number"),
            expected_value=invoice_header.get("po_number"),
            note="Reference Purchase Order was found.",
        )
    )

    _perform_two_way_header_matching(
        invoice_header,
        reference_po,
        summary,
        tolerance_rules,
    )
    _perform_two_way_line_matching(
        invoice_lines,
        reference_po_lines,
        summary,
        tolerance_rules,
        reference_po.get("currency"),
    )

    if match_type == MatchType.TWO_WAY:
        summary.add(
            _status_result(
                status=CheckStatus.NOT_APPLICABLE,
                check_type="grn_exists",
                note=(
                    "Goods receipt is not required for "
                    "2-way matching."
                ),
            )
        )
        return summary

    if reference_grn is None:
        summary.add(
            _status_result(
                status=CheckStatus.FAIL,
                check_type="grn_exists",
                note=(
                    "Reference Goods Receipt is required "
                    "for 3-way matching but was not found."
                ),
            )
        )
        return summary

    summary.add(
        _status_result(
            status=CheckStatus.PASS,
            check_type="grn_exists",
            matched_value=reference_grn.get("grn_number"),
            expected_value=reference_po.get("po_number"),
            note="Reference Goods Receipt was found.",
        )
    )
    _perform_three_way_matching(
        invoice_lines,
        reference_po_lines,
        reference_grn_lines,
        summary,
        tolerance_rules,
    )

    return summary


def _get_one(
    table_name: str,
    column_name: str,
    value,
):
    result = (
        supabase
        .table(table_name)
        .select("*")
        .eq(column_name, value)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _get_many(
    table_name: str,
    column_name: str,
    value,
):
    result = (
        supabase
        .table(table_name)
        .select("*")
        .eq(column_name, value)
        .order("line_number")
        .execute()
    )
    return result.data or []


def save_validation_results(
    document_id,
    summary: ValidationSummary,
    *,
    exception_summary=None,
):
    previous_runs = (
        supabase
        .table("validation_runs")
        .select("id")
        .eq("document_id", document_id)
        .eq("is_current", True)
        .execute()
    )
    if previous_runs.data:
        (
            supabase
            .table("validation_runs")
            .update({"is_current": False})
            .eq("document_id", document_id)
            .eq("is_current", True)
            .execute()
        )
        for previous_run in previous_runs.data:
            (
                supabase
                .table("exception_cases")
                .update({"status": "resolved"})
                .eq(
                    "validation_run_id",
                    previous_run.get("id"),
                )
                .execute()
            )
    (
        supabase
        .table("validation_results")
        .update({"is_current": False})
        .eq("document_id", document_id)
        .eq("is_current", True)
        .execute()
    )

    run_result = (
        supabase
        .table("validation_runs")
        .insert({
            "document_id": document_id,
            "match_type": summary.match_type.value,
            "outcome": summary.overall_status(),
            "two_way_status": summary.two_way_status(),
            "three_way_status": summary.three_way_status(),
            "exception_summary": exception_summary,
            "exception_count": sum(
                result.status in {
                    CheckStatus.FAIL,
                    CheckStatus.NOT_AVAILABLE,
                }
                for result in summary.results
            ),
            "engine_version": VALIDATION_ENGINE_VERSION,
            "is_current": True,
            "supersedes_run_id": (
                previous_runs.data[0]["id"]
                if previous_runs.data
                else None
            ),
        })
        .execute()
    )
    validation_run_id = run_result.data[0]["id"]
    records = []

    for result in summary.results:
        records.append({
            "document_id": document_id,
            "validation_run_id": validation_run_id,
            "engine_version": VALIDATION_ENGINE_VERSION,
            "is_current": True,
            "match_type": summary.match_type.value,
            "check_type": result.check_type,
            "check_status": result.status.value,
            "passed": result.passed,
            "confidence": result.confidence,
            "matched_value": (
                str(result.matched_value)
                if result.matched_value is not None
                else None
            ),
            "expected_value": (
                str(result.expected_value)
                if result.expected_value is not None
                else None
            ),
            "deviation_abs": _json_number(
                result.deviation_abs
            ),
            "deviation_pct": _json_number(
                result.deviation_pct
            ),
            "tolerance_rule_id": (
                result.tolerance_rule_id
            ),
            "tolerance_threshold_pct": _json_number(
                result.tolerance_threshold_pct
            ),
            "tolerance_threshold_amt": _json_number(
                result.tolerance_threshold_amt
            ),
            "note": result.note,
        })

    if records:
        (
            supabase
            .table("validation_results")
            .insert(records)
            .execute()
        )

    if summary.overall_status() in {
        "VARIANCE",
        "UNMATCHED",
    }:
        (
            supabase
            .table("exception_cases")
            .insert({
                "document_id": document_id,
                "validation_run_id": validation_run_id,
                "exception_type": (
                    "MATCH_VARIANCE"
                    if summary.overall_status() == "VARIANCE"
                    else "MATCH_UNMATCHED"
                ),
                "severity": "high",
                "reason": exception_summary,
                "suggested_correction": (
                    "Review failed or unavailable matching checks, "
                    "correct the source data, and rerun matching."
                ),
                "status": "open",
            })
            .execute()
        )

    return validation_run_id


def update_document_stage(
    document_id,
    summary: ValidationSummary,
    *,
    exception_summary=None,
):
    if summary.overall_status() == "MATCHED":
        stage = "matching"
    else:
        stage = "exception"

    recon_summary = summary.to_dict()
    recon_summary["exception_summary"] = exception_summary

    (
        supabase
        .table("ap_documents")
        .update({
            "stage": stage,
            "pipeline_stage": (
                "matched"
                if summary.overall_status() == "MATCHED"
                else "exception"
            ),
            "recon_summary": json.loads(
                json.dumps(recon_summary, default=str)
            ),
        })
        .eq("id", document_id)
        .execute()
    )
    return stage


def _get_latest_chain_document(
    document_chain_id,
    document_type,
):
    if not document_chain_id:
        return None
    result = (
        supabase
        .table("ap_documents")
        .select("*")
        .eq("document_chain_id", document_chain_id)
        .eq("document_type", document_type)
        .eq("is_active", True)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _get_latest_extraction(document_id):
    if not document_id:
        return {}
    result = (
        supabase
        .table("ai_runs")
        .select("result")
        .eq("document_id", document_id)
        .eq("run_type", "extract")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return {}
    return result.data[0].get("result") or {}


def _matching_facts(
    *,
    summary,
    invoice_header,
    po_header,
    grn_header,
    pairwise_statuses,
    exception_summary,
):
    failed_checks = []
    for result in summary.results:
        if result.status not in {
            CheckStatus.FAIL,
            CheckStatus.NOT_AVAILABLE,
        }:
            continue
        failed_checks.append({
            "check_type": result.check_type,
            "status": result.status.value,
            "matched_value": result.matched_value,
            "expected_value": result.expected_value,
            "deviation_abs": _json_number(
                result.deviation_abs
            ),
            "deviation_pct": _json_number(
                result.deviation_pct
            ),
        })
    return {
        "invoice_number": invoice_header.get(
            "invoice_number"
        ),
        "po_number": (
            (po_header or {}).get("po_number")
            or invoice_header.get("po_number")
        ),
        "grn_number": (grn_header or {}).get(
            "grn_number"
        ),
        "overall_match_type": summary.match_type.value,
        "overall_match_status": summary.overall_status(),
        "pairwise_statuses": pairwise_statuses,
        "failed_checks": failed_checks,
        "deterministic_exception_summary": (
            exception_summary
        ),
    }


def _save_document_match_record(
    *,
    invoice_document,
    po_document,
    grn_document,
    invoice_header,
    invoice_lines,
    po_header,
    po_lines,
    grn_header,
    grn_lines,
    summary,
    pairwise_statuses,
    exception_summary,
    explanation,
    validation_run_id,
):
    from app.services.match_record_service import (
        build_document_snapshot,
    )

    document_id = invoice_document.get("id")
    (
        supabase
        .table("document_match_records")
        .update({"is_current": False})
        .eq("invoice_document_id", document_id)
        .eq("is_current", True)
        .execute()
    )

    recon_summary = invoice_document.get(
        "recon_summary"
    ) or {}
    scenario = (
        recon_summary.get("scenario")
        if isinstance(recon_summary, dict)
        else {}
    ) or {}

    record = {
        "document_chain_id": invoice_document.get(
            "document_chain_id"
        ),
        "invoice_document_id": document_id,
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
        "validation_run_id": validation_run_id,
        "invoice_number": invoice_header.get(
            "invoice_number"
        ),
        "po_number": (
            (po_header or {}).get("po_number")
            or invoice_header.get("po_number")
        ),
        "grn_number": (grn_header or {}).get(
            "grn_number"
        ),
        "invoice_data": build_document_snapshot(
            invoice_header,
            invoice_lines,
        ),
        "po_data": (
            build_document_snapshot(po_header, po_lines)
            if po_header
            else None
        ),
        "grn_data": (
            build_document_snapshot(grn_header, grn_lines)
            if grn_header
            else None
        ),
        "match_status_invoice_po": (
            pairwise_statuses["invoice_po"]
        ),
        "match_status_invoice_grn": (
            pairwise_statuses["invoice_grn"]
        ),
        "match_status_po_grn": (
            pairwise_statuses["po_grn"]
        ),
        "overall_match_type": summary.match_type.value,
        "overall_match_status": summary.overall_status(),
        "exception_summary": exception_summary,
        "ai_match_reason": explanation.get(
            "ai_match_reason"
        ),
        "ai_recommended_action": explanation.get(
            "recommended_action"
        ),
        "ai_decision_source": explanation.get("source"),
        "ai_model": explanation.get("model"),
        "ai_prompt_version": explanation.get(
            "prompt_version"
        ),
        "ai_confidence": explanation.get("confidence"),
        "ai_decided_at": explanation.get("generated_at"),
        "engine_version": VALIDATION_ENGINE_VERSION,
        "is_current": True,
        "is_demo": bool(
            str(
                invoice_document.get("source_batch") or ""
            ).startswith("controlled_match_scenarios")
        ),
        "scenario_code": scenario.get("code"),
        "scenario_name": scenario.get("name"),
        "expected_match_type": scenario.get(
            "expected_match_type"
        ),
        "expected_match_status": scenario.get(
            "expected_match_status"
        ),
    }
    result = (
        supabase
        .table("document_match_records")
        .insert(record)
        .execute()
    )
    return result.data[0]


def validate_document(invoice_header_id):
    from app.services.match_explanation_service import (
        get_match_explanation_with_oci,
    )
    from app.services.match_record_service import (
        build_detailed_exception_summary,
        build_pairwise_statuses,
        normalize_grn_extraction,
        normalize_po_extraction,
    )

    invoice_header = _get_one(
        "invoice_headers",
        "id",
        invoice_header_id,
    )

    if invoice_header is None:
        raise ValueError(
            f"Invoice header not found: {invoice_header_id}"
        )

    invoice_document = _get_one(
        "ap_documents",
        "id",
        invoice_header.get("document_id"),
    )
    if invoice_document is None:
        raise ValueError(
            "Invoice AP document was not found."
        )

    po_document = _get_latest_chain_document(
        invoice_document.get("document_chain_id"),
        "purchase_order",
    )
    grn_document = _get_latest_chain_document(
        invoice_document.get("document_chain_id"),
        "grn",
    )

    invoice_lines = _get_many(
        "invoice_lines",
        "invoice_id",
        invoice_header_id,
    )

    reference_po = None
    reference_po_lines = []
    if po_document:
        reference_po, reference_po_lines = (
            normalize_po_extraction(
                document=po_document,
                extraction=_get_latest_extraction(
                    po_document.get("id")
                ),
            )
        )

    reference_grn = None
    reference_grn_lines = []
    if grn_document:
        reference_grn, reference_grn_lines = (
            normalize_grn_extraction(
                document=grn_document,
                extraction=_get_latest_extraction(
                    grn_document.get("id")
                ),
            )
        )

    tolerance_rules = load_active_tolerance_rules(
        supabase
    )

    summary = validate_invoice_data(
        invoice_header=invoice_header,
        invoice_lines=invoice_lines,
        reference_po=reference_po,
        reference_po_lines=reference_po_lines,
        reference_grn=reference_grn,
        reference_grn_lines=reference_grn_lines,
        tolerance_rules=tolerance_rules,
    )

    pairwise_statuses = build_pairwise_statuses(
        summary=summary,
        invoice_header=invoice_header,
        invoice_lines=invoice_lines,
        po_header=reference_po,
        po_lines=reference_po_lines,
        grn_header=reference_grn,
        grn_lines=reference_grn_lines,
    )
    exception_summary = (
        build_detailed_exception_summary(
            summary=summary,
            invoice_header=invoice_header,
            invoice_lines=invoice_lines,
            po_header=reference_po,
            po_lines=reference_po_lines,
            grn_header=reference_grn,
            grn_lines=reference_grn_lines,
        )
    )
    explanation = get_match_explanation_with_oci(
        _matching_facts(
            summary=summary,
            invoice_header=invoice_header,
            po_header=reference_po,
            grn_header=reference_grn,
            pairwise_statuses=pairwise_statuses,
            exception_summary=exception_summary,
        )
    )

    document_id = invoice_header.get("document_id")
    validation_run_id = save_validation_results(
        document_id,
        summary,
        exception_summary=exception_summary,
    )
    stage = update_document_stage(
        document_id,
        summary,
        exception_summary=exception_summary,
    )
    match_record = _save_document_match_record(
        invoice_document=invoice_document,
        po_document=po_document,
        grn_document=grn_document,
        invoice_header=invoice_header,
        invoice_lines=invoice_lines,
        po_header=reference_po,
        po_lines=reference_po_lines,
        grn_header=reference_grn,
        grn_lines=reference_grn_lines,
        summary=summary,
        pairwise_statuses=pairwise_statuses,
        exception_summary=exception_summary,
        explanation=explanation,
        validation_run_id=validation_run_id,
    )

    return {
        "summary": summary,
        "match_type": summary.match_type.value,
        "match_type_source": summary.match_type_source,
        "overall_status": summary.overall_status(),
        "stage": stage,
        "invoice_header": invoice_header,
        "reference_po": reference_po,
        "reference_grn": reference_grn,
        "po_document": po_document,
        "grn_document": grn_document,
        "pairwise_statuses": pairwise_statuses,
        "exception_summary": exception_summary,
        "match_explanation": explanation,
        "document_match_record": match_record,
    }


def revalidate_chain_invoices(source_document_id):
    (
        supabase
        .rpc(
            "refresh_document_chain",
            {"target_document_id": source_document_id},
        )
        .execute()
    )
    source_document = _get_one(
        "ap_documents",
        "id",
        source_document_id,
    )
    if (
        source_document is None
        or not source_document.get("document_chain_id")
    ):
        return []

    invoices = (
        supabase
        .table("ap_documents")
        .select("id")
        .eq(
            "document_chain_id",
            source_document.get("document_chain_id"),
        )
        .eq("document_type", "invoice")
        .eq("is_active", True)
        .execute()
    )
    results = []
    for invoice_document in invoices.data or []:
        invoice_header = _get_one(
            "invoice_headers",
            "document_id",
            invoice_document.get("id"),
        )
        if invoice_header:
            results.append(
                validate_document(invoice_header.get("id"))
            )
    return results
