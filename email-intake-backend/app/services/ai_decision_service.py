import json
from datetime import date
from typing import Callable, Iterable, Mapping, Optional

from json_repair import repair_json

from app.integrations import oci_config
from app.integrations.oci_genai import get_chat_response
from app.services.recommendation_service import (
    RecommendedActionCode,
    get_action_label,
)
from app.services.workflow_decision_service import (
    build_workflow_decision,
    build_workflow_facts,
)


AI_DECISION_PROMPT_VERSION = "oci_priority_recommendation_v1"
ALLOWED_PRIORITIES = {
    "low",
    "medium",
    "high",
    "critical",
}


class InvalidAIDecision(ValueError):
    pass


def _strip_code_fence(value: str) -> str:
    value = value.strip()

    if value.startswith("```"):
        value = (
            value
            .replace("```json", "", 1)
            .replace("```", "")
            .strip()
        )

    return value


def _parse_json_response(value: str) -> dict:
    if not isinstance(value, str) or not value.strip():
        raise InvalidAIDecision("empty_response")

    text = _strip_code_fence(value)

    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        try:
            result = json.loads(repair_json(text))
        except Exception as error:
            raise InvalidAIDecision("invalid_json") from error

    if not isinstance(result, dict):
        raise InvalidAIDecision("response_not_object")

    return result


def _validated_text(
    result: Mapping,
    field_name: str,
    *,
    maximum_length: int,
) -> str:
    value = result.get(field_name)

    if not isinstance(value, str) or not value.strip():
        raise InvalidAIDecision(f"missing_{field_name}")

    return value.strip()[:maximum_length]


def _validated_confidence(value) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError) as error:
        raise InvalidAIDecision("invalid_confidence") from error

    if not 0 <= confidence <= 1:
        raise InvalidAIDecision("invalid_confidence")

    return confidence


def _build_prompt(facts: Mapping) -> str:
    priorities = ", ".join(sorted(ALLOWED_PRIORITIES))
    action_codes = ", ".join(
        action.value
        for action in RecommendedActionCode
    )

    return f"""
You are the OCI GenAI Accounts Payable priority and recommendation model.

Make the final priority and recommended-action decision using only the
verified facts supplied below. Do not invent a missing field, mismatch,
exception, supplier, PO, GRN, due date, or validation result.

Allowed priority values:
{priorities}

Allowed recommended_action_code values:
{action_codes}

Decision guidance:
- Critical: immediate operational or financial risk.
- High: urgent unresolved risk or major validation problem.
- Medium: human review is needed but the risk is not immediate.
- Low: no urgent risk is evidenced.
- Select exactly one action code from the allowed list.
- ai_priority_reason must explain the chosen priority using supplied facts.
- recommended_action must tell the AP user what to do next.
- Keep both text fields concise and business-friendly.

Verified facts:
{json.dumps(facts, sort_keys=True)}

Return only this JSON object:
{{
  "priority": "low|medium|high|critical",
  "ai_priority_reason": "fact-grounded explanation",
  "recommended_action_code": "ONE_ALLOWED_CODE",
  "recommended_action": "clear next action",
  "confidence": 0.0
}}
""".strip()


def request_oci_workflow_decision(
    facts,
    *,
    chat_callable: Callable = get_chat_response,
) -> dict:
    facts_dict = facts.to_dict()
    facts_dict["evaluation_date"] = date.today().isoformat()
    prompt = _build_prompt(facts_dict)

    text = chat_callable(
        prompt=prompt,
        system_prompt=(
            "You are an Accounts Payable decision AI. "
            "Use only verified facts and return strict JSON."
        ),
        temperature=0,
        max_tokens=3000,
    )

    result = _parse_json_response(text)

    priority = str(
        result.get("priority") or ""
    ).strip().lower()

    if priority not in ALLOWED_PRIORITIES:
        raise InvalidAIDecision("invalid_priority")

    try:
        action_code = RecommendedActionCode(
            str(
                result.get("recommended_action_code")
                or ""
            ).strip().upper()
        )
    except ValueError as error:
        raise InvalidAIDecision(
            "invalid_recommended_action_code"
        ) from error

    return {
        "priority": priority,
        "ai_priority_reason": _validated_text(
            result,
            "ai_priority_reason",
            maximum_length=500,
        ),
        "recommended_action": _validated_text(
            result,
            "recommended_action",
            maximum_length=750,
        ),
        "recommended_action_code": action_code.value,
        "recommended_action_label": get_action_label(
            action_code
        ),
        "source": "oci",
        "decision_mode": "ai",
        "confidence": _validated_confidence(
            result.get("confidence")
        ),
        "model": oci_config.CHAT_MODEL_ID,
        "prompt_version": AI_DECISION_PROMPT_VERSION,
        "fallback_used": False,
        "facts": facts_dict,
    }


def get_workflow_decision_with_oci(
    *,
    document_type: Optional[str],
    header: Optional[Mapping],
    supplier_resolved: bool,
    extraction_confidence=None,
    extraction_status: Optional[str] = None,
    document_number=None,
    validation_checks: Iterable[Mapping] = (),
    validation_completed: bool = False,
    chat_callable: Callable = get_chat_response,
) -> dict:
    decision_arguments = {
        "document_type": document_type,
        "header": header,
        "supplier_resolved": supplier_resolved,
        "extraction_confidence": extraction_confidence,
        "extraction_status": extraction_status,
        "document_number": document_number,
        "validation_checks": validation_checks,
        "validation_completed": validation_completed,
    }

    facts = build_workflow_facts(**decision_arguments)

    try:
        return request_oci_workflow_decision(
            facts,
            chat_callable=chat_callable,
        )
    except InvalidAIDecision:
        fallback_reason = "invalid_oci_response"
    except Exception:
        fallback_reason = "oci_unavailable"

    fallback = build_workflow_decision(
        **decision_arguments
    )
    fallback["facts"]["evaluation_date"] = (
        date.today().isoformat()
    )
    fallback.update({
        "source": "rules_fallback",
        "decision_mode": "fallback",
        "model": oci_config.CHAT_MODEL_ID,
        "prompt_version": AI_DECISION_PROMPT_VERSION,
        "fallback_used": True,
        "fallback_reason": fallback_reason,
    })

    return fallback
