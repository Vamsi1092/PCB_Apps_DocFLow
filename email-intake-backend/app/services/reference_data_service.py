from app.repositories.supabase_service import (
    supabase,
    save_reference_purchase_order,
    save_reference_purchase_order_lines,
    get_reference_purchase_order_by_number,
    save_reference_goods_receipt,
    save_reference_goods_receipt_lines,
    get_reference_goods_receipt_by_number
)


def generate_reference_purchase_order(invoice_header_id):
    """
    Generate a Reference Purchase Order from an extracted invoice.

    The function safely handles:
    1. New Reference PO creation
    2. Existing Reference PO detection
    3. Missing Reference PO line creation
    4. Duplicate Reference PO line prevention
    """

    if not invoice_header_id:
        raise ValueError("invoice_header_id is required")

    # Read invoice header
    invoice_result = (
        supabase
        .table("invoice_headers")
        .select("*")
        .eq("id", invoice_header_id)
        .limit(1)
        .execute()
    )

    if not invoice_result.data:
        raise ValueError(
            f"Invoice header not found for ID: {invoice_header_id}"
        )

    invoice_header = invoice_result.data[0]

    # Read invoice lines
    invoice_lines_result = (
        supabase
        .table("invoice_lines")
        .select("*")
        .eq("invoice_id", invoice_header_id)
        .order("line_number")
        .execute()
    )

    invoice_lines = invoice_lines_result.data or []

    if not invoice_lines:
        raise ValueError(
            f"No invoice lines found for invoice ID: {invoice_header_id}"
        )

    po_number = invoice_header.get("po_number")

    if not po_number:
        raise ValueError(
            f"PO number is missing for invoice ID: {invoice_header_id}"
        )

    # Check whether the Reference PO header already exists
    existing_reference_po = get_reference_purchase_order_by_number(
        po_number
    )

    if existing_reference_po:
        reference_po = existing_reference_po
        reference_po_was_existing = True
    else:
        reference_po_data = {
            "po_number": po_number,
            "supplier_id": invoice_header.get("supplier_id"),
            "po_date": invoice_header.get("invoice_date"),
            "currency": invoice_header.get("currency"),
            "total_amount": invoice_header.get("total_amount"),
            "open_amount": invoice_header.get("total_amount"),
            "payment_terms": invoice_header.get("payment_terms"),
            "source_system": "JDE",
            "status": "OPEN",
            "match_type": "2_WAY",
            "notes": "AI Generated Reference PO"
        }

        reference_po = save_reference_purchase_order(
            reference_po_data
        )

        if not reference_po:
            raise Exception(
                "Failed to create Reference Purchase Order."
            )

        reference_po_was_existing = False

    reference_po_id = reference_po.get("id")

    if not reference_po_id:
        raise ValueError(
            "Reference Purchase Order ID is missing."
        )

    # Read any existing Reference PO lines
    existing_lines_result = (
        supabase
        .table("reference_purchase_order_lines")
        .select("*")
        .eq("reference_po_id", reference_po_id)
        .execute()
    )

    existing_reference_po_lines = existing_lines_result.data or []

    existing_line_numbers = {
        line.get("line_number")
        for line in existing_reference_po_lines
        if line.get("line_number") is not None
    }

    # Prepare only missing lines
    reference_po_lines_to_create = []

    for invoice_line in invoice_lines:
        line_number = invoice_line.get("line_number")

        if line_number in existing_line_numbers:
            continue

        reference_po_lines_to_create.append({
            "reference_po_id": reference_po_id,
            "line_number": line_number,
            "description": invoice_line.get("description"),
            "ordered_quantity": (
                invoice_line.get("quantity")
                if invoice_line.get("quantity") is not None
                else 0
            ),
            "unit": invoice_line.get("unit"),
            "unit_price": (
                invoice_line.get("unit_price")
                if invoice_line.get("unit_price") is not None
                else 0
            ),
            "line_amount": invoice_line.get("amount"),
            "currency": reference_po.get("currency"),
            "line_status": "OPEN"
        })

    # If all lines already exist, return the existing records
    if not reference_po_lines_to_create:
        return {
            "success": True,
            "message": "Reference Purchase Order and lines already exist.",
            "reference_po": reference_po,
            "reference_po_lines": existing_reference_po_lines,
            "line_count": len(existing_reference_po_lines)
        }

    # Save missing Reference PO lines
    saved_reference_po_lines = save_reference_purchase_order_lines(
        reference_po_lines_to_create
    )

    if not saved_reference_po_lines:
        raise Exception(
            "Failed to create Reference Purchase Order lines."
        )

    all_reference_po_lines = (
        existing_reference_po_lines + saved_reference_po_lines
    )

    if reference_po_was_existing:
        message = (
            "Existing Reference Purchase Order completed "
            "with missing lines."
        )
    else:
        message = (
            "Reference Purchase Order generated successfully."
        )

    return {
        "success": True,
        "message": message,
        "reference_po": reference_po,
        "reference_po_lines": all_reference_po_lines,
        "new_lines_created": len(saved_reference_po_lines),
        "line_count": len(all_reference_po_lines)
    }


def generate_reference_goods_receipt(invoice_header_id):
    """
    Generate a Reference Goods Receipt from the Reference Purchase Order
    associated with an extracted invoice.

    The function safely handles:
    1. Invoice header lookup
    2. Reference PO lookup
    3. Reference PO line lookup
    4. New Reference GRN creation
    5. Existing Reference GRN detection
    6. Missing Reference GRN line creation
    7. Duplicate Reference GRN line prevention
    8. Incomplete extracted quantity handling
    """

    if not invoice_header_id:
        raise ValueError("invoice_header_id is required")

    # Read invoice header
    invoice_result = (
        supabase
        .table("invoice_headers")
        .select("*")
        .eq("id", invoice_header_id)
        .limit(1)
        .execute()
    )

    if not invoice_result.data:
        raise ValueError(
            f"Invoice header not found for ID: {invoice_header_id}"
        )

    invoice_header = invoice_result.data[0]

    po_number = invoice_header.get("po_number")

    if not po_number:
        raise ValueError(
            f"PO number is missing for invoice ID: {invoice_header_id}"
        )

    # Read the Reference PO created for this invoice
    reference_po = get_reference_purchase_order_by_number(
        po_number
    )

    if not reference_po:
        raise ValueError(
            f"Reference Purchase Order not found for PO number: {po_number}. "
            "Generate the Reference Purchase Order first."
        )

    reference_po_id = reference_po.get("id")

    if not reference_po_id:
        raise ValueError(
            "Reference Purchase Order ID is missing."
        )

    supplier_id = reference_po.get("supplier_id")

    if not supplier_id:
        raise ValueError(
            f"Supplier ID is missing for Reference PO: {po_number}"
        )

    # Read Reference PO lines
    reference_po_lines_result = (
        supabase
        .table("reference_purchase_order_lines")
        .select("*")
        .eq("reference_po_id", reference_po_id)
        .order("line_number")
        .execute()
    )

    reference_po_lines = (
        reference_po_lines_result.data or []
    )

    if not reference_po_lines:
        raise ValueError(
            f"No Reference PO lines found for PO number: {po_number}"
        )

    # Use a deterministic GRN number so reruns do not create duplicates
    grn_number = f"GRN-{po_number}"

    # Identify whether any source PO line had incomplete quantity extraction
    has_incomplete_quantity = any(
        line.get("ordered_quantity") is None
        or line.get("ordered_quantity") == 0
        for line in reference_po_lines
    )

    if has_incomplete_quantity:
        grn_notes = (
            "AI Generated Reference GRN from Reference PO "
            "(Incomplete Quantity Extraction)"
        )
    else:
        grn_notes = (
            "AI Generated Reference GRN from Reference PO"
        )

    # Check whether the Reference GRN header already exists
    existing_reference_grn = (
        get_reference_goods_receipt_by_number(
            grn_number
        )
    )

    if existing_reference_grn:
        reference_grn = existing_reference_grn
        reference_grn_was_existing = True
    else:
        received_date = (
            invoice_header.get("invoice_date")
            or reference_po.get("po_date")
        )

        if not received_date:
            raise ValueError(
                f"Received date could not be determined for PO: {po_number}"
            )

        reference_grn_data = {
            "grn_number": grn_number,
            "reference_po_id": reference_po_id,
            "supplier_id": supplier_id,
            "received_date": received_date,
            "status": "FULLY_ACCEPTED",
            "source_system": "JDE",
            "notes": grn_notes,
            "grn_total_amount": reference_po.get("total_amount")
        }

        reference_grn = save_reference_goods_receipt(
            reference_grn_data
        )

        if not reference_grn:
            raise Exception(
                "Failed to create Reference Goods Receipt."
            )

        reference_grn_was_existing = False

    reference_grn_id = reference_grn.get("id")

    if not reference_grn_id:
        raise ValueError(
            "Reference Goods Receipt ID is missing."
        )

    # Read existing Reference GRN lines
    existing_grn_lines_result = (
        supabase
        .table("reference_goods_receipt_lines")
        .select("*")
        .eq("reference_grn_id", reference_grn_id)
        .execute()
    )

    existing_reference_grn_lines = (
        existing_grn_lines_result.data or []
    )

    existing_line_numbers = {
        line.get("line_number")
        for line in existing_reference_grn_lines
        if line.get("line_number") is not None
    }

    existing_reference_po_line_ids = {
        line.get("reference_po_line_id")
        for line in existing_reference_grn_lines
        if line.get("reference_po_line_id")
    }

    # Prepare only missing GRN lines
    reference_grn_lines_to_create = []

    for reference_po_line in reference_po_lines:
        reference_po_line_id = reference_po_line.get("id")
        line_number = reference_po_line.get("line_number")

        if not reference_po_line_id:
            raise ValueError(
                f"Reference PO line ID is missing for line: {line_number}"
            )

        if line_number is None:
            raise ValueError(
                f"Line number is missing for Reference PO line: "
                f"{reference_po_line_id}"
            )

        # Prevent duplicate lines using both identifiers
        if (
            line_number in existing_line_numbers
            or reference_po_line_id
            in existing_reference_po_line_ids
        ):
            continue

        ordered_quantity = (
            reference_po_line.get("ordered_quantity")
        )

        if ordered_quantity is None:
            ordered_quantity = 0

        description = (
            reference_po_line.get("description")
            or f"Reference PO Line {line_number}"
        )

        reference_grn_lines_to_create.append({
            "reference_grn_id": reference_grn_id,
            "reference_po_line_id": reference_po_line_id,
            "line_number": line_number,
            "item_code": reference_po_line.get("item_code"),
            "description": description,
            "received_quantity": ordered_quantity,
            "accepted_quantity": ordered_quantity,
            "rejected_quantity": 0,
            "unit": reference_po_line.get("unit")
        })

    # If all lines already exist, return the existing records
    if not reference_grn_lines_to_create:
        return {
            "success": True,
            "message": (
                "Reference Goods Receipt and lines already exist."
            ),
            "reference_po": reference_po,
            "reference_grn": reference_grn,
            "reference_grn_lines": existing_reference_grn_lines,
            "line_count": len(existing_reference_grn_lines),
            "has_incomplete_quantity": has_incomplete_quantity
        }

    # Save missing Reference GRN lines
    saved_reference_grn_lines = (
        save_reference_goods_receipt_lines(
            reference_grn_lines_to_create
        )
    )

    if not saved_reference_grn_lines:
        raise Exception(
            "Failed to create Reference Goods Receipt lines."
        )

    all_reference_grn_lines = (
        existing_reference_grn_lines
        + saved_reference_grn_lines
    )

    if reference_grn_was_existing:
        message = (
            "Existing Reference Goods Receipt completed "
            "with missing lines."
        )
    else:
        message = (
            "Reference Goods Receipt generated successfully."
        )

    return {
        "success": True,
        "message": message,
        "reference_po": reference_po,
        "reference_grn": reference_grn,
        "reference_grn_lines": all_reference_grn_lines,
        "new_lines_created": len(saved_reference_grn_lines),
        "line_count": len(all_reference_grn_lines),
        "has_incomplete_quantity": has_incomplete_quantity
    }
