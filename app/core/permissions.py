from enum import Enum
from typing import List
from fastapi import HTTPException, status
from sqlalchemy import select


class Role(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    GROUP_ADMIN = "GROUP_ADMIN"
    HOSPITAL_ADMIN = "HOSPITAL_ADMIN"
    DOCTOR = "DOCTOR"


class Permission(str, Enum):
    CREATE_GROUP_ADMIN = "CREATE_GROUP_ADMIN"
    MANAGE_GROUP_ADMINS = "MANAGE_GROUP_ADMINS"
    VIEW_ALL_HOSPITALS = "VIEW_ALL_HOSPITALS"
    VIEW_GLOBAL_REVENUE = "VIEW_GLOBAL_REVENUE"
    VIEW_GLOBAL_REPORTS = "VIEW_GLOBAL_REPORTS"
    VIEW_ALL_PATIENTS = "VIEW_ALL_PATIENTS"
    VIEW_ALL_DOCTORS = "VIEW_ALL_DOCTORS"
    MANAGE_PLATFORM = "MANAGE_PLATFORM"
    CREATE_HOSPITAL = "CREATE_HOSPITAL"
    CREATE_HOSPITAL_ADMIN = "CREATE_HOSPITAL_ADMIN"
    VIEW_OWN_HOSPITALS = "VIEW_OWN_HOSPITALS"
    VIEW_REVENUE_ANALYTICS = "VIEW_REVENUE_ANALYTICS"
    VIEW_DOCTOR_PERFORMANCE = "VIEW_DOCTOR_PERFORMANCE"
    VIEW_HOSPITAL_PERFORMANCE = "VIEW_HOSPITAL_PERFORMANCE"
    CREATE_DOCTOR = "CREATE_DOCTOR"
    CREATE_CONSULTANT = "CREATE_CONSULTANT"
    MANAGE_PATIENTS = "MANAGE_PATIENTS"
    MANAGE_APPOINTMENTS = "MANAGE_APPOINTMENTS"
    MANAGE_CASES = "MANAGE_CASES"
    MANAGE_BILLING = "MANAGE_BILLING"
    MANAGE_STAFF = "MANAGE_STAFF"
    CREATE_PATIENT = "CREATE_PATIENT"
    CREATE_APPOINTMENT = "CREATE_APPOINTMENT"
    CREATE_CASE = "CREATE_CASE"
    CREATE_TREATMENT_PLAN = "CREATE_TREATMENT_PLAN"
    ADD_PRE_OP = "ADD_PRE_OP"
    ADD_POST_OP = "ADD_POST_OP"
    ASSIGN_CONSULTANT = "ASSIGN_CONSULTANT"
    UPDATE_BILLING = "UPDATE_BILLING"
    COMPLETE_TREATMENT = "COMPLETE_TREATMENT"
    APPROVE_TREATMENT_PLAN = "APPROVE_TREATMENT_PLAN"
    ASSIGN_TREATMENT_DOCTOR = "ASSIGN_TREATMENT_DOCTOR"
    VIEW_TREATMENT_QUEUE = "VIEW_TREATMENT_QUEUE"
    MANAGE_EXPENSES = "MANAGE_EXPENSES"
    VIEW_EXPENSES = "VIEW_EXPENSES"
    DELETE_EXPENSE = "DELETE_EXPENSE"
    MANAGE_LEADS = "MANAGE_LEADS"
    VIEW_LEADS = "VIEW_LEADS"
    VIEW_CRM_DASHBOARD = "VIEW_CRM_DASHBOARD"


ROLE_PERMISSIONS = {
    Role.SUPER_ADMIN: [
        Permission.CREATE_GROUP_ADMIN, Permission.MANAGE_GROUP_ADMINS,
        Permission.VIEW_ALL_HOSPITALS, Permission.VIEW_GLOBAL_REVENUE,
        Permission.VIEW_GLOBAL_REPORTS, Permission.VIEW_ALL_PATIENTS,
        Permission.VIEW_ALL_DOCTORS, Permission.MANAGE_PLATFORM,
        Permission.CREATE_HOSPITAL, Permission.CREATE_HOSPITAL_ADMIN,
        Permission.CREATE_DOCTOR, Permission.MANAGE_STAFF,
        Permission.MANAGE_PATIENTS, Permission.MANAGE_BILLING,
        Permission.CREATE_CONSULTANT, Permission.CREATE_PATIENT,
        Permission.CREATE_APPOINTMENT, Permission.MANAGE_APPOINTMENTS,
        Permission.CREATE_CASE, Permission.MANAGE_CASES,
        Permission.CREATE_TREATMENT_PLAN, Permission.ADD_PRE_OP,
        Permission.ADD_POST_OP, Permission.ASSIGN_CONSULTANT,
        Permission.UPDATE_BILLING,         Permission.COMPLETE_TREATMENT,
        Permission.APPROVE_TREATMENT_PLAN, Permission.ASSIGN_TREATMENT_DOCTOR,
        Permission.VIEW_TREATMENT_QUEUE,
        Permission.MANAGE_EXPENSES, Permission.VIEW_EXPENSES, Permission.DELETE_EXPENSE,
        Permission.MANAGE_LEADS, Permission.VIEW_LEADS,
        Permission.VIEW_CRM_DASHBOARD, Permission.VIEW_REVENUE_ANALYTICS,
        Permission.VIEW_DOCTOR_PERFORMANCE, Permission.VIEW_HOSPITAL_PERFORMANCE,
    ],
    Role.GROUP_ADMIN: [
        Permission.CREATE_HOSPITAL, Permission.CREATE_HOSPITAL_ADMIN,
        Permission.VIEW_OWN_HOSPITALS, Permission.VIEW_REVENUE_ANALYTICS,
        Permission.VIEW_DOCTOR_PERFORMANCE, Permission.VIEW_HOSPITAL_PERFORMANCE,
        Permission.CREATE_DOCTOR, Permission.MANAGE_STAFF,
        Permission.MANAGE_PATIENTS, Permission.CREATE_PATIENT,
        Permission.MANAGE_APPOINTMENTS, Permission.CREATE_APPOINTMENT,
        Permission.MANAGE_BILLING, Permission.MANAGE_CASES,
        Permission.CREATE_CASE, Permission.CREATE_TREATMENT_PLAN,
        Permission.CREATE_CONSULTANT,
        Permission.UPDATE_BILLING,
        Permission.APPROVE_TREATMENT_PLAN, Permission.ASSIGN_TREATMENT_DOCTOR,
        Permission.VIEW_TREATMENT_QUEUE,
        Permission.MANAGE_EXPENSES, Permission.VIEW_EXPENSES, Permission.DELETE_EXPENSE,
        Permission.MANAGE_LEADS, Permission.VIEW_LEADS,
    ],
    Role.HOSPITAL_ADMIN: [
        Permission.CREATE_DOCTOR, Permission.CREATE_CONSULTANT,
        Permission.MANAGE_PATIENTS, Permission.MANAGE_APPOINTMENTS,
        Permission.MANAGE_CASES, Permission.MANAGE_BILLING, Permission.MANAGE_STAFF,
        Permission.CREATE_PATIENT, Permission.CREATE_APPOINTMENT, Permission.CREATE_CASE,
        Permission.CREATE_TREATMENT_PLAN,
        Permission.ADD_PRE_OP, Permission.ADD_POST_OP,
        Permission.UPDATE_BILLING,
        Permission.APPROVE_TREATMENT_PLAN, Permission.ASSIGN_TREATMENT_DOCTOR,
        Permission.VIEW_TREATMENT_QUEUE,
        Permission.MANAGE_EXPENSES, Permission.VIEW_EXPENSES,
        Permission.MANAGE_LEADS, Permission.VIEW_LEADS,
        Permission.VIEW_CRM_DASHBOARD,
    ],
    Role.DOCTOR: [
        Permission.MANAGE_PATIENTS,
        Permission.MANAGE_APPOINTMENTS, Permission.CREATE_APPOINTMENT,
        Permission.CREATE_CASE, Permission.MANAGE_CASES,
        Permission.CREATE_TREATMENT_PLAN, Permission.CREATE_CONSULTANT,
        Permission.ADD_PRE_OP, Permission.ADD_POST_OP,
        Permission.ASSIGN_CONSULTANT,
        Permission.UPDATE_BILLING, Permission.MANAGE_BILLING,
        Permission.COMPLETE_TREATMENT,
        Permission.VIEW_ALL_DOCTORS, Permission.VIEW_OWN_HOSPITALS,
        Permission.MANAGE_LEADS, Permission.VIEW_LEADS,
    ],
}


def has_permission(user_role: str, *permissions: Permission) -> bool:
    if user_role not in [r.value for r in Role]:
        return False
    user_permissions = ROLE_PERMISSIONS.get(Role(user_role), [])
    return any(perm in user_permissions for perm in permissions)


def verify_permission(current_user: dict, *permissions: Permission):
    import logging
    logger = logging.getLogger(__name__)
    user_role = current_user.get("role")
    user_sub = current_user.get("sub", "unknown")
    logger.debug("VERIFY_PERMISSION sub=%s role=%s checking=%s", user_sub, user_role, [p.value for p in permissions])
    if user_role not in [r.value for r in Role]:
        logger.error("VERIFY_PERMISSION FAIL: role '%s' not in %s", user_role, [r.value for r in Role])
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Invalid role: '{user_role}'")
    user_permissions = ROLE_PERMISSIONS.get(Role(user_role), [])
    has_any = any(p in user_permissions for p in permissions)
    if not has_any:
        logger.error("VERIFY_PERMISSION FAIL: role=%s missing %s, user_permissions=%s", user_role, [p.value for p in permissions], [p.value for p in user_permissions])
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing required permission: {', '.join(p.value for p in permissions)}")
    logger.debug("VERIFY_PERMISSION OK: sub=%s role=%s", user_sub, user_role)


async def verify_tenant_access(current_user: dict, entity: object, entity_type: str, db=None):
    """Verify GROUP_ADMIN has tenant-level access to an entity.
    For SUPER_ADMIN/HOSPITAL_ADMIN/DOCTOR, permissions are checked by verify_permission instead.
    """
    role = current_user.get("role")
    if role != Role.GROUP_ADMIN.value:
        return True
    agid = current_user.get("admin_group_id")
    if not agid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: no admin group")

    entity_agid = None
    if entity_type == "hospital":
        entity_agid = str(getattr(entity, "admin_group_id", ""))
    elif entity_type == "doctor":
        entity_agid = str(getattr(entity, "admin_group_id", ""))
    elif entity_type == "patient":
        from app.models.hospital import Hospital
        from sqlalchemy import select
        hid = getattr(entity, "hospital_id", None)
        if hid and db:
            result = await db.execute(select(Hospital.admin_group_id).where(Hospital.id == hid))
            row = result.one_or_none()
            entity_agid = str(row[0]) if row else None
    elif entity_type in ("case", "billing", "treatment_plan", "appointment", "sitting"):
        if db:
            from app.models.case import Case as CaseModel
            from app.models.patient import Patient as PatientModel
            from app.models.hospital import Hospital as HospitalModel
            from app.models.billing import Billing
            from app.models.treatment_plan import TreatmentPlan
            from app.models.appointment import Appointment
            from sqlalchemy import select
            if entity_type == "case":
                case_id = getattr(entity, "id", None)
            elif entity_type == "billing":
                case_id = getattr(entity, "case_id", None)
            elif entity_type == "treatment_plan":
                case_id = getattr(entity, "case_id", None)
            elif entity_type == "appointment":
                patient_id = getattr(entity, "patient_id", None)
            elif entity_type == "sitting":
                plan_id = getattr(entity, "treatment_plan_id", None)
                if plan_id:
                    plan_result = await db.execute(select(TreatmentPlan.case_id).where(TreatmentPlan.id == plan_id))
                    plan_row = plan_result.one_or_none()
                    case_id = plan_row[0] if plan_row else None
            if case_id:
                case_result = await db.execute(select(CaseModel.patient_id).where(CaseModel.id == case_id))
                case_row = case_result.one_or_none()
                patient_id = case_row[0] if case_row else None
            if patient_id:
                pat_result = await db.execute(select(PatientModel.hospital_id).where(PatientModel.id == patient_id))
                pat_row = pat_result.one_or_none()
                hid = pat_row[0] if pat_row else None
                if hid:
                    hosp_result = await db.execute(select(HospitalModel.admin_group_id).where(HospitalModel.id == hid))
                    hosp_row = hosp_result.one_or_none()
                    entity_agid = str(hosp_row[0]) if hosp_row else None
    elif entity_type == "consultant":
        hid = getattr(entity, "hospital_id", None)
        if hid and db:
            from app.models.hospital import Hospital
            from sqlalchemy import select
            result = await db.execute(select(Hospital.admin_group_id).where(Hospital.id == hid))
            row = result.one_or_none()
            entity_agid = str(row[0]) if row else None

    if entity_agid and entity_agid != str(agid):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: not in your admin group")
    return True
