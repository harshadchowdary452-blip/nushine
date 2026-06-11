from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import os, uuid, shutil
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, verify_tenant_access, Permission, Role
from sqlalchemy import select
from app.models.case import Case
from app.repositories.pre_op_repository import PreOpRepository
from app.repositories.audit_log_repository import AuditLogRepository
from app.config import settings

router = APIRouter(prefix="/pre-ops", tags=["Pre-Op"])


@router.post("/{case_id}")
async def add_pre_op(case_id: str, notes: Optional[str] = Form(None), photos: Optional[UploadFile] = File(None), xrays: Optional[UploadFile] = File(None), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.ADD_PRE_OP)
    case_result = await db.execute(select(Case).where(Case.id == case_id))
    case_obj = case_result.scalar_one_or_none()
    if not case_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case_obj, "case", db)
    repo = PreOpRepository(db)
    audit = AuditLogRepository(db)
    photo_urls = []
    xray_urls = []
    if photos:
        ext = os.path.splitext(photos.filename)[1] if photos.filename else ".jpg"
        filename = f"{uuid.uuid4()}{ext}"
        upload_path = os.path.join(settings.UPLOAD_DIR, "pre_op")
        os.makedirs(upload_path, exist_ok=True)
        with open(os.path.join(upload_path, filename), "wb") as f:
            shutil.copyfileobj(photos.file, f)
        photo_urls.append(f"/uploads/pre_op/{filename}")
    if xrays:
        ext = os.path.splitext(xrays.filename)[1] if xrays.filename else ".jpg"
        filename = f"{uuid.uuid4()}{ext}"
        upload_path = os.path.join(settings.UPLOAD_DIR, "xrays")
        os.makedirs(upload_path, exist_ok=True)
        with open(os.path.join(upload_path, filename), "wb") as f:
            shutil.copyfileobj(xrays.file, f)
        xray_urls.append(f"/uploads/xrays/{filename}")
    pre_op = await repo.create(case_id=case_id, notes=notes, photo_urls=",".join(photo_urls) if photo_urls else None, xray_urls=",".join(xray_urls) if xray_urls else None)
    await audit.create(user_id=current_user.get("sub"), action="ADD_PRE_OP", entity_type="PRE_OP", entity_id=str(pre_op.id), details="Pre-op added")
    return {"id": str(pre_op.id), "notes": pre_op.notes, "photo_urls": photo_urls, "xray_urls": xray_urls}
