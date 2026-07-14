# Enterprise Filtering: Step-by-Step Implementation Plan

## Pre-Requisite: Bug Fixes

### Step 1: Fix `TreatmentPlan.patient_id` bug in `patient_repository.py`

**File:** `app/repositories/patient_repository.py`

**Problem:** Lines 61-63 and 139-141 reference `TreatmentPlan.patient_id` which does not exist. `TreatmentPlan` has `case_id`, not `patient_id`. The correct path is `Patient -> Case -> TreatmentPlan`.

**Lines 61-63 (`get_all` method):**
```python
# BEFORE (broken):
elif key == "treatment_status" and value:
    subq = select(TreatmentPlan.patient_id).where(TreatmentPlan.status == value).distinct()
    query = query.where(Patient.id.in_(subq))
```
```python
# AFTER (fixed):
elif key == "treatment_status" and value:
    subq = (
        select(Case.patient_id)
        .join(TreatmentPlan, TreatmentPlan.case_id == Case.id)
        .where(TreatmentPlan.status == value)
        .distinct()
    )
    query = query.where(Patient.id.in_(subq))
```

**Lines 139-141 (`count` method):** Same fix — join `Case` to reach `TreatmentPlan` via `case_id`.

### Step 2: Fix `Billing.patient_id` bug in `patient_repository.py`

**File:** `app/repositories/patient_repository.py`

**Problem:** Lines 64-66 and 142-144 reference `Billing.patient_id` which does not exist. `Billing` has `case_id`. Correct path: `Patient -> Case -> Billing`.

**Lines 64-66 (`get_all` method):**
```python
# BEFORE (broken):
elif key == "billing_status" and value:
    subq = select(Billing.patient_id).where(Billing.payment_status == value).distinct()
    query = query.where(Patient.id.in_(subq))
```
```python
# AFTER (fixed):
elif key == "billing_status" and value:
    subq = (
        select(Case.patient_id)
        .join(Billing, Billing.case_id == Case.id)
        .where(Billing.payment_status == value)
        .distinct()
    )
    query = query.where(Patient.id.in_(subq))
```

**Lines 142-144 (`count` method):** Same fix.

### Step 3: Fix `Billing.appointment_id` bug in `appointment_repository.py`

**File:** `app/repositories/appointment_repository.py`

**Problem:** Line 64 (and line 133 in `count`) references `Billing.appointment_id` which does not exist. `Billing` has `case_id`. Correct path: `Appointment -> Case -> Billing`.

**Line 64 (`get_all` method):**
```python
# BEFORE (broken):
elif key == "payment_status" and value:
    query = query.join(Billing, Appointment.id == Billing.appointment_id, isouter=True).where(Billing.payment_status == value)
```
```python
# AFTER (fixed):
elif key == "payment_status" and value:
    from app.models.case import Case
    query = (
        query.join(Case, Case.appointment_id == Appointment.id, isouter=True)
        .join(Billing, Billing.case_id == Case.id, isouter=True)
        .where(Billing.payment_status == value)
    )
```

**Line 133 (`count` method):** Same fix.

---

## Phase 1: Model Changes + Migration

### Step 4: Add enum values to `AppointmentStatus`

**File:** `app/models/appointment.py`

Add two new values to the `AppointmentStatus` enum at line 9-16:
```python
class AppointmentStatus(str, Enum):
    SCHEDULED = "SCHEDULED"
    CONFIRMED = "CONFIRMED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    NO_SHOW = "NO_SHOW"
    CHECKED_IN = "CHECKED_IN"      # NEW
    RESCHEDULED = "RESCHEDULED"    # NEW
```

### Step 5: Add `created_by_id` / `updated_by_id` to `Appointment` model

**File:** `app/models/appointment.py`

Add imports for `relationship` (already imported) and add two FK columns + relationships after the existing columns (after line 50):

```python
# Add to imports at top (line 3):
from sqlalchemy import String, DateTime, Date, Time, Text, Boolean, Integer, ForeignKey, Enum as SAEnum

# Add columns after line 50 (updated_at):
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    updated_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)

# Add relationships after line 52 (doctor relationship):
    created_by = relationship("User", foreign_keys=[created_by_id], backref="created_appointments")
    updated_by = relationship("User", foreign_keys=[updated_by_id], backref="updated_appointments")
```

### Step 6: Add `created_by_id` / `updated_by_id` to `Patient` model

**File:** `app/models/patient.py`

Add after line 51 (`updated_at`):
```python
    created_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    updated_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
```

Add relationships after line 56 (`appointments` relationship):
```python
    created_by = relationship("User", foreign_keys=[created_by_id], backref="created_patients")
    updated_by = relationship("User", foreign_keys=[updated_by_id], backref="updated_patients")
```

### Step 7: Create Alembic migration

**File:** `alembic/versions/<auto_generated>`

Run `alembic revision --autogenerate -m "add_search_filter_fields"` and ensure the generated migration contains:

```python
def upgrade() -> None:
    # Add CHECKED_IN and RESCHEDULED to appointmentstatus enum
    op.execute("ALTER TYPE appointmentstatus ADD VALUE IF NOT EXISTS 'CHECKED_IN'")
    op.execute("ALTER TYPE appointmentstatus ADD VALUE IF NOT EXISTS 'RESCHEDULED'")

    # Add created_by_id/updated_by_id to appointments
    op.add_column('appointments', sa.Column('created_by_id', sa.String(length=36), nullable=True))
    op.add_column('appointments', sa.Column('updated_by_id', sa.String(length=36), nullable=True))
    op.create_foreign_key('fk_appointments_created_by', 'appointments', 'users', ['created_by_id'], ['id'])
    op.create_foreign_key('fk_appointments_updated_by', 'appointments', 'users', ['updated_by_id'], ['id'])

    # Add created_by_id/updated_by_id to patients
    op.add_column('patients', sa.Column('created_by_id', sa.String(length=36), nullable=True))
    op.add_column('patients', sa.Column('updated_by_id', sa.String(length=36), nullable=True))
    op.create_foreign_key('fk_patients_created_by', 'patients', 'users', ['created_by_id'], ['id'])
    op.create_foreign_key('fk_patients_updated_by', 'patients', 'users', ['updated_by_id'], ['id'])
```

The downgrade should reverse all of the above.

---

## Phase 2: Backend Search Endpoints

### Step 8: Create Pydantic schemas for search responses

**File:** `app/schemas/common.py` (add to existing file)

```python
class PaginatedResponse(BaseModel):
    """Generic paginated response wrapper."""
    items: list
    total: int
    page: int
    page_size: int
    total_pages: int
```

**File:** `app/schemas/appointment.py` (add to existing file)

```python
class AppointmentSearchParams(BaseModel):
    search: Optional[str] = None
    status: Optional[str] = None
    type: Optional[str] = None
    doctor_id: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    time_from: Optional[str] = None
    time_to: Optional[str] = None
    patient_name: Optional[str] = None
    op_no: Optional[str] = None
    mobile: Optional[str] = None
    abha_id: Optional[str] = None
    payment_status: Optional[str] = None
    created_by_id: Optional[str] = None
    page: int = 1
    page_size: int = 20
    sort_by: Optional[str] = None
    sort_order: Optional[str] = None
```

**File:** `app/schemas/patient.py` (add to existing file)

```python
class PatientAdvancedSearchParams(BaseModel):
    search: Optional[str] = None
    status: Optional[str] = None
    gender: Optional[str] = None
    doctor_id: Optional[str] = None
    op_no: Optional[str] = None
    phone: Optional[str] = None
    abha_id: Optional[str] = None
    patient_source: Optional[str] = None
    age_from: Optional[int] = None
    age_to: Optional[int] = None
    case_status: Optional[str] = None
    treatment_status: Optional[str] = None
    billing_status: Optional[str] = None
    created_at_from: Optional[str] = None
    created_at_to: Optional[str] = None
    last_visit_from: Optional[str] = None
    last_visit_to: Optional[str] = None
    created_by_id: Optional[str] = None
    page: int = 1
    page_size: int = 20
    sort_by: Optional[str] = None
    sort_order: Optional[str] = None
```

### Step 9: Create `GET /appointments/search` repository method

**File:** `app/repositories/appointment_repository.py`

Add a new method `search` to `AppointmentRepository` that builds a query from an explicit dict of filter params (NOT reusing `get_all`'s filter dict), returns `(items, total)`:

```python
async def search(
    self,
    filters: Dict[str, Any],
    page: int = 1,
    page_size: int = 20,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "asc",
) -> tuple[List[Appointment], int]:
    """
    Server-side search with pagination. Returns (items, total_count).
    """
    query = select(self.model).options(
        selectinload(self.model.patient),
        selectinload(self.model.doctor),
    ).join(Patient, Appointment.patient_id == Patient.id, isouter=True)

    # --- Global search ---
    if filters.get("search"):
        sv = f"%{filters['search']}%"
        query = query.where(or_(
            Patient.full_name.ilike(sv),
            Patient.phone.ilike(sv),
            Patient.op_no.ilike(sv),
            Patient.abha_id.ilike(sv),
            Appointment.appointment_number.ilike(sv),
            Appointment.notes.ilike(sv),
        ))

    # --- Field-specific filters ---
    if filters.get("status"):
        query = query.where(Appointment.status == filters["status"])
    if filters.get("type"):
        query = query.where(Appointment.appointment_type == filters["type"])
    if filters.get("doctor_id"):
        query = query.where(Appointment.doctor_id == filters["doctor_id"])
    if filters.get("date_from"):
        query = query.where(Appointment.appointment_date >= filters["date_from"])
    if filters.get("date_to"):
        query = query.where(Appointment.appointment_date <= filters["date_to"])
    if filters.get("time_from"):
        query = query.where(Appointment.appointment_time >= filters["time_from"])
    if filters.get("time_to"):
        query = query.where(Appointment.appointment_time <= filters["time_to"])
    if filters.get("patient_name"):
        query = query.where(Patient.full_name.ilike(f"%{filters['patient_name']}%"))
    if filters.get("op_no"):
        query = query.where(Patient.op_no.ilike(f"%{filters['op_no']}%"))
    if filters.get("mobile"):
        query = query.where(Patient.phone.ilike(f"%{filters['mobile']}%"))
    if filters.get("abha_id"):
        query = query.where(Patient.abha_id.ilike(f"%{filters['abha_id']}%"))
    if filters.get("created_by_id"):
        query = query.where(Appointment.created_by_id == filters["created_by_id"])

    # Payment status: join through Case -> Billing
    if filters.get("payment_status"):
        from app.models.case import Case
        from app.models.billing import Billing
        query = (
            query.join(Case, Case.appointment_id == Appointment.id, isouter=True)
            .join(Billing, Billing.case_id == Case.id, isouter=True)
            .where(Billing.payment_status == filters["payment_status"])
        )

    # --- Count total (before pagination) ---
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await self.db.execute(count_query)
    total = total_result.scalar() or 0

    # --- Sorting ---
    sort_column_map = {
        "appointment_date": Appointment.appointment_date,
        "appointment_time": Appointment.appointment_time,
        "status": Appointment.status,
        "created_at": Appointment.created_at,
        "patient_name": Patient.full_name,
    }
    order_col = sort_column_map.get(sort_by, Appointment.appointment_date)
    if sort_order == "desc":
        query = query.order_by(order_col.desc())
    else:
        query = query.order_by(order_col.asc())

    # --- Pagination ---
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await self.db.execute(query)
    items = list(result.scalars().all())
    return items, total
```

### Step 10: Create `GET /appointments/search` endpoint

**File:** `app/routers/appointments.py`

Add a new route **before** the `@router.get("/{appointment_id}")` catch-all route (important — route ordering matters):

```python
@router.get("/search")
async def search_appointments(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    time_from: Optional[str] = Query(None),
    time_to: Optional[str] = Query(None),
    patient_name: Optional[str] = Query(None),
    op_no: Optional[str] = Query(None),
    mobile: Optional[str] = Query(None),
    abha_id: Optional[str] = Query(None),
    payment_status: Optional[str] = Query(None),
    created_by_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query(None, pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_APPOINTMENTS)

    filters = {}
    if search: filters["search"] = search
    if status: filters["status"] = status
    if type: filters["type"] = type
    if doctor_id: filters["doctor_id"] = doctor_id
    if date_from: filters["date_from"] = date_from
    if date_to: filters["date_to"] = date_to
    if time_from: filters["time_from"] = time_from
    if time_to: filters["time_to"] = time_to
    if patient_name: filters["patient_name"] = patient_name
    if op_no: filters["op_no"] = op_no
    if mobile: filters["mobile"] = mobile
    if abha_id: filters["abha_id"] = abha_id
    if payment_status: filters["payment_status"] = payment_status
    if created_by_id: filters["created_by_id"] = created_by_id

    # Role-based scoping (reuse existing helper)
    scoped = await _scope_appointments_by_role(db, current_user, filters, None, None)
    if scoped == []:
        return {"items": [], "total": 0, "page": page, "page_size": page_size, "total_pages": 0}

    service = AppointmentService(db)
    items, total = await service.repo.search(
        filters=scoped,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    for a in items:
        await service._attach_names(a)

    total_pages = (total + page_size - 1) // page_size
    return {
        "items": [AppointmentResponse.model_validate(a) for a in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }
```

**IMPORTANT:** This route MUST be placed BEFORE the `@router.get("/{appointment_id}")` route at line 291, otherwise FastAPI will match `/search` as an `appointment_id`.

### Step 11: Create `GET /patients/search-advanced` repository method

**File:** `app/repositories/patient_repository.py`

Add a new `search_advanced` method:

```python
async def search_advanced(
    self,
    filters: Dict[str, Any],
    page: int = 1,
    page_size: int = 20,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = "asc",
) -> tuple[List[Patient], int]:
    """Server-side advanced search with pagination."""

    query = select(self.model)

    # Global search
    if filters.get("search"):
        sv = f"%{filters['search']}%"
        query = query.where(or_(
            Patient.full_name.ilike(sv),
            Patient.phone.ilike(sv),
            Patient.email.ilike(sv),
            Patient.op_no.ilike(sv),
            Patient.abha_id.ilike(sv),
            Patient.address.ilike(sv),
        ))

    # Direct field filters
    if filters.get("status"):
        query = query.where(Patient.status == filters["status"])
    if filters.get("gender"):
        query = query.where(Patient.gender == filters["gender"])
    if filters.get("doctor_id"):
        query = query.where(Patient.doctor_id == filters["doctor_id"])
    if filters.get("op_no"):
        query = query.where(Patient.op_no.ilike(f"%{filters['op_no']}%"))
    if filters.get("phone"):
        query = query.where(Patient.phone.ilike(f"%{filters['phone']}%"))
    if filters.get("abha_id"):
        query = query.where(Patient.abha_id.ilike(f"%{filters['abha_id']}%"))
    if filters.get("patient_source"):
        query = query.where(Patient.patient_source.ilike(f"%{filters['patient_source']}%"))
    if filters.get("age_from") is not None:
        query = query.where(Patient.age >= filters["age_from"])
    if filters.get("age_to") is not None:
        query = query.where(Patient.age <= filters["age_to"])
    if filters.get("created_by_id"):
        query = query.where(Patient.created_by_id == filters["created_by_id"])

    # Date range filters
    from datetime import datetime
    if filters.get("created_at_from"):
        dt = datetime.fromisoformat(filters["created_at_from"])
        query = query.where(Patient.created_at >= dt)
    if filters.get("created_at_to"):
        dt = datetime.fromisoformat(filters["created_at_to"])
        query = query.where(Patient.created_at <= dt)

    # Last visit filters (via Case)
    if filters.get("last_visit_from"):
        subq = select(Case.patient_id).where(Case.created_at >= filters["last_visit_from"]).distinct()
        query = query.where(Patient.id.in_(subq))
    if filters.get("last_visit_to"):
        subq = select(Case.patient_id).where(Case.created_at <= filters["last_visit_to"]).distinct()
        query = query.where(Patient.id.in_(subq))

    # Case status filter
    if filters.get("case_status"):
        subq = select(Case.patient_id).where(Case.status == filters["case_status"]).distinct()
        query = query.where(Patient.id.in_(subq))

    # Treatment status filter (FIXED: join through Case)
    if filters.get("treatment_status"):
        subq = (
            select(Case.patient_id)
            .join(TreatmentPlan, TreatmentPlan.case_id == Case.id)
            .where(TreatmentPlan.status == filters["treatment_status"])
            .distinct()
        )
        query = query.where(Patient.id.in_(subq))

    # Billing status filter (FIXED: join through Case)
    if filters.get("billing_status"):
        subq = (
            select(Case.patient_id)
            .join(Billing, Billing.case_id == Case.id)
            .where(Billing.payment_status == filters["billing_status"])
            .distinct()
        )
        query = query.where(Patient.id.in_(subq))

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await self.db.execute(count_query)
    total = total_result.scalar() or 0

    # Sorting
    sort_column_map = {
        "full_name": Patient.full_name,
        "created_at": Patient.created_at,
        "age": Patient.age,
        "status": Patient.status,
        "phone": Patient.phone,
    }
    order_col = sort_column_map.get(sort_by, Patient.created_at)
    if sort_order == "desc":
        query = query.order_by(order_col.desc())
    else:
        query = query.order_by(order_col.asc())

    # Pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await self.db.execute(query)
    items = list(result.scalars().all())
    return items, total
```

**New import needed at top of file:**
```python
from sqlalchemy import select, or_, and_, exists, func
```

### Step 12: Create `GET /patients/search-advanced` endpoint

**File:** `app/routers/patients.py`

Add a new route **before** the `@router.get("/{patient_id}")` catch-all route (before line 177):

```python
@router.get("/search-advanced")
async def search_patients_advanced(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    gender: Optional[str] = Query(None),
    doctor_id: Optional[str] = Query(None),
    op_no: Optional[str] = Query(None),
    phone: Optional[str] = Query(None),
    abha_id: Optional[str] = Query(None),
    patient_source: Optional[str] = Query(None),
    age_from: Optional[int] = Query(None),
    age_to: Optional[int] = Query(None),
    case_status: Optional[str] = Query(None),
    treatment_status: Optional[str] = Query(None),
    billing_status: Optional[str] = Query(None),
    created_at_from: Optional[str] = Query(None),
    created_at_to: Optional[str] = Query(None),
    last_visit_from: Optional[str] = Query(None),
    last_visit_to: Optional[str] = Query(None),
    created_by_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: Optional[str] = Query(None),
    sort_order: Optional[str] = Query(None, pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    verify_permission(current_user, Permission.MANAGE_PATIENTS, Permission.VIEW_ALL_PATIENTS)

    filters = {}
    if search: filters["search"] = search
    if status: filters["status"] = status
    if gender: filters["gender"] = gender
    if doctor_id: filters["doctor_id"] = doctor_id
    if op_no: filters["op_no"] = op_no
    if phone: filters["phone"] = phone
    if abha_id: filters["abha_id"] = abha_id
    if patient_source: filters["patient_source"] = patient_source
    if age_from is not None: filters["age_from"] = age_from
    if age_to is not None: filters["age_to"] = age_to
    if case_status: filters["case_status"] = case_status
    if treatment_status: filters["treatment_status"] = treatment_status
    if billing_status: filters["billing_status"] = billing_status
    if created_at_from: filters["created_at_from"] = created_at_from
    if created_at_to: filters["created_at_to"] = created_at_to
    if last_visit_from: filters["last_visit_from"] = last_visit_from
    if last_visit_to: filters["last_visit_to"] = last_visit_to
    if created_by_id: filters["created_by_id"] = created_by_id

    # Role-based scoping (reuse existing pattern from get_patients)
    role = current_user.get("role")
    if role == Role.DOCTOR.value:
        did = current_user.get("sub")
        if did:
            direct_ids = select(Patient.id).where(Patient.doctor_id == did)
            appt_ids = select(Appointment.patient_id).where(Appointment.doctor_id == did, Appointment.is_active == True)
            case_ids = select(Case.patient_id).where(Case.doctor_id == did)
            union_query = direct_ids.union(appt_ids, case_ids)
            result = await db.execute(union_query)
            pids = [row[0] for row in result.all()]
            if pids:
                filters["id__in"] = pids
            else:
                return {"items": [], "total": 0, "page": page, "page_size": page_size, "total_pages": 0}
    elif role == Role.HOSPITAL_ADMIN.value:
        if current_user.get("hospital_id"):
            filters["hospital_id"] = current_user.get("hospital_id")
    elif role == Role.GROUP_ADMIN.value:
        from app.models.hospital import Hospital
        agid = current_user.get("admin_group_id")
        if agid:
            hospital_result = await db.execute(select(Hospital.id).where(Hospital.admin_group_id == agid))
            hids = [row[0] for row in hospital_result.all()]
            if hids:
                filters["hospital_id__in"] = hids
            else:
                return {"items": [], "total": 0, "page": page, "page_size": page_size, "total_pages": 0}

    service = PatientService(db)
    items, total = await service.repo.search_advanced(
        filters=filters,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    total_pages = (total + page_size - 1) // page_size
    return {
        "items": [PatientResponse.model_validate(p) for p in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }
```

**IMPORTANT:** This route MUST be placed BEFORE the `@router.get("/{patient_id}")` route.

---

## Phase 3: Frontend Shared Utilities

### Step 13: Create `frontend/src/hooks/` directory

Create the directory `frontend/src/hooks/`.

### Step 14: Create `useServerFilters.ts` hook

**File:** `frontend/src/hooks/useServerFilters.ts`

```typescript
import { useState, useCallback, useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { useDebounce } from "./useDebounce"

interface UseServerFiltersOptions {
  defaultPage?: number
  defaultPageSize?: number
  defaultSortBy?: string
  defaultSortOrder?: "asc" | "desc"
  debounceMs?: number
}

interface FilterState {
  [key: string]: string | number | undefined
}

export function useServerFilters(options: UseServerFiltersOptions = {}) {
  const {
    defaultPage = 1,
    defaultPageSize = 20,
    defaultSortBy,
    defaultSortOrder = "desc",
    debounceMs = 300,
  } = options

  const [searchParams, setSearchParams] = useSearchParams()

  // Parse filter state from URL search params
  const filters = useMemo<FilterState>(() => {
    const result: FilterState = {}
    searchParams.forEach((value, key) => {
      if (value !== "") result[key] = value
    })
    return result
  }, [searchParams])

  // Extract pagination from URL
  const page = Number(filters.page) || defaultPage
  const pageSize = Number(filters.page_size) || defaultPageSize
  const sortBy = (filters.sort_by as string) || defaultSortBy
  const sortOrder = (filters.sort_order as "asc" | "desc") || defaultSortOrder

  // Debounced text filters (for search inputs)
  const textFilters = useMemo(() => {
    const textKeys = ["search", "patient_name", "op_no", "phone", "mobile", "abha_id"]
    const result: FilterState = {}
    for (const key of textKeys) {
      if (filters[key]) result[key] = filters[key]
    }
    return result
  }, [filters])
  const debouncedTextFilters = useDebounce(textFilters, debounceMs)

  // Non-text filters (instant)
  const selectFilters = useMemo(() => {
    const skipKeys = new Set([
      "page", "page_size", "sort_by", "sort_order",
      "search", "patient_name", "op_no", "phone", "mobile", "abha_id",
    ])
    const result: FilterState = {}
    for (const [key, value] of Object.entries(filters)) {
      if (!skipKeys.has(key) && value !== undefined && value !== "") {
        result[key] = value
      }
    }
    return result
  }, [filters])

  // Combined query params for API
  const queryParams = useMemo(() => ({
    ...debouncedTextFilters,
    ...selectFilters,
    page,
    page_size: pageSize,
    sort_by: sortBy,
    sort_order: sortOrder,
  }), [debouncedTextFilters, selectFilters, page, pageSize, sortBy, sortOrder])

  const setFilter = useCallback((key: string, value: string | number | undefined) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === undefined || value === "" || value === null) {
        next.delete(key)
      } else {
        next.set(key, String(value))
      }
      // Reset to page 1 when filters change (but not when page changes)
      if (key !== "page") next.set("page", "1")
      return next
    })
  }, [setSearchParams])

  const setFilters = useCallback((updates: Record<string, string | number | undefined>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "" || value === null) {
          next.delete(key)
        } else {
          next.set(key, String(value))
        }
      }
      next.set("page", "1")
      return next
    })
  }, [setSearchParams])

  const setPage = useCallback((p: number) => {
    setFilter("page", p)
  }, [setFilter])

  const setSort = useCallback((field: string, order: "asc" | "desc") => {
    setFilters({ sort_by: field, sort_order: order })
  }, [setFilters])

  const resetFilters = useCallback(() => {
    setSearchParams(new URLSearchParams())
  }, [setSearchParams])

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; value: string }[] = []
    for (const [key, value] of Object.entries(filters)) {
      if (["page", "page_size"].includes(key)) continue
      if (value !== undefined && value !== "") {
        chips.push({ key, label: key.replace(/_/g, " "), value: String(value) })
      }
    }
    return chips
  }, [filters])

  return {
    filters,
    queryParams,
    page,
    pageSize,
    sortBy,
    sortOrder,
    setFilter,
    setFilters,
    setPage,
    setSort,
    resetFilters,
    activeChips,
  }
}
```

### Step 15: Create `useDebounce.ts` hook

**File:** `frontend/src/hooks/useDebounce.ts`

```typescript
import { useState, useEffect } from "react"

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
```

### Step 16: Create `date-presets.ts` utility

**File:** `frontend/src/lib/date-presets.ts`

```typescript
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns"

export type DatePreset =
  | "today" | "tomorrow" | "yesterday"
  | "last_7_days" | "last_30_days"
  | "this_month" | "last_month"
  | "this_year" | "last_year"
  | "custom"

export function resolveDatePreset(preset: DatePreset): { date_from?: string; date_to?: string } {
  const now = new Date()

  switch (preset) {
    case "today":
      return { date_from: formatISO(startOfDay(now)), date_to: formatISO(endOfDay(now)) }
    case "tomorrow": {
      const tmrw = subDays(now, -1)
      return { date_from: formatISO(startOfDay(tmrw)), date_to: formatISO(endOfDay(tmrw)) }
    }
    case "yesterday": {
      const yest = subDays(now, 1)
      return { date_from: formatISO(startOfDay(yest)), date_to: formatISO(endOfDay(yest)) }
    }
    case "last_7_days":
      return { date_from: formatISO(startOfDay(subDays(now, 6))), date_to: formatISO(endOfDay(now)) }
    case "last_30_days":
      return { date_from: formatISO(startOfDay(subDays(now, 29))), date_to: formatISO(endOfDay(now)) }
    case "this_month":
      return { date_from: formatISO(startOfMonth(now)), date_to: formatISO(endOfMonth(now)) }
    case "last_month": {
      const lm = subDays(startOfMonth(now), 1)
      return { date_from: formatISO(startOfMonth(lm)), date_to: formatISO(endOfMonth(lm)) }
    }
    case "this_year":
      return { date_from: formatISO(startOfYear(now)), date_to: formatISO(endOfYear(now)) }
    case "last_year": {
      const ly = subDays(startOfYear(now), 1)
      return { date_from: formatISO(startOfYear(ly)), date_to: formatISO(endOfYear(ly)) }
    }
    case "custom":
      return {}
  }
}

function formatISO(d: Date): string {
  return d.toISOString().split("T")[0]
}
```

### Step 17: Create `FilterBar` shared component

**File:** `frontend/src/components/ui/filter-bar.tsx`

This component provides:
- Desktop: inline flex-wrap layout with filter controls
- Mobile: collapsible Sheet (slide-out drawer using existing `Sheet` component)
- Apply and Reset buttons
- Loading indicator

Structure:
```tsx
import { useState } from "react"
import { SlidersHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"

interface FilterBarProps {
  children: React.ReactNode
  activeCount?: number
  onReset?: () => void
  isLoading?: boolean
}

export default function FilterBar({ children, activeCount = 0, onReset, isLoading }: FilterBarProps) {
  // Mobile: Sheet trigger with badge count
  // Desktop: inline flex-wrap container
  // Renders children (filter controls) inside appropriate layout
}
```

### Step 18: Create `FilterChips` shared component

**File:** `frontend/src/components/ui/filter-chips.tsx`

```tsx
import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface FilterChip {
  key: string
  label: string
  value: string
}

interface FilterChipsProps {
  chips: FilterChip[]
  onRemove: (key: string) => void
  onClearAll: () => void
}

export default function FilterChips({ chips, onRemove, onClearAll }: FilterChipsProps) {
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Badge key={chip.key} variant="secondary" className="gap-1 pr-1">
          <span className="text-xs">{chip.label}: {chip.value}</span>
          <button onClick={() => onRemove(chip.key)} className="ml-1 rounded-full hover:bg-muted p-0.5">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Button variant="ghost" size="sm" onClick={onClearAll} className="h-6 text-xs">
        Clear all
      </Button>
    </div>
  )
}
```

---

## Phase 4: Frontend Appointment Filtering

### Step 19: Update TypeScript types

**File:** `frontend/src/types/index.ts`

Update `AppointmentStatus` type (line 262):
```typescript
// BEFORE:
export type AppointmentStatus = "SCHEDULED" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

// AFTER:
export type AppointmentStatus = "SCHEDULED" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW" | "CHECKED_IN" | "RESCHEDULED";
```

Add new filter interfaces at end of file:
```typescript
export interface AppointmentSearchFilters {
  search?: string
  status?: string
  type?: string
  doctor_id?: string
  date_from?: string
  date_to?: string
  time_from?: string
  time_to?: string
  patient_name?: string
  op_no?: string
  mobile?: string
  abha_id?: string
  payment_status?: string
  created_by_id?: string
  page?: number
  page_size?: number
  sort_by?: string
  sort_order?: "asc" | "desc"
}

export interface PatientSearchFilters {
  search?: string
  status?: string
  gender?: string
  doctor_id?: string
  op_no?: string
  phone?: string
  abha_id?: string
  patient_source?: string
  age_from?: number
  age_to?: number
  case_status?: string
  treatment_status?: string
  billing_status?: string
  created_at_from?: string
  created_at_to?: string
  last_visit_from?: string
  last_visit_to?: string
  created_by_id?: string
  page?: number
  page_size?: number
  sort_by?: string
  sort_order?: "asc" | "desc"
}
```

### Step 20: Add new API functions to `endpoints.ts`

**File:** `frontend/src/services/endpoints.ts`

Add to `appointmentsApi` object (after line 95, before the closing `}`):
```typescript
  search: (params: Record<string, unknown>) =>
    api.get("/appointments/search", { params }).then((r) => r.data),
```

Add to `patientsApi` object (after line 68, before the closing `}`):
```typescript
  searchAdvanced: (params: Record<string, unknown>) =>
    api.get("/patients/search-advanced", { params }).then((r) => r.data),
```

### Step 21: Create `AppointmentFilterBar` component

**File:** `frontend/src/pages/appointments/filter-bar.tsx`

This component renders all appointment-specific filter controls. It receives `useServerFilters` state/actions as props.

Controls:
1. **Date Preset Select** + Custom Date Range inputs (date_from, date_to)
2. **Doctor SearchableSelect** (uses doctorsApi.list data)
3. **Status Select** (8 statuses including CHECKED_IN, RESCHEDULED)
4. **Type Select** (5 appointment types)
5. **Patient Name** text input (debounced via useServerFilters)
6. **OP No** text input (debounced)
7. **Phone** text input (debounced)
8. **ABHA ID** text input (debounced)
9. **Payment Status Select** (DRAFT, PARTIAL, PAID, OVERDUE, CANCELLED)
10. **Time Slot Select** (Morning 6-12, Afternoon 12-17, Evening 17-21)
11. **Created By SearchableSelect**

```tsx
// Key structure:
import { useQuery } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import FilterBar from "@/components/ui/filter-bar"
import SearchableSelect from "@/components/ui/searchable-select"
import { doctorsApi } from "@/services/endpoints"
import { resolveDatePreset, type DatePreset } from "@/lib/date-presets"
import type { AppointmentSearchFilters } from "@/types"

interface AppointmentFilterBarProps {
  filters: Record<string, string | number | undefined>
  setFilter: (key: string, value: string | number | undefined) => void
  setFilters: (updates: Record<string, string | number | undefined>) => void
  resetFilters: () => void
  activeCount: number
  isLoading?: boolean
}

export default function AppointmentFilterBar({ filters, setFilter, setFilters, resetFilters, activeCount, isLoading }: AppointmentFilterBarProps) {
  // ... renders all filter controls
  // Date preset changes call setFilters({ date_from, date_to })
  // Each Select/Input calls setFilter for its specific key
}
```

### Step 22: Rewrite `appointments/list.tsx` data fetching

**File:** `frontend/src/pages/appointments/list.tsx`

**What changes:**
1. Import `useServerFilters` from `@/hooks/useServerFilters`
2. Import `AppointmentFilterBar` from `./filter-bar`
3. Import `FilterChips` from `@/components/ui/filter-chips`
4. Replace the `useQuery` call (lines 230-233):

```typescript
// BEFORE:
const { data, isLoading } = useQuery<PaginatedResponse<Appointment>>({
  queryKey: ["appointments"],
  queryFn: () => appointmentsApi.list({ page_size: 100 }),
})

// AFTER:
const { queryParams, page, pageSize, sortBy, sortOrder, setFilter, setFilters, setPage, setSort, resetFilters, activeChips } = useServerFilters({
  defaultSortBy: "appointment_date",
  defaultSortOrder: "desc",
})

const { data, isLoading } = useQuery({
  queryKey: ["appointments", "search", queryParams],
  queryFn: () => appointmentsApi.search(queryParams),
  placeholderData: (prev) => prev,  // keepPreviousData
})
```

5. **Remove** `globalFilter` state and the `<Input>` search bar (lines 222, 502-510)
6. **Remove** `getFilteredRowModel` from the TanStack Table imports and config
7. **Remove** client-side pagination from TanStack Table config (use server pagination instead)
8. Add `<AppointmentFilterBar>` and `<FilterChips>` above the table
9. Update table to use server-side pagination controls (Page X of Y, using `data.total_pages`)
10. Update `statusVariant` to include new statuses:

```typescript
const statusVariant: Record<string, ...> = {
  SCHEDULED: "default",
  CONFIRMED: "success",
  IN_PROGRESS: "warning",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
  NO_SHOW: "outline",
  CHECKED_IN: "success",    // NEW
  RESCHEDULED: "warning",   // NEW
}
```

11. Update mutation `onSuccess` to invalidate `["appointments", "search"]`:

```typescript
queryClient.invalidateQueries({ queryKey: ["appointments"], refetchType: "all" })
// This already uses prefix matching, so ["appointments", "search"] will be invalidated too
```

12. **Keep unchanged**: Calendar view, create dialog, delete dialog, SlotGrid

---

## Phase 5: Frontend Patient Filtering

### Step 23: Create `PatientFilterBar` component

**File:** `frontend/src/pages/patients/filter-bar.tsx`

Similar structure to AppointmentFilterBar but with 15+ controls:

1. **Global Search** text input (debounced)
2. **Status Select** (10 patient statuses)
3. **Gender Select** (MALE, FEMALE, OTHER)
4. **Doctor SearchableSelect**
5. **OP No** text input (debounced)
6. **Phone** text input (debounced)
7. **ABHA ID** text input (debounced)
8. **Patient Source** SearchableSelect (reuse SOURCE_OPTIONS from existing list.tsx)
9. **Age Range** (age_from, age_to) number inputs
10. **Case Status Select**
11. **Treatment Status Select**
12. **Billing Status Select**
13. **Registration Date Range** (created_at_from, created_at_to)
14. **Last Visit Date Range** (last_visit_from, last_visit_to)
15. **Created By SearchableSelect**

```tsx
interface PatientFilterBarProps {
  filters: Record<string, string | number | undefined>
  setFilter: (key: string, value: string | number | undefined) => void
  setFilters: (updates: Record<string, string | number | undefined>) => void
  resetFilters: () => void
  activeCount: number
  isLoading?: boolean
}

export default function PatientFilterBar({ filters, setFilter, setFilters, resetFilters, activeCount, isLoading }: PatientFilterBarProps) {
  // ... renders all 15 filter controls
}
```

### Step 24: Rewrite `patients/list.tsx` data fetching

**File:** `frontend/src/pages/patients/list.tsx`

**What changes:**
1. Import `useServerFilters` from `@/hooks/useServerFilters`
2. Import `PatientFilterBar` from `./filter-bar`
3. Import `FilterChips` from `@/components/ui/filter-chips`
4. Replace the `useQuery` call (lines 123-128):

```typescript
// BEFORE:
const { data, isLoading } = useQuery<Patient[]>({
  queryKey: ["patients", { search: globalFilter }],
  queryFn: () => patientsApi.list({ search: globalFilter, page_size: 100, hospital_id: currentUser?.hospital_id || undefined }),
  refetchOnMount: true,
  staleTime: 0,
})

// AFTER:
const { queryParams, page, pageSize, sortBy, sortOrder, setFilter, setFilters, setPage, setSort, resetFilters, activeChips } = useServerFilters({
  defaultSortBy: "created_at",
  defaultSortOrder: "desc",
})

const { data, isLoading } = useQuery({
  queryKey: ["patients", "search-advanced", queryParams],
  queryFn: () => patientsApi.searchAdvanced(queryParams),
  placeholderData: (prev) => prev,
})
```

5. **Remove** `globalFilter` state (line 114)
6. **Remove** `genderFilter` state and button group (lines 115, 324-334)
7. **Remove** `statusFilter` state and button group (lines 116, 336-348)
8. **Remove** client-side filtering in `patients` useMemo (lines 181-191)
9. **Remove** `getFilteredRowModel` from TanStack Table imports and config
10. Add `<PatientFilterBar>` and `<FilterChips>` above the table
11. Update table to use server-side pagination
12. Update mutation `onSuccess` — existing invalidation `{ queryKey: ["patients"] }` already uses prefix matching

13. **Keep unchanged**: Create dialog, delete dialog

---

## Phase 6: Validation

### Step 25: Backend validation

Run:
```bash
# Ensure all Python imports resolve
cd C:\Users\harsh\fastapi-project
python -c "from app.main import app; print('Backend OK')"

# Run Alembic migration
alembic upgrade head

# Test endpoints manually or via test_api.py
```

### Step 26: Frontend validation

Run:
```bash
cd C:\Users\harsh\fastapi-project\frontend
npx tsc --noEmit   # TypeScript type check
npm run build      # Full build (includes type check via "tsc && vite build")
```

### Step 27: Manual smoke tests

1. Open `/appointments` — verify new filter bar renders, existing list still loads
2. Apply a status filter — verify URL updates with `?status=SCHEDULED`
3. Apply a date range — verify API call includes `date_from` and `date_to`
4. Click "Clear all" — verify filters reset
5. Navigate away and back — verify filters persist via URL
6. Open `/patients` — verify similar behavior
7. Apply `treatment_status` filter — verify no backend crash (bug is fixed)
8. Apply `billing_status` filter — verify no backend crash (bug is fixed)

---

## File Summary

### New Files (8)
| # | File | Purpose |
|---|------|---------|
| 1 | `frontend/src/hooks/useServerFilters.ts` | Filter state management hook with URL sync |
| 2 | `frontend/src/hooks/useDebounce.ts` | Debounce hook for text inputs |
| 3 | `frontend/src/lib/date-presets.ts` | Date preset utility functions |
| 4 | `frontend/src/components/ui/filter-bar.tsx` | Reusable filter bar layout (responsive) |
| 5 | `frontend/src/components/ui/filter-chips.tsx` | Removable filter chip badges |
| 6 | `frontend/src/pages/appointments/filter-bar.tsx` | Appointment-specific filter controls |
| 7 | `frontend/src/pages/patients/filter-bar.tsx` | Patient-specific filter controls |
| 8 | `alembic/versions/<auto_generated>.py` | Migration for new columns + enum values |

### Modified Files (7)
| # | File | Changes |
|---|------|---------|
| 1 | `app/repositories/patient_repository.py` | Fix treatment_status + billing_status bugs; add `search_advanced` method |
| 2 | `app/repositories/appointment_repository.py` | Fix payment_status bug; add `search` method |
| 3 | `app/models/appointment.py` | Add CHECKED_IN/RESCHEDULED enum values; add created_by_id/updated_by_id columns |
| 4 | `app/models/patient.py` | Add created_by_id/updated_by_id columns + relationships |
| 5 | `app/routers/appointments.py` | Add `GET /search` endpoint |
| 6 | `app/routers/patients.py` | Add `GET /search-advanced` endpoint |
| 7 | `frontend/src/services/endpoints.ts` | Add `appointmentsApi.search` and `patientsApi.searchAdvanced` |
| 8 | `frontend/src/types/index.ts` | Update AppointmentStatus; add filter interfaces |
| 9 | `frontend/src/pages/appointments/list.tsx` | Switch to server-side filtering/pagination |
| 10 | `frontend/src/pages/patients/list.tsx` | Switch to server-side filtering/pagination |

### Unchanged (verified zero impact)
- `GET /appointments/` — existing endpoint untouched
- `GET /patients/` — existing endpoint untouched
- `GET /patients/search` — existing endpoint untouched (used by consent forms, case reports)
- All dashboard, CRM, export, calendar code — completely unaffected
- Create/delete/update dialogs — unchanged
- Calendar view — unchanged
