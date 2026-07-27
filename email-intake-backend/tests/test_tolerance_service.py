import unittest

from app.services.tolerance_service import resolve_tolerance_rule


class ToleranceServiceTests(unittest.TestCase):
    def test_amount_checks_use_amount_tolerance_alias(self):
        rules = [{
            "id": "usd-rule",
            "check_type": "amount_tolerance",
            "threshold_pct": 5,
            "threshold_amt": None,
            "currency": "USD",
            "active": True,
        }]

        rule = resolve_tolerance_rule(
            rules,
            check_type="line_amount_match",
            currency="USD",
        )

        self.assertEqual(rule.id, "usd-rule")

    def test_currency_specific_rule_does_not_apply_to_other_currency(self):
        rules = [{
            "id": "usd-rule",
            "check_type": "amount_tolerance",
            "threshold_pct": 5,
            "threshold_amt": None,
            "currency": "USD",
            "active": True,
        }]

        rule = resolve_tolerance_rule(
            rules,
            check_type="amount_match",
            currency="EUR",
        )

        self.assertIsNone(rule)

    def test_inactive_rule_is_ignored(self):
        rules = [{
            "id": "inactive-rule",
            "check_type": "amount_tolerance",
            "threshold_pct": 5,
            "threshold_amt": None,
            "currency": "USD",
            "active": False,
        }]

        rule = resolve_tolerance_rule(
            rules,
            check_type="amount_match",
            currency="USD",
        )

        self.assertIsNone(rule)


if __name__ == "__main__":
    unittest.main()
