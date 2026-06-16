from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
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


@router.get("/{case_id}")
async def get_pre_op(case_id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.MANAGE_CASES)
    case_result = await db.execute(select(Case).where(Case.id == case_id))
    case_obj = case_result.scalar_one_or_none()
    if not case_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    await verify_tenant_access(current_user, case_obj, "case", db)
    repo = PreOpRepository(db)
    pre_ops = await repo.get_all(filters={"case_id": case_id})
    if not pre_ops:
        return {"id": None, "notes": None, "photo_urls": None, "xray_urls": None}
    all_photos = []
    all_xrays = []
    notes = None
    latest_id = None
    for po in pre_ops:
        if po.photo_urls:
            all_photos.extend(po.photo_urls.split(","))
        if po.xray_urls:
            all_xrays.extend(po.xray_urls.split(","))
        if po.notes:
            notes = po.notes
        latest_id = str(po.id)
    return {
        "id": latest_id,
        "notes": notes,
        "photo_urls": ",".join(all_photos) if all_photos else None,
        "xray_urls": ",".join(all_xrays) if all_xrays else None,
    }


@router.post("/{case_id}")
async def add_pre_op(case_id: str, notes: Optional[str] = Form(None), photos: List[UploadFile] = File(None), xrays: List[UploadFile] = File(None), db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
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
        for photo in photos if isinstance(photos, list) else [photos]:
            if photo.filename:
                ext = os.path.splitext(photo.filename)[1] or ".jpg"
                filename = f"{uuid.uuid4()}{ext}"
                upload_path = os.path.join(settings.UPLOAD_DIR, "pre_op")
                os.makedirs(upload_path, exist_ok=True)
                with open(os.path.join(upload_path, filename), "wb") as f:
                    shutil.copyfileobj(photo.file, f)
                photo_urls.append(f"/uploads/pre_op/{filename}")
    if xrays:
        for xray in xrays if isinstance(xrays, list) else [xrays]:
            if xray.filename:
                ext = os.path.splitext(xray.filename)[1] or ".jpg"
                filename = f"{uuid.uuid4()}{ext}"
                upload_path = os.path.join(settings.UPLOAD_DIR, "xrays")
                os.makedirs(upload_path, exist_ok=True)
                with open(os.path.join(upload_path, filename), "wb") as f:
                    shutil.copyfileobj(xray.file, f)
                xray_urls.append(f"/uploads/xrays/{filename}")
    existing = await repo.get_all(filters={"case_id": case_id})
    if existing:
        target = existing[-1]
        existing_photos = target.photo_urls.split(",") if target.photo_urls else []
        existing_xrays = target.xray_urls.split(",") if target.xray_urls else []
        all_photos = existing_photos + photo_urls
        all_xrays = existing_xrays + xray_urls
        new_notes = notes or target.notes
        updated = await repo.update(
            target.id,
            notes=new_notes,
            photo_urls=",".join(all_photos) if all_photos else None,
            xray_urls=",".join(all_xrays) if all_xrays else None,
        )
        await audit.create(user_id=current_user.get("sub"), action="UPDATE_PRE_OP", entity_type="PRE_OP", entity_id=str(updated.id), details="Pre-op photos appended")
        return {"id": str(updated.id), "notes": updated.notes, "photo_urls": photo_urls, "xray_urls": xray_urls}
    pre_op = await repo.create(case_id=case_id, notes=notes, photo_urls=",".join(photo_urls) if photo_urls else None, xray_urls=",".join(xray_urls) if xray_urls else None)
    await audit.create(user_id=current_user.get("sub"), action="ADD_PRE_OP", entity_type="PRE_OP", entity_id=str(pre_op.id), details="Pre-op added")
    return {"id": str(pre_op.id), "notes": pre_op.notes, "photo_urls": photo_urls, "xray_urls": xray_urls}
