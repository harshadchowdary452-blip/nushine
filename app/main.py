import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from alembic import command
from alembic.config import Config
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.database import engine, async_session_factory
from app.core.security import hash_password
from app.core.permissions import Role
from app.core.logging import setup_logging, correlation_id, generate_correlation_id
from app.core.middleware import RequestIDMiddleware
from app.utils.scheduler import check_appointment_reminders, check_same_day_appointments, check_missed_appointments, check_overdue_treatments
from app.routers import auth, admin_groups, hospitals, doctors, consultants, patients, cases, consultant_notes, treatment_plans, treatment_sittings, treatment_plan_items, appointments, billings, pre_ops, post_ops, dashboards, whatsapp_messaging, whatsapp_config, notifications, hospital_monthly_expenses, reports, crm, crm_v2, calendar, status_audit, campaigns, campaign_templates, leads, doctor_working_hours, doctor_availability, doctor_leaves, doctor_blocked_slots, consent_forms, enquiries, treatment_follow_ups, recalls, crm_settings, exports, treatment_types, crm_opd_settings, doctor_queue, clinical_progress_notes, master_data, crm_rules
from app.crm.routers import follow_ups as crm_v3_follow_ups
from app.crm.routers import templates as crm_v3_templates
from app.crm.routers import events as crm_events
from app.crm.routers import automation as crm_automation
from app.crm.routers import treatment_automation as crm_treatment_automation

setup_logging(settings.ENVIRONMENT)
logger = logging.getLogger("app")

# Rate limiter
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"], storage_uri=settings.REDIS_URL if settings.REDIS_URL else "memory://")


def run_migrations():
    base_dir = Path(__file__).resolve().parents[1]
    config = Config(str(base_dir / "alembic" / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", settings.SYNC_DATABASE_URL)
    command.upgrade(config, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Running Alembic migrations...")
    try:
        await asyncio.to_thread(run_migrations)
        logger.info("Migrations completed")
    except Exception as e:
        logger.warning(f"Migration warning (non-fatal): {e}")

    logger.info("Seeding super admin...")
    await seed_super_admin()

    # Wire CRM Event Dispatcher
    try:
        from app.crm.events import get_dispatcher
        from app.crm.services.event_handlers import CRM_EVENT_HANDLERS
        dispatcher = get_dispatcher()
        for event_type, handler in CRM_EVENT_HANDLERS.items():
            dispatcher.subscribe(event_type, handler)
        logger.info("CRM event handlers registered: %d handlers", len(CRM_EVENT_HANDLERS))
    except Exception as e:
        logger.warning(f"CRM event handler registration failed (non-fatal): {e}")

    try:
        from app.utils.case_pdf import _ensure_browser
        await _ensure_browser()
        logger.info("Playwright browser ready")
    except Exception as e:
        logger.warning(f"Playwright pre-launch skipped: {e}")

    reminder_task = asyncio.create_task(check_appointment_reminders())
    same_day_task = asyncio.create_task(check_same_day_appointments())
    missed_task = asyncio.create_task(check_missed_appointments())
    overdue_task = asyncio.create_task(check_overdue_treatments())

    logger.info("Application startup complete!")
    yield

    logger.info("Shutting down...")
    from app.utils.case_pdf import _cleanup
    await _cleanup()

    for task in [reminder_task, same_day_task, missed_task, overdue_task]:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass

    await engine.dispose()
    logger.info("Shutdown complete")


app = FastAPI(
    title=settings.APP_NAME,
    description="Modern Dental Practice Management Platform",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    cid = correlation_id.get("")
    logger.error(f"IntegrityError on {request.method} {request.url.path}", exc_info=True, extra={"correlation_id": cid})
    return JSONResponse(
        status_code=409,
        content={"detail": "Operation failed: this record has related data and cannot be deleted. Try deactivating it instead.", "correlation_id": cid},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    cid = correlation_id.get("")
    logger.error(f"Unhandled exception on {request.method} {request.url.path}", exc_info=True, extra={"correlation_id": cid})
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "correlation_id": cid, "path": request.url.path},
    )


app.add_middleware(RequestIDMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

app.include_router(auth.router, prefix="/api/v1")
app.include_router(admin_groups.router, prefix="/api/v1")
app.include_router(hospitals.router, prefix="/api/v1")
app.include_router(doctors.router, prefix="/api/v1")
app.include_router(consultants.router, prefix="/api/v1")
app.include_router(patients.router, prefix="/api/v1")
app.include_router(cases.router, prefix="/api/v1")
app.include_router(consultant_notes.router, prefix="/api/v1")
app.include_router(treatment_plans.router, prefix="/api/v1")
app.include_router(treatment_plan_items.router, prefix="/api/v1")
app.include_router(treatment_sittings.router, prefix="/api/v1")
app.include_router(appointments.router, prefix="/api/v1")
app.include_router(billings.router, prefix="/api/v1")
app.include_router(pre_ops.router, prefix="/api/v1")
app.include_router(post_ops.router, prefix="/api/v1")
app.include_router(dashboards.router, prefix="/api/v1")
app.include_router(whatsapp_messaging.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(hospital_monthly_expenses.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(crm.router, prefix="/api/v1")
app.include_router(crm_v2.router, prefix="/api/v1")
app.include_router(crm_v3_follow_ups.router, prefix="/api/v1/crm")
app.include_router(crm_v3_templates.router, prefix="/api/v1/crm")
app.include_router(crm_events.router, prefix="/api/v1/crm")
app.include_router(crm_automation.router, prefix="/api/v1/crm")
app.include_router(crm_treatment_automation.router, prefix="/api/v1")
app.include_router(campaigns.router, prefix="/api/v1")
app.include_router(campaign_templates.router, prefix="/api/v1")
app.include_router(calendar.router, prefix="/api/v1")
app.include_router(leads.router, prefix="/api/v1")
app.include_router(whatsapp_config.router, prefix="/api/v1")
app.include_router(status_audit.router, prefix="/api/v1")
app.include_router(doctor_working_hours.router, prefix="/api/v1")
app.include_router(doctor_availability.router, prefix="/api/v1")
app.include_router(doctor_leaves.router, prefix="/api/v1")
app.include_router(doctor_blocked_slots.router, prefix="/api/v1")
app.include_router(consent_forms.router, prefix="/api/v1")
app.include_router(enquiries.router, prefix="/api/v1")
app.include_router(treatment_follow_ups.router, prefix="/api/v1")
app.include_router(recalls.router, prefix="/api/v1")
app.include_router(crm_settings.router, prefix="/api/v1")
app.include_router(exports.router, prefix="/api/v1")
app.include_router(treatment_types.router, prefix="/api/v1")
app.include_router(crm_opd_settings.router, prefix="/api/v1")
app.include_router(doctor_queue.router, prefix="/api/v1")
app.include_router(clinical_progress_notes.router, prefix="/api/v1")
app.include_router(master_data.router, prefix="/api/v1")
app.include_router(crm_rules.router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"app": settings.APP_NAME, "tagline": settings.APP_TAGLINE, "version": "1.0.0", "docs": "/docs", "redoc": "/redoc"}


@app.get("/health")
@limiter.exempt
async def health(request: Request):
    checks = {"status": "healthy", "version": "1.0.0", "timestamp": "", "checks": {}}
    from datetime import datetime, timezone
    checks["timestamp"] = datetime.now(timezone.utc).isoformat()

    # Database check
    try:
        async with async_session_factory() as db:
            await db.execute(text("SELECT 1"))
        checks["checks"]["database"] = "ok"
    except Exception as e:
        checks["checks"]["database"] = f"error: {type(e).__name__}"
        checks["status"] = "degraded"

    # Redis check
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL)
        await r.ping()
        await r.aclose()
        checks["checks"]["redis"] = "ok"
    except Exception:
        checks["checks"]["redis"] = "unavailable"
        # Redis is optional, don't degrade for it

    status_code = 200 if checks["status"] == "healthy" else 503
    return JSONResponse(status_code=status_code, content=checks)


async def seed_super_admin():
    from sqlalchemy import select
    from app.models.user import User
    async with async_session_factory() as db:
        query = select(User).where(User.email == settings.SUPER_ADMIN_EMAIL)
        result = await db.execute(query)
        existing = result.scalar_one_or_none()
        if not existing:
            super_admin = User(
                email=settings.SUPER_ADMIN_EMAIL,
                password_hash=hash_password(settings.SUPER_ADMIN_PASSWORD),
                full_name="Super Admin",
                role=Role.SUPER_ADMIN,
                is_verified=True,
            )
            db.add(super_admin)
            await db.commit()
            logger.info(f"Created super admin: {settings.SUPER_ADMIN_EMAIL}")
        else:
            logger.info("Super admin already exists")
