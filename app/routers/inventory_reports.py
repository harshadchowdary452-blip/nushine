import asyncio
import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission
from app.services.inventory_reports_service import build_report, REPORT_TYPES, INVENTORY_HEADERS
from app.services.export_service import _generate_excel, _generate_pdf, _stream_csv, _hospital_info

router = APIRouter(prefix="/reports/inventory", tags=["Inventory Reports"])


@router.get("/types")
async def list_report_types(current_user: dict = Depends(get_current_user)):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    return {"types": [{"id": k, "label": v} for k, v in REPORT_TYPES.items()]}


@router.get("")
async def inventory_report(
    report_type: str = Query(...),
    format: str = Query("json", pattern="^(json|csv|excel|pdf)$"),
    hospital_id: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    supplier_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    order_period: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.VIEW_INVENTORY, Permission.MANAGE_INVENTORY)
    report = await build_report(
        db, current_user, report_type,
        hospital_id=hospital_id, category_id=category_id, supplier_id=supplier_id,
        date_from=date_from, date_to=date_to, status=status,
        order_period=order_period, search=search,
    )

    if format == "json":
        return report

    headers = report["headers"]
    rows = report["rows"]
    summary = report["summary"]
    label = report["report_label"]
    safe = report_type
    date_str = datetime.now(timezone.utc).strftime("%Y_%m_%d")
    hid = current_user.get("hospital_id")
    info = await _hospital_info(db, hid)

    if format == "csv":
        return _stream_csv(rows, headers, f"{safe}_{date_str}.csv")

    if format == "excel":
        filename = f"{safe}_{date_str}.xlsx"
        filepath = await asyncio.to_thread(_generate_excel, rows, headers, filename, summary=summary)
        return FileResponse(filepath, filename=filename, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

    if format == "pdf":
        filename = f"{safe}_{date_str}.pdf"
        filepath = await _generate_pdf(label, headers, rows, filename, info=info, summary=summary)
        return FileResponse(filepath, filename=filename, media_type="application/pdf")

    raise HTTPException(status_code=400, detail=f"Unknown format: {format}")
