import argparse
from pathlib import Path

from app.repositories.supabase_service import supabase


BUCKET = "ap-email-attachments"


def _upload(path: Path, object_path: str):
    try:
        supabase.storage.from_(BUCKET).upload(
            object_path,
            path.read_bytes(),
            {
                "content-type": "application/pdf",
                "upsert": "true",
            },
        )
    except Exception as error:
        if "already exists" not in str(error).lower():
            raise


def _import_invoice_attachments(invoice_directory: Path):
    source_files = {
        path.name.casefold(): path
        for path in invoice_directory.glob("*.pdf")
    }
    attachments = (
        supabase.table("email_attachments")
        .select("id,filename")
        .execute()
        .data
        or []
    )
    updated = 0
    for attachment in attachments:
        source = source_files.get(
            str(attachment.get("filename") or "").casefold()
        )
        if source is None:
            continue
        object_path = f"{attachment['id']}/{source.name.replace('#', '_')}"
        _upload(source, object_path)
        (
            supabase.table("email_attachments")
            .update({
                "storage_bucket": BUCKET,
                "storage_path": object_path,
            })
            .eq("id", attachment["id"])
            .execute()
        )
        updated += 1
    return updated


def _import_reference_documents(
    directory: Path,
    *,
    table: str,
    number_column: str,
    filename_prefix: str,
    object_prefix: str,
):
    records = (
        supabase.table(table)
        .select(f"id,{number_column}")
        .execute()
        .data
        or []
    )
    by_number = {
        str(record[number_column]): record
        for record in records
    }
    updated = 0
    for path in directory.glob("*.pdf"):
        number = path.stem.removeprefix(filename_prefix)
        record = by_number.get(number)
        if record is None:
            raise RuntimeError(
                f"No {table} record matches supplied PDF {path.name}"
            )
        object_path = f"{object_prefix}/{record['id']}/{path.name}"
        _upload(path, object_path)
        (
            supabase.table(table)
            .update({
                "document_filename": path.name,
                "document_storage_bucket": BUCKET,
                "document_storage_path": object_path,
            })
            .eq("id", record["id"])
            .execute()
        )
        updated += 1
    return updated


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        required=True,
        type=Path,
        help="Extracted Reference_Documents directory",
    )
    args = parser.parse_args()
    source = args.source.resolve()

    invoice_updates = _import_invoice_attachments(
        source / "Invoices"
    )
    po_updates = _import_reference_documents(
        source / "Purchase_Orders",
        table="reference_purchase_orders",
        number_column="po_number",
        filename_prefix="Purchase_Order_",
        object_prefix="supplied-reference-po",
    )
    grn_updates = _import_reference_documents(
        source / "Goods_Receipts",
        table="reference_goods_receipts",
        number_column="grn_number",
        filename_prefix="Goods_Receipt_",
        object_prefix="supplied-reference-grn",
    )

    print(f"invoice_attachment_rows_updated={invoice_updates}")
    print(f"reference_po_documents_updated={po_updates}")
    print(f"reference_grn_documents_updated={grn_updates}")


if __name__ == "__main__":
    main()
