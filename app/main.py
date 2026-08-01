import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from fastapi import FastAPI, Request, Depends
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
from app.dependencies import verify_hospital_context
from app.utils.scheduler import check_appointment_reminders, check_same_day_appointments, check_missed_appointments, check_overdue_treatments, check_recurring_recalls
from app.routers import auth, admin_groups, hospitals, doctors, consultants, patients, cases, consultant_notes, treatment_plans, treatment_sittings, treatment_plan_items, appointments, billings, pre_ops, post_ops, dashboards, whatsapp_messaging, whatsapp_config, notifications, hospital_monthly_expenses, reports, crm, crm_v2, calendar, status_audit, leads, doctor_working_hours, doctor_availability, doctor_leaves, doctor_blocked_slots, consent_forms, enquiries, treatment_follow_ups, recalls, exports, treatment_types, doctor_queue, clinical_progress_notes, master_data, crm_rules, crm_config_settings, crm_feedback, users
from app.crm.routers import events as crm_events
from app.crm.routers import event_test as crm_event_test

setup_logging(settings.ENVIRONMENT)
logger = logging.getLogger("app")

# Rate limiter
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"], storage_uri=settings.REDIS_URL if settings.REDIS_URL else "memory://")


MIGRATION_SQL = """
-- Feedback tables (idempotent)
CREATE TABLE IF NOT EXISTS lead_feedback (
    id VARCHAR(36) PRIMARY KEY,
    enquiry_id VARCHAR(36) NOT NULL REFERENCES generated_enquiries(id),
    hospital_id VARCHAR(36) REFERENCES hospitals(id),
    lead_id VARCHAR(36) NOT NULL REFERENCES leads(id),
    response_status VARCHAR(30) NOT NULL DEFAULT 'CONTACTED',
    interested BOOLEAN DEFAULT FALSE,
    follow_up_required BOOLEAN DEFAULT TRUE,
    budget_mentioned FLOAT,
    preferred_consultation_date DATE,
    preferred_consultation_time TIME,
    preferred_doctor_id VARCHAR(36) REFERENCES users(id),
    reason_not_interested TEXT,
    competitor_chosen VARCHAR(255),
    call_outcome VARCHAR(30),
    whatsapp_replied BOOLEAN DEFAULT FALSE,
    callback_requested BOOLEAN DEFAULT FALSE,
    notes TEXT,
    feedback_date TIMESTAMPTZ,
    feedback_by VARCHAR(36) REFERENCES users(id),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_lead_feedback_enquiry ON lead_feedback(enquiry_id);
CREATE INDEX IF NOT EXISTS idx_lead_feedback_lead ON lead_feedback(lead_id);

CREATE TABLE IF NOT EXISTS patient_feedback_context (
    id VARCHAR(36) PRIMARY KEY,
    enquiry_id VARCHAR(36) NOT NULL REFERENCES generated_enquiries(id),
    hospital_id VARCHAR(36) REFERENCES hospitals(id),
    patient_id VARCHAR(36) NOT NULL REFERENCES patients(id),
    consultation_experience INTEGER,
    treatment_satisfaction INTEGER,
    doctor_rating INTEGER,
    staff_behaviour INTEGER,
    waiting_time INTEGER,
    billing_experience INTEGER,
    facility_cleanliness INTEGER,
    would_recommend BOOLEAN,
    overall_rating INTEGER,
    next_follow_up_required BOOLEAN DEFAULT FALSE,
    recovery_status VARCHAR(50),
    additional_comments TEXT,
    feedback_date TIMESTAMPTZ,
    feedback_by VARCHAR(36) REFERENCES users(id),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_patient_feedback_enquiry ON patient_feedback_context(enquiry_id);
CREATE INDEX IF NOT EXISTS idx_patient_feedback_patient ON patient_feedback_context(patient_id);

CREATE TABLE IF NOT EXISTS feedback_notes (
    id VARCHAR(36) PRIMARY KEY,
    feedback_id VARCHAR(36) NOT NULL,
    feedback_type VARCHAR(10) NOT NULL,
    content TEXT NOT NULL,
    created_by VARCHAR(36) REFERENCES users(id),
    edit_history TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_feedback_notes_feedback ON feedback_notes(feedback_id);

-- Patient sync columns (idempotent)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS latest_satisfaction_rating INTEGER;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS latest_feedback_date TIMESTAMPTZ;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS latest_feedback_comments TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS latest_recovery_status VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS latest_recommendation_status BOOLEAN;

-- Lead sync columns (idempotent)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS latest_response_status VARCHAR(30);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS latest_feedback_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS latest_feedback_notes TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS latest_call_outcome VARCHAR(30);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS latest_follow_up_requirement VARCHAR(20);
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Creating feedback tables...")
    try:
        async with engine.begin() as conn:
            for stmt in MIGRATION_SQL.split(";"):
                s = stmt.strip()
                if s:
                    await conn.execute(text(s))
        logger.info("Feedback tables ready")
    except Exception as e:
        logger.warning(f"Table creation warning (non-fatal): {e}")

    logger.info("Seeding super admin...")
    await seed_super_admin()

    # Wire CRM Event Dispatcher — Phase 3.3
    try:
        from app.crm.services.event_dispatcher import get_central_dispatcher
        from app.crm.services.rule_engine import get_rule_engine
        from app.crm.services.enquiry_executor import get_enquiry_executor
        dispatcher = get_central_dispatcher()
        rule_engine = get_rule_engine()
        executor = get_enquiry_executor()
        dispatcher.set_rule_engine(rule_engine)
        dispatcher.set_executor(executor)
        logger.info("CRM Phase 3.3: Central dispatcher + rule engine + executor wired")
    except Exception as e:
        logger.warning(f"CRM Phase 3.3 wiring failed (non-fatal): {e}")

    # Legacy CRM handler wiring removed — all events route through CentralEventDispatcher

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
    recurring_recall_task = asyncio.create_task(check_recurring_recalls())

    logger.info("Application startup complete!")
    yield

    logger.info("Shutting down...")
    from app.utils.case_pdf import _cleanup
    await _cleanup()

    for task in [reminder_task, same_day_task, missed_task, overdue_task, recurring_recall_task]:
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
    msg = str(exc.orig).lower() if exc.orig else ""
    logger.error(f"IntegrityError on {request.method} {request.url.path}", exc_info=True, extra={"correlation_id": cid})
    if "unique" in msg or "duplicate" in msg:
        detail = "A record with this name already exists. Please use a different name."
    elif "foreign key" in msg or "referenced" in msg:
        detail = "This record has related data and cannot be deleted. Try deactivating it instead."
    else:
        detail = "Operation failed due to a data constraint violation."
    return JSONResponse(
        status_code=409,
        content={"detail": detail, "correlation_id": cid},
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
app.include_router(doctors.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(consultants.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(patients.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(cases.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(consultant_notes.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(treatment_plans.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(treatment_plan_items.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(treatment_sittings.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(appointments.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(billings.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(pre_ops.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(post_ops.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(dashboards.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(whatsapp_messaging.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(notifications.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(hospital_monthly_expenses.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(reports.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(crm.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(crm_v2.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(crm_events.router, prefix="/api/v1/crm", dependencies=[Depends(verify_hospital_context)])
app.include_router(crm_event_test.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(calendar.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(leads.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(whatsapp_config.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(status_audit.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(doctor_working_hours.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(doctor_availability.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(doctor_leaves.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(doctor_blocked_slots.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(consent_forms.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(enquiries.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(treatment_follow_ups.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(recalls.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(exports.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(treatment_types.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(doctor_queue.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(clinical_progress_notes.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(master_data.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(crm_rules.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(crm_config_settings.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(crm_feedback.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])
app.include_router(users.router, prefix="/api/v1", dependencies=[Depends(verify_hospital_context)])


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
