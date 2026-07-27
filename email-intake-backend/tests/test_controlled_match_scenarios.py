import pytest

from scripts.controlled_match_scenarios import (
    SCENARIOS,
    select_scenarios,
)


def test_select_scenarios_defaults_to_full_controlled_set():
    assert select_scenarios() == SCENARIOS


def test_select_scenarios_can_target_one_retry():
    selected = select_scenarios(
        "S06_THREE_WAY_AMOUNT_VARIANCE"
    )

    assert [
        scenario["code"]
        for scenario in selected
    ] == ["S06_THREE_WAY_AMOUNT_VARIANCE"]


def test_select_scenarios_rejects_unknown_code():
    with pytest.raises(
        ValueError,
        match="Unknown controlled scenario code",
    ):
        select_scenarios("S99")
