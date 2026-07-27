import argparse
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.repositories.supabase_service import supabase


OUTPUT_DIR = Path("output/pdf")
BUCKET = "ap-email-attachments"


def _money(value, currency="USD"):
    if value is None:
        return "Not available"
    return f"{currency} {float(value):,.2f}"


def _document(path, title, subtitle, fields, lines, columns):
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReferenceTitle",
        parent=styles["Title"],
        alignment=TA_CENTER,
        textColor=colors.HexColor("#1E3A8A"),
        fontSize=20,
        leading=24,
    )
    notice_style = ParagraphStyle(
        "Notice",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        textColor=colors.HexColor("#991B1B"),
        backColor=colors.HexColor("#FEE2E2"),
        borderPadding=7,
        fontSize=9,
    )
    table_header_style = ParagraphStyle(
        "TableHeader",
        parent=styles["BodyText"],
        textColor=colors.white,
        fontName="Helvetica-Bold",
        fontSize=8,
    )
    doc = SimpleDocTemplate(
        str(path),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=title,
    )
    notice = Table(
        [[Paragraph(
            "POC-GENERATED REFERENCE DOCUMENT - NOT AN INDEPENDENT ERP/JDE SOURCE",
            notice_style,
        )]],
        colWidths=[167 * mm],
    )
    notice.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FEE2E2")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#FCA5A5")),
        ("PADDING", (0, 0), (-1, -1), 7),
    ]))
    story = [
        Paragraph(title, title_style),
        Paragraph(subtitle, styles["Heading2"]),
        Spacer(1, 5 * mm),
        notice,
        Spacer(1, 7 * mm),
    ]
    field_rows = [
        [Paragraph(str(label), styles["BodyText"]),
         Paragraph(str(value if value is not None else "Not available"), styles["BodyText"])]
        for label, value in fields
    ]
    field_table = Table(field_rows, colWidths=[52 * mm, 105 * mm])
    field_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EFF6FF")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([
        field_table,
        Spacer(1, 8 * mm),
        Paragraph("Line Details", styles["Heading2"]),
    ])
    table_data = [[Paragraph(c, table_header_style) for c in columns]]
    for line in lines:
        table_data.append([
            Paragraph(str(value if value is not None else "-"), styles["BodyText"])
            for value in line
        ])
    line_table = Table(
        table_data,
        repeatRows=1,
        colWidths=[14 * mm, 65 * mm, 19 * mm, 19 * mm, 25 * mm, 25 * mm],
    )
    line_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E3A8A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 5),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
    ]))
    story.extend([
        line_table,
        Spacer(1, 10 * mm),
        Paragraph(
            "Generated from stored POC reference data for document preview and matching demonstration.",
            styles["Italic"],
        ),
    ])
    doc.build(story)


def _upload(table, record_id, path, object_path):
    supabase.storage.from_(BUCKET).upload(
        object_path,
        path.read_bytes(),
        {"content-type": "application/pdf", "upsert": "true"},
    )
    (
        supabase.table(table)
        .update({
            "document_filename": path.name,
            "document_storage_bucket": BUCKET,
            "document_storage_path": object_path,
        })
        .eq("id", record_id)
        .execute()
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    purchase_orders = (
        supabase.table("reference_purchase_orders")
        .select("*")
        .order("po_number")
        .execute()
        .data
        or []
    )
    receipts = (
        supabase.table("reference_goods_receipts")
        .select("*")
        .order("grn_number")
        .execute()
        .data
        or []
    )
    suppliers = (
        supabase.table("suppliers")
        .select("id,name")
        .execute()
        .data
        or []
    )
    supplier_names = {
        supplier["id"]: supplier["name"]
        for supplier in suppliers
    }

    for po in purchase_orders:
        po_lines = (
            supabase.table("reference_purchase_order_lines")
            .select("*")
            .eq("reference_po_id", po["id"])
            .order("line_number")
            .execute()
            .data
            or []
        )
        filename = f"Reference_PO_{po['po_number']}.pdf"
        path = OUTPUT_DIR / filename
        _document(
            path,
            "Reference Purchase Order",
            f"PO {po['po_number']}",
            [
                (
                    "Supplier",
                    po.get("supplier_name")
                    or supplier_names.get(po.get("supplier_id"))
                    or "Not available",
                ),
                ("PO Date", po.get("po_date")),
                ("Status", po.get("status")),
                ("Currency", po.get("currency")),
                ("Total", _money(po.get("total_amount"), po.get("currency"))),
                ("Payment Terms", po.get("payment_terms")),
                ("Source", "POC_GENERATED"),
            ],
            [[
                line.get("line_number"),
                line.get("description"),
                line.get("ordered_quantity"),
                line.get("unit"),
                _money(line.get("unit_price"), po.get("currency")),
                _money(line.get("line_amount"), po.get("currency")),
            ] for line in po_lines],
            ["Line", "Description", "Qty", "Unit", "Unit Price", "Amount"],
        )
        if args.apply:
            _upload(
                "reference_purchase_orders",
                po["id"],
                path,
                f"reference-po/{po['id']}/{filename}",
            )

    for grn in receipts:
        grn_lines = (
            supabase.table("reference_goods_receipt_lines")
            .select("*")
            .eq("reference_grn_id", grn["id"])
            .order("line_number")
            .execute()
            .data
            or []
        )
        filename = f"Reference_GRN_{grn['grn_number']}.pdf"
        path = OUTPUT_DIR / filename
        _document(
            path,
            "Reference Goods Receipt",
            grn["grn_number"],
            [
                ("Received Date", grn.get("received_date")),
                ("Status", grn.get("status")),
                ("Warehouse", grn.get("warehouse_location")),
                ("Receiver", grn.get("receiver_name")),
                ("Source", "POC_GENERATED"),
            ],
            [[
                line.get("line_number"),
                line.get("description"),
                line.get("received_quantity"),
                line.get("accepted_quantity"),
                line.get("rejected_quantity"),
                line.get("unit"),
            ] for line in grn_lines],
            ["Line", "Description", "Received", "Accepted", "Rejected", "Unit"],
        )
        if args.apply:
            _upload(
                "reference_goods_receipts",
                grn["id"],
                path,
                f"reference-grn/{grn['id']}/{filename}",
            )

    print(f"generated={len(purchase_orders) + len(receipts)}")
    print(f"uploaded={len(purchase_orders) + len(receipts) if args.apply else 0}")


if __name__ == "__main__":
    main()
