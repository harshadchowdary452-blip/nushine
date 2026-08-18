"""Dashboards package — composed from sub-endpoint modules."""

from fastapi import APIRouter
from app.routers.dashboards.super_admin import router as super_admin_router
from app.routers.dashboards.group_admin import router as group_admin_router
from app.routers.dashboards.hospital_admin import router as hospital_admin_router
from app.routers.dashboards.doctor import router as doctor_router
from app.routers.dashboards.quick_views import router as quick_views_router

router = APIRouter(prefix="/dashboards", tags=["Dashboards"])

router.include_router(super_admin_router)
router.include_router(group_admin_router)
router.include_router(hospital_admin_router)
router.include_router(doctor_router)
router.include_router(quick_views_router)
