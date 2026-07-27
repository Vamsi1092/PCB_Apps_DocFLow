import os
import re
import json
from json_repair import repair_json

from dotenv import load_dotenv
from app.integrations.oci_genai import get_chat_response

load_dotenv()


def classify_document(subject, body, attachment_content):

    prompt = f"""
You are an Accounts Payable AI Assistant.

Classify the following email into exactly one of these document types:

1. Invoice
2. Purchase Order
3. Acknowledgement
4. GRN
5. Others

Rules:
- Classify as Invoice if the email or attachment contains invoice number, invoice date, total amount, GST/tax, payment terms, supplier invoice, bill, amount due, or remit-to information.
- Classify as Purchase Order if the email or attachment contains purchase order, PO number, buyer, supplier, procurement, order details, delivery date, or purchase request.
- Classify as Acknowledgement if the email or attachment confirms or accepts a purchase order, including words like acknowledgement, accepted, confirmed, acceptance, delivery schedule, or thank you for your purchase order.
- Classify as GRN if the email or attachment contains GRN, Goods Receipt Note, Goods Received Note, Goods Receipt, Material Receipt, Delivery Receipt, Receiving Report, warehouse receipt, received quantity, accepted quantity, rejected quantity, goods received, received goods, or receipt against PO.
- Classify as Others only if the email is general communication, meeting notes, project discussion, weekly status update, greeting, or unrelated content.

Subject:
{subject}

Body:
{body}

Attachment Content:
{attachment_content}

IMPORTANT:

Use ONLY these folder names:

Invoice
Purchase Order
Acknowledgement
GRN
Others

Never return:
General Communication
General
PO
PurchaseOrder
Acknowledgment
Invoice Folder
Goods Receipt Note
Goods Received Note
Delivery Receipt
GRN Folder
Receiving Report

The target_folder MUST exactly match one of the five folder names above.

Return ONLY valid JSON in this exact format:

{{
    "document_type": "Invoice",
    "confidence_score": 0.97,
    "reason": "Invoice number and total amount detected",
    "target_folder": "Invoice",
    "ai_status": "success"
}}
"""

    try:
        text = get_chat_response(
            prompt=prompt,
            system_prompt="You are an Accounts Payable AI Assistant.",
            temperature=0
        )


        if text.startswith("```"):
            text = text.replace("```json", "").replace("```", "").strip()

        try:
            result = json.loads(text)
        except json.JSONDecodeError:
            fixed_text = repair_json(text)
            result = json.loads(fixed_text)

        result["ai_model_used"] = "OCI Gemini 2.5 Pro"
        result["ai_status"] = "success"

        return result

    except Exception as error:
        return {
            "document_type": "Others",
            "confidence_score": 0.0,
            "reason": "AI classification failed. Manual review required.",
            "target_folder": "Others",
            "ai_status": "failed",
            "error": str(error)
        }


def extract_document_data(subject, body, attachment_content):

    prompt = f"""
You are an Intelligent Accounts Payable Document Understanding and Extraction AI.

Your task is to read the email and attachment content, understand the business intent, and extract AP-ready structured data.

The document can be one of these types:
1. Invoice
2. Purchase Order
3. Acknowledgement
4. GRN
5. Credit Memo
6. Supplier Statement
7. Payment Follow-up
8. Others

Input Details:

Email Subject:
{subject}

Email Body:
{body}

Attachment Content:
{attachment_content}

Important Rules:
- Return ONLY valid JSON.
- Do not return explanation outside JSON.
- Do not guess values.
- If a field is not available, return null.
- Dates should be kept exactly as found in the document.
- Amounts should be numbers only.
- Extract both header-level fields and line-item-level fields.
- Extract customer_number only when the document explicitly contains a customer account identifier.
- It may appear as Customer Number, Customer ID, Customer Account, Client Number, Account Number, or Customer Code.
- Do not confuse customer_number with Purchase Order Number, Sales Order Number, Invoice Number, supplier code, or tracking number.
- If no customer account identifier is explicitly present, return null.
- ai_intent is the AI Understanding shown to the AP user.
- line_items must be an array. If no line items are found, return an empty array.
- exception_review should explain if anything needs review.
- validation_ready_fields should help future Supplier/JDE validation and 2-way/3-way matching.
document_number must always be copied from the primary business identifier extracted from the document.

Invoice:
document_number = invoice_number

Purchase Order:
document_number = po_number

Acknowledgement:
document_number = acknowledgement_number
If acknowledgement_number is unavailable, use confirmation_number.

GRN:
document_number = grn_number
If grn_number is unavailable, use receipt_number.
If receipt_number is unavailable, use delivery_note_number.

Never use document labels, dates, page numbers, or headings as document_number.  - Invoice: invoice_number
  - Purchase Order: po_number
  - Acknowledgement: acknowledgement_number or confirmation_number
  - GRN: grn_number or receipt_number or delivery_note_number

Invoice Rules:
IMPORTANT INVOICE HEADER EXTRACTION RULES

PURCHASE ORDER NUMBER AND ORDER NUMBER RULES

- po_number and order_number are two different business fields.
- A value explicitly associated with "PO No", "PO Number", "Purchase Order No",
  "Purchase Order Number", or "Customer PO" must populate header.po_number.
- A value explicitly associated with "Order No", "Order Number",
  "Original Order No", or "Sales Order No" must populate header.order_number.
- Never place an Order No value into po_number.
- Never place a PO No value into order_number.
- Never swap po_number and order_number.
- Preserve both values separately when both are present.
- customer_po should equal po_number only when the document explicitly identifies
  the value as a customer PO or purchase order reference.

IMPORTANT PDF LAYOUT RULE

PDF text extraction may place values before their visual labels or may separate
labels and values into different parts of the extracted text.

Do not rely only on the order of lines in the OCR text.
Use the document's business labels and surrounding section structure.

For Radwell invoices in the compact layout:

- The top values may represent invoice date, invoice number, customer number,
  and an internal order/taker reference.
- The value associated with "PO No" is the purchase order number.
- The value associated with "Order No" is the internal order number.
- Do not interpret the internal Order No as the purchase order number.

Example:

Invoice No. = 35404276
Customer # = 854552
PO No = 18498927
Order No = 913077

Return:

"invoice_number": "35404276"
"customer_number": "854552"
"po_number": "18498927"
"customer_po": "18498927"
"order_number": "913077"

Never return:

"po_number": "913077"
"order_number": "18498927"

- Never extract column labels as field values.
- Invoice Number must always be the business invoice identifier printed on the document.
- If the document contains a table like:

Number      Date      Page
10614771    26-JAN-26 1 of 1

then extract:

invoice_number = 10614771
invoice_date = 26-JAN-26

Never return:

invoice_number = "Number"
invoice_number = "Date"
invoice_number = "Page"

Always extract the value beneath or beside the label.

If multiple document numbers exist, prioritize:

1. Invoice Number
2. Invoice No.
3. Invoice #
4. Number (business document number)

Do not use Purchase Order Number, Sales Order Number, Tracking Number, Page Number, or column headers as the invoice number.

If the invoice number cannot be confidently identified, return null instead of guessing.
- Financial values must NEVER be calculated or inferred.
- If multiple numeric values are present, do not assume which one is the invoice total. Use only values explicitly associated with financial labels.
- For Invoice documents, total_amount must come only from labels such as Grand Total, Total Amount, Amount Due, Total Amount Due, Invoice Total, or Total Amount Due in US Dollars.
- subtotal must come only from labels such as Subtotal or Sub-Total.
- tax_amount must only be extracted if the invoice explicitly contains labels such as Tax, VAT, GST, Sales Tax, or HST. Otherwise return null.
- freight_amount must only be extracted if Freight or Shipping Charge is explicitly shown.
Freight Terms are NOT Incoterms.

Populate incoterms only when internationally recognized Incoterms are explicitly present, such as:

EXW
FOB
FCA
DAP
DDP
CIF
CFR
CIP

Do not store shipping instructions such as:

Bill UPS Collect
Collect
Prepaid
Third Party Billing

inside incoterms.

If only freight instructions exist:

incoterms = null
- Never confuse Grand Total Weight with Grand Total Amount.
- Never confuse Gross Weight or Net Weight with invoice totals.
- Gross Weight, Net Weight, Total Weight, Roll Count, Quantity, and Package Count are NOT financial amounts.
- For line_items.line_amount, copy the value from the document's Amount column only.
- Do not calculate line_amount from quantity, rolls, packages, price, weight, width, or diameter.
Invoice Line Item Rules:
- Do not skip the first product line item.
- If the same product description appears multiple times with different sizes, quantities, weights, or amounts, treat each occurrence as a separate line item.
- Preserve invoice line items in the same order as shown in the document.
- For RESOLUTE invoices, each "RESOLUTE BOOK 70" product section is a valid invoice line item.
- Do not treat repeated descriptions as duplicates if the amount is different.
- Do not include subtotal, grand total, weight summary, roll/package summary, or page total as line items.
- Only include product rows that have a final Amount column value.

Purchase Order Rules:
- For Purchase Order documents, extract PO number, supplier, buyer, document date, payment terms, currency, total amount, and purchase order line items.
- For PO line items, extract item description, quantity, unit price, line amount, currency, and PO reference if available.
- Purchase Order documents are usually used for 2-way matching.
IMPORTANT PURCHASE ORDER EXTRACTION RULES

The Supplier and Ship To sections may appear vertically or side-by-side.

Example:

Supplier:               Ship To:
CNG                     DO IT BEST CORP.

Supplier = CNG
Ship To = DO IT BEST CORP.

Never use the Ship To company as the Supplier.

The supplier is the vendor issuing or receiving the Purchase Order.

The Ship To company is the delivery destination and must populate:

ship_to_name
ship_to_address

NOT

supplier_name
supplier_address

If the Supplier field is immediately followed by the Ship To label,
extract the first business name after "Supplier:" as supplier_name,
even if the address appears later.

Do not assume the nearest address belongs to the supplier.

Acknowledgement Rules:
- For Acknowledgement documents, extract acknowledgement number, confirmation number, PO number, supplier, buyer, acknowledgement date, confirmation status, expected delivery date, and confirmed line items if available.
- Acknowledgement confirms supplier acceptance or confirmation of a purchase order.
Classify as Acknowledgement if the document contains any of these phrases:
- ORDER CONFIRMATION
- ORDER CONFIRMATION DETAILS
- CONFIRMATION NO
- Confirmation No.
- PO Confirmation
- Order Acknowledgement

Important:
If a document contains both "Purchase Order No." and "ORDER CONFIRMATION", classify it as Acknowledgement, not Purchase Order.

GRN Rules:
- If the document is a GRN, Goods Receipt Note, Goods Received Note, Goods Receipt, Material Receipt, Delivery Receipt, Receiving Report, Warehouse Receipt, or Goods Received document, set document_type as "GRN".
- GRN means goods were received against a Purchase Order.
- For GRN documents, extract GRN number, receipt number, delivery note number, PO number, supplier, receiver/warehouse, received date, ship-to, and received line items.
- For GRN line items, received_quantity is the most important field.
- Extract ordered_quantity, received_quantity, accepted_quantity, rejected_quantity, quantity_uom, item_code, material_code, and description if available.
- GRN documents usually do not contain invoice payment totals. Do not force total_amount unless clearly printed.
- GRN documents are used for 3-way matching, so three_way_match_required should be true.
- GRN does not request payment directly. It confirms goods receipt for validation and matching.

AI Understanding Rules:
Generate a business narrative of 2 to 4 sentences using the actual extracted values from the document.

The AI Understanding should answer:
1. Who sent or issued the document?
2. What business document was received?
3. What important business references were identified, such as invoice number, PO number, GRN number, acknowledgement number, supplier, or buyer?
4. What business action is being requested or confirmed?
5. Mention important totals, dates, quantities, tax, freight, received quantities, or line item count if available.
6. Mention detected attachment/document information if relevant.

Do NOT generate generic text.
Always include actual extracted values whenever available.

Good Example for Invoice:
TechNova Solutions Pvt Ltd submitted Invoice INV-2045 against Purchase Order PO-78420 requesting payment processing. The invoice total is ₹80,240 including taxes and freight charges. Three invoice line items were identified from the attached PDF.

Good Example for Purchase Order:
Daiwa Corporation issued Purchase Order PO-78420 to TechNova Solutions Pvt Ltd requesting supply of IT accessories. The purchase order contains multiple line items with an estimated order value of ₹80,240.

Good Example for Acknowledgement:
TechNova Solutions Pvt Ltd acknowledged Purchase Order PO-78420 and confirmed acceptance of the requested items. The acknowledgement includes expected delivery information.

Good Example for GRN:
Warehouse team submitted GRN GRN-44120 confirming goods receipt against Purchase Order PO-21078 on 19-Feb-2025. The GRN contains received quantities and is ready for 3-way matching with the purchase order and supplier invoice.

Confidence Score Rules:

Generate confidence_score yourself based on your understanding of the attachment.

The confidence_score must NOT be a fixed value.

Evaluate:
- Overall document clarity.
- OCR/text readability.
- Completeness of extracted header fields.
- Completeness of extracted line items.
- Consistency between document type and extracted values.
- Whether mandatory business fields were confidently identified.

Use the following guidance:

0.95 - 0.99
Document is very clear.
Almost every important field is extracted confidently.

0.90 - 0.94
Document is clear.
Minor optional fields may be missing.

0.80 - 0.89
Most required fields are extracted.
Some optional or less important fields are missing.

0.70 - 0.79
Important fields are partially missing or ambiguous.

0.50 - 0.69
Multiple mandatory fields are unclear or missing.

Below 0.50
Poor quality document.
Extraction is unreliable.

Do not assign the same confidence score to every document.
Each document should receive its own confidence score based on the extracted information and document quality.

Extraction Status Rules:

Return "completed" if the required fields for the detected document type are confidently extracted.

Return "needs_review" only when mandatory business fields are missing or unclear.

FINAL SELF VALIDATION

Before returning JSON, validate the extracted values.

For Invoice documents:

- invoice_number must not equal:
  Number
  Date
  Page
  Invoice
  Invoice Number

If invoice_number equals any field label, search the document again and extract the actual business invoice number.

The same validation applies to:

po_number
acknowledgement_number
grn_number
document_number

Return JSON in this exact structure:

{{
    "document_type": "Invoice",
    "document_number": null,
    "ai_intent": "TechNova Solutions Pvt Ltd submitted Invoice INV-2045 against Purchase Order PO-78420 for payment processing. The invoice total is ₹80,240 including ₹12,240 tax and ₹8,000 freight charges. Three invoice line items were identified from the attached PDF.",
    "business_summary": "Successfully extracted document header fields and line item details.",
    "recommended_action": "Route to Document Review",
    "lifecycle_stage": "Document Review",
    "confidence_score": 0.90,
    "extraction_status": "completed",

    "detected_documents": [
        {{
            "document_name": null,
            "document_category": null,
            "file_type": null
        }}
    ],

    "header": {{
        "invoice_number": null,
        "confirmation_number": null,
        "acknowledgement_number": null,
        "grn_number": null,
        "receipt_number": null,
        "delivery_note_number": null,
        "po_number": null,
        "customer_po": null,
        "customer_number": null,
        "related_order": null,
        "order_number": null,
        "reference_number": null,
        "document_date": null,
        "invoice_date": null,
        "due_date": null,
        "received_date": null,
        "shipment_date": null,
        "delivery_date": null,
        "supplier_name": null,
        "supplier_address": null,
        "buyer_name": null,
        "receiver_name": null,
        "bill_to_name": null,
        "bill_to_address": null,
        "ship_to_name": null,
        "ship_to_address": null,
        "payment_terms": null,
        "incoterms": null,
        "currency": null,
        "subtotal": null,
        "tax_amount": null,
        "freight_amount": null,
        "discount_amount": null,
        "total_amount": null,
        "total_quantity": null,
        "total_weight": null,
        "total_rolls": null,
        "remit_to": null,
        "csr_name": null,
        "csr_email": null,
        "comments": null
    }},

    "line_items": [
        {{
            "line_number": null,
            "item_code": null,
            "material_code": null,
            "description": null,
            "quantity": null,
            "ordered_quantity": null,
            "received_quantity": null,
            "accepted_quantity": null,
            "rejected_quantity": null,
            "quantity_uom": null,
            "unit_price": null,
            "line_amount": null,
            "currency": null,
            "po_reference": null,
            "end_user": null
        }}
    ],

    "exception_review": {{
        "exception_status": "No Exception",
        "exception_summary": "No obvious exception detected from extracted document data.",
        "review_required": false,
        "review_reason": null
    }},

    "validation_ready_fields": {{
        "supplier_validation_key": null,
        "po_match_key": null,
        "invoice_match_key": null,
        "grn_match_key": null,
        "duplicate_check_key": null,
        "currency_check_required": true,
        "two_way_match_required": true,
        "three_way_match_required": false
    }}
}}
"""

    try:
        text = get_chat_response(
            prompt=prompt,
            system_prompt="You are an Intelligent Accounts Payable Document Understanding and Extraction AI.",
            temperature=0
        )
            

        print("\n================ AI RAW RESPONSE ================\n")
        print(text)
        print("\n===============================================\n")

        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].strip()
        else:
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                text = match.group(0).strip()

        try:
            result = json.loads(text)
        except json.JSONDecodeError:
            fixed_text = repair_json(text)
            result = json.loads(fixed_text)

        result["ai_model_used"] = "OCI Gemini 2.5 Pro"
        result["ai_status"] = "success"

        return result

    except Exception as error:
        return {
            "document_type": "Others",
            "document_number": None,
            "ai_intent": "AI could not determine the business intent. Manual review is required.",
            "business_summary": "AI extraction failed. Manual review required.",
            "recommended_action": "Route to Manual Review",
            "lifecycle_stage": "Document Review",
            "confidence_score": 0.0,
            "extraction_status": "needs_review",
            "detected_documents": [],
            "header": {
                "invoice_number": None,
                "confirmation_number": None,
                "acknowledgement_number": None,
                "grn_number": None,
                "receipt_number": None,
                "delivery_note_number": None,
                "po_number": None,
                "customer_po": None,
                "customer_number": None,
                "related_order": None,
                "order_number": None,
                "reference_number": None,
                "document_date": None,
                "invoice_date": None,
                "due_date": None,
                "received_date": None,
                "shipment_date": None,
                "delivery_date": None,
                "supplier_name": None,
                "supplier_address": None,
                "buyer_name": None,
                "receiver_name": None,
                "bill_to_name": None,
                "bill_to_address": None,
                "ship_to_name": None,
                "ship_to_address": None,
                "payment_terms": None,
                "incoterms": None,
                "currency": None,
                "subtotal": None,
                "tax_amount": None,
                "freight_amount": None,
                "discount_amount": None,
                "total_amount": None,
                "total_quantity": None,
                "total_weight": None,
                "total_rolls": None,
                "remit_to": None,
                "csr_name": None,
                "csr_email": None,
                "comments": None
            },
            "line_items": [],
            "exception_review": {
                "exception_status": "Review Required",
                "exception_summary": "AI extraction failed.",
                "review_required": True,
                "review_reason": "System was unable to extract structured document data."
            },
            "validation_ready_fields": {
                "supplier_validation_key": None,
                "po_match_key": None,
                "invoice_match_key": None,
                "grn_match_key": None,
                "duplicate_check_key": None,
                "currency_check_required": True,
                "two_way_match_required": True,
                "three_way_match_required": False
            },
            "ai_status": "failed",
            "error": str(error)
        }
