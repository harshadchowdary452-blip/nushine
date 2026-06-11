from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import Role, Permission, verify_tenant_access
from app.repositories.patient_repository import PatientRepository
from app.utils.whatsapp import WhatsAppProvider

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp Messaging"])


class SendMessageRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\+?[1-9]\d{9,14}$")
    message: str = Field(..., min_length=1, max_length=1000)
    patient_id: Optional[str] = None


class BroadcastRequest(BaseModel):
    patient_ids: List[str] = Field(..., min_length=1)
    message: str = Field(..., min_length=1, max_length=1000)


@router.post("/send")
async def send_whatsapp_message(
    request: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS, Permission.VIEW_ALL_PATIENTS)
    provider = WhatsAppProvider()
    success = await provider.send_message(request.phone, request.message)
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to send WhatsApp message")
    return {"success": True, "message": "WhatsApp message sent successfully"}


@router.post("/broadcast")
async def broadcast_whatsapp_messages(
    request: BroadcastRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS)
    patient_repo = PatientRepository(db)
    sent = 0
    failed = 0
    provider = WhatsAppProvider()
    for pid in request.patient_ids:
        patient = await patient_repo.get(pid)
        if not patient:
            continue
        await verify_tenant_access(current_user, patient, "patient", db)
        if patient.phone:
            msg = request.message.replace("{name}", patient.full_name)
            ok = await provider.send_message(patient.phone, msg)
            if ok:
                sent += 1
            else:
                failed += 1
    return {"success": True, "sent": sent, "failed": failed}
