import json
from datetime import datetime, timezone
from typing import Callable, Mapping

from app.integrations import oci_config
from app.integrations.oci_genai import get_chat_response
from app.services.ai_decision_service import (
    InvalidAIDecision,
    _parse_json_response,
    _validated_confidence,
    _validated_text,
)


MATCH_EXPLANATION_PROMPT_VERSION = "oci_match_explanation_v1"
MATCH_EXPLANATION_MAX_TOKENS = 12000


def _build_prompt(facts: Mapping) -> str:
    return f"""
You are the OCI GenAI Accounts Payable matching explanation model.

The deterministic matching engine has already selected the match type,
pairwise statuses, and overall status. Do not change or reinterpret those
decisions. Explain them using only the verified facts below. Do not invent
documents, values, suppliers, discrepancies, or actions.

Write a concise business explanation for both matched and non-matched
scenarios. The recommended action must be appropriate for the supplied
deterministic outcome.

Verified matching facts:
{json.dumps(dict(facts), sort_keys=True, default=str)}

Return only this JSON object:
{{
  "ai_match_reason": "fact-grounded explanation",
  "recommended_action": "clear AP next action",
  "confidence": 0.0
}}
""".strip()


def _fallback(facts: Mapping, reason: str) -> dict:
    status = facts.get("overall_match_status")
    deterministic_summary = (
        facts.get("deterministic_exception_summary")
    )
    if deterministic_summary:
        match_reason = deterministic_summary
    elif status == "MATCHED":
        match_reason = (
            "All applicable deterministic matching checks passed."
        )
    else:
        match_reason = (
            "The deterministic matching result requires review."
        )

    if status == "MATCHED":
        action = "Continue the standard approval workflow."
    elif status == "UNMATCHED":
        action = (
            "Locate or ingest the referenced purchase order "
            "before approval."
        )
    else:
        action = (
            "Review the documented variance before approval."
        )

    return {
        "ai_match_reason": match_reason,
        "recommended_action": action,
        "source": "rules_fallback",
        "model": oci_config.CHAT_MODEL_ID,
        "prompt_version": MATCH_EXPLANATION_PROMPT_VERSION,
        "confidence": 1.0,
        "fallback_used": True,
        "fallback_reason": reason,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def get_match_explanation_with_oci(
    facts: Mapping,
    *,
    chat_callable: Callable = get_chat_response,
) -> dict:
    try:
        response = chat_callable(
            prompt=_build_prompt(facts),
            system_prompt=(
                "Explain deterministic Accounts Payable matching "
                "facts. Return strict JSON only."
            ),
            temperature=0,
            max_tokens=MATCH_EXPLANATION_MAX_TOKENS,
        )
        result = _parse_json_response(response)
        return {
            "ai_match_reason": _validated_text(
                result,
                "ai_match_reason",
                maximum_length=1200,
            ),
            "recommended_action": _validated_text(
                result,
                "recommended_action",
                maximum_length=900,
            ),
            "source": "oci",
            "model": oci_config.CHAT_MODEL_ID,
            "prompt_version": MATCH_EXPLANATION_PROMPT_VERSION,
            "confidence": _validated_confidence(
                result.get("confidence")
            ),
            "fallback_used": False,
            "generated_at": datetime.now(
                timezone.utc
            ).isoformat(),
        }
    except InvalidAIDecision:
        return _fallback(facts, "invalid_oci_response")
    except Exception:
        return _fallback(facts, "oci_unavailable")
