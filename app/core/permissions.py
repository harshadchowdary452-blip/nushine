from enum import Enum
from typing import List
from fastapi import HTTPException, status


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
        Permission.UPDATE_BILLING, Permission.COMPLETE_TREATMENT,
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
    ],
    Role.HOSPITAL_ADMIN: [
        Permission.CREATE_DOCTOR, Permission.CREATE_CONSULTANT,
        Permission.MANAGE_PATIENTS, Permission.MANAGE_APPOINTMENTS,
        Permission.MANAGE_CASES, Permission.MANAGE_BILLING, Permission.MANAGE_STAFF,
        Permission.CREATE_PATIENT, Permission.CREATE_APPOINTMENT, Permission.CREATE_CASE,
        Permission.CREATE_TREATMENT_PLAN,
    ],
    Role.DOCTOR: [
        Permission.CREATE_PATIENT, Permission.MANAGE_PATIENTS,
        Permission.CREATE_APPOINTMENT, Permission.MANAGE_APPOINTMENTS,
        Permission.CREATE_CASE, Permission.MANAGE_CASES,
        Permission.CREATE_TREATMENT_PLAN, Permission.CREATE_CONSULTANT,
        Permission.ADD_PRE_OP, Permission.ADD_POST_OP,
        Permission.ASSIGN_CONSULTANT,
        Permission.UPDATE_BILLING, Permission.MANAGE_BILLING,
        Permission.COMPLETE_TREATMENT,
        Permission.VIEW_ALL_DOCTORS, Permission.VIEW_OWN_HOSPITALS,
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
    logger.warning("VERIFY_PERMISSION sub=%s role=%s checking=%s", user_sub, user_role, [p.value for p in permissions])
    if user_role not in [r.value for r in Role]:
        logger.error("VERIFY_PERMISSION FAIL: role '%s' not in %s", user_role, [r.value for r in Role])
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Invalid role: '{user_role}'")
    user_permissions = ROLE_PERMISSIONS.get(Role(user_role), [])
    has_any = any(p in user_permissions for p in permissions)
    if not has_any:
        logger.error("VERIFY_PERMISSION FAIL: role=%s missing %s, user_permissions=%s", user_role, [p.value for p in permissions], [p.value for p in user_permissions])
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing required permission: {', '.join(p.value for p in permissions)}")
    logger.warning("VERIFY_PERMISSION OK: sub=%s role=%s", user_sub, user_role)
