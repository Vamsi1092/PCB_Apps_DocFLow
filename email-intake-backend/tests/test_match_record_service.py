from app.services.match_record_service import (
    build_detailed_exception_summary,
    build_pairwise_statuses,
    normalize_grn_extraction,
    normalize_po_extraction,
)
from app.services.validation_service import validate_invoice_data


def _invoice():
    return {
        "invoice_number": "INV-1",
        "po_number": "PO-1",
        "supplier_id": "supplier-1",
        "supplier_name": "Supplier One",
        "currency": "USD",
        "total_amount": 100,
        "payment_terms": "NET 30",
    }


def _invoice_lines():
    return [{
        "line_number": 1,
        "description": "Widget",
        "quantity": 10,
        "unit_price": 10,
        "amount": 100,
    }]


def _po():
    return {
        "po_number": "PO-1",
        "supplier_id": "supplier-1",
        "supplier_name": "Supplier One",
        "currency": "USD",
        "total_amount": 100,
        "payment_terms": "NET 30",
    }


def _po_lines():
    return [{
        "line_number": 1,
        "description": "Widget",
        "ordered_quantity": 10,
        "unit_price": 10,
        "line_amount": 100,
    }]


def _grn():
    return {
        "grn_number": "GRN-PO-1",
        "po_number": "PO-1",
        "supplier_id": "supplier-1",
        "supplier_name": "Supplier One",
    }


def _grn_lines(quantity=10):
    return [{
        "line_number": 1,
        "description": "Widget",
        "received_quantity": quantity,
    }]


def _summary(po=None, grn=None, grn_quantity=10):
    return validate_invoice_data(
        invoice_header=_invoice(),
        invoice_lines=_invoice_lines(),
        reference_po=po,
        reference_po_lines=_po_lines() if po else [],
        reference_grn=grn,
        reference_grn_lines=(
            _grn_lines(grn_quantity) if grn else []
        ),
        tolerance_rules=[],
    )


def test_two_way_marks_grn_pairs_not_applicable():
    statuses = build_pairwise_statuses(
        summary=_summary(po=_po()),
        invoice_header=_invoice(),
        invoice_lines=_invoice_lines(),
        po_header=_po(),
        po_lines=_po_lines(),
        grn_header=None,
        grn_lines=[],
    )

    assert statuses == {
        "invoice_po": "MATCHED",
        "invoice_grn": "NOT_APPLICABLE",
        "po_grn": "NOT_APPLICABLE",
    }


def test_three_way_grn_quantity_variance_is_pair_specific():
    statuses = build_pairwise_statuses(
        summary=_summary(
            po=_po(),
            grn=_grn(),
            grn_quantity=8,
        ),
        invoice_header=_invoice(),
        invoice_lines=_invoice_lines(),
        po_header=_po(),
        po_lines=_po_lines(),
        grn_header=_grn(),
        grn_lines=_grn_lines(8),
    )

    assert statuses["invoice_po"] == "MATCHED"
    assert statuses["invoice_grn"] == "VARIANCE"
    assert statuses["po_grn"] == "VARIANCE"


def test_unmatched_has_explicit_pair_statuses():
    statuses = build_pairwise_statuses(
        summary=_summary(),
        invoice_header=_invoice(),
        invoice_lines=_invoice_lines(),
        po_header=None,
        po_lines=[],
        grn_header=None,
        grn_lines=[],
    )

    assert statuses == {
        "invoice_po": "UNMATCHED",
        "invoice_grn": "NOT_APPLICABLE",
        "po_grn": "NOT_APPLICABLE",
    }


def test_detailed_amount_exception_contains_values_and_delta():
    po = _po()
    po["total_amount"] = 125
    summary = validate_invoice_data(
        invoice_header=_invoice(),
        invoice_lines=_invoice_lines(),
        reference_po=po,
        reference_po_lines=_po_lines(),
        reference_grn=None,
        reference_grn_lines=[],
        tolerance_rules=[],
    )

    reason = build_detailed_exception_summary(
        summary=summary,
        invoice_header=_invoice(),
        invoice_lines=_invoice_lines(),
        po_header=po,
        po_lines=_po_lines(),
        grn_header=None,
        grn_lines=[],
    )

    assert "100.00" in reason
    assert "125.00" in reason
    assert "25.00" in reason


def test_normalizes_real_po_and_grn_extraction_payloads():
    po_header, po_lines = normalize_po_extraction(
        document={
            "id": "po-document",
            "supplier_id": "supplier-1",
        },
        extraction={
            "document_number": "PO-1",
            "header": {
                "currency": "USD",
                "total_amount": 100,
                "payment_terms": "NET 30",
            },
            "line_items": [{
                "line_number": 1,
                "description": "Widget",
                "quantity": 10,
                "unit_price": 10,
                "line_amount": 100,
            }],
        },
    )
    grn_header, grn_lines = normalize_grn_extraction(
        document={
            "id": "grn-document",
            "supplier_id": "supplier-1",
        },
        extraction={
            "document_number": "GRN-1",
            "header": {"po_number": "PO-1"},
            "line_items": [{
                "line_number": 1,
                "description": "Widget",
                "received_quantity": 10,
            }],
        },
    )

    assert po_header["po_number"] == "PO-1"
    assert po_lines[0]["ordered_quantity"] == 10
    assert grn_header["grn_number"] == "GRN-1"
    assert grn_lines[0]["received_quantity"] == 10
