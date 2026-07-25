"""
Phase 3.3 Test APIs — verify rule evaluation for all event types.

NO CRM records are created. Only returns decisions.
"""
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.core.permissions import verify_permission, Permission

logger = logging.getLogger("crm.event_test")

router = APIRouter(prefix="/crm/test", tags=["CRM Event Test"])


# ============================================================
# Request Schemas
# ============================================================

class EventTestRequest(BaseModel):
    event_type: str = Field(..., description="Event type (e.g. LEAD_CREATED, TREATMENT_COMPLETED)")
    entity_type: str = Field(..., description="Entity type (LEAD, PATIENT, CASE, TREATMENT, APPOINTMENT)")
    entity_id: str = Field(default="test-entity-001", description="Entity ID")
    hospital_id: Optional[str] = Field(default=None, description="Hospital ID (resolved from entity if not provided)")
    patient_id: Optional[str] = Field(default=None)
    doctor_id: Optional[str] = Field(default=None)
    payload: dict = Field(default_factory=dict, description="Additional event data")


class LeadEventRequest(BaseModel):
    hospital_id: str
    lead_id: str = "test-lead-001"
    patient_id: Optional[str] = None
    source: str = "WEBSITE"
    status: str = "NEW"
    payload: dict = Field(default_factory=dict)


class TreatmentEventRequest(BaseModel):
    hospital_id: str
    treatment_type_id: Optional[str] = None
    treatment_plan_id: str = "test-plan-001"
    case_id: str = "test-case-001"
    patient_id: Optional[str] = None
    doctor_id: Optional[str] = None
    visit_stage: str = "FINAL"
    payload: dict = Field(default_factory=dict)


class AppointmentEventRequest(BaseModel):
    hospital_id: str
    appointment_id: str = "test-apt-001"
    patient_id: Optional[str] = None
    doctor_id: Optional[str] = None
    treatment_type_id: Optional[str] = None
    payload: dict = Field(default_factory=dict)


class CaseEventRequest(BaseModel):
    hospital_id: str
    case_id: str = "test-case-001"
    patient_id: Optional[str] = None
    treatment_type_id: Optional[str] = None
    payload: dict = Field(default_factory=dict)


# ============================================================
# Test Endpoints
# ============================================================

@router.post("/event")
async def test_generic_event(
    req: EventTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Test any event type through the centralized dispatcher."""
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)

    from app.crm.services.event_dispatcher import get_central_dispatcher
    from app.crm.services.rule_engine import get_rule_engine

    dispatcher = get_central_dispatcher()
    dispatcher.set_rule_engine(get_rule_engine())

    result = await dispatcher.dispatch(
        event_type=req.event_type,
        source_module="TEST_API",
        entity_type=req.entity_type,
        entity_id=req.entity_id,
        hospital_id=req.hospital_id,
        patient_id=req.patient_id,
        doctor_id=req.doctor_id,
        payload=req.payload,
        db=db,
    )

    return {
        "success": True,
        "message": f"Event '{req.event_type}' evaluated (no records created)",
        "data": result,
    }


@router.post("/lead-event")
async def test_lead_event(
    req: LeadEventRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Test lead-related events (LEAD_CREATED, PATIENT_REGISTERED)."""
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)

    from app.crm.services.event_dispatcher import get_central_dispatcher
    from app.crm.services.rule_engine import get_rule_engine

    dispatcher = get_central_dispatcher()
    dispatcher.set_rule_engine(get_rule_engine())

    event_type = "LEAD_CREATED" if req.status == "NEW" else "PATIENT_REGISTERED"
    entity_id = req.lead_id or req.patient_id or "test-entity-001"

    result = await dispatcher.dispatch(
        event_type=event_type,
        source_module="TEST_API",
        entity_type="LEAD",
        entity_id=entity_id,
        hospital_id=req.hospital_id,
        patient_id=req.patient_id,
        payload={
            "lead_id": req.lead_id,
            "source": req.source,
            "status": req.status,
            **req.payload,
        },
        db=db,
    )

    return {
        "success": True,
        "message": f"Lead event '{event_type}' evaluated (no records created)",
        "data": result,
    }


@router.post("/treatment-event")
async def test_treatment_event(
    req: TreatmentEventRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Test treatment events (TREATMENT_STARTED, TREATMENT_COMPLETED)."""
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)

    from app.crm.services.event_dispatcher import get_central_dispatcher
    from app.crm.services.rule_engine import get_rule_engine

    dispatcher = get_central_dispatcher()
    dispatcher.set_rule_engine(get_rule_engine())

    event_type = "TREATMENT_COMPLETED"

    result = await dispatcher.dispatch(
        event_type=event_type,
        source_module="TEST_API",
        entity_type="TREATMENT",
        entity_id=req.treatment_plan_id,
        hospital_id=req.hospital_id,
        patient_id=req.patient_id,
        doctor_id=req.doctor_id,
        payload={
            "treatment_type_id": req.treatment_type_id,
            "case_id": req.case_id,
            "visit_stage": req.visit_stage,
            **req.payload,
        },
        db=db,
    )

    return {
        "success": True,
        "message": f"Treatment event '{event_type}' evaluated (no records created)",
        "data": result,
    }


@router.post("/appointment-event")
async def test_appointment_event(
    req: AppointmentEventRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Test appointment events (APPOINTMENT_CREATED, APPOINTMENT_COMPLETED, etc.)."""
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)

    from app.crm.services.event_dispatcher import get_central_dispatcher
    from app.crm.services.rule_engine import get_rule_engine

    dispatcher = get_central_dispatcher()
    dispatcher.set_rule_engine(get_rule_engine())

    event_type = "APPOINTMENT_CREATED"

    result = await dispatcher.dispatch(
        event_type=event_type,
        source_module="TEST_API",
        entity_type="APPOINTMENT",
        entity_id=req.appointment_id,
        hospital_id=req.hospital_id,
        patient_id=req.patient_id,
        doctor_id=req.doctor_id,
        payload={
            "treatment_type_id": req.treatment_type_id,
            **req.payload,
        },
        db=db,
    )

    return {
        "success": True,
        "message": f"Appointment event '{event_type}' evaluated (no records created)",
        "data": result,
    }


@router.post("/case-event")
async def test_case_event(
    req: CaseEventRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Test case events (CASE_COMPLETED)."""
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)

    from app.crm.services.event_dispatcher import get_central_dispatcher
    from app.crm.services.rule_engine import get_rule_engine

    dispatcher = get_central_dispatcher()
    dispatcher.set_rule_engine(get_rule_engine())

    event_type = "CASE_COMPLETED"

    result = await dispatcher.dispatch(
        event_type=event_type,
        source_module="TEST_API",
        entity_type="CASE",
        entity_id=req.case_id,
        hospital_id=req.hospital_id,
        patient_id=req.patient_id,
        payload={
            "treatment_type_id": req.treatment_type_id,
            **req.payload,
        },
        db=db,
    )

    return {
        "success": True,
        "message": f"Case event '{event_type}' evaluated (no records created)",
        "data": result,
    }


# ============================================================
# Supported Events List
# ============================================================

@router.get("/events")
async def list_supported_events(
    current_user: dict = Depends(get_current_user),
):
    """List all supported event types for Phase 3.3."""
    verify_permission(current_user, Permission.VIEW_CRM_DASHBOARD)

    from app.crm.services.event_dispatcher import SUPPORTED_EVENTS
    return {
        "success": True,
        "data": {
            "supported_events": sorted(SUPPORTED_EVENTS),
            "total": len(SUPPORTED_EVENTS),
            "phase": "3.3",
            "note": "No CRM records are created by these events. Execution belongs to Phase 3.4.",
        },
    }
