import os
import uuid
from fastapi import UploadFile, HTTPException, status
from app.config import settings

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
PDF_EXTENSIONS = {".pdf"}


def validate_extension(filename: str | None, allowed: set[str]) -> str:
    ext = os.path.splitext(filename or "")[1].lower() or ".jpg"
    if ext not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{ext or '(none)'}' is not allowed. Allowed: {', '.join(sorted(allowed))}",
        )
    return ext


async def save_upload(
    file: UploadFile,
    subdir: str,
    allowed: set[str] | None = None,
    max_size: int | None = None,
) -> str:
    """Validate + persist an upload (streaming, size-limited); returns `/uploads/...` URL.

    Extension and content-type are validated, the payload is streamed to disk in
    chunks so oversized files are rejected without buffering the whole body, and
    the stored name is a random UUID (unpredictable URL).
    """
    allowed = allowed or IMAGE_EXTENSIONS
    ext = validate_extension(file.filename, allowed)
    limit = max_size if max_size is not None else settings.MAX_UPLOAD_SIZE

    sub = subdir.strip("/")
    upload_path = os.path.join(settings.UPLOAD_DIR, sub)
    os.makedirs(upload_path, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    dest = os.path.join(upload_path, filename)

    written = 0
    try:
        with open(dest, "wb") as out:
            while True:
                chunk = await file.read(64 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > limit:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="File exceeds the maximum allowed size",
                    )
                out.write(chunk)
    except HTTPException:
        if os.path.exists(dest):
            os.remove(dest)
        raise

    return f"/uploads/{sub}/{filename}"
