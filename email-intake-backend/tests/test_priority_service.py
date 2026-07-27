import unittest
from datetime import date

from app.services.priority_service import (
    build_priority_facts,
    determine_priority,
)


class PriorityServiceTests(unittest.TestCase):
    def test_failed_extraction_is_critical(self):
        facts = build_priority_facts(
            document_type="Invoice",
            supplier_resolved=False,
            po_available=False,
            extraction_status="failed",
            extraction_confidence=0.0,
        )

        decision = determine_priority(
            facts,
            today=date(2026, 7, 23),
        )

        self.assertEqual(decision.priority, "critical")
        self.assertIn("extraction failed", decision.reason.lower())

    def test_unresolved_supplier_is_high(self):
        facts = build_priority_facts(
            document_type="invoice",
            supplier_resolved=False,
            po_available=True,
            extraction_status="completed",
            extraction_confidence=0.95,
        )

        decision = determine_priority(facts)

        self.assertEqual(decision.priority, "high")
        self.assertIn("supplier", decision.reason.lower())

    def test_missing_invoice_po_is_high(self):
        facts = build_priority_facts(
            document_type="invoice",
            supplier_resolved=True,
            po_available=False,
            extraction_status="completed",
            extraction_confidence=0.95,
        )

        decision = determine_priority(facts)

        self.assertEqual(decision.priority, "high")
        self.assertIn("purchase order", decision.reason.lower())

    def test_high_impact_validation_failure_is_high(self):
        facts = build_priority_facts(
            document_type="invoice",
            supplier_resolved=True,
            po_available=True,
            failed_checks=["amount_match"],
            extraction_status="completed",
            extraction_confidence=0.95,
            validation_completed=True,
        )

        decision = determine_priority(facts)

        self.assertEqual(decision.priority, "high")
        self.assertIn("amount_match", decision.reason)

    def test_due_within_two_days_is_medium(self):
        facts = build_priority_facts(
            document_type="invoice",
            supplier_resolved=True,
            po_available=True,
            extraction_status="completed",
            extraction_confidence=0.95,
            due_date="2026-07-25",
            validation_completed=True,
        )

        decision = determine_priority(
            facts,
            today=date(2026, 7, 23),
        )

        self.assertEqual(decision.priority, "medium")
        self.assertIn("within two days", decision.reason.lower())

    def test_overdue_document_with_failure_is_critical(self):
        facts = build_priority_facts(
            document_type="invoice",
            supplier_resolved=True,
            po_available=True,
            failed_checks=["description_match"],
            extraction_status="completed",
            extraction_confidence=0.95,
            due_date="2026-07-20",
            validation_completed=True,
        )

        decision = determine_priority(
            facts,
            today=date(2026, 7, 23),
        )

        self.assertEqual(decision.priority, "critical")
        self.assertIn("overdue", decision.reason.lower())

    def test_clean_validated_invoice_is_low(self):
        facts = build_priority_facts(
            document_type="invoice",
            supplier_resolved=True,
            po_available=True,
            extraction_status="completed",
            extraction_confidence=0.95,
            validation_completed=True,
        )

        decision = determine_priority(facts)

        self.assertEqual(decision.priority, "low")
        self.assertIn("all completed validation checks passed", decision.reason)

    def test_facts_are_safe_to_store_as_json(self):
        facts = build_priority_facts(
            document_type="Purchase Order",
            supplier_resolved=True,
            po_available=True,
            failed_checks=["Currency_Match", "currency_match"],
            missing_fields=["buyer", "buyer"],
            extraction_confidence="2.0",
            due_date="not-a-date",
        )

        stored = facts.to_dict()

        self.assertEqual(stored["document_type"], "purchase_order")
        self.assertEqual(stored["failed_checks"], ["currency_match"])
        self.assertEqual(stored["missing_fields"], ["buyer"])
        self.assertEqual(stored["extraction_confidence"], 1.0)
        self.assertIsNone(stored["due_date"])


if __name__ == "__main__":
    unittest.main()
