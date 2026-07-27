import mimetypes
from pathlib import Path

from app.repositories.supabase_service import supabase


BUCKET = "ap-email-attachments"
SOURCE_DIRECTORY = Path(r"C:\Users\Shaik Basha\Downloads")


def main():
    source_files = {
        path.name.casefold(): path
        for path in SOURCE_DIRECTORY.iterdir()
        if path.is_file()
    }
    attachments = (
        supabase.table("email_attachments")
        .select("id,filename,storage_path")
        .execute()
        .data
        or []
    )
    uploaded = 0
    unavailable = 0

    for attachment in attachments:
        current_path = str(attachment.get("storage_path") or "")
        if (
            current_path.startswith(f"{attachment['id']}/")
            and "#" not in current_path
        ):
            uploaded += 1
            continue

        source = source_files.get(
            str(attachment.get("filename") or "").casefold()
        )
        if source is None:
            unavailable += 1
            continue

        storage_filename = source.name.replace("#", "_")
        object_path = f"{attachment['id']}/{storage_filename}"
        content_type = (
            mimetypes.guess_type(source.name)[0]
            or "application/octet-stream"
        )
        try:
            supabase.storage.from_(BUCKET).upload(
                object_path,
                source.read_bytes(),
                {
                    "content-type": content_type,
                    "upsert": "true",
                },
            )
        except Exception as error:
            if "already exists" not in str(error).lower():
                raise

        (
            supabase.table("email_attachments")
            .update({
                "storage_bucket": BUCKET,
                "storage_path": object_path,
            })
            .eq("id", attachment["id"])
            .execute()
        )
        uploaded += 1

    print(f"uploaded={uploaded}")
    print(f"source_file_unavailable={unavailable}")


if __name__ == "__main__":
    main()
