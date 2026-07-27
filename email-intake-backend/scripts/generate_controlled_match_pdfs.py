import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.repositories.supabase_service import supabase
from scripts.controlled_match_scenarios import (
    SCENARIOS,
    build_scenario_payload,
)


OUTPUT_DIR = Path(
    "output/pdf/controlled_match_scenarios"
)
NAVY = colors.HexColor("#17365D")
BLUE = colors.HexColor("#DCE6F1")
AMBER = colors.HexColor("#FFF2CC")
GREEN = colors.HexColor("#E2F0D9")
GRID = colors.HexColor("#A6B2C1")
TEXT = colors.HexColor("#243447")

STYLES = getSampleStyleSheet()
BODY = ParagraphStyle(
    "DocumentBody",
    parent=STYLES["BodyText"],
    fontName="Helvetica",
    fontSize=8,
    leading=10,
    textColor=TEXT,
)
SMALL = ParagraphStyle(
    "DocumentSmall",
    parent=BODY,
    fontSize=7,
    leading=8.5,
)
RIGHT = ParagraphStyle(
    "DocumentRight",
    parent=BODY,
    alignment=TA_RIGHT,
)


def _fmt_number(value):
    if value is None:
        return "-"
    number = float(value)
    if number.is_integer():
        return f"{int(number):,}"
    return f"{number:,.2f}"


def _fmt_money(value, currency="USD"):
    if value is None:
        return "-"
    return f"{currency} {float(value):,.2f}"


def _footer(canvas, document):
    canvas.saveState()
    canvas.setStrokeColor(GRID)
    canvas.line(
        document.leftMargin,
        0.47 * inch,
        letter[0] - document.rightMargin,
        0.47 * inch,
    )
    canvas.setFont("Helvetica", 6.5)
    canvas.setFillColor(colors.HexColor("#5F6B78"))
    canvas.drawString(
        document.leftMargin,
        0.30 * inch,
        (
            "CONTROLLED DEMO SOURCE DOCUMENT - "
            "NOT SOURCED FROM JDE/ERP"
        ),
    )
    canvas.drawRightString(
        letter[0] - document.rightMargin,
        0.30 * inch,
        f"Page {document.page}",
    )
    canvas.restoreState()


def _header(document_type, document_number):
    brand = Paragraph(
        "<b>DAIWA AP CONNECT</b><br/>"
        "<font size='7'>Controlled AP Demonstration</font>",
        ParagraphStyle(
            "Brand",
            parent=BODY,
            fontSize=15,
            leading=16,
            textColor=NAVY,
        ),
    )
    title = Paragraph(
        f"<b>{document_type}</b><br/>"
        f"<font size='9'>{document_number}</font>",
        ParagraphStyle(
            "Title",
            parent=RIGHT,
            fontSize=18,
            leading=20,
            textColor=NAVY,
        ),
    )
    table = Table(
        [[brand, title]],
        colWidths=[3.6 * inch, 3.4 * inch],
    )
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 1.5, NAVY),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def _demo_banner():
    table = Table(
        [[Paragraph(
            "<b>CONTROLLED DEMO SOURCE DOCUMENT</b> - "
            "Contains transaction facts only; matching results "
            "are calculated separately.",
            SMALL,
        )]],
        colWidths=[7 * inch],
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), AMBER),
        ("BOX", (0, 0), (-1, -1), 0.6, GRID),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def _section_table(rows, widths):
    table = Table(rows, colWidths=widths)
    table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, GRID),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, GRID),
        ("BACKGROUND", (0, 0), (-1, 0), BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), NAVY),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 7),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def _line_table(lines, *, grn=False):
    if grn:
        headers = [
            "LINE",
            "DESCRIPTION",
            "RECEIVED",
            "UOM",
        ]
        widths = [
            0.45 * inch,
            5.1 * inch,
            0.9 * inch,
            0.55 * inch,
        ]
        rows = [headers]
        for line in lines:
            rows.append([
                str(line.get("line_number") or ""),
                Paragraph(
                    str(line.get("description") or "-"),
                    SMALL,
                ),
                _fmt_number(
                    line.get("received_quantity")
                ),
                str(line.get("unit") or "-"),
            ])
    else:
        headers = [
            "LINE",
            "DESCRIPTION",
            "QTY",
            "UOM",
            "UNIT PRICE",
            "LINE TOTAL",
        ]
        widths = [
            0.4 * inch,
            3.45 * inch,
            0.55 * inch,
            0.5 * inch,
            0.95 * inch,
            1.15 * inch,
        ]
        rows = [headers]
        for line in lines:
            rows.append([
                str(line.get("line_number") or ""),
                Paragraph(
                    str(line.get("description") or "-"),
                    SMALL,
                ),
                _fmt_number(
                    line.get("ordered_quantity")
                ),
                str(line.get("unit") or "-"),
                _fmt_money(line.get("unit_price")),
                _fmt_money(line.get("line_amount")),
            ])

    table = Table(
        rows,
        colWidths=widths,
        repeatRows=1,
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 7),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.35, GRID),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
    ]))
    return table


def _build_po(path, payload):
    header = payload["po_header"]
    lines = payload["po_lines"]
    currency = header.get("currency") or "USD"
    document = SimpleDocTemplate(
        str(path),
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=30,
        bottomMargin=45,
        title=f"Purchase Order {header['po_number']}",
        author="Daiwa AP Connect POC",
    )
    story = [
        _header("PURCHASE ORDER", header["po_number"]),
        Spacer(1, 8),
        _demo_banner(),
        Spacer(1, 10),
        _section_table(
            [
                ["PO DATE", "CURRENCY", "PAYMENT TERMS"],
                [
                    str(header.get("po_date") or "-"),
                    currency,
                    str(header.get("payment_terms") or "-"),
                ],
            ],
            [2.1 * inch, 1.7 * inch, 3.2 * inch],
        ),
        Spacer(1, 9),
        _section_table(
            [
                ["SUPPLIER", "BUYER / SHIP TO"],
                [
                    Paragraph(
                        "<b>"
                        + str(
                            header.get("supplier_name")
                            or "Supplier"
                        )
                        + "</b><br/>Supplier represented on "
                        "the source invoice.",
                        BODY,
                    ),
                    Paragraph(
                        "<b>Daiwa AP Demo Buying Organization</b>"
                        "<br/>Controlled Receiving Location"
                        "<br/>United States",
                        BODY,
                    ),
                ],
            ],
            [3.5 * inch, 3.5 * inch],
        ),
        Spacer(1, 10),
        _line_table(lines),
        Spacer(1, 10),
    ]

    summary = Table(
        [
            ["SUBTOTAL", _fmt_money(
                header.get("subtotal"),
                currency,
            )],
            ["OTHER / TAX / FREIGHT", _fmt_money(
                (
                    float(header.get("other_amount") or 0)
                    + float(
                        header.get("scenario_adjustment") or 0
                    )
                ),
                currency,
            )],
            ["PO TOTAL", _fmt_money(
                header.get("total_amount"),
                currency,
            )],
        ],
        colWidths=[2.0 * inch, 1.6 * inch],
        hAlign="RIGHT",
    )
    summary.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, GRID),
        ("BACKGROUND", (0, -1), (-1, -1), GREEN),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(KeepTogether(summary))
    document.build(
        story,
        onFirstPage=_footer,
        onLaterPages=_footer,
    )


def _build_grn(path, payload):
    header = payload["grn_header"]
    lines = payload["grn_lines"]
    document = SimpleDocTemplate(
        str(path),
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=30,
        bottomMargin=45,
        title=f"Goods Receipt {header['grn_number']}",
        author="Daiwa AP Connect POC",
    )
    story = [
        _header("GOODS RECEIPT", header["grn_number"]),
        Spacer(1, 8),
        _demo_banner(),
        Spacer(1, 10),
        _section_table(
            [
                ["RECEIVED DATE", "REFERENCE PO", "LOCATION"],
                [
                    str(header.get("received_date") or "-"),
                    str(header.get("po_number") or "-"),
                    "Controlled Receiving Location",
                ],
            ],
            [2.0 * inch, 2.0 * inch, 3.0 * inch],
        ),
        Spacer(1, 9),
        _section_table(
            [
                ["SUPPLIER", "RECEIVING ORGANIZATION"],
                [
                    Paragraph(
                        "<b>"
                        + str(
                            header.get("supplier_name")
                            or "Supplier"
                        )
                        + "</b><br/>Supplier represented on "
                        "the source invoice.",
                        BODY,
                    ),
                    Paragraph(
                        "<b>Daiwa AP Demo Receiving</b>"
                        "<br/>Controlled Warehouse Personnel",
                        BODY,
                    ),
                ],
            ],
            [3.5 * inch, 3.5 * inch],
        ),
        Spacer(1, 10),
        _line_table(lines, grn=True),
        Spacer(1, 12),
        Paragraph(
            "This receipt records document facts only. "
            "Reconciliation with the invoice and purchase order "
            "is performed by the backend matching engine.",
            SMALL,
        ),
    ]
    document.build(
        story,
        onFirstPage=_footer,
        onLaterPages=_footer,
    )


def _get_invoice_data(document_id):
    document = (
        supabase.table("ap_documents")
        .select("id,supplier_id,attachment_id")
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
        .eq("id", document.get("supplier_id"))
        .single()
        .execute()
        .data
    )
    attachment = (
        supabase.table("email_attachments")
        .select("filename")
        .eq("id", document.get("attachment_id"))
        .single()
        .execute()
        .data
    )
    return (
        header,
        lines,
        supplier.get("name"),
        attachment.get("filename"),
    )


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []
    for scenario in SCENARIOS:
        header, lines, supplier_name, invoice_filename = (
            _get_invoice_data(
                scenario["invoice_document_id"]
            )
        )
        payload = build_scenario_payload(
            scenario=scenario,
            invoice_header=header,
            invoice_lines=lines,
            supplier_name=supplier_name,
        )
        po_filename = None
        grn_filename = None
        if payload["po_header"]:
            po_filename = (
                f"PO_{payload['po_header']['po_number']}.pdf"
            )
            _build_po(
                OUTPUT_DIR / po_filename,
                payload,
            )
        if payload["grn_header"]:
            grn_filename = (
                f"{payload['grn_header']['grn_number']}.pdf"
            )
            _build_grn(
                OUTPUT_DIR / grn_filename,
                payload,
            )
        manifest.append({
            "scenario_code": scenario["code"],
            "scenario_name": scenario["name"],
            "invoice_number": scenario["invoice_number"],
            "invoice_filename": invoice_filename,
            "po_number": (
                payload["po_header"].get("po_number")
                if payload["po_header"]
                else header.get("po_number")
            ),
            "grn_number": (
                payload["grn_header"].get("grn_number")
                if payload["grn_header"]
                else None
            ),
            "po_filename": po_filename,
            "grn_filename": grn_filename,
            "expected_match_type": scenario[
                "expected_match_type"
            ],
            "expected_match_status": scenario[
                "expected_match_status"
            ],
        })

    (
        OUTPUT_DIR / "SCENARIO_MANIFEST.json"
    ).write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
