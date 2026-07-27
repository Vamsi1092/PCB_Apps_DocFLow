from copy import deepcopy
from decimal import Decimal


SOURCE_BATCH = "controlled_match_scenarios_v1"

SCENARIOS = [
    {
        "code": "S01_NO_PO_UNMATCHED",
        "name": "No PO - Unmatched",
        "invoice_document_id": (
            "816f1e1a-58f6-4d18-9dd7-a935bf836c74"
        ),
        "invoice_number": "90815741",
        "expected_match_type": "UNMATCHED",
        "expected_match_status": "UNMATCHED",
        "create_po": False,
        "create_grn": False,
    },
    {
        "code": "S02_TWO_WAY_MATCHED",
        "name": "2-Way Matched",
        "invoice_document_id": (
            "67977f1c-50cc-4f2f-8075-cd2b343beb54"
        ),
        "invoice_number": "905879",
        "expected_match_type": "2_WAY",
        "expected_match_status": "MATCHED",
        "create_po": True,
        "create_grn": False,
        "invoice_header_overrides": {
            "payment_terms": "Credit Card",
        },
    },
    {
        "code": "S03_TWO_WAY_AMOUNT_VARIANCE",
        "name": "2-Way Amount Variance",
        "invoice_document_id": (
            "038aeef7-0003-4ebd-a7a3-1e756726a9e2"
        ),
        "invoice_number": "9484",
        "expected_match_type": "2_WAY",
        "expected_match_status": "VARIANCE",
        "create_po": True,
        "create_grn": False,
        "po_total_delta": 100,
    },
    {
        "code": "S04_TWO_WAY_QUANTITY_VARIANCE",
        "name": "2-Way Quantity Variance",
        "invoice_document_id": (
            "db852182-7a72-4f32-b537-acdca7e2b528"
        ),
        "invoice_number": "10614771",
        "expected_match_type": "2_WAY",
        "expected_match_status": "VARIANCE",
        "create_po": True,
        "create_grn": False,
        "po_line_overrides": {
            2: {"ordered_quantity": 2},
        },
    },
    {
        "code": "S05_THREE_WAY_MATCHED",
        "name": "3-Way Matched",
        "invoice_document_id": (
            "5d14d1d4-1975-484f-bdd1-1c63653a07b4"
        ),
        "invoice_number": "35832709",
        "expected_match_type": "3_WAY",
        "expected_match_status": "MATCHED",
        "create_po": True,
        "create_grn": True,
    },
    {
        "code": "S06_THREE_WAY_AMOUNT_VARIANCE",
        "name": "3-Way Amount Variance",
        "invoice_document_id": (
            "822d594d-71f6-42ae-90f7-879bf4eed8fc"
        ),
        "invoice_number": "35404276",
        "expected_match_type": "3_WAY",
        "expected_match_status": "VARIANCE",
        "create_po": True,
        "create_grn": True,
        "invoice_header_overrides": {
            "po_number": "913077",
        },
        "po_total_delta": 500,
    },
    {
        "code": "S07_THREE_WAY_GRN_QUANTITY_VARIANCE",
        "name": "3-Way GRN Quantity Variance",
        "invoice_document_id": (
            "ccdca12b-ca90-4b80-9be9-088dfdea4845"
        ),
        "invoice_number": "1913636",
        "expected_match_type": "3_WAY",
        "expected_match_status": "VARIANCE",
        "create_po": True,
        "create_grn": True,
        "invoice_line_overrides": {
            1: {
                "quantity": 130903,
                "unit": "LBS",
                "unit_price": 47.25,
            },
        },
        "grn_line_overrides": {
            1: {"received_quantity": 125000},
        },
    },
]


def select_scenarios(scenario_code=None):
    if not scenario_code:
        return SCENARIOS

    selected = [
        scenario
        for scenario in SCENARIOS
        if scenario["code"] == scenario_code
    ]
    if not selected:
        raise ValueError(
            "Unknown controlled scenario code: "
            f"{scenario_code}"
        )
    return selected


def _decimal(value):
    return Decimal(str(value or 0))


def _apply_line_overrides(lines, overrides):
    for line in lines:
        line_number = int(line.get("line_number") or 0)
        line.update((overrides or {}).get(line_number, {}))


def build_scenario_payload(
    *,
    scenario,
    invoice_header,
    invoice_lines,
    supplier_name,
):
    invoice_header = deepcopy(invoice_header)
    invoice_lines = deepcopy(invoice_lines)
    invoice_header.update(
        scenario.get("invoice_header_overrides") or {}
    )
    _apply_line_overrides(
        invoice_lines,
        scenario.get("invoice_line_overrides"),
    )
    invoice_header["supplier_name"] = supplier_name

    po_header = None
    po_lines = []
    if scenario.get("create_po"):
        po_lines = []
        for line in invoice_lines:
            po_lines.append({
                "line_number": line.get("line_number"),
                "item_code": line.get("item_code"),
                "description": line.get("description"),
                "ordered_quantity": line.get("quantity"),
                "unit": line.get("unit") or "EA",
                "unit_price": line.get("unit_price"),
                "line_amount": line.get("amount"),
            })
        _apply_line_overrides(
            po_lines,
            scenario.get("po_line_overrides"),
        )

        line_total = sum(
            _decimal(line.get("line_amount"))
            for line in po_lines
        )
        invoice_total = _decimal(
            invoice_header.get("total_amount")
        )
        base_other = invoice_total - line_total
        delta = _decimal(
            scenario.get("po_total_delta")
        )
        po_header = {
            "po_number": invoice_header.get("po_number"),
            "supplier_id": invoice_header.get("supplier_id"),
            "supplier_name": supplier_name,
            "po_date": invoice_header.get("invoice_date"),
            "currency": invoice_header.get("currency"),
            "subtotal": float(line_total),
            "other_amount": float(base_other),
            "scenario_adjustment": float(delta),
            "total_amount": float(invoice_total + delta),
            "payment_terms": invoice_header.get(
                "payment_terms"
            ),
        }

    grn_header = None
    grn_lines = []
    if scenario.get("create_grn"):
        grn_header = {
            "grn_number": (
                f"GRN-{invoice_header.get('po_number')}"
            ),
            "po_number": invoice_header.get("po_number"),
            "supplier_id": invoice_header.get("supplier_id"),
            "supplier_name": supplier_name,
            "received_date": invoice_header.get(
                "invoice_date"
            ),
        }
        for line in po_lines:
            grn_lines.append({
                "line_number": line.get("line_number"),
                "item_code": line.get("item_code"),
                "description": line.get("description"),
                "received_quantity": line.get(
                    "ordered_quantity"
                ),
                "unit": line.get("unit") or "EA",
            })
        _apply_line_overrides(
            grn_lines,
            scenario.get("grn_line_overrides"),
        )

    return {
        "scenario": deepcopy(scenario),
        "invoice_header": invoice_header,
        "invoice_lines": invoice_lines,
        "po_header": po_header,
        "po_lines": po_lines,
        "grn_header": grn_header,
        "grn_lines": grn_lines,
    }
