import json

from app.repositories.supabase_service import supabase
from app.services.match_record_service import (
    build_detailed_exception_summary,
    build_pairwise_statuses,
)
from app.services.validation_service import validate_invoice_data
from scripts.controlled_match_scenarios import (
    SCENARIOS,
    build_scenario_payload,
)


def _invoice_data(document_id):
    document = (
        supabase.table("ap_documents")
        .select("id,supplier_id")
        .eq("id", document_id)
        .single()
        .execute()
        .data
    )
    header = (
        supabase.table("invoice_headers")
        .select("*")
        .eq("document_id", document_id)
        .single()
        .execute()
        .data
    )
    lines = (
        supabase.table("invoice_lines")
        .select("*")
        .eq("invoice_id", header["id"])
        .order("line_number")
        .execute()
        .data
        or []
    )
    supplier = (
        supabase.table("suppliers")
        .select("name")
        .eq("id", document["supplier_id"])
        .single()
        .execute()
        .data
    )
    return header, lines, supplier["name"]


def main():
    tolerance_rules = (
        supabase.table("tolerance_rules")
        .select("*")
        .eq("active", True)
        .execute()
        .data
        or []
    )
    results = []
    for scenario in SCENARIOS:
        header, lines, supplier_name = _invoice_data(
            scenario["invoice_document_id"]
        )
        payload = build_scenario_payload(
            scenario=scenario,
            invoice_header=header,
            invoice_lines=lines,
            supplier_name=supplier_name,
        )
        summary = validate_invoice_data(
            invoice_header=payload["invoice_header"],
            invoice_lines=payload["invoice_lines"],
            reference_po=payload["po_header"],
            reference_po_lines=payload["po_lines"],
            reference_grn=payload["grn_header"],
            reference_grn_lines=payload["grn_lines"],
            tolerance_rules=tolerance_rules,
        )
        pairwise = build_pairwise_statuses(
            summary=summary,
            invoice_header=payload["invoice_header"],
            invoice_lines=payload["invoice_lines"],
            po_header=payload["po_header"],
            po_lines=payload["po_lines"],
            grn_header=payload["grn_header"],
            grn_lines=payload["grn_lines"],
        )
        exception_summary = build_detailed_exception_summary(
            summary=summary,
            invoice_header=payload["invoice_header"],
            invoice_lines=payload["invoice_lines"],
            po_header=payload["po_header"],
            po_lines=payload["po_lines"],
            grn_header=payload["grn_header"],
            grn_lines=payload["grn_lines"],
        )
        results.append({
            "scenario_code": scenario["code"],
            "expected": [
                scenario["expected_match_type"],
                scenario["expected_match_status"],
            ],
            "actual": [
                summary.match_type.value,
                summary.overall_status(),
            ],
            "pairwise_statuses": pairwise,
            "exception_summary": exception_summary,
        })

    failures = [
        result
        for result in results
        if result["actual"] != result["expected"]
    ]
    print(json.dumps(results, indent=2, default=str))
    if failures:
        raise RuntimeError(
            "Scenario outcome mismatch: "
            + json.dumps(failures)
        )


if __name__ == "__main__":
    main()
