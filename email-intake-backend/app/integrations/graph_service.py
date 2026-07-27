import os
import base64
import requests

from dotenv import load_dotenv

load_dotenv()

TENANT_ID = os.getenv("TENANT_ID")
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
MAILBOX_EMAIL = os.getenv("MAILBOX_EMAIL")

def get_access_token():

    token_url = f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token"

    payload = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials"
    }

    response = requests.post(token_url, data=payload)

    return response.json()

def get_emails():

    token_response = get_access_token()
    access_token = token_response.get("access_token")

    if not access_token:
        return {
            "error": "Access token not generated",
            "details": token_response
        }

    graph_url = f"https://graph.microsoft.com/v1.0/users/{MAILBOX_EMAIL}/mailFolders/inbox/messages?$top=10&$orderby=receivedDateTime desc"

    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    response = requests.get(graph_url, headers=headers)

    return response.json()

def get_attachments(message_id):

    token_response = get_access_token()
    access_token = token_response.get("access_token")

    if not access_token:
        return {
            "error": "Access token not generated",
            "details": token_response
        }

    graph_url = f"https://graph.microsoft.com/v1.0/users/{MAILBOX_EMAIL}/messages/{message_id}/attachments"

    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    response = requests.get(graph_url, headers=headers)

    return response.json()

def download_attachment(message_id, attachment_id):

    token_response = get_access_token()
    access_token = token_response.get("access_token")

    if not access_token:
        return {
            "error": "Access token not generated",
            "details": token_response
        }

    graph_url = f"https://graph.microsoft.com/v1.0/users/{MAILBOX_EMAIL}/messages/{message_id}/attachments/{attachment_id}"

    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    response = requests.get(graph_url, headers=headers)
    attachment_data = response.json()

    file_name = attachment_data.get("name")
    content_bytes = attachment_data.get("contentBytes")

    if not file_name or not content_bytes:
        return {
            "error": "Attachment file content not found",
            "attachment_data": attachment_data
        }

    os.makedirs("downloads", exist_ok=True)

    file_path = os.path.join("downloads", file_name)

    with open(file_path, "wb") as file:
        file.write(base64.b64decode(content_bytes))

    return file_path

def get_folders():

    token_response = get_access_token()

    access_token = token_response.get("access_token")

    graph_url = f"https://graph.microsoft.com/v1.0/users/{MAILBOX_EMAIL}/mailFolders"

    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    response = requests.get(
        graph_url,
        headers=headers
    )

    return response.json()

def get_inbox_child_folders():

    token_response = get_access_token()

    access_token = token_response.get("access_token")

    graph_url = f"https://graph.microsoft.com/v1.0/users/{MAILBOX_EMAIL}/mailFolders/inbox/childFolders"

    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    response = requests.get(
        graph_url,
        headers=headers
    )

    return response.json()

FOLDER_MAPPING = {
    "Acknowledgement": "AAMkADg1OWQ0MjQ1LTQzMjMtNGQ4YS1iODE2LThkOWI4N2UxNTE4NAAuAAAAAAA3JL-l6dThQIDM_Cmic3P5AQBOSYPWxtdhTZWf5UvbC3m4AAAFMj74AAA=",
    "GRN": "AAMkADg1OWQ0MjQ1LTQzMjMtNGQ4YS1iODE2LThkOWI4N2UxNTE4NAAuAAAAAAA3JL-l6dThQIDM_Cmic3P5AQBOSYPWxtdhTZWf5UvbC3m4AAAIVHFRAAA=",
    "Invoice": "AAMkADg1OWQ0MjQ1LTQzMjMtNGQ4YS1iODE2LThkOWI4N2UxNTE4NAAuAAAAAAA3JL-l6dThQIDM_Cmic3P5AQBOSYPWxtdhTZWf5UvbC3m4AAAFMj75AAA=",
    "Others": "AAMkADg1OWQ0MjQ1LTQzMjMtNGQ4YS1iODE2LThkOWI4N2UxNTE4NAAuAAAAAAA3JL-l6dThQIDM_Cmic3P5AQBOSYPWxtdhTZWf5UvbC3m4AAAFMj73AAA=",
    "Purchase Order": "AAMkADg1OWQ0MjQ1LTQzMjMtNGQ4YS1iODE2LThkOWI4N2UxNTE4NAAuAAAAAAA3JL-l6dThQIDM_Cmic3P5AQBOSYPWxtdhTZWf5UvbC3m4AAAFMj76AAA="
}

def move_email_to_folder(message_id, target_folder):

    token_response = get_access_token()

    access_token = token_response.get("access_token")

    if not access_token:
        return {
            "error": "Access token not generated",
            "details": token_response
        }

    destination_folder_id = FOLDER_MAPPING.get(target_folder)

    if not destination_folder_id:
        return {
            "error": "Target folder not found",
            "target_folder": target_folder
        }

    graph_url = f"https://graph.microsoft.com/v1.0/users/{MAILBOX_EMAIL}/messages/{message_id}/move"

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    payload = {
        "destinationId": destination_folder_id
    }

    response = requests.post(
        graph_url,
        headers=headers,
        json=payload
    )

    return response.json()

def get_all_inbox_emails():

    token_response = get_access_token()
    access_token = token_response.get("access_token")

    if not access_token:
        return {
            "error": "Access token not generated",
            "details": token_response
        }

    graph_url = f"https://graph.microsoft.com/v1.0/users/{MAILBOX_EMAIL}/mailFolders/inbox/messages?$top=25&$orderby=receivedDateTime desc"

    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    all_emails = []

    while graph_url:

        response = requests.get(
            graph_url,
            headers=headers
        )

        response_json = response.json()

        email_list = response_json.get("value", [])
        all_emails.extend(email_list)

        graph_url = response_json.get("@odata.nextLink")

    return {
        "total_emails": len(all_emails),
        "value": all_emails
    }
