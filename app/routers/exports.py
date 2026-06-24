from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.services.export_service import (
    export_data, generate_dashboard_pdf, generate_financial_report_pdf,
    generate_monthly_report_pdf, log_export, EXPORT_MODULES, MODULE_LABELS,
)

router = APIRouter(prefix="/exports", tags=["Exports"])


@router.get("/modules")
async def list_export_modules(current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_GLOBAL_REPORTS, Permission.VIEW_CRM_DASHBOARD)
    return {
        "modules": [
            {"id": k, "label": MODULE_LABELS.get(k, k.title())}
            for k in EXPORT_MODULES.keys()
        ]
    }


@router.get("/{module}")
async def export_module(
    module: str,
    format: str = Query("csv", pattern="^(csv|excel|pdf)$"),
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_GLOBAL_REPORTS, Permission.VIEW_CRM_DASHBOARD)
    if module not in EXPORT_MODULES:
        raise HTTPException(status_code=404, detail=f"Unknown export module: {module}")
    try:
        result, count = await export_data(db, current_user, module, format, period, start_date, end_date)
        await log_export(db, current_user, module, format, count, str(result) if isinstance(result, str) else None)
        if isinstance(result, str):
            return FileResponse(result, filename=result.split("\\")[-1].split("/")[-1], media_type="application/octet-stream")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/dashboard/pdf")
async def export_dashboard_pdf(
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_GLOBAL_REPORTS, Permission.VIEW_CRM_DASHBOARD)
    filepath = await generate_dashboard_pdf(db, current_user, period, start_date, end_date)
    await log_export(db, current_user, "dashboard", "pdf", 0, filepath)
    from app.services.export_service import EXPORT_DIR
    filename = filepath.split("\\")[-1].split("/")[-1]
    return FileResponse(filepath, filename=filename, media_type="application/pdf")


@router.get("/financial/pdf")
async def export_financial_pdf(
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_GLOBAL_REVENUE, Permission.VIEW_REVENUE_ANALYTICS)
    filepath = await generate_financial_report_pdf(db, current_user, period, start_date, end_date)
    await log_export(db, current_user, "financial", "pdf", 0, filepath)
    filename = filepath.split("\\")[-1].split("/")[-1]
    return FileResponse(filepath, filename=filename, media_type="application/pdf")


@router.get("/monthly/pdf")
async def export_monthly_pdf(
    period: str = Query("this_month"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_GLOBAL_REPORTS, Permission.VIEW_CRM_DASHBOARD)
    filepath = await generate_monthly_report_pdf(db, current_user, period, start_date, end_date)
    await log_export(db, current_user, "monthly", "pdf", 0, filepath)
    filename = filepath.split("\\")[-1].split("/")[-1]
    return FileResponse(filepath, filename=filename, media_type="application/pdf")
