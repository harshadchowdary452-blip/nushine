from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
import os, uuid, shutil
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from sqlalchemy import select
from app.models.case import Case
from app.repositories.post_op_repository import PostOpRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.config import settings

router = APIRouter(prefix="/post-ops", tags=["Post-Op"])


@router.get("/{case_id}")
async def get_post_op(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    case_result = await db.execute(select(Case).where(Case.id == case_id))
    case_obj = case_result.scalar_one_or_none()
    if not case_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case_obj, "case", db)
    repo = PostOpRepository(db)
    post_ops = await repo.get_all(filters={"case_id": case_id})
    if not post_ops:
        return {"id": None, "notes": None, "report": None, "photo_urls": None}
    latest = post_ops[-1]
    return {"id": str(latest.id), "notes": latest.notes, "report": latest.report, "photo_urls": latest.photo_urls}


@router.post("/{case_id}")
async def add_post_op(case_id: str, notes: Optional[str] = Form(None), report: Optional[str] = Form(None), photos: List[UploadFile] = File(None), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.ADD_POST_OP)
    case_result = await db.execute(select(Case).where(Case.id == case_id))
    case_obj = case_result.scalar_one_or_none()
    if not case_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case_obj, "case", db)
    repo = PostOpRepository(db)
    audit = AuditLogRepository(db)
    photo_urls = []
    if photos:
        for photo in photos if isinstance(photos, list) else [photos]:
            if photo.filename:
                ext = os.path.splitext(photo.filename)[1] or ".jpg"
                filename = f"{uuid.uuid4()}{ext}"
                upload_path = os.path.join(settings.UPLOAD_DIR, "post_op")
                os.makedirs(upload_path, exist_ok=True)
                with open(os.path.join(upload_path, filename), "wb") as f:
                    shutil.copyfileobj(photo.file, f)
                photo_urls.append(f"/uploads/post_op/{filename}")
    post_op = await repo.create(case_id=case_id, notes=notes, report=report, photo_urls=",".join(photo_urls) if photo_urls else None)
    await audit.create(user_id=current_user.get("sub"), action="ADD_POST_OP", entity_type="POST_OP", entity_id=str(post_op.id), details="Post-op added")
    return {"id": str(post_op.id), "notes": post_op.notes, "report": post_op.report, "photo_urls": photo_urls}
