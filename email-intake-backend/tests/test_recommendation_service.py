import unittest

from app.services.priority_service import build_priority_facts
from app.services.recommendation_service import (
    RecommendedActionCode,
    recommend_action,
)


class RecommendationServiceTests(unittest.TestCase):
    def test_failed_extraction_recommends_retry(self):
        facts = build_priority_facts(
            document_type="invoice",
            supplier_resolved=False,
            po_available=False,
            extraction_status="failed",
            extraction_confidence=0.0,
        )

        action = recommend_action(facts)

        self.assertEqual(
            action.code,
            RecommendedActionCode.RETRY_EXTRACTION,
        )

    def test_unresolved_supplier_precedes_matching_actions(self):
        facts = build_priority_facts(
            document_type="invoice",
            supplier_resolved=False,
            po_available=True,
            failed_checks=["amount_match"],
            extraction_status="completed",
            extraction_confidence=0.95,
            validation_completed=True,
        )

        action = recommend_action(facts)

        self.assertEqual(
            action.code,
            RecommendedActionCode.RESOLVE_SUPPLIER,
        )

    def test_missing_po_has_canonical_action(self):
        facts = build_priority_facts(
            document_type="invoice",
            supplier_resolved=True,
            po_available=False,
            extraction_status="completed",
            extraction_confidence=0.95,
        )

        action = recommend_action(facts)

        self.assertEqual(
            action.code,
            RecommendedActionCode.REQUEST_MISSING_PO,
        )

    def test_amount_failure_recommends_amount_review(self):
        facts = build_priority_facts(
            document_type="invoice",
            supplier_resolved=True,
            po_available=True,
            failed_checks=["amount_match"],
            validation_completed=True,
        )

        action = recommend_action(facts)

        self.assertEqual(
            action.code,
            RecommendedActionCode.REVIEW_AMOUNT_VARIANCE,
        )

    def test_quantity_failure_recommends_quantity_review(self):
        facts = build_priority_facts(
            document_type="invoice",
            supplier_resolved=True,
            po_available=True,
            failed_checks=["three_way_quantity_match"],
            validation_completed=True,
        )

        action = recommend_action(facts)

        self.assertEqual(
            action.code,
            RecommendedActionCode.REVIEW_QUANTITY_VARIANCE,
        )

    def test_three_way_missing_grn_requests_grn(self):
        facts = build_priority_facts(
            document_type="invoice",
            supplier_resolved=True,
            po_available=True,
            grn_available=False,
            three_way_required=True,
            failed_checks=["grn_exists"],
            validation_completed=True,
        )

        action = recommend_action(facts)

        self.assertEqual(
            action.code,
            RecommendedActionCode.REQUEST_MISSING_GRN,
        )

    def test_two_way_missing_grn_does_not_request_grn(self):
        facts = build_priority_facts(
            document_type="invoice",
            supplier_resolved=True,
            po_available=True,
            grn_available=False,
            three_way_required=False,
            validation_completed=True,
        )

        action = recommend_action(facts)

        self.assertEqual(
            action.code,
            RecommendedActionCode.REVIEW_AND_APPROVE,
        )

    def test_clean_validation_recommends_review_and_approve(self):
        facts = build_priority_facts(
            document_type="invoice",
            supplier_resolved=True,
            po_available=True,
            validation_completed=True,
        )

        action = recommend_action(facts)
        stored = action.to_dict()

        self.assertEqual(
            action.code,
            RecommendedActionCode.REVIEW_AND_APPROVE,
        )
        self.assertEqual(stored["code"], "REVIEW_AND_APPROVE")
        self.assertEqual(stored["source"], "rules")


if __name__ == "__main__":
    unittest.main()
