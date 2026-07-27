import json

from app.services.match_explanation_service import (
    MATCH_EXPLANATION_MAX_TOKENS,
    get_match_explanation_with_oci,
)


def _facts():
    return {
        "invoice_number": "INV-1",
        "po_number": "PO-1",
        "grn_number": None,
        "overall_match_type": "2_WAY",
        "overall_match_status": "VARIANCE",
        "pairwise_statuses": {
            "invoice_po": "VARIANCE",
            "invoice_grn": "NOT_APPLICABLE",
            "po_grn": "NOT_APPLICABLE",
        },
        "failed_checks": [{
            "check_type": "amount_match",
            "invoice_value": 100,
            "po_value": 125,
            "delta": 25,
        }],
        "deterministic_exception_summary": (
            "Invoice amount USD 100.00 vs PO amount "
            "USD 125.00; delta USD 25.00."
        ),
    }


def test_oci_explains_but_does_not_choose_match_status():
    def fake_chat(**kwargs):
        assert '"overall_match_status": "VARIANCE"' in kwargs["prompt"]
        assert "Do not change or reinterpret" in kwargs["prompt"]
        assert (
            kwargs["max_tokens"]
            == MATCH_EXPLANATION_MAX_TOKENS
        )
        return json.dumps({
            "ai_match_reason": (
                "The deterministic comparison found a USD 25 variance."
            ),
            "recommended_action": (
                "Review the PO amount before approval."
            ),
            "confidence": 0.98,
        })

    result = get_match_explanation_with_oci(
        _facts(),
        chat_callable=fake_chat,
    )

    assert result["source"] == "oci"
    assert result["fallback_used"] is False
    assert "match_status" not in result
    assert "USD 25" in result["ai_match_reason"]


def test_failed_oci_call_is_clearly_labeled():
    result = get_match_explanation_with_oci(
        _facts(),
        chat_callable=lambda **_: (_ for _ in ()).throw(
            RuntimeError("provider unavailable")
        ),
    )

    assert result["source"] == "rules_fallback"
    assert result["fallback_used"] is True
    assert "provider unavailable" not in json.dumps(result)
