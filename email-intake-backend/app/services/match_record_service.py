from decimal import Decimal, InvalidOperation
from typing import Iterable, Mapping, Optional

from app.services.validation_service import (
    CheckStatus,
    MatchType,
    ValidationSummary,
)


PAIR_MATCHED = "MATCHED"
PAIR_VARIANCE = "VARIANCE"
PAIR_UNMATCHED = "UNMATCHED"
PAIR_NOT_AVAILABLE = "NOT_AVAILABLE"
PAIR_NOT_APPLICABLE = "NOT_APPLICABLE"


def _decimal(value) -> Optional[Decimal]:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _sum_required(
    lines: Iterable[Mapping],
    field: str,
) -> Optional[Decimal]:
    lines = list(lines or [])
    if not lines:
        return None
    total = Decimal("0")
    for line in lines:
        value = _decimal(line.get(field))
        if value is None:
            return None
        total += value
    return total


def _normalize_text(value) -> Optional[str]:
    if value is None:
        return None
    normalized = " ".join(str(value).split()).strip().upper()
    return normalized or None


def _summary_status(results) -> str:
    results = list(results)
    if any(result.status == CheckStatus.FAIL for result in results):
        return PAIR_VARIANCE
    if any(
        result.status == CheckStatus.NOT_AVAILABLE
        for result in results
    ):
        return PAIR_NOT_AVAILABLE
    return PAIR_MATCHED


def _quantity_pair_status(
    *,
    left_header: Mapping,
    left_lines: Iterable[Mapping],
    left_quantity_field: str,
    right_header: Mapping,
    right_lines: Iterable[Mapping],
    right_quantity_field: str,
) -> str:
    missing = False
    variance = False

    left_supplier = left_header.get("supplier_id")
    right_supplier = right_header.get("supplier_id")
    if not left_supplier or not right_supplier:
        missing = True
    elif str(left_supplier) != str(right_supplier):
        variance = True

    left_total = _sum_required(left_lines, left_quantity_field)
    right_total = _sum_required(right_lines, right_quantity_field)
    if left_total is None or right_total is None:
        missing = True
    elif left_total != right_total:
        variance = True

    right_by_line = {
        line.get("line_number"): line
        for line in (right_lines or [])
        if line.get("line_number") is not None
    }
    for left_line in left_lines or []:
        line_number = left_line.get("line_number")
        right_line = right_by_line.get(line_number)
        if right_line is None:
            variance = True
            continue

        left_quantity = _decimal(
            left_line.get(left_quantity_field)
        )
        right_quantity = _decimal(
            right_line.get(right_quantity_field)
        )
        if left_quantity is None or right_quantity is None:
            missing = True
        elif left_quantity != right_quantity:
            variance = True

        left_description = _normalize_text(
            left_line.get("description")
        )
        right_description = _normalize_text(
            right_line.get("description")
        )
        if (
            left_description is None
            or right_description is None
        ):
            missing = True
        elif left_description != right_description:
            variance = True

    if variance:
        return PAIR_VARIANCE
    if missing:
        return PAIR_NOT_AVAILABLE
    return PAIR_MATCHED


def build_pairwise_statuses(
    *,
    summary: ValidationSummary,
    invoice_header: Mapping,
    invoice_lines: Iterable[Mapping],
    po_header: Optional[Mapping],
    po_lines: Iterable[Mapping],
    grn_header: Optional[Mapping],
    grn_lines: Iterable[Mapping],
) -> dict:
    if summary.match_type == MatchType.UNMATCHED:
        return {
            "invoice_po": PAIR_UNMATCHED,
            "invoice_grn": PAIR_NOT_APPLICABLE,
            "po_grn": PAIR_NOT_APPLICABLE,
        }

    invoice_po_results = [
        result
        for result in summary.results
        if result.check_type not in {
            "match_strategy",
            "po_exists",
            "grn_exists",
        }
        and not result.check_type.startswith("three_way_")
    ]
    invoice_po = _summary_status(invoice_po_results)

    if summary.match_type == MatchType.TWO_WAY:
        return {
            "invoice_po": invoice_po,
            "invoice_grn": PAIR_NOT_APPLICABLE,
            "po_grn": PAIR_NOT_APPLICABLE,
        }

    if grn_header is None:
        return {
            "invoice_po": invoice_po,
            "invoice_grn": PAIR_NOT_AVAILABLE,
            "po_grn": PAIR_NOT_AVAILABLE,
        }

    return {
        "invoice_po": invoice_po,
        "invoice_grn": _quantity_pair_status(
            left_header=invoice_header,
            left_lines=invoice_lines,
            left_quantity_field="quantity",
            right_header=grn_header,
            right_lines=grn_lines,
            right_quantity_field="received_quantity",
        ),
        "po_grn": _quantity_pair_status(
            left_header=po_header or {},
            left_lines=po_lines,
            left_quantity_field="ordered_quantity",
            right_header=grn_header,
            right_lines=grn_lines,
            right_quantity_field="received_quantity",
        ),
    }


def _money(value) -> str:
    decimal = _decimal(value)
    return (
        f"{decimal:,.2f}"
        if decimal is not None
        else "unavailable"
    )


def _quantity(value) -> str:
    decimal = _decimal(value)
    if decimal is None:
        return "unavailable"
    return f"{decimal:,.4f}".rstrip("0").rstrip(".")


def build_detailed_exception_summary(
    *,
    summary: ValidationSummary,
    invoice_header: Mapping,
    invoice_lines: Iterable[Mapping],
    po_header: Optional[Mapping],
    po_lines: Iterable[Mapping],
    grn_header: Optional[Mapping],
    grn_lines: Iterable[Mapping],
) -> Optional[str]:
    if summary.overall_status() == "MATCHED":
        return None

    if summary.match_type == MatchType.UNMATCHED:
        po_number = invoice_header.get("po_number") or "unknown"
        return (
            f"No purchase order document was found for PO "
            f"{po_number}; the invoice is unmatched."
        )

    problems = []
    amount_check = summary.get("amount_match")
    if amount_check and amount_check.status == CheckStatus.FAIL:
        currency = (
            invoice_header.get("currency")
            or (po_header or {}).get("currency")
            or ""
        )
        currency_prefix = f"{currency} " if currency else ""
        problems.append(
            "Invoice amount "
            f"{currency_prefix}{_money(invoice_header.get('total_amount'))} "
            "vs PO amount "
            f"{currency_prefix}{_money((po_header or {}).get('total_amount'))}; "
            f"delta {currency_prefix}{_money(amount_check.deviation_abs)}."
        )

    total_check = summary.get("total_quantity_match")
    if total_check and total_check.status in {
        CheckStatus.FAIL,
        CheckStatus.NOT_AVAILABLE,
    }:
        problems.append(
            "Invoice total quantity "
            f"{_quantity(_sum_required(invoice_lines, 'quantity'))} "
            "vs PO total quantity "
            f"{_quantity(_sum_required(po_lines, 'ordered_quantity'))}."
        )

    three_way_total = summary.get(
        "three_way_total_quantity_match"
    )
    if three_way_total and three_way_total.status in {
        CheckStatus.FAIL,
        CheckStatus.NOT_AVAILABLE,
    }:
        problems.append(
            "Three-way quantity comparison: invoice "
            f"{_quantity(_sum_required(invoice_lines, 'quantity'))}, "
            "PO "
            f"{_quantity(_sum_required(po_lines, 'ordered_quantity'))}, "
            "GRN "
            f"{_quantity(_sum_required(grn_lines, 'received_quantity'))}."
        )

    supplier_check = summary.get("supplier_match")
    if supplier_check and supplier_check.status in {
        CheckStatus.FAIL,
        CheckStatus.NOT_AVAILABLE,
    }:
        problems.append(
            "Supplier comparison did not reconcile between "
            "the invoice and PO."
        )

    if not problems:
        failed_labels = []
        for result in summary.results:
            if result.status not in {
                CheckStatus.FAIL,
                CheckStatus.NOT_AVAILABLE,
            }:
                continue
            label = result.check_type.replace("_", " ")
            if label not in failed_labels:
                failed_labels.append(label)
        if failed_labels:
            problems.append(
                "Review required for "
                + ", ".join(failed_labels)
                + "."
            )

    return " ".join(problems[:3]) or None


def normalize_po_extraction(
    *,
    document: Mapping,
    extraction: Mapping,
):
    header = dict(extraction.get("header") or {})
    line_items = extraction.get("line_items") or []
    po_header = {
        "document_id": document.get("id"),
        "po_number": (
            header.get("po_number")
            or extraction.get("document_number")
        ),
        "supplier_id": document.get("supplier_id"),
        "supplier_name": header.get("supplier_name"),
        "po_date": (
            header.get("po_date")
            or header.get("document_date")
        ),
        "currency": header.get("currency"),
        "total_amount": header.get("total_amount"),
        "payment_terms": header.get("payment_terms"),
        "shipping_amount": header.get("shipping_amount"),
    }
    po_lines = []
    for index, line in enumerate(line_items):
        po_lines.append({
            "line_number": line.get("line_number") or index + 1,
            "item_code": line.get("item_code"),
            "description": line.get("description"),
            "ordered_quantity": (
                line.get("ordered_quantity")
                if line.get("ordered_quantity") is not None
                else line.get("quantity")
            ),
            "unit": (
                line.get("unit")
                or line.get("quantity_uom")
            ),
            "unit_price": line.get("unit_price"),
            "line_amount": (
                line.get("line_amount")
                if line.get("line_amount") is not None
                else line.get("amount")
            ),
        })
    return po_header, po_lines


def normalize_grn_extraction(
    *,
    document: Mapping,
    extraction: Mapping,
):
    header = dict(extraction.get("header") or {})
    line_items = extraction.get("line_items") or []
    grn_header = {
        "document_id": document.get("id"),
        "grn_number": (
            header.get("grn_number")
            or extraction.get("document_number")
        ),
        "po_number": header.get("po_number"),
        "supplier_id": document.get("supplier_id"),
        "supplier_name": header.get("supplier_name"),
        "received_date": header.get("received_date"),
    }
    grn_lines = []
    for index, line in enumerate(line_items):
        received_quantity = line.get("received_quantity")
        if received_quantity is None:
            received_quantity = line.get("accepted_quantity")
        if received_quantity is None:
            received_quantity = line.get("quantity")
        grn_lines.append({
            "line_number": line.get("line_number") or index + 1,
            "item_code": line.get("item_code"),
            "description": line.get("description"),
            "received_quantity": received_quantity,
            "unit": (
                line.get("unit")
                or line.get("quantity_uom")
            ),
        })
    return grn_header, grn_lines


def build_document_snapshot(
    header: Mapping,
    lines: Iterable[Mapping],
) -> dict:
    excluded = {
        "bank_account",
        "notes",
        "raw_text",
        "body_full",
    }
    safe_header = {
        key: value
        for key, value in dict(header or {}).items()
        if key not in excluded
    }
    safe_lines = [
        {
            key: value
            for key, value in dict(line).items()
            if key not in {"raw_text"}
        }
        for line in (lines or [])
    ]
    return {
        "header": safe_header,
        "lines": safe_lines,
    }
