import argparse

from app.repositories.supabase_service import supabase
from app.services.validation_service import validate_document


def target_invoice_headers():
    legacy = (
        supabase
        .table("validation_results")
        .select("document_id")
        .like("check_type", "three_way_%")
        .execute()
    )
    document_ids = sorted({
        row["document_id"]
        for row in (legacy.data or [])
        if row.get("document_id")
    })
    if not document_ids:
        return []

    result = (
        supabase
        .table("invoice_headers")
        .select("id,document_id,invoice_number,po_number")
        .in_("document_id", document_ids)
        .execute()
    )
    return result.data or []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    targets = target_invoice_headers()

    print(f"targets={len(targets)}")
    for target in targets:
        print(
            target["invoice_number"],
            target["po_number"],
            target["document_id"],
        )

    if not args.apply:
        print("dry_run=true")
        return

    if len(targets) != 7:
        raise RuntimeError(
            f"Expected exactly 7 historical targets, found {len(targets)}"
        )

    results = []
    for target in targets:
        result = validate_document(target["id"])
        results.append({
            "invoice_number": target["invoice_number"],
            "po_number": target["po_number"],
            "match_type": result["match_type"],
            "outcome": result["overall_status"],
            "stage": result["stage"],
        })

    po_numbers = [row["po_number"] for row in targets]
    (
        supabase
        .table("reference_purchase_orders")
        .update({"match_type": "3_WAY"})
        .in_("po_number", po_numbers)
        .execute()
    )

    for result in results:
        print(result)


if __name__ == "__main__":
    main()
