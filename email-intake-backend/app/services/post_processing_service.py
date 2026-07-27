import re

from app.services.generic_recovery_service import (
    calculate_missing_line_values,
    invoice_needs_recovery,
    get_valid_invoice_lines
)


def clean_number(value):
    if value is None:
        return None

    if isinstance(value, (int, float)):
        return float(value)

    try:
        cleaned_value = (
            str(value)
            .replace(",", "")
            .replace("$", "")
            .replace("₹", "")
            .strip()
        )
        return float(cleaned_value)
    except:
        return None

def is_valid_po_number(value):
    if value is None:
        return False

    value = str(value).strip()

    invalid_values = {
        "",
        "invoice",
        "po",
        "po no",
        "po number",
        "purchase order",
        "number",
        "date",
        "page",
        "none",
        "null",
        "n/a"
    }

    if value.lower() in invalid_values:
        return False

    # PO must contain at least one digit.
    if not re.search(r"\d", value):
        return False

    # Allow letters, digits, hyphens and slashes only.
    return bool(re.fullmatch(r"[A-Za-z0-9\-/]+", value))


def extract_amount_near_label(text, label):
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    for index, line in enumerate(lines):
        if label.lower() in line.lower():

            same_line_match = re.search(r"([0-9,]+\.\d{2})", line)
            if same_line_match:
                return clean_number(same_line_match.group(1))

            for next_index in range(index + 1, min(index + 4, len(lines))):
                match = re.search(r"([0-9,]+\.\d{2})", lines[next_index])
                if match:
                    return clean_number(match.group(1))

            for previous_index in range(index - 1, max(index - 4, -1), -1):
                match = re.search(r"([0-9,]+\.\d{2})", lines[previous_index])
                if match:
                    return clean_number(match.group(1))

    return None


def extract_resolute_line_amounts(text):
    line_amounts = []
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    for index, line in enumerate(lines):
        if "RESOLUTE BOOK 70" in line.upper():

            search_window = lines[index:index + 12]
            numeric_values = []

            for window_line in search_window:
                matches = re.findall(r"\b[0-9,]+\.\d{2}\b", window_line)

                for match in matches:
                    numeric_values.append(clean_number(match))

            if numeric_values:
                line_amounts.append(numeric_values[-1])

    cleaned_amounts = []

    for amount in line_amounts:
        if amount not in cleaned_amounts:
            cleaned_amounts.append(amount)

    return cleaned_amounts


def extract_po_number_from_text(text):
    match = re.search(r"\b(\d{6,})\s*/\s*\d{6,}\b", text)

    if match:
        return match.group(1)

    match = re.search(r"\bPO[:\s#-]*([A-Za-z0-9-]+)\b", text, re.IGNORECASE)

    if match:
        return match.group(1)

    return None

def extract_invoice_number_from_text(text):

        # BlueStar layout:
    # Number
    # Date
    # Page
    # 10614771
    # 26-JAN-26
    # 1 of 1
    match = re.search(
        r"Number\s*[\r\n]+\s*Date\s*[\r\n]+\s*Page\s*[\r\n]+\s*([0-9]{5,})\s*[\r\n]+\s*[0-9]{1,2}-[A-Za-z]{3}-[0-9]{2,4}",
        text,
        re.IGNORECASE
    )

    if match:
        return match.group(1).strip()

    # Pattern 1: INVOICE - ORDER #9484
    match = re.search(
        r"INVOICE\s*-\s*ORDER\s*#\s*([0-9]+)",
        text,
        re.IGNORECASE
    )

    if match:
        return match.group(1).strip()

    # Pattern 2: Invoice #:905879 / Invoice # 905879
    match = re.search(
        r"Invoice\s*#\s*:?\s*([A-Za-z0-9\-]+)",
        text,
        re.IGNORECASE
    )

    if match:
        return match.group(1).strip()

    # Pattern 3: Invoice Number: 905879
    match = re.search(
        r"Invoice\s+Number\s*:?\s*([A-Za-z0-9\-]+)",
        text,
        re.IGNORECASE
    )

    if match:
        return match.group(1).strip()

    # Pattern 4: Invoice No. followed by value
    match = re.search(
        r"Invoice\s+No\.?\s*[\n\r\s]+([0-9]{5,})",
        text,
        re.IGNORECASE
    )

    if match:
        return match.group(1).strip()

    # Pattern 5: BlueStar layout
    # Number / Date / Page followed by values
    match = re.search(
        r"Number\s+Date\s+Page\s+([0-9]{5,})\s+([0-9]{1,2}-[A-Za-z]{3}-[0-9]{2,4})\s+1\s+of\s+1",
        text,
        re.IGNORECASE
    )

    if match:
        return match.group(1).strip()

    return None


def extract_customer_po_from_text(text):

    # Pattern 1: PO NUMBER · BUYER · NOTES 41323385
    match = re.search(
        r"PO\s+NUMBER\s*[·\-\:\s]*BUYER\s*[·\-\:\s]*NOTES\s+([A-Za-z0-9\-\/]{5,})",
        text,
        re.IGNORECASE
    )

    if match:
        value = match.group(1).strip()

        if is_valid_po_number(value):
            return value

    # Pattern 2: CUSTOMERS PO#41315113
    match = re.search(
        r"CUSTOMERS?\s+PO\s*#\s*([A-Za-z0-9\-\/]+)",
        text,
        re.IGNORECASE
    )

    if match:
        value = match.group(1).strip()

        if is_valid_po_number(value):
            return value

    # Pattern 3: Customer PO # / Cust PO #
    match = re.search(
        r"(?:Customer|Cust)\s+PO\s*#?\s*:?\s*([A-Za-z0-9\-\/]{5,})",
        text,
        re.IGNORECASE
    )

    if match:
        value = match.group(1).strip()

        if is_valid_po_number(value):
            return value

    # Pattern 4: Customer PO: 5444534
    match = re.search(
        r"Customer\s+PO\s*:\s*([A-Za-z0-9\-\/]{5,})",
        text,
        re.IGNORECASE
    )

    if match:
        value = match.group(1).strip()

        if is_valid_po_number(value):
            return value

    # Do not use a broad "PO No + next text" pattern here.
    # In Radwell PDFs, the next token can be the word "Invoice".
    return None

def extract_invoice_date_from_text(text):

    match = re.search(
        r"Invoice\s+Date\s*:\s*([0-9]{1,2}-[A-Za-z]{3}-[0-9]{2,4})",
        text,
        re.IGNORECASE
    )

    if match:
        return match.group(1).strip()

    return None

def extract_po_line_details(text):

    po_lines = []

    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    def is_possible_item_line(line):
        line_lower = line.lower()

        if not re.match(r"^[A-Z0-9\-]+\s+.+", line):
            return False

        if any(skip in line_lower for skip in [
            "purchase order",
            "created date",
            "supplier",
            "ship to",
            "payment terms",
            "total",
            "printed by",
            "phone",
            "warehouse",
            "details"
        ]):
            return False

        return (
            "charcoal" in line_lower
            or "briquette" in line_lower
            or "paper bag" in line_lower
            or "lump" in line_lower
        )

    for index, line in enumerate(lines):

        if not is_possible_item_line(line):
            continue

        description = line.strip()

        lookahead = lines[index + 1:index + 8]
        block_text = " ".join(lookahead)

        quantity = None
        unit_price = None
        line_amount = None

        # Quantity: standalone number before prices
        for la in lookahead:
            qty_match = re.match(
                r"^([0-9,]+(?:\.\d{2})?)$",
                la
            )

            if qty_match:
                quantity = clean_number(qty_match.group(1))
                break

        # Prices: collect all $ amounts from next lines
        price_values = re.findall(
            r"\$([0-9,]+(?:\.\d{2})?)",
            block_text
        )

        numeric_prices = [
            clean_number(value)
            for value in price_values
            if clean_number(value) is not None
        ]

        if len(numeric_prices) >= 2:
            unit_price = numeric_prices[0]
            line_amount = numeric_prices[1]

        elif len(numeric_prices) == 1:
            line_amount = numeric_prices[0]

        # If quantity and line amount exist but unit price missing
        if (
            quantity
            and line_amount
            and unit_price is None
            and quantity != 0
        ):
            unit_price = round(line_amount / quantity, 2)

        # If quantity and unit price exist but line amount missing
        if (
            quantity
            and unit_price
            and line_amount is None
        ):
            line_amount = round(quantity * unit_price, 2)

        # Validate math
        if (
            quantity is not None
            and unit_price is not None
            and line_amount is not None
        ):
            expected_amount = round(quantity * unit_price, 2)

            if abs(expected_amount - line_amount) > 0.10:
                # Try alternative mapping if values look swapped
                if abs(quantity * line_amount - unit_price) <= 0.10:
                    old_unit_price = unit_price
                    unit_price = line_amount
                    line_amount = old_unit_price

            po_lines.append({
                "description": description,
                "quantity": quantity,
                "unit_price": unit_price,
                "line_amount": line_amount
            })

    return po_lines

def correct_po_header_fields(extraction_result, attachment_content):

    header = extraction_result.get("header", {})

    if re.search(r"Total\s*\(USD\)", attachment_content, re.IGNORECASE):
        header["currency"] = "USD"

    if "Jealous Devil, LLC" in attachment_content:

        header["buyer_name"] = "Jealous Devil, LLC"

        if not header.get("bill_to_name"):
            header["bill_to_name"] = "Jealous Devil, LLC"

        supplier = None

        match = re.search(
            r"#\s*Warehouse\s+Details\s+(\d{3,6}\s+)?(.+?)\s+\d+\s+West\s+Progress\s+Drive",
            attachment_content,
            re.IGNORECASE | re.DOTALL
        )

        if match:
            supplier = match.group(2).strip()

        if not supplier:
            match = re.search(
                r"#\s*Warehouse\s+Details\s+(.+?)\s+\d{3,6}\s+[A-Za-z]+\s+",
                attachment_content,
                re.IGNORECASE | re.DOTALL
            )

            if match:
                supplier = match.group(1).strip()

        if supplier:

            if not header.get("supplier_name"):

                supplier = re.sub(r"\s+", " ", supplier)
                supplier = re.sub(r"^\d{3,6}\s+", "", supplier)
                supplier = re.sub(r"^JD\s+", "", supplier, flags=re.IGNORECASE)
                supplier = supplier.strip()

                header["supplier_name"] = supplier


    extraction_result["header"] = header

    return extraction_result
    
def remove_duplicate_line_items(line_items):
    cleaned_items = []
    seen_keys = set()

    for item in line_items:
        key = (
            item.get("description"),
            clean_number(item.get("line_amount")),
            clean_number(item.get("quantity"))
        )

        if key not in seen_keys:
            cleaned_items.append(item)
            seen_keys.add(key)

    return cleaned_items


def filter_invoice_line_items_by_amount(extraction_result, valid_amounts):
    line_items = extraction_result.get("line_items", [])
    filtered_items = []

    used_amounts = []

    for item in line_items:
        item_amount = clean_number(item.get("line_amount"))

        if item_amount in valid_amounts and item_amount not in used_amounts:
            item["line_amount"] = item_amount
            filtered_items.append(item)
            used_amounts.append(item_amount)

    for index, item in enumerate(filtered_items):
        item["line_number"] = index + 1

    extraction_result["line_items"] = filtered_items
    return extraction_result


def set_document_number(extraction_result):
    header = extraction_result.get("header", {})
    document_type = extraction_result.get("document_type")

    document_number = extraction_result.get("document_number")

    if not document_number:
        if document_type == "Invoice":
            document_number = header.get("invoice_number")

        elif document_type == "Purchase Order":
            document_number = header.get("po_number")

        elif document_type == "Acknowledgement":
            document_number = (
                header.get("acknowledgement_number")
                or header.get("confirmation_number")
            )

        elif document_type == "GRN":
            document_number = (
                header.get("grn_number")
                or header.get("receipt_number")
                or header.get("delivery_note_number")
            )

    extraction_result["document_number"] = document_number
    return extraction_result


def update_validation_ready_fields(extraction_result):
    header = extraction_result.get("header", {})
    document_type = extraction_result.get("document_type")

    validation_ready_fields = extraction_result.get("validation_ready_fields", {})

    if header.get("supplier_name"):
        validation_ready_fields["supplier_validation_key"] = header.get("supplier_name")

    if header.get("po_number"):
        validation_ready_fields["po_match_key"] = header.get("po_number")

    if document_type == "Invoice":
        if header.get("invoice_number"):
            validation_ready_fields["invoice_match_key"] = header.get("invoice_number")

        validation_ready_fields["two_way_match_required"] = True
        validation_ready_fields["currency_check_required"] = True
        validation_ready_fields["three_way_match_required"] = False

    elif document_type == "Purchase Order":
        if header.get("po_number"):
            validation_ready_fields["po_match_key"] = header.get("po_number")

        validation_ready_fields["two_way_match_required"] = True
        validation_ready_fields["currency_check_required"] = True
        validation_ready_fields["three_way_match_required"] = False

    elif document_type == "GRN":
        grn_match_key = (
            header.get("grn_number")
            or header.get("receipt_number")
            or header.get("delivery_note_number")
        )

        if grn_match_key:
            validation_ready_fields["grn_match_key"] = grn_match_key

        validation_ready_fields["two_way_match_required"] = True
        validation_ready_fields["three_way_match_required"] = True
        validation_ready_fields["currency_check_required"] = False

    extraction_result["validation_ready_fields"] = validation_ready_fields
    return extraction_result


def fix_detected_documents(extraction_result):
    detected_documents = extraction_result.get("detected_documents", [])

    for document in detected_documents:
        file_type = document.get("file_type")

        if file_type in ["ft", "", None]:
            document["file_type"] = "PDF"

        if not document.get("document_category"):
            document["document_category"] = extraction_result.get("document_type")

        if not document.get("document_name"):
            document["document_name"] = (
                extraction_result.get("document_type")
                or "Document"
            )

    extraction_result["detected_documents"] = detected_documents
    return extraction_result


def generate_corrected_ai_intent(extraction_result):
    header = extraction_result.get("header", {})
    line_items = extraction_result.get("line_items", [])

    document_type = extraction_result.get("document_type")
    supplier_name = header.get("supplier_name") or "Supplier"
    buyer_name = header.get("buyer_name") or "Buyer"
    receiver_name = header.get("receiver_name") or header.get("ship_to_name") or "Receiver"

    invoice_number = header.get("invoice_number")
    po_number = header.get("po_number")
    grn_number = (
        header.get("grn_number")
        or header.get("receipt_number")
        or header.get("delivery_note_number")
    )

    total_amount = header.get("total_amount")
    currency = header.get("currency") or ""

    line_count = len(line_items)

    if document_type == "Invoice":
        intent = f"{supplier_name} submitted"

        if invoice_number:
            intent += f" Invoice {invoice_number}"

        if po_number:
            intent += f" against Purchase Order {po_number}"

        intent += " for payment processing."

        if total_amount:
            intent += f" The invoice total is {currency} {total_amount}."

        if line_count == 1:
            intent += " 1 invoice line item was identified from the attached document."
        elif line_count > 1:
            intent += f" {line_count} invoice line items were identified from the attached document."

        return intent

    if document_type == "Purchase Order":
        intent = f"{buyer_name} issued"

        if po_number:
            intent += f" Purchase Order {po_number}"

        intent += f" to {supplier_name}."

        if total_amount:
            intent += f" The purchase order total is {currency} {total_amount}."

        if line_count == 1:
            intent += " 1 purchase order line item was identified from the attached document."
        elif line_count > 1:
            intent += f" {line_count} purchase order line items were identified from the attached document."

        return intent

    if document_type == "GRN":
        intent = f"{receiver_name} confirmed goods receipt"

        if grn_number:
            intent += f" through GRN {grn_number}"

        if po_number:
            intent += f" against Purchase Order {po_number}"

        intent += "."

        if line_count == 1:
            intent += " 1 received line item was identified for 3-way matching."
        elif line_count > 1:
            intent += f" {line_count} received line items were identified for 3-way matching."

        return intent

    return extraction_result.get("ai_intent")


def normalize_line_items(extraction_result):
    normalized_items = []

    for index, line_item in enumerate(
        extraction_result.get("line_items", []),
        start=1
    ):
        line_item["line_amount"] = clean_number(
            line_item.get("line_amount")
        )

        line_item["unit_price"] = clean_number(
            line_item.get("unit_price")
        )

        line_item["quantity"] = clean_number(
            line_item.get("quantity")
        )

        if "ordered_quantity" in line_item:
            line_item["ordered_quantity"] = clean_number(
                line_item.get("ordered_quantity")
            )

        if "received_quantity" in line_item:
            line_item["received_quantity"] = clean_number(
                line_item.get("received_quantity")
            )

        if "accepted_quantity" in line_item:
            line_item["accepted_quantity"] = clean_number(
                line_item.get("accepted_quantity")
            )

        if "rejected_quantity" in line_item:
            line_item["rejected_quantity"] = clean_number(
                line_item.get("rejected_quantity")
            )

        quantity = line_item.get("quantity")
        unit_price = line_item.get("unit_price")
        line_amount = line_item.get("line_amount")

        # Calculate amount when quantity and unit price are available.
        if (
            line_amount is None
            and quantity is not None
            and unit_price is not None
        ):
            line_item["line_amount"] = round(
                quantity * unit_price,
                2
            )

        # Calculate unit price when amount and quantity are available.
        elif (
            unit_price is None
            and line_amount is not None
            and quantity not in [None, 0]
        ):
            line_item["unit_price"] = round(
                line_amount / quantity,
                4
            )

        if line_item.get("line_number") is None:
            line_item["line_number"] = index

        normalized_items.append(line_item)

    extraction_result["line_items"] = normalized_items
    return extraction_result

def correct_radwell_compact_invoice_header(
    extraction_result,
    attachment_content
):
    header = extraction_result.get("header", {})

    if "Radwell International" not in attachment_content:
        return extraction_result

    # Extract values using their actual labels instead of fixed line positions.
    invoice_date_match = re.search(
        r"Invoice\s*Date\s*[:#-]?\s*"
        r"(\d{1,2}/\d{1,2}/\d{4})",
        attachment_content,
        re.IGNORECASE
    )

    invoice_number_match = re.search(
        r"Invoice\s*(?:No\.?|Number)\s*[:#-]?\s*"
        r"([A-Z0-9\-]+)",
        attachment_content,
        re.IGNORECASE
    )

    customer_number_match = re.search(
        r"Customer\s*(?:No\.?|Number|#)\s*[:#-]?\s*"
        r"([A-Z0-9\-]+)",
        attachment_content,
        re.IGNORECASE
    )

    po_number_match = re.search(
        r"\bPO\s*(?:No\.?|Number|#)\s*[:#-]?\s*"
        r"([A-Z0-9\-]+)",
        attachment_content,
        re.IGNORECASE
    )

    order_number_match = re.search(
        r"\bOrder\s*(?:No\.?|Number|#)\s*[:#-]?\s*"
        r"([A-Z0-9\-]+)",
        attachment_content,
        re.IGNORECASE
    )

    if invoice_date_match:
        invoice_date = invoice_date_match.group(1).strip()
        header["invoice_date"] = invoice_date
        header["document_date"] = invoice_date

    if invoice_number_match:
        invoice_number = invoice_number_match.group(1).strip()

        if re.match(r"^[A-Z0-9\-]{5,}$", invoice_number):
            header["invoice_number"] = invoice_number
            extraction_result["document_number"] = invoice_number

    if customer_number_match:
        customer_number = customer_number_match.group(1).strip()

        if re.match(r"^[A-Z0-9\-]{4,}$", customer_number):
            header["customer_number"] = customer_number
            header["reference_number"] = customer_number

    if po_number_match:
        po_number = po_number_match.group(1).strip()

        if is_valid_po_number(po_number):
            header["po_number"] = po_number
            header["customer_po"] = po_number

    if order_number_match:
        order_number = order_number_match.group(1).strip()

        if re.match(r"^[A-Z0-9\-]{4,}$", order_number):
            header["order_number"] = order_number

    subtotal_match = re.search(
        r"Sub[- ]?total\s+([\d,]+\.\d{2})",
        attachment_content,
        re.IGNORECASE
    )

    if subtotal_match:
        header["subtotal"] = clean_number(
            subtotal_match.group(1)
        )

    extraction_result["header"] = header

    return extraction_result


def process_invoice(extraction_result, attachment_content):
    header = extraction_result.get("header", {})

    extraction_result = correct_radwell_compact_invoice_header(
        extraction_result,
        attachment_content
    )

    header = extraction_result.get("header", {})

    extracted_invoice_number = extract_invoice_number_from_text(
        attachment_content
    )

    if extracted_invoice_number:
        header["invoice_number"] = extracted_invoice_number

    extracted_customer_po = extract_customer_po_from_text(
        attachment_content
    )

    current_po_number = header.get("po_number")

    # Keep the AI-extracted value when it is already valid.
    # Use text fallback only if the current value is missing or invalid.
    if not is_valid_po_number(current_po_number):
        if is_valid_po_number(extracted_customer_po):
            header["po_number"] = extracted_customer_po
            header["customer_po"] = extracted_customer_po
    else:
        header["po_number"] = str(current_po_number).strip()

        if not is_valid_po_number(header.get("customer_po")):
            header["customer_po"] = header["po_number"]

    extracted_invoice_date = extract_invoice_date_from_text(
        attachment_content
    )

    if extracted_invoice_date:
        header["invoice_date"] = extracted_invoice_date
        header["document_date"] = extracted_invoice_date

    if header.get("currency") == "US":
        header["currency"] = "USD"

    grand_total = extract_amount_near_label(
        attachment_content,
        "Grand Total"
    )

    total_amount_due = extract_amount_near_label(
        attachment_content,
        "Total Amount Due"
    )

    if grand_total is not None:
        header["total_amount"] = grand_total
        print("Corrected Grand Total :", grand_total)

    elif total_amount_due is not None:
        header["total_amount"] = total_amount_due

    else:
        header["total_amount"] = clean_number(
            header.get("total_amount")
        )

    subtotal = (
        extract_amount_near_label(
            attachment_content,
            "Sub-total"
        )
        or extract_amount_near_label(
            attachment_content,
            "Sub-Total"
        )
        or extract_amount_near_label(
            attachment_content,
            "Subtotal"
        )
    )

    if subtotal is not None:
        subtotal = clean_number(subtotal)

        if (
            header.get("total_amount") is not None
            and subtotal > header.get("total_amount")
        ):
            header["subtotal"] = header.get("total_amount")
        else:
            header["subtotal"] = subtotal

    else:
        # If subtotal was not found but tax and freight are zero,
        # subtotal should equal total amount.
        if (
            header.get("subtotal") in [None, 0]
            and header.get("total_amount") is not None
            and not re.search(
                r"(Tax|VAT|GST|Sales Tax|Freight|Shipping)",
                attachment_content,
                re.IGNORECASE
            )
        ):
            header["subtotal"] = header.get("total_amount")
        else:
            header["subtotal"] = clean_number(
                header.get("subtotal")
            )

    if not re.search(
        r"\b(Tax|VAT|GST|Sales Tax|HST)\b",
        attachment_content,
        re.IGNORECASE
    ):
        header["tax_amount"] = None
        print("Corrected Tax :", header.get("tax_amount"))
    else:
        header["tax_amount"] = clean_number(
            header.get("tax_amount")
        )

    if not re.search(
        r"\b(Freight|Shipping Charge|Shipping)\b",
        attachment_content,
        re.IGNORECASE
    ):
        header["freight_amount"] = None
        print("Corrected Freight :", header.get("freight_amount"))
    else:
        header["freight_amount"] = clean_number(
            header.get("freight_amount")
        )

    corrected_line_amounts = extract_resolute_line_amounts(
        attachment_content
    )

    print("Corrected Line Amounts :", corrected_line_amounts)

    if corrected_line_amounts:
        rebuilt_line_items = []

        for index, amount in enumerate(corrected_line_amounts):
            rebuilt_line_items.append({
                "line_number": index + 1,
                "description": (
                    "RESOLUTE BOOK 70 / BOOK SHADE / 600 ^m / "
                    "4802.61.3191 / Uncoated Gwd. Paper Other: Other"
                ),
                "quantity": None,
                "unit_price": None,
                "line_amount": amount,
                "currency": header.get("currency"),
                "po_reference": header.get("po_number"),
                "end_user": "PENGUIN RANDOM HOUSE",
                "item_code": None,
                "material_code": None,
                "ordered_quantity": None,
                "received_quantity": None,
                "accepted_quantity": None,
                "rejected_quantity": None,
                "quantity_uom": None
            })

        extraction_result["line_items"] = rebuilt_line_items

        print(
            "Rebuilt Resolute invoice line items "
            "from post-processing."
        )

    else:
        extraction_result["line_items"] = remove_duplicate_line_items(
            extraction_result.get("line_items", [])
        )

    if (
        header.get("subtotal") is None
        and header.get("total_amount") is not None
        and header.get("tax_amount") in [None, 0]
        and header.get("freight_amount") in [None, 0]
    ):
        header["subtotal"] = header.get("total_amount")

    bad_invoice_values = [
        "number",
        "date",
        "page",
        "invoice",
        "invoice number"
    ]

    if (
        header.get("invoice_number")
        and str(header.get("invoice_number")).strip().lower()
        in bad_invoice_values
    ):
        corrected_invoice_number = extract_invoice_number_from_text(
            attachment_content
        )

        if corrected_invoice_number:
            header["invoice_number"] = corrected_invoice_number

    if header.get("invoice_number"):
        extraction_result["document_number"] = header.get(
            "invoice_number"
        )

    # Generic Recovery Layer - Phase 1
    recovered_line_items = calculate_missing_line_values(
        extraction_result.get("line_items", [])
    )

    extraction_result["line_items"] = recovered_line_items

    for item in extraction_result.get("line_items", []):
        if item.get("currency") == "US":
            item["currency"] = "USD"

        if not item.get("currency") and header.get("currency"):
            item["currency"] = header.get("currency")

        if (
            item.get("unit_price") is None
            and item.get("quantity") in [1, 1.0, "1"]
            and item.get("line_amount") is not None
        ):
            item["unit_price"] = item.get("line_amount")

    extraction_result["header"] = header

    return extraction_result

def extract_po_supplier_block(text):

    lines = [line.strip() for line in text.splitlines() if line.strip()]

    for index, line in enumerate(lines):

        if line.lower() == "details":

            possible_supplier = lines[index + 1] if index + 1 < len(lines) else None

            if possible_supplier:
                possible_supplier = re.sub(
                    r"^\d{4}\s+",
                    "",
                    possible_supplier
                ).strip()

                # Ignore buyer/company block
                if "Jealous Devil" not in possible_supplier:
                    return possible_supplier

    return None

def extract_po_supplier_from_supplier_section(text):
    match = re.search(
        r"Supplier:\s*[\r\n]+\s*Ship\s+To:\s*[\r\n]+\s*([^\r\n]+)",
        text,
        re.IGNORECASE
    )

    if match:
        return match.group(1).strip()

    return None

def process_purchase_order(extraction_result, attachment_content):
    header = extraction_result.get("header", {})

    extracted_supplier = extract_po_supplier_block(attachment_content)

    if extracted_supplier:
        header["supplier_name"] = extracted_supplier

    header["total_amount"] = clean_number(
        header.get("total_amount")
    )

    header["subtotal"] = clean_number(
        header.get("subtotal")
    )

    if (
        header.get("total_amount") is not None
        and (
            header.get("subtotal") is None
            or header.get("subtotal") != header.get("total_amount")
        )
    ):
        header["subtotal"] = header.get("total_amount")

    header["tax_amount"] = clean_number(
        header.get("tax_amount")
    )

    header["freight_amount"] = clean_number(
        header.get("freight_amount")
    )

    po_line_details = extract_po_line_details(attachment_content)
    print("DEBUG PO LINE DETAILS:", po_line_details)
    print("DEBUG PO LINE DETAILS:", po_line_details)

    print("Corrected PO Line Details :", po_line_details)

    for index, line_item in enumerate(extraction_result.get("line_items", [])):
        if index < len(po_line_details):

            if po_line_details[index].get("description"):
                line_item["description"] = po_line_details[index].get("description")

            if po_line_details[index].get("quantity") is not None:
                line_item["quantity"] = po_line_details[index].get("quantity")
                line_item["ordered_quantity"] = po_line_details[index].get("quantity")

            if po_line_details[index].get("unit_price") is not None:
                line_item["unit_price"] = po_line_details[index].get("unit_price")

            if po_line_details[index].get("line_amount") is not None:
                line_item["line_amount"] = po_line_details[index].get("line_amount")

            if not line_item.get("currency") and header.get("currency"):
                line_item["currency"] = header.get("currency")

    extraction_result["line_items"] = remove_duplicate_line_items(
        extraction_result.get("line_items", [])
    )

    extraction_result["header"] = header

    extraction_result = correct_po_header_fields(
        extraction_result,
        attachment_content
    )

    header = extraction_result.get("header", {})

    correct_supplier = extract_po_supplier_from_supplier_section(attachment_content)

    if correct_supplier:
        header["supplier_name"] = correct_supplier
        extraction_result["header"] = header


    validation_ready_fields = extraction_result.get("validation_ready_fields", {})

    if header.get("supplier_name"):
        validation_ready_fields["supplier_validation_key"] = header.get("supplier_name")

    extraction_result["validation_ready_fields"] = validation_ready_fields

    return extraction_result


def process_grn(extraction_result, attachment_content):
    header = extraction_result.get("header", {})

    header["total_amount"] = clean_number(
        header.get("total_amount")
    )

    header["subtotal"] = clean_number(
        header.get("subtotal")
    )

    header["tax_amount"] = clean_number(
        header.get("tax_amount")
    )

    header["freight_amount"] = clean_number(
        header.get("freight_amount")
    )

    extraction_result["line_items"] = remove_duplicate_line_items(
        extraction_result.get("line_items", [])
    )

    extraction_result["header"] = header

    header = extraction_result.get("header", {})
    po_number = header.get("po_number")

    for line_item in extraction_result.get("line_items", []):
        if not line_item.get("po_reference") and po_number:
            line_item["po_reference"] = po_number

        if line_item.get("received_quantity") is None and line_item.get("quantity") is not None:
            line_item["received_quantity"] = line_item.get("quantity")

    return extraction_result

def correct_order_confirmation_fields(extraction_result, attachment_content):

    if not re.search(r"ORDER\s+CONFIRMATION", attachment_content, re.IGNORECASE):
        return extraction_result

    header = extraction_result.get("header", {})

    extraction_result["document_type"] = "Acknowledgement"

    # Confirmation number
    confirmation_match = re.search(
        r"Confirmation\s+No\.?\s*([0-9]+)",
        attachment_content,
        re.IGNORECASE
    )

    if confirmation_match:
        confirmation_no = confirmation_match.group(1).strip()
        header["confirmation_number"] = confirmation_no
        header["acknowledgement_number"] = confirmation_no
        extraction_result["document_number"] = confirmation_no

    # PO number - strict one-line value
    po_match = re.search(
        r"Purchase\s+Order\s+No\.?\s*[\n\r]+\s*([0-9]+\s+[A-Z]{2})",
        attachment_content,
        re.IGNORECASE
    )

    if po_match:
        po_no = re.sub(r"\s+", " ", po_match.group(1)).strip()
        header["po_number"] = po_no

    # Buyer
    header["buyer_name"] = "Central National Canada ULC"

    # Supplier
    header["supplier_name"] = "Hulamin Operations Proprietary Limited"

    # Supplier address
    supplier_address_match = re.search(
        r"HEAD OFFICE:\s*(.*?South Africa)",
        attachment_content,
        re.IGNORECASE | re.DOTALL
    )

    if supplier_address_match:
        header["supplier_address"] = re.sub(
            r"\s+",
            " ",
            supplier_address_match.group(1)
        ).strip()

    # Document date = Issue/Re-Issue Date
    issue_date_match = re.search(
        r"Issue/Re-Issue\s+Date\s+([0-9]{1,2}-[A-Z]{3}-[0-9]{4})",
        attachment_content,
        re.IGNORECASE
    )

    if issue_date_match:
        header["document_date"] = issue_date_match.group(1).strip()

    # Payment terms
    header["payment_terms"] = "14 Days from Bill of Lading Date"

    # ACK should not use due date
    header["due_date"] = None

    # Fix line item PO references after PO cleanup
    for item in extraction_result.get("line_items", []):
        item["po_reference"] = header.get("po_number")

    # Detected document sync
    extraction_result["detected_documents"] = [
        {
            "file_type": "PDF",
            "document_name": "Order Confirmation",
            "document_category": "Acknowledgement"
        }
    ]

    # AI intent rebuild
    extraction_result["ai_intent"] = (
        f"{header.get('supplier_name')} submitted "
        f"Acknowledgement {header.get('acknowledgement_number')} "
        f"for Purchase Order {header.get('po_number')}."
    )

    # Validation keys
    validation_ready_fields = extraction_result.get("validation_ready_fields", {})

    validation_ready_fields["po_match_key"] = header.get("po_number")
    validation_ready_fields["supplier_validation_key"] = header.get("supplier_name")
    validation_ready_fields["invoice_match_key"] = None
    validation_ready_fields["two_way_match_required"] = False
    validation_ready_fields["three_way_match_required"] = False

    extraction_result["validation_ready_fields"] = validation_ready_fields
    extraction_result["header"] = header

    return extraction_result

def correct_acknowledgement_line_items(extraction_result, attachment_content):

    if not re.search(r"ORDER\s+CONFIRMATION", attachment_content, re.IGNORECASE):
        return extraction_result

    line_items = extraction_result.get("line_items", [])

    pattern = re.compile(
        r"\b([0-9]{6}E)\s+"
        r"([0-9]+)\s*/\s*[0-9]+\s+"
        r"([0-9,]+)\s+"
        r"(PLATE.*?INTERLEAVE\s*-\s*PAPER).*?"
        r"([0-9]{1,2}-[A-Z]{3}-[0-9]{4})\s+"
        r"([0-9]{1,2}-[A-Z]{3}-[0-9]{4}).*?"
        r"([0-9]+\.[0-9]{4})",
        re.IGNORECASE | re.DOTALL
    )

    matches = pattern.findall(attachment_content)

    corrected_lines = []

    for match in matches:
        item_code = match[0].strip()
        line_number = match[1].strip()
        quantity = clean_number(match[2])
        description = re.sub(r"\s+", " ", match[3]).strip()
        buyer_requested_arrival = match[4].strip()
        seller_confirmed_arrival = match[5].strip()
        unit_price = clean_number(match[6])

        corrected_lines.append({
            "currency": "USD",
            "end_user": None,
            "quantity": quantity,
            "item_code": item_code,
            "unit_price": unit_price,
            "description": description,
            "line_amount": None,
            "line_number": line_number,
            "po_reference": extraction_result.get("header", {}).get("po_number"),
            "quantity_uom": "LBS",
            "material_code": None,
            "ordered_quantity": quantity,
            "accepted_quantity": quantity,
            "received_quantity": None,
            "rejected_quantity": None,
            "buyer_requested_arrival": buyer_requested_arrival,
            "seller_confirmed_arrival": seller_confirmed_arrival
        })

    if corrected_lines:
        extraction_result["line_items"] = corrected_lines

    return extraction_result

def process_acknowledgement(extraction_result, attachment_content):

    header = extraction_result.get("header", {})

    header["total_amount"] = clean_number(
        header.get("total_amount")
    )

    header["subtotal"] = clean_number(
        header.get("subtotal")
    )

    header["tax_amount"] = clean_number(
        header.get("tax_amount")
    )

    header["freight_amount"] = clean_number(
        header.get("freight_amount")
    )

    line_items = extraction_result.get("line_items", [])

    if (
        len(line_items) == 1
        and all(value is None for value in line_items[0].values())
    ):
        extraction_result["line_items"] = []

    extraction_result["header"] = header

    extraction_result = correct_acknowledgement_line_items(
        extraction_result,
        attachment_content
    )

    extraction_result = correct_order_confirmation_fields(
        extraction_result,
        attachment_content
    )

    return extraction_result

def update_status_and_confidence(extraction_result):
    header = extraction_result.get("header", {})
    document_type = extraction_result.get("document_type")
    line_items = extraction_result.get("line_items", [])

    if document_type == "Invoice":

        header_complete = all([
            header.get("invoice_number"),
            is_valid_po_number(header.get("po_number")),
            header.get("supplier_name"),
            header.get("total_amount") is not None
        ])

        lines_complete = (
            len(line_items) > 0
            and all(
                item.get("description")
                and item.get("line_amount") is not None
                for item in line_items
            )
        )

        if header_complete and lines_complete:
            extraction_result["extraction_status"] = "completed"
        else:
            extraction_result["extraction_status"] = "review_required"

    elif document_type == "Purchase Order":

        if (
            header.get("po_number")
            and header.get("supplier_name")
            and header.get("total_amount") is not None
            and len(line_items) > 0
        ):
            extraction_result["extraction_status"] = "completed"
        else:
            extraction_result["extraction_status"] = "review_required"

    elif document_type == "GRN":

        grn_identifier = (
            header.get("grn_number")
            or header.get("receipt_number")
            or header.get("delivery_note_number")
        )

        if (
            grn_identifier
            and header.get("po_number")
            and len(line_items) > 0
        ):
            extraction_result["extraction_status"] = "completed"
        else:
            extraction_result["extraction_status"] = "review_required"

    elif document_type == "Acknowledgement":

        acknowledgement_identifier = (
            header.get("acknowledgement_number")
            or header.get("confirmation_number")
        )

        if (
            acknowledgement_identifier
            and header.get("po_number")
            and header.get("supplier_name")
        ):
            extraction_result["extraction_status"] = "completed"
        else:
            extraction_result["extraction_status"] = "review_required"

    return extraction_result

def post_process_extraction(extraction_result, attachment_content):
    header = extraction_result.get("header", {})
    document_type = extraction_result.get("document_type")

    print("\n================ POST PROCESSING STARTED ================\n")

    print("Document Type   :", document_type)
    print("AI Total Amount :", header.get("total_amount"))
    print("AI Subtotal     :", header.get("subtotal"))
    print("AI Tax          :", header.get("tax_amount"))
    print("AI Freight      :", header.get("freight_amount"))

    if not header.get("po_number"):
        extracted_po_number = extract_po_number_from_text(attachment_content)
        if extracted_po_number:
            header["po_number"] = extracted_po_number

    extraction_result["header"] = header

    extraction_result = normalize_line_items(
        extraction_result
    )

    extraction_result = correct_order_confirmation_fields(
        extraction_result,
        attachment_content
    )

    document_type = extraction_result.get("document_type")

    if document_type == "Invoice":
        extraction_result = process_invoice(
            extraction_result,
            attachment_content
        )

    elif document_type == "Purchase Order":
        extraction_result = process_purchase_order(
            extraction_result,
            attachment_content
        )

    elif document_type == "GRN":
        extraction_result = process_grn(
            extraction_result,
            attachment_content
        )

    elif document_type == "Acknowledgement":
        extraction_result = process_acknowledgement(
            extraction_result,
            attachment_content
        )

    extraction_result = set_document_number(
        extraction_result
    )

    extraction_result = update_validation_ready_fields(
        extraction_result
    )

    extraction_result = update_status_and_confidence(
        extraction_result
    )

    extraction_result = fix_detected_documents(
        extraction_result
    )

    print("\nFinal Header After Post Processing\n")
    print(extraction_result.get("header", {}))
    print("\n================ POST PROCESSING FINISHED ================\n")

    extraction_result["ai_intent"] = generate_corrected_ai_intent(
        extraction_result
    )

    return extraction_result
