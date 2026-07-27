import json
import unittest

from app.services.ai_decision_service import (
    get_workflow_decision_with_oci,
)


def _base_arguments():
    return {
        "document_type": "Invoice",
        "header": {
            "invoice_number": "INV-1",
            "po_number": "PO-1",
            "currency": "USD",
            "total_amount": 100,
        },
        "supplier_resolved": True,
        "extraction_confidence": 0.95,
        "extraction_status": "completed",
        "validation_checks": [
            {
                "check_type": "amount_match",
                "passed": False,
            },
        ],
        "validation_completed": True,
    }


class AIDecisionServiceTests(unittest.TestCase):
    def test_valid_oci_decision_is_primary(self):
        def fake_chat(**kwargs):
            self.assertIn(
                '"failed_checks": ["amount_match"]',
                kwargs["prompt"],
            )
            return json.dumps({
                "priority": "high",
                "ai_priority_reason": (
                    "The invoice has a verified amount mismatch."
                ),
                "recommended_action_code": (
                    "REVIEW_AMOUNT_VARIANCE"
                ),
                "recommended_action": (
                    "Review the amount variance before approval."
                ),
                "confidence": 0.96,
            })

        decision = get_workflow_decision_with_oci(
            **_base_arguments(),
            chat_callable=fake_chat,
        )

        self.assertEqual(decision["source"], "oci")
        self.assertEqual(decision["decision_mode"], "ai")
        self.assertEqual(decision["priority"], "high")
        self.assertEqual(
            decision["recommended_action_code"],
            "REVIEW_AMOUNT_VARIANCE",
        )
        self.assertFalse(decision["fallback_used"])
        self.assertEqual(
            decision["facts"]["failed_checks"],
            ["amount_match"],
        )
        self.assertIn(
            "evaluation_date",
            decision["facts"],
        )

    def test_code_fenced_json_is_accepted(self):
        def fake_chat(**kwargs):
            return """```json
            {
              "priority": "medium",
              "ai_priority_reason": "Human review is required.",
              "recommended_action_code": "REVIEW_VALIDATION_EXCEPTION",
              "recommended_action": "Review the validation exception.",
              "confidence": 0.88
            }
            ```"""

        decision = get_workflow_decision_with_oci(
            **_base_arguments(),
            chat_callable=fake_chat,
        )

        self.assertEqual(decision["source"], "oci")
        self.assertEqual(decision["priority"], "medium")

    def test_invalid_enum_uses_labeled_fallback(self):
        def fake_chat(**kwargs):
            return json.dumps({
                "priority": "urgent",
                "ai_priority_reason": "Urgent.",
                "recommended_action_code": "PAY_NOW",
                "recommended_action": "Pay it.",
                "confidence": 0.9,
            })

        decision = get_workflow_decision_with_oci(
            **_base_arguments(),
            chat_callable=fake_chat,
        )

        self.assertEqual(
            decision["source"],
            "rules_fallback",
        )
        self.assertEqual(
            decision["fallback_reason"],
            "invalid_oci_response",
        )
        self.assertTrue(decision["fallback_used"])

    def test_oci_failure_uses_labeled_fallback(self):
        def fake_chat(**kwargs):
            raise RuntimeError("provider unavailable")

        decision = get_workflow_decision_with_oci(
            **_base_arguments(),
            chat_callable=fake_chat,
        )

        self.assertEqual(
            decision["source"],
            "rules_fallback",
        )
        self.assertEqual(
            decision["fallback_reason"],
            "oci_unavailable",
        )
        self.assertNotIn(
            "provider unavailable",
            json.dumps(decision),
        )


if __name__ == "__main__":
    unittest.main()
