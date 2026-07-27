from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Iterable, Mapping, Optional


CHECK_TYPE_ALIASES = {
    "amount_match": "amount_tolerance",
    "line_amount_match": "amount_tolerance",
    "unit_price_match": "amount_tolerance",
}


def _decimal(value) -> Optional[Decimal]:
    if value is None or value == "":
        return None

    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


@dataclass(frozen=True)
class ToleranceRule:
    id: str
    rule_name: Optional[str]
    check_type: str
    threshold_pct: Optional[Decimal]
    threshold_amt: Optional[Decimal]
    currency: Optional[str]

    @classmethod
    def from_record(cls, record: Mapping):
        return cls(
            id=str(record.get("id")),
            rule_name=record.get("rule_name"),
            check_type=str(
                record.get("check_type") or ""
            ).strip().lower(),
            threshold_pct=_decimal(
                record.get("threshold_pct")
            ),
            threshold_amt=_decimal(
                record.get("threshold_amt")
            ),
            currency=(
                str(record.get("currency")).strip().upper()
                if record.get("currency")
                else None
            ),
        )


def resolve_tolerance_rule(
    rules: Iterable[Mapping],
    *,
    check_type: str,
    currency: Optional[str],
) -> Optional[ToleranceRule]:
    """
    Resolve an active rule using exact check type first, then its configured
    alias. Currency-specific rules take precedence over global rules.
    """

    normalized_check_type = (
        str(check_type).strip().lower()
    )
    alias = CHECK_TYPE_ALIASES.get(
        normalized_check_type
    )
    accepted_check_types = [
        normalized_check_type,
    ]

    if alias and alias not in accepted_check_types:
        accepted_check_types.append(alias)

    normalized_currency = (
        str(currency).strip().upper()
        if currency
        else None
    )

    candidates = []

    for record in rules:
        if record.get("active") is False:
            continue

        rule = ToleranceRule.from_record(record)

        if rule.check_type not in accepted_check_types:
            continue

        if (
            rule.currency
            and normalized_currency
            and rule.currency != normalized_currency
        ):
            continue

        if rule.currency and not normalized_currency:
            continue

        check_rank = accepted_check_types.index(
            rule.check_type
        )
        currency_rank = (
            0
            if rule.currency == normalized_currency
            else 1
        )
        candidates.append(
            (check_rank, currency_rank, rule)
        )

    if not candidates:
        return None

    candidates.sort(
        key=lambda item: (item[0], item[1])
    )

    return candidates[0][2]


def is_within_tolerance(
    rule: Optional[ToleranceRule],
    *,
    deviation_abs: Optional[Decimal],
    deviation_pct: Optional[Decimal],
) -> bool:
    if rule is None:
        return False

    configured_results = []

    if rule.threshold_amt is not None:
        configured_results.append(
            deviation_abs is not None
            and deviation_abs <= rule.threshold_amt
        )

    if rule.threshold_pct is not None:
        configured_results.append(
            deviation_pct is not None
            and deviation_pct <= rule.threshold_pct
        )

    if not configured_results:
        return False

    # When both limits are configured, both must be satisfied. This prevents
    # a broad threshold from silently overriding the stricter one.
    return all(configured_results)


def load_active_tolerance_rules(supabase_client) -> list[dict]:
    result = (
        supabase_client
        .table("tolerance_rules")
        .select(
            "id, rule_name, check_type, threshold_pct, "
            "threshold_amt, currency, active, created_at"
        )
        .eq("active", True)
        .order("created_at", desc=True)
        .execute()
    )

    return result.data or []
