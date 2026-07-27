from pathlib import Path


def _record_id(result):
    if isinstance(result, dict):
        return result.get("id")
    data = getattr(result, "data", None) or []
    if data:
        return data[0].get("id")
    return None


def persist_email_attachments(
    *,
    email_id,
    message_id,
    attachments,
    detected_type,
    primary_graph_attachment_id,
    primary_file_path,
    download_file,
    create_record,
    store_file,
):
    """Persist metadata and Storage objects for every Graph attachment."""
    results = []

    for attachment in attachments:
        graph_attachment_id = attachment.get("id")
        filename = attachment.get("name") or "attachment"
        is_primary = (
            bool(primary_graph_attachment_id)
            and graph_attachment_id == primary_graph_attachment_id
        )
        file_path = (
            primary_file_path
            if is_primary and primary_file_path
            else download_file(message_id, graph_attachment_id)
        )

        record = create_record({
            "email_id": email_id,
            "filename": filename,
            "file_type": attachment.get("contentType"),
            "size_kb": int(attachment.get("size", 0) / 1024),
            "storage_bucket": None,
            "storage_path": None,
            "detected_type": detected_type,
            "graph_attachment_id": graph_attachment_id,
        })
        attachment_id = _record_id(record)
        stored = False

        if (
            attachment_id
            and isinstance(file_path, (str, Path))
            and Path(file_path).is_file()
        ):
            store_file(
                attachment_id,
                filename,
                str(file_path),
                attachment.get("contentType"),
            )
            stored = True

        results.append({
            "attachment_id": attachment_id,
            "graph_attachment_id": graph_attachment_id,
            "is_primary": is_primary,
            "stored": stored,
        })

    return results
