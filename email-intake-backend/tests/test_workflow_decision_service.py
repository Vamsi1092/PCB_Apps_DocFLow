import unittest

from app.services.workflow_decision_service import (
    build_workflow_decision,
)


class WorkflowDecisionServiceTests(unittest.TestCase):
    def test_pre_validation_invoice_is_pending_matching(self):
        decision = build_workflow_decision(
            document_type="Invoice",
            header={
                "invoice_number": "INV-1",
                "po_number": "PO-1",
                "currency": "USD",
                "total_amount": 100,
            },
            supplier_resolved=True,
            extraction_confidence=0.95,
            extraction_status="completed",
        )

        self.assertEqual(decision["priority"], "medium")
        self.assertEqual(
            decision["recommended_action_code"],
            "REVIEW_DOCUMENT",
        )
        self.assertEqual(decision["facts"]["match_type"], "2_WAY")

    def test_completed_three_way_match_is_approval_ready(self):
        decision = build_workflow_decision(
            document_type="Invoice",
            header={
                "invoice_number": "INV-1",
                "po_number": "PO-1",
                "currency": "USD",
                "total_amount": 100,
            },
            supplier_resolved=True,
            extraction_confidence=0.95,
            extraction_status="completed",
            validation_checks=[
                {
                    "check_type": "po_exists",
                    "passed": True,
                },
                {
                    "check_type": "grn_exists",
                    "passed": True,
                },
                {
                    "check_type": "three_way_quantity_match",
                    "passed": True,
                },
            ],
            validation_completed=True,
        )

        self.assertEqual(decision["priority"], "low")
        self.assertEqual(
            decision["recommended_action_code"],
            "REVIEW_AND_APPROVE",
        )
        self.assertEqual(decision["facts"]["match_type"], "3_WAY")

    def test_validation_exception_is_grounded(self):
        decision = build_workflow_decision(
            document_type="Invoice",
            header={
                "invoice_number": "INV-1",
                "po_number": "PO-1",
                "currency": "USD",
                "total_amount": 100,
            },
            supplier_resolved=True,
            extraction_confidence=0.95,
            extraction_status="completed",
            validation_checks=[
                {
                    "check_type": "amount_match",
                    "passed": False,
                },
            ],
            validation_completed=True,
        )

        self.assertEqual(decision["priority"], "high")
        self.assertEqual(
            decision["recommended_action_code"],
            "REVIEW_AMOUNT_VARIANCE",
        )
        self.assertEqual(
            decision["facts"]["failed_checks"],
            ["amount_match"],
        )

    def test_unresolved_supplier_is_not_overridden_by_ai_action(self):
        decision = build_workflow_decision(
            document_type="Invoice",
            header={
                "invoice_number": "INV-1",
                "po_number": "PO-1",
                "currency": "USD",
                "total_amount": 100,
            },
            supplier_resolved=False,
            extraction_confidence=0.95,
            extraction_status="completed",
        )

        self.assertEqual(decision["priority"], "high")
        self.assertEqual(
            decision["recommended_action_code"],
            "RESOLVE_SUPPLIER",
        )
        self.assertEqual(decision["source"], "rules")

    def test_unavailable_validation_is_in_decision_facts(self):
        decision = build_workflow_decision(
            document_type="Invoice",
            header={
                "invoice_number": "INV-1",
                "po_number": "PO-1",
                "currency": "USD",
                "total_amount": 100,
            },
            supplier_resolved=True,
            extraction_confidence=0.95,
            extraction_status="completed",
            validation_checks=[{
                "check_type": "quantity_match",
                "status": "NOT_AVAILABLE",
                "passed": None,
            }],
            validation_completed=True,
        )

        self.assertEqual(
            decision["facts"]["unavailable_checks"],
            ["quantity_match"],
        )
        self.assertEqual(decision["priority"], "medium")


if __name__ == "__main__":
    unittest.main()
