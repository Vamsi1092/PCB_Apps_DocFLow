from typing import Any, Dict, List, Optional


def to_number(value: Any) -> Optional[float]:
    """
    Safely converts invoice values into numbers.

    Examples:
        "6,980.00"  -> 6980.0
        "$15.00"    -> 15.0
        None        -> None
        ""          -> None
    """

    if value is None:
        return None

    if isinstance(value, (int, float)):
        return float(value)

    cleaned_value = str(value).strip()

    if not cleaned_value:
        return None

    cleaned_value = (
        cleaned_value
        .replace(",", "")
        .replace("$", "")
        .replace("₹", "")
        .replace("€", "")
        .replace("£", "")
        .strip()
    )

    try:
        return float(cleaned_value)
    except (TypeError, ValueError):
        return None


def calculate_missing_line_values(
    line_items: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Calculates missing invoice line values when enough information exists.

    Rules:
    1. quantity + unit_price -> line_amount
    2. quantity + line_amount -> unit_price
    """

    recovered_lines = []

    for index, original_line in enumerate(line_items):
        line = dict(original_line)

        quantity = to_number(line.get("quantity"))
        unit_price = to_number(line.get("unit_price"))
        line_amount = to_number(line.get("line_amount"))

        if quantity is not None and unit_price is not None:
            if line_amount is None:
                line_amount = round(quantity * unit_price, 2)

        if quantity not in (None, 0) and line_amount is not None:
            if unit_price is None:
                unit_price = round(line_amount / quantity, 4)

        line["line_number"] = (
            line.get("line_number")
            or index + 1
        )

        line["quantity"] = quantity
        line["unit_price"] = unit_price
        line["line_amount"] = line_amount

        recovered_lines.append(line)

    return recovered_lines


def invoice_needs_recovery(
    extraction_result: Dict[str, Any]
) -> bool:
    """
    Checks whether an invoice still has incomplete line-item information.
    """

    if extraction_result.get("document_type") != "Invoice":
        return False

    line_items = extraction_result.get("line_items") or []

    if not line_items:
        return True

    for line in line_items:
        quantity = to_number(line.get("quantity"))
        unit_price = to_number(line.get("unit_price"))
        line_amount = to_number(line.get("line_amount"))

        if line_amount is None:
            return True

        if quantity is not None and quantity != 0:
            if unit_price is None:
                return True

    return False

def normalize_line_number(value):
    """
    Converts invoice line references into an integer.

    Examples:
        "1.1" -> 1
        "2.1" -> 2
        "3"   -> 3
        4     -> 4

    Returns None when conversion is not possible.
    """

    if value is None:
        return None

    try:
        value_text = str(value).strip()

        if not value_text:
            return None

        # Some invoices use hierarchical line numbers such as 1.1 or 2.1.
        # Supabase invoice_lines.line_number expects an integer.
        if "." in value_text:
            value_text = value_text.split(".", 1)[0]

        return int(value_text)

    except (TypeError, ValueError):
        return None

def get_valid_invoice_lines(
    line_items: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Returns only invoice lines that have a valid amount.

    This prevents one incomplete line from crashing
    the complete invoice database save.
    """

    valid_lines = []

    for index, line_item in enumerate(line_items, start=1):

        # Normalize line numbers such as:
        # 1.1 -> 1
        # 2.1 -> 2
        normalized_line_number = normalize_line_number(
            line_item.get("line_number")
        )

        if normalized_line_number is None:
            normalized_line_number = index

        line_amount = to_number(line_item.get("line_amount"))

        if line_amount is None:
            continue

        cleaned_line = dict(line_item)

        cleaned_line["line_number"] = normalized_line_number
        cleaned_line["line_amount"] = line_amount

        valid_lines.append(cleaned_line)

    return valid_lines