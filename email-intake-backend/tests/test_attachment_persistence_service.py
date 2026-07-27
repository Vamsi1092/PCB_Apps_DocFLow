from pathlib import Path

from app.services.attachment_persistence_service import (
    persist_email_attachments,
)


def test_persists_and_uploads_every_attachment(tmp_path):
    primary_file = tmp_path / "invoice.pdf"
    primary_file.write_bytes(b"invoice")
    second_file = tmp_path / "supporting.pdf"
    second_file.write_bytes(b"supporting")
    attachments = [
        {
            "id": "graph-primary",
            "name": "invoice.pdf",
            "contentType": "application/pdf",
            "size": 2048,
        },
        {
            "id": "graph-second",
            "name": "supporting.pdf",
            "contentType": "application/pdf",
            "size": 1024,
        },
    ]
    saved = []
    uploaded = []
    downloads = []

    def download_file(message_id, attachment_id):
        downloads.append((message_id, attachment_id))
        return str(second_file)

    def create_record(data):
        saved.append(data)
        return {"id": f"row-{len(saved)}"}

    def store_file(attachment_id, filename, file_path, content_type):
        uploaded.append(
            (attachment_id, filename, Path(file_path), content_type)
        )

    results = persist_email_attachments(
        email_id="email-1",
        message_id="message-1",
        attachments=attachments,
        detected_type="invoice",
        primary_graph_attachment_id="graph-primary",
        primary_file_path=str(primary_file),
        download_file=download_file,
        create_record=create_record,
        store_file=store_file,
    )

    assert len(results) == 2
    assert [row["graph_attachment_id"] for row in saved] == [
        "graph-primary",
        "graph-second",
    ]
    assert downloads == [("message-1", "graph-second")]
    assert [item[0] for item in uploaded] == ["row-1", "row-2"]
    assert results[0]["is_primary"] is True
    assert results[1]["is_primary"] is False


def test_keeps_metadata_when_an_attachment_cannot_be_downloaded():
    saved = []
    uploaded = []

    results = persist_email_attachments(
        email_id="email-1",
        message_id="message-1",
        attachments=[
            {
                "id": "graph-missing",
                "name": "missing.pdf",
                "contentType": "application/pdf",
                "size": 512,
            }
        ],
        detected_type="invoice",
        primary_graph_attachment_id=None,
        primary_file_path=None,
        download_file=lambda *_: {"error": "not available"},
        create_record=lambda data: (
            saved.append(data) or {"id": "row-missing"}
        ),
        store_file=lambda *args: uploaded.append(args),
    )

    assert len(saved) == 1
    assert uploaded == []
    assert results == [
        {
            "attachment_id": "row-missing",
            "graph_attachment_id": "graph-missing",
            "is_primary": False,
            "stored": False,
        }
    ]
