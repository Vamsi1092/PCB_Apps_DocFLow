from pathlib import Path


MIGRATION = (
    Path(__file__).parents[1]
    / "supabase"
    / "migrations"
    / "20260724160000_allow_unmatched_validation_match_type.sql"
)
READ_ONLY_VIEWS_MIGRATION = (
    Path(__file__).parents[1]
    / "supabase"
    / "migrations"
    / "20260724170000_restrict_controlled_matching_views_to_read_only.sql"
)


def test_validation_match_type_constraint_supports_runtime_values():
    sql = MIGRATION.read_text(encoding="utf-8")

    for match_type in (
        "UNMATCHED",
        "2_WAY",
        "3_WAY",
    ):
        assert f"'{match_type}'" in sql


def test_validation_match_type_constraint_retains_legacy_non_po():
    sql = MIGRATION.read_text(encoding="utf-8")

    assert "'NON_PO'" in sql


def test_controlled_matching_views_are_select_only_for_anon():
    sql = READ_ONLY_VIEWS_MIGRATION.read_text(
        encoding="utf-8"
    )

    for view in (
        "current_match_results",
        "document_ui_view",
        "invoice_match_review_view",
    ):
        assert (
            f"on public.{view}\nfrom anon"
            in sql
        )
        assert (
            f"grant select on public.{view} to anon"
            in sql
        )
