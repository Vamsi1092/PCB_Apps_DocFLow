import unittest

from app.services.validation_service import (
    CheckStatus,
    MatchType,
    calculate_deviation,
    select_match_type,
    validate_invoice_data,
)


AMOUNT_TOLERANCE = [{
    "id": "rule-amount-usd",
    "rule_name": "Standard Amount Tolerance",
    "check_type": "amount_tolerance",
    "threshold_pct": 5,
    "threshold_amt": None,
    "currency": "USD",
    "active": True,
}]


def _invoice(**overrides):
    result = {
        "id": "invoice-1",
        "document_id": "document-1",
        "supplier_id": "supplier-1",
        "invoice_number": "INV-1",
        "po_number": "PO-1",
        "currency": "USD",
        "total_amount": 100,
        "payment_terms": "NET 30",
        "gl_account": None,
        "cost_center": None,
    }
    result.update(overrides)
    return result


def _po(**overrides):
    result = {
        "id": "po-1",
        "po_number": "PO-1",
        "supplier_id": "supplier-1",
        "currency": "USD",
        "total_amount": 100,
        "payment_terms": "NET 30",
        "match_type": "2_WAY",
    }
    result.update(overrides)
    return result


def _invoice_line(**overrides):
    result = {
        "line_number": 1,
        "description": "Widget",
        "quantity": 10,
        "unit_price": 10,
        "amount": 100,
    }
    result.update(overrides)
    return result


def _po_line(**overrides):
    result = {
        "id": "po-line-1",
        "line_number": 1,
        "description": "Widget",
        "ordered_quantity": 10,
        "unit_price": 10,
        "line_amount": 100,
    }
    result.update(overrides)
    return result


class MatchStrategyTests(unittest.TestCase):
    def test_missing_reference_po_selects_unmatched(self):
        self.assertEqual(
            select_match_type(
                _invoice(),
                None,
                None,
            ),
            MatchType.UNMATCHED,
        )

    def test_reference_po_without_grn_selects_two_way(self):
        self.assertEqual(
            select_match_type(_invoice(), _po(), None),
            MatchType.TWO_WAY,
        )

    def test_po_and_grn_select_three_way_despite_stored_label(self):
        self.assertEqual(
            select_match_type(
                _invoice(),
                _po(match_type="2_WAY"),
                {"id": "grn-1"},
            ),
            MatchType.THREE_WAY,
        )


class MissingValueSafetyTests(unittest.TestCase):
    def test_none_supplier_ids_do_not_match(self):
        summary = validate_invoice_data(
            invoice_header=_invoice(supplier_id=None),
            invoice_lines=[],
            reference_po=_po(supplier_id=None),
            reference_po_lines=[],
            reference_grn=None,
            reference_grn_lines=[],
            tolerance_rules=AMOUNT_TOLERANCE,
        )

        supplier_check = summary.get("supplier_match")

        self.assertEqual(
            supplier_check.status,
            CheckStatus.NOT_AVAILABLE,
        )
        self.assertIsNone(supplier_check.passed)

    def test_description_matching_ignores_whitespace_layout(self):
        summary = validate_invoice_data(
            invoice_header=_invoice(),
            invoice_lines=[
                _invoice_line(
                    description="Medical monitor\nSerial: ABC123",
                )
            ],
            reference_po=_po(),
            reference_po_lines=[
                _po_line(
                    description="Medical monitor Serial: ABC123",
                )
            ],
            reference_grn=None,
            reference_grn_lines=[],
            tolerance_rules=AMOUNT_TOLERANCE,
        )

        self.assertEqual(
            summary.get("description_match").status,
            CheckStatus.PASS,
        )

    def test_missing_quantities_are_not_coerced_to_zero(self):
        summary = validate_invoice_data(
            invoice_header=_invoice(),
            invoice_lines=[_invoice_line(quantity=None)],
            reference_po=_po(),
            reference_po_lines=[_po_line(ordered_quantity=None)],
            reference_grn=None,
            reference_grn_lines=[],
            tolerance_rules=AMOUNT_TOLERANCE,
        )

        quantity_check = summary.get("quantity_match")

        self.assertEqual(
            quantity_check.status,
            CheckStatus.NOT_AVAILABLE,
        )
        self.assertIsNone(quantity_check.deviation_pct)

    def test_two_way_marks_grn_not_applicable(self):
        summary = validate_invoice_data(
            invoice_header=_invoice(),
            invoice_lines=[_invoice_line()],
            reference_po=_po(match_type="2_WAY"),
            reference_po_lines=[_po_line()],
            reference_grn=None,
            reference_grn_lines=[],
            tolerance_rules=AMOUNT_TOLERANCE,
        )

        grn_check = summary.get("grn_exists")

        self.assertEqual(
            grn_check.status,
            CheckStatus.NOT_APPLICABLE,
        )
        self.assertTrue(summary.passed())

    def test_missing_grn_is_a_valid_two_way_match(self):
        summary = validate_invoice_data(
            invoice_header=_invoice(),
            invoice_lines=[_invoice_line()],
            reference_po=_po(match_type="3_WAY"),
            reference_po_lines=[_po_line()],
            reference_grn=None,
            reference_grn_lines=[],
            tolerance_rules=AMOUNT_TOLERANCE,
        )

        grn_check = summary.get("grn_exists")

        self.assertEqual(grn_check.status, CheckStatus.NOT_APPLICABLE)
        self.assertEqual(summary.match_type, MatchType.TWO_WAY)

    def test_no_reference_po_is_unmatched(self):
        summary = validate_invoice_data(
            invoice_header=_invoice(
                po_number=None,
                gl_account="6100",
                cost_center="OPS",
            ),
            invoice_lines=[],
            reference_po=None,
            reference_po_lines=[],
            reference_grn=None,
            reference_grn_lines=[],
            tolerance_rules=AMOUNT_TOLERANCE,
        )

        self.assertEqual(summary.match_type, MatchType.UNMATCHED)
        self.assertEqual(
            summary.get("po_exists").status,
            CheckStatus.FAIL,
        )
        self.assertEqual(summary.overall_status(), "UNMATCHED")

    def test_quantity_comparison_uses_summed_lines(self):
        summary = validate_invoice_data(
            invoice_header=_invoice(),
            invoice_lines=[
                _invoice_line(line_number=1, quantity=4),
                _invoice_line(line_number=2, quantity=6),
            ],
            reference_po=_po(),
            reference_po_lines=[
                _po_line(line_number=1, ordered_quantity=5),
                _po_line(line_number=2, ordered_quantity=5),
            ],
            reference_grn=None,
            reference_grn_lines=[],
            tolerance_rules=AMOUNT_TOLERANCE,
        )

        total_check = summary.get("total_quantity_match")
        self.assertEqual(total_check.status, CheckStatus.PASS)
        self.assertEqual(total_check.matched_value, 10)
        self.assertEqual(total_check.expected_value, 10)

    def test_three_way_compares_summed_grn_quantity(self):
        summary = validate_invoice_data(
            invoice_header=_invoice(),
            invoice_lines=[_invoice_line(quantity=10)],
            reference_po=_po(match_type="2_WAY"),
            reference_po_lines=[_po_line(ordered_quantity=10)],
            reference_grn={"id": "grn-1", "grn_number": "GRN-1"},
            reference_grn_lines=[{
                "line_number": 1,
                "description": "Widget",
                "received_quantity": 9,
            }],
            tolerance_rules=AMOUNT_TOLERANCE,
        )

        self.assertEqual(summary.match_type, MatchType.THREE_WAY)
        self.assertEqual(
            summary.get("three_way_total_quantity_match").status,
            CheckStatus.FAIL,
        )
        self.assertEqual(summary.overall_status(), "VARIANCE")
        self.assertEqual(summary.two_way_status(), "MATCHED")
        self.assertEqual(summary.three_way_status(), "VARIANCE")
        self.assertIn(
            "three way total quantity",
            summary.exception_summary().lower(),
        )

    def test_two_way_exposes_two_way_status_only(self):
        summary = validate_invoice_data(
            invoice_header=_invoice(),
            invoice_lines=[_invoice_line()],
            reference_po=_po(),
            reference_po_lines=[_po_line()],
            reference_grn=None,
            reference_grn_lines=[],
            tolerance_rules=AMOUNT_TOLERANCE,
        )

        self.assertEqual(summary.two_way_status(), "MATCHED")
        self.assertIsNone(summary.three_way_status())
        self.assertIsNone(summary.exception_summary())


class DeviationAndToleranceTests(unittest.TestCase):
    def test_percentage_uses_expected_value_as_denominator(self):
        absolute, percentage = calculate_deviation(105, 100)

        self.assertEqual(absolute, 5)
        self.assertEqual(percentage, 5)

    def test_zero_expected_value_has_undefined_percentage(self):
        absolute, percentage = calculate_deviation(10, 0)

        self.assertEqual(absolute, 10)
        self.assertIsNone(percentage)

    def test_amount_inside_database_percentage_tolerance_passes(self):
        summary = validate_invoice_data(
            invoice_header=_invoice(total_amount=104),
            invoice_lines=[],
            reference_po=_po(total_amount=100),
            reference_po_lines=[],
            reference_grn=None,
            reference_grn_lines=[],
            tolerance_rules=AMOUNT_TOLERANCE,
        )

        amount_check = summary.get("amount_match")

        self.assertEqual(amount_check.status, CheckStatus.PASS)
        self.assertEqual(amount_check.deviation_abs, 4)
        self.assertEqual(amount_check.deviation_pct, 4)
        self.assertEqual(
            amount_check.tolerance_rule_id,
            "rule-amount-usd",
        )

    def test_amount_outside_database_percentage_tolerance_fails(self):
        summary = validate_invoice_data(
            invoice_header=_invoice(total_amount=106),
            invoice_lines=[],
            reference_po=_po(total_amount=100),
            reference_po_lines=[],
            reference_grn=None,
            reference_grn_lines=[],
            tolerance_rules=AMOUNT_TOLERANCE,
        )

        amount_check = summary.get("amount_match")

        self.assertEqual(amount_check.status, CheckStatus.FAIL)
        self.assertEqual(amount_check.deviation_pct, 6)


if __name__ == "__main__":
    unittest.main()
