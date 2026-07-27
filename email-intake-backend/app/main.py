from fastapi import FastAPI
from dotenv import load_dotenv
import os
import base64
from app.services.classification_service import (
    classify_email,
    read_excel_content,
    read_docx_content,
    read_pdf_content,
)
from app.services.ai_service import classify_document, extract_document_data
from app.services.post_processing_service import post_process_extraction
from app.services.generic_recovery_service import get_valid_invoice_lines
from app.services.reference_data_service import (
    generate_reference_goods_receipt,
    generate_reference_purchase_order,
)
from app.services.validation_service import (
    revalidate_chain_invoices,
    validate_document,
)
from app.services.ai_decision_service import (
    get_workflow_decision_with_oci
)
from app.services.attachment_persistence_service import (
    persist_email_attachments
)
from app.integrations.graph_service import (
    get_access_token,
    get_emails,
    get_attachments,
    download_attachment,
    get_folders,
    get_inbox_child_folders,
    move_email_to_folder,
    get_all_inbox_emails
)

from app.repositories.supabase_service import (
    save_email,
    save_attachment,
    store_attachment_file,
    get_email_by_external_id,
    get_supplier_id_by_alias,
    save_ap_document,
    save_ai_run,
    save_invoice_header,
    save_invoice_lines,
    save_purchase_order,
    save_purchase_order_lines,
    get_purchase_order_by_number,
    save_goods_receipt,
    save_goods_receipt_lines,
    update_email_status,
    update_email_ai_details,
    update_ap_document_workflow_decision,
    get_document_queue_records,
    get_dashboard_kpis,
    get_dashboard_pipeline,
    get_exceptions_by_severity
)

from typing import Optional

load_dotenv()

app = FastAPI()

@app.get("/")
def home():
    return {
        "message": "Email Intake Backend Running"
    }

@app.get("/token")
def generate_token():
    return get_access_token()


@app.get("/emails")
def read_emails():
    return get_emails()

@app.get("/save-email")
def save_first_email():

    emails = get_emails()

    email_list = emails.get("value", [])

    email_to_save = None

    for email in email_list:
        if email.get("hasAttachments") == True:
            email_to_save = email
            break

    if not email_to_save:
        email_to_save = email_list[0]

    email_data = {
        "external_message_id": email_to_save.get("id"),
        "subject": email_to_save.get("subject"),
        "from_email": email_to_save.get("sender", {})
                                  .get("emailAddress", {})
                                  .get("address"),
        "body_preview": email_to_save.get("bodyPreview"),
        "received_at": email_to_save.get("receivedDateTime"),
        "has_attachments": email_to_save.get("hasAttachments"),
        "status": "new"
    }

    result = save_email(email_data)

    return {
        "message": "Email saved successfully",
        "saved_subject": email_to_save.get("subject"),
        "has_attachments": email_to_save.get("hasAttachments"),
        "result": str(result)
    }

@app.get("/attachments")
def read_attachments():

    emails = get_emails()

    email_list = emails.get("value", [])

    email_with_attachment = None

    for email in email_list:
        if email.get("hasAttachments") == True:
            email_with_attachment = email
            break

    if not email_with_attachment:
        return {
            "message": "No email with attachment found"
        }

    message_id = email_with_attachment.get("id")

    attachments = get_attachments(message_id)

    clean_attachments = []

    for attachment in attachments.get("value", []):
        clean_attachments.append({
            "graph_attachment_id": attachment.get("id"),
            "filename": attachment.get("name"),
            "file_type": attachment.get("contentType"),
            "size_kb": round(attachment.get("size", 0) / 1024, 2)
        })

    return {
        "email_subject": email_with_attachment.get("subject"),
        "message_id": message_id,
        "attachment_count": len(clean_attachments),
        "attachments": clean_attachments
    }

@app.get("/save-attachment")
def save_first_attachment():

    emails = get_emails()

    email_list = emails.get("value", [])

    email_with_attachment = None

    for email in email_list:
        if email.get("hasAttachments") == True:
            email_with_attachment = email
            break

    if not email_with_attachment:
        return {
            "message": "No email with attachment found"
        }

    message_id = email_with_attachment.get("id")

    saved_email = get_email_by_external_id(message_id)

    if not saved_email:
        return {
            "message": "Email metadata not found in Supabase. Please run /save-email first."
        }

    supabase_email_id = saved_email.get("id")

    attachments = get_attachments(message_id)

    attachment_list = attachments.get("value", [])

    if len(attachment_list) == 0:
        return {
            "message": "No attachments found"
        }

    first_attachment = attachment_list[0]

    attachment_data = {
        "email_id": supabase_email_id,
        "graph_attachment_id": first_attachment.get("id"),
        "filename": first_attachment.get("name"),
        "file_type": first_attachment.get("contentType"),
        "size_kb": int(first_attachment.get("size", 0) / 1024),
        "storage_path": None
    }

    result = save_attachment(attachment_data)

    return {
        "message": "Attachment saved successfully",
        "result": str(result)
    }

@app.get("/download-attachment")
def download_first_attachment():

    emails = get_emails()

    email_list = emails.get("value", [])

    email_with_attachment = None

    for email in email_list:
        if email.get("hasAttachments") == True:
            email_with_attachment = email
            break

    if not email_with_attachment:
        return {
            "message": "No email with attachment found"
        }

    message_id = email_with_attachment.get("id")

    attachments = get_attachments(message_id)

    attachment_list = attachments.get("value", [])

    if len(attachment_list) == 0:
        return {
            "message": "No attachment found"
        }

    first_attachment = attachment_list[0]

    attachment_id = first_attachment.get("id")

    downloaded_attachment = download_attachment(
        message_id,
        attachment_id
    )

    return downloaded_attachment

@app.get("/save-downloaded-attachment")
def save_downloaded_attachment():

    emails = get_emails()

    email_list = emails.get("value", [])

    email_with_attachment = None

    for email in email_list:
        if email.get("hasAttachments") == True:
            email_with_attachment = email
            break

    if not email_with_attachment:
        return {
            "message": "No email with attachment found"
        }

    message_id = email_with_attachment.get("id")

    attachments = get_attachments(message_id)

    attachment_list = attachments.get("value", [])

    if len(attachment_list) == 0:
        return {
            "message": "No attachment found"
        }

    first_attachment = attachment_list[0]

    attachment_id = first_attachment.get("id")

    downloaded_attachment = download_attachment(
        message_id,
        attachment_id
    )

    filename = downloaded_attachment.get("name")
    content_bytes = downloaded_attachment.get("contentBytes")

    if not content_bytes:
        return {
            "message": "No file content found in attachment"
        }

    file_content = base64.b64decode(content_bytes)

    file_path = os.path.join("downloads", filename)

    with open(file_path, "wb") as file:
        file.write(file_content)

    return {
        "message": "Attachment file saved successfully",
        "filename": filename,
        "file_path": file_path
    }

@app.get("/folders")
def read_folders():

    folders = get_folders()

    clean_folders = []

    for folder in folders.get("value", []):
        clean_folders.append({
            "folder_id": folder.get("id"),
            "folder_name": folder.get("displayName"),
            "child_folder_count": folder.get("childFolderCount"),
            "total_item_count": folder.get("totalItemCount"),
            "unread_item_count": folder.get("unreadItemCount")
        })

    return {
        "folder_count": len(clean_folders),
        "folders": clean_folders
    }

@app.get("/inbox-child-folders")
def read_inbox_child_folders():

    return get_inbox_child_folders()

@app.get("/classify-email")
def classify_email_with_attachment():

    emails = get_emails()

    email_list = emails.get("value", [])

    if not email_list:
        return {
            "message": "No emails found"
        }

    email_to_classify = None

    for email in email_list:
        if email.get("hasAttachments") == True:
            email_to_classify = email
            break

    if not email_to_classify:
        email_to_classify = email_list[0]

    subject = email_to_classify.get("subject")

    body_preview = email_to_classify.get("bodyPreview")

    attachment_filename = ""

    file_type = ""

    document_content = ""

    if email_to_classify.get("hasAttachments"):

        attachments = get_attachments(
            email_to_classify.get("id")
        )

        attachment_list = attachments.get("value", [])

        if attachment_list:

            attachment_filename = attachment_list[0].get("name")

            file_type = attachment_list[0].get("contentType")

            if attachment_filename.endswith(".xlsx"):

                file_path = os.path.join(
                    "downloads",
                    attachment_filename
                )

                document_content = read_excel_content(
                    file_path
                )

    result = classify_email(
        subject,
        body_preview,
        attachment_filename,
        file_type,
        document_content
    )

    return {
        "message_id": email_to_classify.get("id"),
        "subject": subject,
        "body_preview": body_preview,
        "has_attachments": email_to_classify.get("hasAttachments"),
        "attachment_filename": attachment_filename,
        "file_type": file_type,
        "document_content_used": document_content[:500],
        "classification_result": result
    }

@app.get("/read-downloaded-file")
def read_downloaded_file():

    file_path = "downloads/Daiwa_POC_Phase1_3Week_TaskPlan.xlsx"

    content = read_excel_content(file_path)

    return {
        "file_name": "Daiwa_POC_Phase1_3Week_TaskPlan.xlsx",
        "content": content
    }

@app.get("/move-email")
def move_classified_email():

    emails = get_emails()

    email_list = emails.get("value", [])

    if not email_list:
        return {
            "message": "No emails found"
        }

    email_to_move = None

    for email in email_list:
        if email.get("hasAttachments") == True:
            email_to_move = email
            break

    if not email_to_move:
        email_to_move = email_list[0]

    subject = email_to_move.get("subject")
    body_preview = email_to_move.get("bodyPreview")

    attachment_filename = ""
    file_type = ""
    document_content = ""

    if email_to_move.get("hasAttachments"):

        attachments = get_attachments(
            email_to_move.get("id")
        )

        attachment_list = attachments.get("value", [])

        if attachment_list:

            attachment_filename = attachment_list[0].get("name")
            file_type = attachment_list[0].get("contentType")

            if attachment_filename.endswith(".xlsx"):

                file_path = os.path.join(
                    "downloads",
                    attachment_filename
                )

                document_content = read_excel_content(file_path)

    classification_result = classify_email(
        subject,
        body_preview,
        attachment_filename,
        file_type,
        document_content
    )

    target_folder = classification_result.get("target_folder")

    move_result = move_email_to_folder(
        email_to_move.get("id"),
        target_folder
    )

    return {
        "subject": subject,
        "classification": classification_result,
        "move_result": move_result
    }

@app.get("/save-extracted-document-test")
def save_extracted_document_test():

    emails = get_emails()

    email_list = emails.get("value", [])

    if not email_list:
        return {
            "message": "No emails found"
        }

    email_to_process = email_list[0]

    external_message_id = email_to_process.get("id")

    saved_email = get_email_by_external_id(external_message_id)

    if not saved_email:
        return {
            "message": "Email not found in Supabase. Please run /save-email first."
        }

    extracted_data = {
        "email_id": saved_email.get("id"),
        "document_type": "Invoice",
        "invoice_number": "TEST-INV-001",
        "supplier_name": "Test Supplier",
        "total_amount": 1000,
        "confidence_score": 0.95,
        "extraction_status": "completed",
        "extracted_json": {
            "classification": "Invoice",
            "confidence": 0.95,
            "reason": "Test extracted document insert",
            "invoice_number": "TEST-INV-001",
            "supplier_name": "Test Supplier",
            "total_amount": 1000
        }
    }

    result = save_extracted_document(extracted_data)

    return {
        "message": "Extracted document saved successfully",
        "result": str(result)
    }

@app.get("/create-work-item-test")
def create_work_item_test():

    emails = get_emails()

    email_list = emails.get("value", [])

    if not email_list:
        return {
            "message": "No emails found"
        }

    external_message_id = email_list[0].get("id")

    saved_email = get_email_by_external_id(external_message_id)

    if not saved_email:
        return {
            "message": "Email not found in database"
        }

    work_item = {
        "email_id": saved_email.get("id"),
        "document_type": "Invoice",
        "priority": "Medium",
        "status": "New",
        "human_review_required": False,
        "next_action": "Ready for ERP Posting"
    }

    result = save_work_item(work_item)

    return {
        "message": "Work item created successfully",
        "result": str(result)
    }

@app.get("/ai-classification")
def ai_classification():

    emails = get_emails()
    email_list = emails.get("value", [])

    if not email_list:
        return {
            "message": "No emails found"
        }

    email_to_classify = email_list[0]

    subject = email_to_classify.get("subject")
    body_preview = email_to_classify.get("bodyPreview")

    attachment_content = ""

    if email_to_classify.get("hasAttachments"):

        attachments = get_attachments(email_to_classify.get("id"))
        attachment_list = attachments.get("value", [])

        if attachment_list:
            attachment_filename = attachment_list[0].get("name")
            file_path = os.path.join("downloads", attachment_filename)

            if attachment_filename.endswith(".xlsx"):
                attachment_content = read_excel_content(file_path)
            else:
                attachment_content = f"Attachment file name: {attachment_filename}"

    ai_result = classify_document(
        subject,
        body_preview,
        attachment_content
    )

    return {
        "message_id": email_to_classify.get("id"),
        "subject": subject,
        "body_preview": body_preview,
        "ai_classification": ai_result
    }

'''
@app.get("/ai-classify-and-move-all")
def ai_classify_and_move_all():

    emails = get_emails()
    email_list = emails.get("value", [])

    if not email_list:
        return {
            "message": "No emails found",
            "results": []
        }

    processed_results = []

    for email in email_list:

        subject = email.get("subject")
        body_preview = email.get("bodyPreview")
        message_id = email.get("id")

        attachment_filename = ""
        attachment_content = ""

        if email.get("hasAttachments"):

            attachments = get_attachments(message_id)
            attachment_list = attachments.get("value", [])

            if attachment_list:

                attachment_filename = attachment_list[0].get("name")

                file_path = os.path.join(
                    "downloads",
                    attachment_filename
                )

                if attachment_filename.endswith(".xlsx"):

                    attachment_content = read_excel_content(file_path)

                else:

                    attachment_content = (
                        "Attachment file name: "
                        + attachment_filename
                    )

        ai_result = classify_document(
            subject,
            body_preview,
            attachment_content
        )

        target_folder = ai_result.get("target_folder")

        move_result = move_email_to_folder(
            message_id,
            target_folder
        )

        processed_results.append({
            "message_id": message_id,
            "subject": subject,
            "attachment_filename": attachment_filename,
            "ai_classification": ai_result,
            "move_result": move_result
        })

    return {
        "message": "AI classification and folder movement completed",
        "total_processed": len(processed_results),
        "results": processed_results
    }
'''

@app.get("/ai-classify-and-move-all")
def ai_classify_and_move_all():

    emails = get_emails()
    email_list = emails.get("value", [])

    if not email_list:
        return {
            "message": "No emails found",
            "results": []
        }

    processed_results = []

    for email in email_list:

        subject = email.get("subject")
        body_preview = email.get("bodyPreview")
        message_id = email.get("id")

        attachment_filename = ""
        attachment_content = ""

        if email.get("hasAttachments"):

            attachments = get_attachments(message_id)
            attachment_list = attachments.get("value", [])

            if attachment_list:

                attachment = attachment_list[0]
                attachment_filename = attachment.get("name")

                file_path = download_attachment(
                    message_id,
                    attachment.get("id")
                )

                if attachment_filename.lower().endswith(".xlsx"):
                    attachment_content = read_excel_content(file_path)

                elif attachment_filename.lower().endswith(".docx"):
                    attachment_content = read_docx_content(file_path)

                else:
                    attachment_content = (
                        "Attachment filename: " + attachment_filename
                    )

        ai_result = classify_document(
            subject,
            body_preview,
            attachment_content
        )

        target_folder = ai_result.get("target_folder")

        email_data = {
            "external_message_id": message_id,
            "subject": subject,
            "from_email": email.get("sender", {})
                               .get("emailAddress", {})
                               .get("address"),
            "body_preview": body_preview,
            "received_at": email.get("receivedDateTime"),
            "has_attachments": email.get("hasAttachments"),
            "category": ai_result.get("document_type"),
            "classification_confidence": ai_result.get("confidence_score"),
            "ai_understanding": ai_result,
            "suggested_action": "Move to " + str(target_folder) + " Folder",
            "status": "AI Classified"
        }

        save_result = save_email(email_data)

        if ai_result.get("ai_status") == "failed":
            move_result = {
                "message": "Email not moved because AI classification failed"
            }
        else:
            move_result = move_email_to_folder(
                message_id,
                target_folder
            )

        processed_results.append({
            "message_id": message_id,
            "subject": subject,
            "attachment_filename": attachment_filename,
            "ai_classification": ai_result,
            "database_save": str(save_result),
            "move_result": move_result
        })

    return {
        "message": "AI classification, database save, and folder movement completed",
        "total_processed": len(processed_results),
        "results": processed_results
    }

@app.get("/debug-ai-input")
def debug_ai_input():

    emails = get_emails()
    email_list = emails.get("value", [])

    if not email_list:
        return {
            "message": "Inbox empty"
        }

    debug_results = []

    for email in email_list:

        subject = email.get("subject")
        body_preview = email.get("bodyPreview")
        message_id = email.get("id")

        attachment_filename = ""
        attachment_content = ""

        if email.get("hasAttachments"):

            attachments = get_attachments(message_id)
            attachment_list = attachments.get("value", [])

            if attachment_list:

                attachment = attachment_list[0]
                attachment_filename = attachment.get("name")

                file_path = download_attachment(
                    message_id,
                    attachment.get("id")
                )

                if attachment_filename.lower().endswith(".xlsx"):
                    attachment_content = read_excel_content(file_path)

                elif attachment_filename.lower().endswith(".docx"):
                    attachment_content = read_docx_content(file_path)

                else:
                    attachment_content = (
                        "Attachment filename: " + attachment_filename
                    )

        ai_result = classify_document(
            subject,
            body_preview,
            attachment_content
        )

        debug_results.append({
            "subject": subject,
            "body_preview": body_preview,
            "attachment_filename": attachment_filename,
            "attachment_content_preview": attachment_content[:1500],
            "attachment_content_length": len(attachment_content),
            "ai_result": ai_result
        })

    return {
        "message": "AI debug completed",
        "total_checked": len(debug_results),
        "results": debug_results
    }

@app.get("/extract-latest")
def extract_latest():

    emails = get_emails()
    email_list = emails.get("value", [])

    if not email_list:
        return {
            "message": "Inbox empty"
        }

    email = email_list[0]

    subject = email.get("subject")
    body_preview = email.get("bodyPreview")
    message_id = email.get("id")

    attachment_filename = ""
    attachment_content = ""

    if email.get("hasAttachments"):

        attachments = get_attachments(message_id)
        attachment_list = attachments.get("value", [])

        if attachment_list:

            attachment = attachment_list[0]
            attachment_filename = attachment.get("name")

            file_path = download_attachment(
                message_id,
                attachment.get("id")
            )

            if attachment_filename.lower().endswith(".xlsx"):
                attachment_content = read_excel_content(file_path)

            elif attachment_filename.lower().endswith(".docx"):
                attachment_content = read_docx_content(file_path)

            else:
                attachment_content = (
                    "Attachment filename: " + attachment_filename
                )

    extraction_result = extract_document_data(
        subject,
        body_preview,
        attachment_content
    )

    save_result = save_extracted_document({
    "document_type": extraction_result.get("document_type"),
    "invoice_number": extraction_result.get("invoice_number"),
    "supplier_name": extraction_result.get("supplier_name"),
    "total_amount": extraction_result.get("total_amount"),
    "confidence_score": extraction_result.get("confidence_score"),
    "extraction_status": extraction_result.get("extraction_status"),
    "extracted_json": extraction_result
    })

    return {
        "message": "AI extraction completed",
        "subject": subject,
        "attachment_filename": attachment_filename,
        "attachment_content_preview": attachment_content[:500],
        "extraction_result": extraction_result,
        "database_save": str(save_result)
    }


class EmailPipelineError(Exception):
    """
    Carries the Supabase email ID when processing fails
    after the email record has already been created.
    """

    def __init__(self, message, email_supabase_id=None):
        super().__init__(message)
        self.email_supabase_id = email_supabase_id

def process_email_pipeline(email):

    message_id = email.get("id")
    internet_message_id = email.get("internetMessageId")
    subject = email.get("subject")
    body_preview = email.get("bodyPreview")
    body_full = email.get("body", {}).get("content")
    email_supabase_id = None

    existing_email = get_email_by_external_id(message_id)

    if existing_email:

        existing_status = existing_email.get("status")

        if existing_status == "processed":
            message = (
                "Email was already processed successfully. "
                "Skipping to prevent duplicate processing."
            )
        else:
            message = (
                "Email already exists with an incomplete status. "
                "Automatic retry was blocked to prevent duplicate "
                "attachments and document records."
            )

        return {
            "message": message,
            "status": "skipped",
            "email_supabase_id": existing_email.get("id"),
            "subject": subject,
            "existing_status": existing_status
        }

    attachment_filename = ""
    attachment_content = ""
    attachment_supabase_id = None
    attachment = None
    attachment_list = []
    file_path = None

    if email.get("hasAttachments"):

        attachments = get_attachments(message_id)
        attachment_list = attachments.get("value", [])

        if attachment_list:

            attachment = attachment_list[0]
            attachment_filename = attachment.get("name")

            file_path = download_attachment(
                message_id,
                attachment.get("id")
            )

            if attachment_filename.lower().endswith(".xlsx"):
                attachment_content = read_excel_content(file_path)

            elif attachment_filename.lower().endswith(".docx"):
                attachment_content = read_docx_content(file_path)

            elif attachment_filename.lower().endswith(".pdf"):

                print("\n========== PDF DEBUG ==========")
                print("Attachment Name:", attachment_filename)
                print("Downloaded File Path:", file_path)
                print("File Exists:", os.path.exists(file_path))
                print("File Size:", os.path.getsize(file_path) if os.path.exists(file_path) else "File not found")

                attachment_content = read_pdf_content(file_path)

                print("PDF Text Length:", len(attachment_content))
                print("First 1000 chars:")
                print(attachment_content[:1000])
                print("================================\n")
            else:
                attachment_content = (
                    "Attachment filename: " + attachment_filename
                )

    classification_result = classify_document(
        subject,
        body_preview,
        attachment_content
    )

    email_data = {
        "external_message_id": message_id,
        "internet_message_id": internet_message_id,
        "from_name": email.get("sender", {})
                          .get("emailAddress", {})
                          .get("name"),
        "from_email": email.get("sender", {})
                           .get("emailAddress", {})
                           .get("address"),
        "subject": subject,
        "body_preview": body_preview,
        "body_full": body_full,
        "received_at": email.get("receivedDateTime"),
        "has_attachments": email.get("hasAttachments"),
        "category": classification_result.get("document_type"),
        "classification_confidence": classification_result.get("confidence_score"),
        "status": "processing",
        "suggested_action": "Move to " + str(classification_result.get("target_folder")) + " Folder",
        "ai_intent": classification_result.get("reason"),
        "ai_understanding": classification_result
    }

    email_insert_result = save_email(email_data)
    email_supabase_id = email_insert_result.data[0].get("id")

    if attachment_list:
        persisted_attachments = persist_email_attachments(
            email_id=email_supabase_id,
            message_id=message_id,
            attachments=attachment_list,
            detected_type=classification_result.get("document_type"),
            primary_graph_attachment_id=(
                attachment.get("id") if attachment else None
            ),
            primary_file_path=file_path,
            download_file=download_attachment,
            create_record=save_attachment,
            store_file=store_attachment_file,
        )
        primary_record = next(
            (
                record for record in persisted_attachments
                if record.get("is_primary")
            ),
            None,
        )
        if primary_record:
            attachment_supabase_id = primary_record.get("attachment_id")

    print("\n================ ATTACHMENT CONTENT SENT TO AI ================\n")
    print(attachment_content[:5000])
    print("\n==============================================================\n")

    extraction_result = extract_document_data(
        subject,
        body_preview,
        attachment_content
    )

    extraction_result = post_process_extraction(
        extraction_result,
        attachment_content
    )

    header = extraction_result.get("header", {})
    line_items = extraction_result.get("line_items", [])
    document_type = extraction_result.get("document_type")

    supplier_name = (
        header.get("supplier_name")
        or extraction_result.get("supplier_name")
    )

    supplier_id = get_supplier_id_by_alias(
        supplier_name
    )

    print("\n========== SUPPLIER LOOKUP ==========")
    print("Extracted Supplier Name:", supplier_name)
    print("Matched Supplier ID:", supplier_id)
    print("=====================================\n")

    def normalize_document_type(value):
        if value == "Invoice":
            return "invoice"
        if value == "Purchase Order":
            return "purchase_order"
        if value == "Acknowledgement":
            return "acknowledgement"
        if value == "GRN":
            return "grn"
        return "others"

    def normalize_date(value):
        if not value:
            return None

        from datetime import datetime

        value = str(value).strip()

        date_formats = [
            "%Y-%m-%d",
            "%Y/%m/%d",
            "%d-%b-%Y",
            "%d-%b-%y",
            "%d/%m/%Y",
            "%m/%d/%Y"
        ]

        for date_format in date_formats:
            try:
                return datetime.strptime(value, date_format).date().isoformat()
            except:
                pass

        return None

    workflow_header = dict(header)
    workflow_header["due_date"] = normalize_date(
        header.get("due_date")
    )

    workflow_decision = get_workflow_decision_with_oci(
        document_type=document_type,
        header=workflow_header,
        supplier_resolved=supplier_id is not None,
        extraction_confidence=extraction_result.get(
            "confidence_score"
        ),
        extraction_status=extraction_result.get(
            "extraction_status"
        ),
        document_number=extraction_result.get(
            "document_number"
        )
    )

    extraction_result["workflow_decision"] = (
        workflow_decision
    )

    recon_summary = dict(
        extraction_result.get("validation_ready_fields")
        or {}
    )
    recon_summary["workflow_decision"] = workflow_decision

    ap_document_data = {
        "email_id": email_supabase_id,
        "attachment_id": attachment_supabase_id,
        "document_type": normalize_document_type(document_type),
        "supplier_id": supplier_id,
        "stage": "review",
        "pipeline_stage": "extracted",
        "extraction_status": "extracted",
        "received_at": email.get("receivedDateTime"),
        "priority": workflow_decision.get("priority"),
        "ai_priority_reason": workflow_decision.get(
            "ai_priority_reason"
        ),
        "ai_confidence": extraction_result.get("confidence_score"),
        "is_active": True,
        "recon_summary": recon_summary
    }

    ap_document_result = save_ap_document(ap_document_data)
    ap_document_id = ap_document_result.data[0]["id"]

    ai_run_data = {
        "document_id": ap_document_id,
        "email_id": email_supabase_id,
        "run_type": "extract",
        "model": extraction_result.get("ai_model_used"),
        "confidence": extraction_result.get("confidence_score"),
        "result": extraction_result,
        "mock_mode": False
    }

    print("\n================ AI RUN RESULT ================\n")
    print(extraction_result)
    print("\n===============================================\n")

    save_ai_run(ai_run_data)

    invoice_header_id = None
    validation_match_type = None
    final_workflow_decision = workflow_decision

    if document_type == "Invoice":

        invoice_number = (
        header.get("invoice_number")
        or extraction_result.get("document_number")
        or header.get("order_number")
        or header.get("reference_number")
        or "UNKNOWN-INVOICE"
        )

        invoice_header_data = {
            "document_id": ap_document_id,
            "supplier_id": supplier_id,
            "invoice_number": invoice_number,
            "invoice_date": normalize_date(header.get("invoice_date")),
            "due_date": normalize_date(header.get("due_date")),
            "po_number": header.get("po_number"),
            "customer_number": header.get("customer_number"),
            "grn_number": header.get("grn_number"),
            "currency": header.get("currency"),
            "subtotal": header.get("subtotal"),
            "tax_amount": header.get("tax_amount"),
            "freight_amount": header.get("freight_amount"),
            "total_amount": header.get("total_amount"),
            "payment_terms": header.get("payment_terms"),
            "bank_account": header.get("remit_to"),
            "notes": header.get("comments")
        }

        invoice_header_result = save_invoice_header(invoice_header_data)
        invoice_header_id = invoice_header_result.data[0]["id"]

        valid_line_items = get_valid_invoice_lines(line_items)

        invoice_lines_data = []

        for index, line_item in enumerate(valid_line_items):
            invoice_lines_data.append({
                "invoice_id": invoice_header_id,
                "line_number": line_item.get("line_number") or index + 1,
                "description": line_item.get("description"),
                "quantity": line_item.get("quantity"),
                "unit": line_item.get("quantity_uom"),
                "unit_price": line_item.get("unit_price"),
                "amount": line_item.get("line_amount"),
                "po_line_ref": line_item.get("po_reference"),
                "grn_line_ref": None,
                "confidence": extraction_result.get("confidence_score")
            })

        if invoice_lines_data:
            save_invoice_lines(invoice_lines_data)
        else:
            print(
                "Invoice header saved, but no valid invoice lines "
                "were available for insertion."
            )

        # ----------------------------------------
        # Validate Invoice
        # ----------------------------------------

        validation_result = validate_document(invoice_header_id)
        validation_match_type = validation_result.get(
            "match_type"
        )

        print("\n========== VALIDATION RESULT ==========")
        print(validation_result)
        print("=======================================\n")

        validation_summary = (
            validation_result.get("summary")
            if isinstance(validation_result, dict)
            else validation_result
        )

        validation_checks = (
            validation_summary.to_list()
            if hasattr(validation_summary, "to_list")
            else []
        )

        final_workflow_decision = get_workflow_decision_with_oci(
            document_type=document_type,
            header=workflow_header,
            supplier_resolved=supplier_id is not None,
            extraction_confidence=extraction_result.get(
                "confidence_score"
            ),
            extraction_status=extraction_result.get(
                "extraction_status"
            ),
            document_number=extraction_result.get(
                "document_number"
            ),
            validation_checks=validation_checks,
            validation_completed=True
        )

        recon_summary["workflow_decision"] = (
            final_workflow_decision
        )
        recon_summary["validation_summary"] = {
            "overall_status": (
                validation_summary.overall_status()
                if hasattr(
                    validation_summary,
                    "overall_status"
                )
                else None
            ),
            "check_count": len(validation_checks),
            "failed_check_count": len([
                check
                for check in validation_checks
                if check.get("passed") is False
            ])
        }

        extraction_result["workflow_decision"] = (
            final_workflow_decision
        )

        update_ap_document_workflow_decision(
            ap_document_id,
            final_workflow_decision,
            recon_summary
        )

    purchase_order_id = None
    goods_receipt_id = None

    if document_type == "Purchase Order":

        purchase_order_data = {
            "po_number": header.get("po_number") or extraction_result.get("document_number"),
            "supplier_id": supplier_id,
            "po_date": normalize_date(header.get("document_date")),
            "currency": header.get("currency"),
            "total_amount": header.get("total_amount"),
            "open_amount": header.get("total_amount"),
            "status": "open",
            "notes": header.get("comments")
        }

        purchase_order_result = save_purchase_order(purchase_order_data)
        purchase_order_id = purchase_order_result.data[0]["id"]

        purchase_order_lines_data = []

        for index, line_item in enumerate(line_items):
            purchase_order_lines_data.append({
                "po_id": purchase_order_id,
                "line_number": line_item.get("line_number") or index + 1,
                "item_code": line_item.get("item_code"),
                "description": line_item.get("description"),
                "quantity": line_item.get("quantity") or line_item.get("ordered_quantity"),
                "unit": line_item.get("quantity_uom"),
                "unit_price": line_item.get("unit_price"),
                "amount": line_item.get("line_amount"),
                "received_qty": line_item.get("received_quantity") or 0
            })

        save_purchase_order_lines(purchase_order_lines_data)

    if document_type == "GRN":

        matched_po = get_purchase_order_by_number(
            header.get("po_number")
        )

        po_id = matched_po.get("id") if matched_po else None

        goods_receipt_data = {
            "grn_number": header.get("grn_number") or extraction_result.get("document_number"),
            "po_id": po_id,
            "supplier_id": supplier_id,
            "received_date": normalize_date(header.get("received_date")),
            "notes": header.get("comments"),
            "receiver_name": header.get("receiver_name"),
            "warehouse": header.get("warehouse"),
            "status": "received"
        }

        goods_receipt_result = save_goods_receipt(goods_receipt_data)
        goods_receipt_id = goods_receipt_result.data[0]["id"]

        goods_receipt_lines_data = []

        for index, line_item in enumerate(line_items):
            goods_receipt_lines_data.append({
                "grn_id": goods_receipt_id,
                "po_line_id": None,
                "line_number": line_item.get("line_number") or index + 1,
                "item_code": line_item.get("item_code"),
                "description": line_item.get("description"),
                "quantity": line_item.get("received_quantity") or line_item.get("quantity"),
                "unit": line_item.get("quantity_uom")
            })

        save_goods_receipt_lines(goods_receipt_lines_data)

    extraction_result["priority"] = (
        final_workflow_decision.get("priority")
    )
    extraction_result["ai_priority_reason"] = (
        final_workflow_decision.get(
            "ai_priority_reason"
        )
    )
    extraction_result["recommended_action"] = (
        final_workflow_decision.get(
            "recommended_action"
        )
    )

    save_ai_run({
        "document_id": ap_document_id,
        "email_id": email_supabase_id,
        "run_type": "priority_recommendation",
        "model": final_workflow_decision.get("model"),
        "confidence": final_workflow_decision.get(
            "confidence"
        ),
        "result": final_workflow_decision,
        "mock_mode": False
    })

    update_email_ai_details(
        email_supabase_id,
        extraction_result.get("ai_intent"),
        extraction_result,
        final_workflow_decision.get(
            "recommended_action"
        )
    )

    if document_type in {"Purchase Order", "GRN"}:
        revalidate_chain_invoices(ap_document_id)

    update_email_status(
        email_supabase_id,
        "processed"
    )

    move_result = None

    final_document_type = extraction_result.get("document_type")

    folder_map = {
        "Invoice": "Invoice",
        "Purchase Order": "Purchase Order",
        "Acknowledgement": "Acknowledgement",
        "GRN": "GRN",
        "Others": "Others"
    }

    final_target_folder = folder_map.get(
        final_document_type,
        classification_result.get("target_folder")
    )

    if classification_result.get("ai_status") == "success":
        move_result = move_email_to_folder(
            message_id,
            final_target_folder
        )
    else:
        move_result = {
            "message": "Email not moved because AI classification failed"
        }

    return {
        "subject": subject,
        "status": "processed",
        "document_type": final_document_type,
        "target_folder": final_target_folder,
        "extraction_status": extraction_result.get("extraction_status"),
        "email_id": email_supabase_id,
        "attachment_id": attachment_supabase_id,
        "ap_document_id": ap_document_id,
        "invoice_header_id": invoice_header_id,
        "purchase_order_id": purchase_order_id,
        "goods_receipt_id": goods_receipt_id,
        "match_type": validation_match_type,
        "priority": final_workflow_decision.get("priority"),
        "ai_priority_reason": final_workflow_decision.get(
            "ai_priority_reason"
        ),
        "recommended_action": final_workflow_decision.get(
            "recommended_action"
        ),
        "recommended_action_code": (
            final_workflow_decision.get(
                "recommended_action_code"
            )
        ),
        "decision_source": final_workflow_decision.get(
            "source"
        ),
        "decision_model": final_workflow_decision.get(
            "model"
        ),
        "decision_fallback_used": (
            final_workflow_decision.get(
                "fallback_used"
            )
        ),
        "folder_movement": "completed" if classification_result.get("ai_status") == "success" else "not_completed"
    }


@app.get("/process-latest-email")
def process_latest_email():

    emails = get_emails()
    email_list = emails.get("value", [])

    if not email_list:
        return {
            "message": "Inbox empty"
        }

    email = email_list[0]

    return process_email_pipeline(email)


@app.get("/process-inbox-emails")
def process_inbox_emails():

    emails = get_all_inbox_emails()
    email_list = emails.get("value", [])

    if not email_list:
        return {
            "message": "Inbox empty",
            "total_found": 0,
            "processed": 0,
            "skipped": 0,
            "failed": 0,
            "results": []
        }

    results = []
    processed_count = 0
    skipped_count = 0
    failed_count = 0

    for email in email_list:

        try:
            result = process_email_pipeline(email)

            if result.get("status") == "skipped":
                skipped_count = skipped_count + 1
            else:
                processed_count = processed_count + 1

            results.append(result)

        except Exception as error:
            failed_count = failed_count + 1

            email_supabase_id = None

            try:
                existing_email = get_email_by_external_id(
                    email.get("id")
                )

                if existing_email:
                    email_supabase_id = existing_email.get("id")

                    update_email_status(
                        email_supabase_id,
                        "failed"
                    )

                    print(
                        "Email status updated to failed:",
                        email_supabase_id
                    )

            except Exception as status_error:
                print(
                    "Unable to update email status to failed:",
                    str(status_error)
                )

            results.append({
                "subject": email.get("subject"),
                "status": "failed",
                "email_supabase_id": email_supabase_id,
                "error": str(error)
            })

    return {
        "message": "Inbox processing completed",
        "total_found": len(email_list),
        "processed": processed_count,
        "skipped": skipped_count,
        "failed": failed_count,
        "results": results
    }

@app.get("/api/document-queue")
def get_document_queue():
    try:
        records = get_document_queue_records()

        return {
            "success": True,
            "message": "Document queue retrieved successfully",
            "total_records": len(records),
            "documents": records
        }

    except Exception as error:
        return {
            "success": False,
            "message": "Unable to retrieve document queue",
            "error": str(error),
            "total_records": 0,
            "documents": []
        }

@app.get("/api/dashboard/kpis")
def dashboard_kpis(
    dateFilter: str = "last100",
    startDate: Optional[str] = None,
    endDate: Optional[str] = None
):
    try:
        allowed_filters = {
            "today",
            "week",
            "month",
            "last100",
            "custom"
        }

        normalized_filter = dateFilter.lower().strip()

        if normalized_filter not in allowed_filters:
            return {
                "success": False,
                "message": (
                    "Invalid dateFilter. Allowed values are: "
                    "today, week, month, last100, custom."
                )
            }

        if normalized_filter == "custom":
            if not startDate or not endDate:
                return {
                    "success": False,
                    "message": (
                        "startDate and endDate are required "
                        "when dateFilter is custom."
                    )
                }

        kpis = get_dashboard_kpis(
            date_filter=normalized_filter,
            start_date=startDate,
            end_date=endDate
        )

        return {
            "success": True,
            "message": "Dashboard KPIs retrieved successfully",
            "data": kpis
        }

    except Exception as error:
        return {
            "success": False,
            "message": "Unable to retrieve dashboard KPIs",
            "error": str(error),
            "data": None
        }

@app.get("/api/dashboard/pipeline")
def dashboard_pipeline(
    dateFilter: str = "last100",
    startDate: Optional[str] = None,
    endDate: Optional[str] = None
):
    try:
        allowed_filters = {
            "today",
            "week",
            "month",
            "last100",
            "custom"
        }

        normalized_filter = dateFilter.lower().strip()

        if normalized_filter not in allowed_filters:
            return {
                "success": False,
                "message": (
                    "Invalid dateFilter. Allowed values are: "
                    "today, week, month, last100, custom."
                ),
                "data": None
            }

        if normalized_filter == "custom":
            if not startDate or not endDate:
                return {
                    "success": False,
                    "message": (
                        "startDate and endDate are required "
                        "when dateFilter is custom."
                    ),
                    "data": None
                }

        pipeline = get_dashboard_pipeline(
            date_filter=normalized_filter,
            start_date=startDate,
            end_date=endDate
        )

        return {
            "success": True,
            "message": "Dashboard pipeline retrieved successfully",
            "data": pipeline
        }

    except Exception as error:
        return {
            "success": False,
            "message": "Unable to retrieve dashboard pipeline",
            "error": str(error),
            "data": None
        }

@app.get("/api/dashboard/exceptions-by-severity")
def dashboard_exceptions_by_severity(
    dateFilter: str = "last100",
    startDate: Optional[str] = None,
    endDate: Optional[str] = None
):
    try:
        allowed_filters = {
            "today",
            "week",
            "month",
            "last100",
            "custom"
        }

        normalized_filter = dateFilter.lower().strip()

        if normalized_filter not in allowed_filters:
            return {
                "success": False,
                "message": (
                    "Invalid dateFilter. Allowed values are: "
                    "today, week, month, last100, custom."
                ),
                "data": None
            }

        if normalized_filter == "custom":
            if not startDate or not endDate:
                return {
                    "success": False,
                    "message": (
                        "startDate and endDate are required "
                        "when dateFilter is custom."
                    ),
                    "data": None
                }

        severity_data = get_exceptions_by_severity(
            date_filter=normalized_filter,
            start_date=startDate,
            end_date=endDate
        )

        return {
            "success": True,
            "message": (
                "Exception severity summary retrieved successfully"
            ),
            "data": severity_data
        }

    except Exception as error:
        return {
            "success": False,
            "message": (
                "Unable to retrieve exception severity summary"
            ),
            "error": str(error),
            "data": None
        }

@app.post("/api/reference-po/{invoice_header_id}")
def create_reference_po(invoice_header_id: str):
    try:
        return generate_reference_purchase_order(invoice_header_id)
    except Exception as error:
        return {
            "success": False,
            "error": str(error)
        }

@app.post("/api/reference-grn/{invoice_header_id}")
def create_reference_grn(invoice_header_id: str):
    """
    Generate a Reference Goods Receipt from an existing
    Reference Purchase Order.

    Temporary testing endpoint.
    """

    return generate_reference_goods_receipt(
        invoice_header_id
    )
