# Treatment Execution & Workflow Management System — Revised Implementation Plan

## Architecture

```
Case Report Created
    ↓
Treatment Plan Prepared (stored as TreatmentPlanItem records)
    ↓
Admin / Authorized Doctor Reviews
    ↓
Approve Treatment Plan → Version Locked → Treatment Records Generated
    ↓
Doctor Assignment → Doctor Queue → Visits / Sittings → Completion → Billing → Case Complete
```

**Core Principles:**
- Case Report is the clinical source of truth (diagnosis, findings, treatment plan)
- Treatment records are generated ONLY after approval
- TreatmentPlanItem is the normalized canonical table (not JSON blob)
- Every edit before approval creates a new version
- Doctors execute treatments; they never modify the treatment plan

---

## PHASE 1: Backend Model Changes

### 1.1 New Model — TreatmentPlanItem
**File:** New `app/models/treatment_plan_item.py`

```python
class TreatmentPlanItem(Base):
    __tablename__ = "treatment_plan_items"
    id: str (PK, UUID)
    case_id: str (FK → cases.id)
    version: int (default=1)  # Version number for audit
    is_current: bool (default=True)  # Only current version items are active
    procedure_name: str (not null)  # e.g. "Root Canal Treatment"
    tooth_numbers: str (nullable)  # comma-separated: "16,17,27"
    estimated_visits: int (default=1)
    estimated_cost: float (default=0.0)
    remarks: str (nullable)
    sequence_order: int (default=0)  # Execution order within the plan
    dependency_item_id: str (FK → treatment_plan_items.id, nullable)
    generated_treatment_id: str (FK → treatment_plans.id, nullable)  # Link to execution record
    assigned_doctor_id: str (FK → users.id, nullable)
    assistant_doctor_id: str (FK → users.id, nullable)  # Optional assistant
    is_approved: bool (default=False)
    approved_by_id: str (FK → users.id, nullable)
    approved_at: datetime (nullable)
    created_by_id: str (FK → users.id, nullable)
    created_at: datetime
    updated_at: datetime

    # Relationships
    case = relationship("Case", back_populates="treatment_plan_items")
    dependency_item = relationship("TreatmentPlanItem", remote_side=[id], foreign_keys=[dependency_item_id])
    generated_treatment = relationship("TreatmentPlan")
    assigned_doctor = relationship("User", foreign_keys=[assigned_doctor_id])
    assistant_doctor = relationship("User", foreign_keys=[assistant_doctor_id])
```

### 1.2 Update Case Model
**File:** `app/models/case.py`

Add columns:
```python
treatment_plan_version: int (default=0)  # 0 = not yet approved
treatment_plan_approved: bool (default=False)
treatment_plan_approved_by_id: str (FK → users.id, nullable)
treatment_plan_approved_at: datetime (nullable)
treatment_plan_items = relationship("TreatmentPlanItem", back_populates="case", cascade="all, delete-orphan")
```

### 1.3 Update TreatmentPlan Model
**File:** `app/models/treatment_plan.py`

Add columns:
```python
treatment_plan_item_id: str (FK → treatment_plan_items.id, nullable)  # Source item
assigned_doctor_id: str (FK → users.id, nullable)
assistant_doctor_id: str (FK → users.id, nullable)
tooth_numbers: str (nullable)
priority: str (default="MEDIUM")  # LOW/MEDIUM/HIGH/EMERGENCY
sequence_order: int (default=0)
dependency_treatment_id: str (FK → treatment_plans.id, nullable)
overdue_reason: str (nullable)
overdue_delay_type: str (nullable)  # Patient Missed/Doctor Delay/Lab Delay/Medical/Patient Request/Financial/Other
started_at: datetime (nullable)
completed_at: datetime (nullable)
created_by_id: str (FK → users.id, nullable)
auto_created: bool (default=True)
```

Update status enum:
```python
class TreatmentPlanStatus(str, Enum):
    ASSIGNED = "ASSIGNED"
    SCHEDULED = "SCHEDULED"
    IN_PROGRESS = "IN_PROGRESS"
    WAITING_PATIENT = "WAITING_PATIENT"
    WAITING_LAB = "WAITING_LAB"
    ON_HOLD = "ON_HOLD"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    OVERDUE = "OVERDUE"
```

### 1.4 Update TreatmentSitting Model
**File:** `app/models/treatment_sitting.py`

Add columns:
```python
materials_used: str (nullable)  # Materials used during sitting
duration_minutes: int (nullable)  # Duration of sitting
attachments_json: str (nullable)  # JSON array of file URLs
signature_url: str (nullable)  # Digital signature URL
completed_by_id: str (FK → users.id, nullable)
completed_at: datetime (nullable)
```

### 1.5 Alembic Migration
**File:** New `alembic/versions/treatment_plan_item_and_enhancements_*.py`

Creates:
- `treatment_plan_items` table
- Adds new columns to `cases`, `treatment_plans`, `treatment_sittings`
- Adds `treatment_plan_item_id` FK to `treatment_plans`

---

## PHASE 2: Backend Services

### 2.1 Treatment Plan Item Service
**File:** New `app/services/treatment_plan_item_service.py`

```python
class TreatmentPlanItemService:
    async def create_items(self, case_id: str, items: list[dict], user_id: str) -> int:
        """Create TreatmentPlanItem records from treatment plan data. Returns version number."""

    async def get_items(self, case_id: str, version: int = None) -> list:
        """Get items for a case. If version=None, get current version."""

    async def update_item(self, item_id: str, data: dict) -> TreatmentPlanItem:
        """Update a treatment plan item (only allowed before approval)."""

    async def delete_item(self, item_id: str) -> bool:
        """Delete a treatment plan item (only allowed before approval)."""

    async def approve_plan(self, case_id: str, user_id: str) -> list[TreatmentPlan]:
        """Approve the current version. Generate Treatment records from all items. Returns generated treatments."""

    async def create_new_version(self, case_id: str, user_id: str) -> int:
        """Create a new version by copying current items. Returns new version number."""

    async def get_version_history(self, case_id: str) -> list[dict]:
        """Get all versions with item counts and approval status."""
```

### 2.2 Treatment Generation Service
**File:** New `app/services/treatment_generator.py`

```python
class TreatmentGenerator:
    async def generate_from_items(self, items: list[TreatmentPlanItem], case: Case, user_id: str) -> list[TreatmentPlan]:
        """Generate Treatment records from approved TreatmentPlanItems."""
        for item in items:
            treatment = TreatmentPlan(
                case_id=case.id,
                treatment_plan_item_id=item.id,
                treatment_name=item.procedure_name,
                tooth_numbers=item.tooth_numbers,
                cost=item.estimated_cost,
                total_sittings=item.estimated_visits,
                remaining_sittings=item.estimated_visits,
                sequence_order=item.sequence_order,
                assigned_doctor_id=item.assigned_doctor_id or case.doctor_id,
                assistant_doctor_id=item.assistant_doctor_id,
                priority="MEDIUM",
                status=TreatmentPlanStatus.ASSIGNED,
                auto_created=True,
                created_by_id=user_id,
            )
            # Handle dependencies
            if item.dependency_item_id:
                dep_item = await get_item(item.dependency_item_id)
                if dep_item and dep_item.generated_treatment_id:
                    treatment.dependency_treatment_id = dep_item.generated_treatment_id
                    treatment.status = TreatmentPlanStatus.WAITING_PATIENT  # Wait for dependency
            db.add(treatment)
```

### 2.3 Update Case Service
**File:** `app/services/case_service.py`

In `create()` and `update()`:
```python
# Parse _JSON_ treatment plan and create/update TreatmentPlanItems
raw_tp = data.get("initial_treatment_plan", "")
if raw_tp and raw_tp.startswith("_JSON_"):
    items = json.loads(raw_tp[6:])
    item_svc = TreatmentPlanItemService(db)
    version = await item_svc.create_items(case.id, items, user_id)
    case.treatment_plan_version = version
    case.treatment_plan_approved = False  # Reset approval on edit
```

### 2.4 Update Treatment Plan Service
**File:** `app/services/treatment_plan_service.py`

Add methods:
- `assign_doctor(plan_id, doctor_id, assigned_by_id)` — Assign primary/assistant doctor
- `update_status(plan_id, new_status, user_id)` — With lifecycle timestamps
- `check_overdue()` — Mark overdue treatments
- `get_doctor_queue(doctor_id, filters)` — Doctor's queue with sorting
- `get_admin_dashboard(hospital_id)` — KPIs
- `suggest_next_appointment(plan_id)` — Auto-suggest next visit date

### 2.5 Update Treatment Sitting Service
**File:** `app/services/treatment_sitting_service.py`

Enhance:
- Include all new fields (materials_used, duration_minutes, etc.)
- Auto-update parent plan's completed_sittings/remaining_sittings
- Auto-set plan status to IN_PROGRESS on first sitting
- Auto-set plan status to COMPLETED when all sittings done
- Auto-suggest next appointment date from last sitting

### 2.6 Overdue Detection Service
**File:** New `app/services/overdue_detection.py`

```python
class OverdueDetectionService:
    async def check_and_mark_overdue(self):
        """Run hourly. Mark treatments past expected completion as OVERDUE."""
        # Also: check Waiting for Patient > 7 days → CRM task
        # Check Waiting for Lab > 5 days → CRM task
```

### 2.7 CRM Rule Engine
**File:** New `app/services/crm_rule_engine.py`

```python
class CRMRuleEngine:
    """Configurable rule engine for treatment events → CRM tasks."""

    async def on_event(self, event_type: str, context: dict):
        """Process a treatment event and create CRM tasks based on rules."""
        rules = await self._get_matching_rules(event_type, context)
        for rule in rules:
            await self._execute_rule(rule, context)

    # Event types:
    # treatment_assigned, visit_completed, treatment_completed,
    # treatment_overdue, waiting_patient_expired, waiting_lab_expired,
    # patient_missed_visit, treatment_on_hold
```

### 2.8 Notification Service
**File:** New `app/services/treatment_notification.py`

```python
class TreatmentNotificationService:
    async def notify_overdue(self, treatments):
        """Notify admins of overdue treatments."""

    async def notify_waiting_lab(self, treatments):
        """Notify admins of lab delays."""

    async def notify_pending_assignments(self, treatments):
        """Notify admins of unassigned treatments."""

    async def notify_doctor_queue(self, doctor_id, treatments):
        """Notify doctor of today's queue."""

    async def notify_reception_followup(self, patients):
        """Notify reception of patients waiting for follow-up."""
```

---

## PHASE 3: Backend API Endpoints

### 3.1 Treatment Plan Items Router
**File:** New `app/routers/treatment_plan_items.py`

```
GET  /treatment-plan-items/{case_id}          — Get items for a case (current version)
GET  /treatment-plan-items/{case_id}/versions — Get version history
POST /treatment-plan-items/{case_id}          — Add item to current draft
PUT  /treatment-plan-items/{item_id}          — Update item (before approval only)
DELETE /treatment-plan-items/{item_id}        — Delete item (before approval only)
POST /treatment-plan-items/{case_id}/approve  — Approve plan, generate treatments
POST /treatment-plan-items/{case_id}/version  — Create new version
```

### 3.2 Treatment Plans Router
**File:** `app/routers/treatment_plans.py`

Update existing + add:
```
GET  /treatments/                          — List (updated filters)
GET  /treatments/{id}                      — Get with full context
PUT  /treatments/{id}/assign               — Assign doctor(s)
PUT  /treatments/{id}/status               — Update status
POST /treatments/{id}/start                — Start treatment
POST /treatments/{id}/complete             — Complete treatment
POST /treatments/{id}/report-overdue       — Report overdue with reason
GET  /treatments/overdue                   — List overdue
GET  /treatments/dashboard/admin           — Admin KPIs
GET  /treatments/dashboard/doctor          — Doctor dashboard
```

### 3.3 Treatment Sittings Router
**File:** `app/routers/treatment_sittings.py`

Update:
```
POST /treatment-sittings/                  — Create (with all new fields)
PUT  /treatment-sittings/{id}              — Update
POST /treatment-sittings/{id}/complete     — Complete sitting (auto-update plan)
```

### 3.4 Doctor Queue Router
**File:** New `app/routers/doctor_queue.py`

```
GET /doctor-queue/{doctor_id}
  ?status=IN_PROGRESS
  &sort=emergency|priority|date|time

Response: {
  today_queue: [...],
  upcoming_queue: [...],
  waiting_for_patient: [...],
  waiting_for_lab: [...],
  overdue: [...],
  completed_today: [...],
  cancelled: [...],
  stats: { today, in_progress, waiting_patient, waiting_lab, overdue, completed_today }
}
```

---

## PHASE 4: Backend Schemas

### 4.1 Treatment Plan Item Schemas
**File:** New `app/schemas/treatment_plan_item.py`

```python
class TreatmentPlanItemCreate(BaseModel):
    procedure_name: str
    tooth_numbers: Optional[str] = None
    estimated_visits: int = 1
    estimated_cost: float = 0.0
    remarks: Optional[str] = None
    sequence_order: int = 0
    dependency_item_id: Optional[str] = None
    assigned_doctor_id: Optional[str] = None
    assistant_doctor_id: Optional[str] = None

class TreatmentPlanItemResponse(BaseModel):
    id: str
    case_id: str
    version: int
    is_current: bool
    procedure_name: str
    tooth_numbers: Optional[str]
    estimated_visits: int
    estimated_cost: float
    remarks: Optional[str]
    sequence_order: int
    dependency_item_id: Optional[str]
    dependency_item_name: Optional[str]
    generated_treatment_id: Optional[str]
    assigned_doctor_id: Optional[str]
    assigned_doctor_name: Optional[str]
    assistant_doctor_id: Optional[str]
    assistant_doctor_name: Optional[str]
    is_approved: bool
    approved_at: Optional[datetime]
    created_at: datetime

class TreatmentPlanVersionResponse(BaseModel):
    version: int
    item_count: int
    is_current: bool
    is_approved: bool
    approved_by: Optional[str]
    approved_at: Optional[datetime]
    total_cost: float
    total_visits: int
```

### 4.2 Update Treatment Plan Schemas
**File:** `app/schemas/treatment_plan.py`

Add to `TreatmentPlanResponse`:
```python
treatment_plan_item_id: Optional[str]
assigned_doctor_id: Optional[str]
assigned_doctor_name: Optional[str]
assistant_doctor_id: Optional[str]
assistant_doctor_name: Optional[str]
tooth_numbers: Optional[str]
priority: str
sequence_order: int
dependency_treatment_id: Optional[str]
dependency_treatment_name: Optional[str]
overdue_reason: Optional[str]
overdue_delay_type: Optional[str]
started_at: Optional[datetime]
completed_at: Optional[datetime]
auto_created: bool
```

New request schemas:
```python
class TreatmentAssignDoctor(BaseModel):
    primary_doctor_id: str
    assistant_doctor_id: Optional[str] = None
    priority: Optional[str] = "MEDIUM"
    dependency_treatment_id: Optional[str] = None

class TreatmentOverdueReport(BaseModel):
    reason: str
    delay_type: str  # Patient Missed/Doctor Delay/Lab Delay/Medical/Patient Request/Financial/Other
```

### 4.3 Update Treatment Sitting Schemas
**File:** `app/schemas/treatment_sitting.py`

Add to `TreatmentSittingCreate/Update/Response`:
```python
sitting_date: Optional[date]
doctor_id: Optional[str]
materials_used: Optional[str]
duration_minutes: Optional[int]
attachments_json: Optional[str]
signature_url: Optional[str]
completed_by_id: Optional[str]
completed_at: Optional[datetime]
```

---

## PHASE 5: Permissions

### 5.1 New Permissions
**File:** `app/core/permissions.py`

```python
APPROVE_TREATMENT_PLAN = "APPROVE_TREATMENT_PLAN"
ASSIGN_TREATMENT_DOCTOR = "ASSIGN_TREATMENT_DOCTOR"
VIEW_TREATMENT_QUEUE = "VIEW_TREATMENT_QUEUE"
MANAGE_TREATMENT_OVERDUE = "MANAGE_TREATMENT_OVERDUE"
```

Role assignments:
- `APPROVE_TREATMENT_PLAN`: HOSPITAL_ADMIN, GROUP_ADMIN, SUPER_ADMIN
- `ASSIGN_TREATMENT_DOCTOR`: HOSPITAL_ADMIN, GROUP_ADMIN, SUPER_ADMIN
- `VIEW_TREATMENT_QUEUE`: DOCTOR, HOSPITAL_ADMIN, GROUP_ADMIN
- `MANAGE_TREATMENT_OVERDUE`: HOSPITAL_ADMIN, GROUP_ADMIN, SUPER_ADMIN

---

## PHASE 6: Scheduler

### 6.1 Overdue Detection
**File:** `app/utils/scheduler.py`

Add `check_overdue_treatments()`:
- Runs every hour
- Marks treatments past expected_completion_date as OVERDUE
- Creates CRM tasks for overdue treatments
- Checks Waiting for Patient > 7 days → CRM task
- Checks Waiting for Lab > 5 days → CRM task

Register in `app/main.py`.

---

## PHASE 7: Frontend Types & API

### 7.1 Types
**File:** `frontend/src/types/index.ts`

New/updated types:
```typescript
export type TreatmentStatus =
  | "ASSIGNED" | "SCHEDULED" | "IN_PROGRESS"
  | "WAITING_PATIENT" | "WAITING_LAB" | "ON_HOLD"
  | "COMPLETED" | "CANCELLED" | "OVERDUE";

export interface TreatmentPlanItem {
  id: string;
  case_id: string;
  version: number;
  is_current: boolean;
  procedure_name: string;
  tooth_numbers: string | null;
  estimated_visits: number;
  estimated_cost: number;
  remarks: string | null;
  sequence_order: number;
  dependency_item_id: string | null;
  dependency_item_name: string | null;
  generated_treatment_id: string | null;
  assigned_doctor_id: string | null;
  assigned_doctor_name: string | null;
  assistant_doctor_id: string | null;
  assistant_doctor_name: string | null;
  is_approved: boolean;
  approved_at: string | null;
  created_at: string;
}

export interface TreatmentPlanVersion {
  version: number;
  item_count: number;
  is_current: boolean;
  is_approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  total_cost: number;
  total_visits: number;
}

export interface DoctorQueue {
  today_queue: TreatmentPlan[];
  upcoming_queue: TreatmentPlan[];
  waiting_for_patient: TreatmentPlan[];
  waiting_for_lab: TreatmentPlan[];
  overdue: TreatmentPlan[];
  completed_today: TreatmentPlan[];
  cancelled: TreatmentPlan[];
  stats: {
    today: number;
    in_progress: number;
    waiting_patient: number;
    waiting_lab: number;
    overdue: number;
    completed_today: number;
  };
}

export interface TreatmentDashboard {
  active_treatments: number;
  today_treatments: number;
  today_revenue: number;
  pending_revenue: number;
  completed_today: number;
  waiting_for_patient: number;
  waiting_for_lab: number;
  overdue_treatments: number;
  doctors_working: number;
  avg_completion_days: number;
  success_rate: number;
  estimated_revenue: number;
  collected_revenue: number;
}
```

### 7.2 API Endpoints
**File:** `frontend/src/services/endpoints.ts`

```typescript
export const treatmentPlanItemsApi = {
  list: (caseId: string) => api.get(`/treatment-plan-items/${caseId}`).then(r => r.data),
  versions: (caseId: string) => api.get(`/treatment-plan-items/${caseId}/versions`).then(r => r.data),
  create: (caseId: string, data: any) => api.post(`/treatment-plan-items/${caseId}`, data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/treatment-plan-items/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/treatment-plan-items/${id}`).then(r => r.data),
  approve: (caseId: string) => api.post(`/treatment-plan-items/${caseId}/approve`).then(r => r.data),
  newVersion: (caseId: string) => api.post(`/treatment-plan-items/${caseId}/version`).then(r => r.data),
};

export const treatmentApi = {
  // ... existing CRUD
  assignDoctor: (id: string, data: any) => api.put(`/treatments/${id}/assign`, data).then(r => r.data),
  start: (id: string, data?: any) => api.post(`/treatments/${id}/start`, data).then(r => r.data),
  complete: (id: string) => api.post(`/treatments/${id}/complete`).then(r => r.data),
  reportOverdue: (id: string, data: any) => api.post(`/treatments/${id}/report-overdue`, data).then(r => r.data),
  getOverdue: () => api.get(`/treatments/overdue`).then(r => r.data),
  getAdminDashboard: () => api.get(`/treatments/dashboard/admin`).then(r => r.data),
  getDoctorDashboard: () => api.get(`/treatments/dashboard/doctor`).then(r => r.data),
};

export const doctorQueueApi = {
  get: (doctorId: string, params?: any) => api.get(`/doctor-queue/${doctorId}`, { params }).then(r => r.data),
};
```

---

## PHASE 8: Frontend Pages

### 8.1 Treatment Plan Approval Page
**File:** New `frontend/src/pages/cases/treatment-plan.tsx`

Full-page view for reviewing and approving treatment plans:
- **Version history sidebar**: Shows all versions with item counts
- **Current plan table**: Procedure, Teeth, Est. Visits, Est. Cost, Sequence, Dependency, Assigned Doctor
- **Add/Edit/Delete items**: Only when not yet approved
- **Reorder**: Drag-and-drop sequence ordering
- **Approve button**: Triggers generation of Treatment records
- **New Version button**: Creates editable copy of current version

### 8.2 Treatment List Page
**File:** `frontend/src/pages/treatments/list.tsx` — Full rewrite

- **Status tabs**: All | Assigned | Scheduled | In Progress | Waiting | On Hold | Completed | Overdue
- **Filters**: Doctor, Priority, Date Range, Search
- **Table**: Treatment #, Patient, Procedure, Teeth, Doctor(s), Priority, Status, Progress, Est. Cost, Actions
- **No manual create**: Treatments are generated from approved plans
- **Quick actions**: Assign Doctor, Start, View Details
- **Status badges**: Color-coded per spec
- **Progress bar**: Visual completion percentage

### 8.3 Doctor Queue Page
**File:** New `frontend/src/pages/treatments/doctor-queue.tsx`

- **Header**: Doctor name, today's date
- **Stats cards**: Today's Queue, In Progress, Waiting Patient, Waiting Lab, Overdue, Completed Today
- **Sections**:
  - Today's Queue (sorted by priority → time)
  - Upcoming
  - Waiting for Patient (red highlight if > 7 days)
  - Waiting for Lab (yellow highlight if > 5 days)
  - Overdue (dark red)
  - Completed Today
- **Actions**: Start Treatment, Add Visit, View Details
- **Auto-refresh**: Every 30 seconds

### 8.4 Treatment Detail Page
**File:** `frontend/src/pages/treatments/detail.tsx` — Full rewrite

**Sections:**
1. **Header**: Name, status badge, priority, tooth numbers, patient/case links
2. **Pipeline Progress**: Diagnosis → Planning → Assigned → Visit 1 → Visit 2 → ... → Completed (visual step indicator)
3. **Treatment Info Card**: Assigned doctor(s), dates, progress bar, estimated vs actual
4. **Patient Info Card**: Name, OP#, phone, age/gender
5. **Case Report Link**: Read-only case summary + all treatments in case
6. **Visit History**: Timeline of sittings with clinical notes, procedures, materials, prescriptions, signatures
7. **Add Visit Form**: Rich form with all clinical fields
8. **Billing Summary**: Estimated cost, advance paid, collected, pending, discount, invoice status
9. **Dependencies**: Shows dependent treatment status
10. **CRM Activities**: Follow-ups, tasks created
11. **Timeline**: Full audit trail
12. **Quick Actions**: Start, Pause, Complete, Cancel, Assign Doctor, Mark Waiting

### 8.5 Case Report Detail — Treatment Summary
**File:** `frontend/src/pages/cases/detail.tsx`

Replace static treatment summary with live data from TreatmentPlanItems:
```
Treatment Plan (v2 — Approved)
──────────────────────────────
#  Procedure     Teeth    Doctor       Status        Visits  Cost
1  Extraction    16       Dr. Ramesh   Completed     1/1     ₹1,500
2  RCT           15       Dr. Sai Ram  In Progress   2/4     ₹6,000
3  Bridge        15-17    —            Waiting       0/3     ₹12,000
──────────────────────────────
Total: ₹19,500 | Collected: ₹7,500 | Pending: ₹12,000
```

Show approval status, version, and "Approve" button for admins.

### 8.6 Admin Dashboard — Treatment KPIs
**File:** Extend `frontend/src/pages/dashboard/hospital-admin.tsx`

Treatment section with KPI cards:
- Today's Treatments / Today's Revenue
- Pending Revenue / Completed Today
- Waiting for Patient / Waiting for Lab
- Overdue Treatments (with alert badge)
- Doctors Working / Avg Completion Time
- Treatment Success Rate %

---

## PHASE 9: CRM Integration

### 9.1 CRM Rule Engine
**File:** `app/services/crm_rule_engine.py`

Configurable rules stored in `treatment_follow_up_rules` table (extend existing):

| Event | Rule | CRM Action |
|-------|------|------------|
| Treatment Assigned | default | Reception Task: "Schedule first visit" |
| Visit Completed | default | Task: "Call patient, book next visit" |
| Treatment Completed | per treatment type | Feedback + Review + Recall tasks |
| Extraction Completed | 7-day rule | Follow-up: "Review after 7 days" |
| Scaling Completed | 6-month rule | Recall: "Recall after 6 months" |
| Bridge Waiting for Lab | 5-day rule | Task: "Lab follow-up after 5 days" |
| Waiting for Patient > 7 days | auto-detect | High-priority reception task |
| Waiting for Lab > 5 days | auto-detect | Lab follow-up task |
| Overdue Treatment | auto-detect | High-priority CRM task |
| Patient Missed Visit | auto-detect | WhatsApp → Call → Escalation |

### 9.2 Patient Timeline
**File:** `app/services/timeline_helper.py`

Events logged automatically:
- Treatment Generated (from approved plan)
- Treatment Assigned to Dr. {name}
- Doctor Changed from Dr. {old} to Dr. {new}
- Visit {n} of {total} Completed
- Treatment Set to Waiting for Patient
- Treatment Set to Waiting for Lab
- Treatment Delayed: {reason}
- Treatment Completed
- CRM Task Created: {type}
- Next Appointment Booked: {date}
- Recall Created: {type}

---

## PHASE 10: Notifications

### 10.1 Notification Targets
**File:** Extend `app/services/treatment_notification.py`

| Recipient | Event | Notification |
|-----------|-------|-------------|
| Admin | Overdue treatment | "Treatment {name} is {n} days overdue" |
| Admin | Waiting for Lab > 5 days | "Lab delay for {patient}" |
| Admin | Pending assignment | "Treatment {name} needs doctor assignment" |
| Doctor | Today's queue | "You have {n} treatments today" |
| Doctor | Upcoming visits | "Visit scheduled for {patient} at {time}" |
| Reception | Follow-up due | "Patient {name} follow-up due" |
| Reception | Recall due | "Patient {name} recall due" |
| Reception | Lab pending | "Lab pending for {patient}" |

---

## PHASE 11: Audit Log

Every treatment action logs via `record_timeline_event()`:
- Created, Assigned, Doctor Changed, Status Changed
- Visit Added, Visit Completed
- Completed, Cancelled, Overdue Reported
- CRM Task Created, Recall Created
- Each log: User, Date, Time, Description

---

## PHASE 12: Responsive UI

- **Desktop (>1024px)**: Full table layout, multi-column dashboard, side-by-side detail
- **Tablet (768-1024px)**: Card-based list, 2-column dashboard, stacked detail
- **Mobile (<768px)**: Single-column cards, full-width detail, bottom action buttons, no horizontal scroll

---

## Implementation Order

### Phase 1 (Core — ~15 files) ✅ COMPLETE
1. TreatmentPlanItem model + migration
2. TreatmentPlanItem service
3. Treatment Generator service
4. Case service update (save TreatmentPlanItems)
5. TreatmentPlanItem API router
6. TreatmentPlanItem schemas
7. TreatmentPlan model updates (new statuses, columns)
8. TreatmentSitting model updates (new columns)
9. Treatment Plan/Sitting schema updates
10. Treatment Plan/Sitting service updates
11. Treatment Plan/Sitting router updates
12. Permissions update
13. Frontend types
14. Frontend API endpoints
15. Treatment Plan Approval page (frontend)
16. Treatment List page rewrite (frontend)
17. Treatment Detail page rewrite (frontend)
18. Case Report treatment summary (frontend)

### Phase 2 (Workflow — ~8 files) ✅ COMPLETE
19. Doctor Queue router + page
20. Dependencies logic in service
21. Waiting for Patient/Lab workflows
22. Appointment suggestion logic
23. Billing integration sync
24. CRM Rule Engine
25. CRM automation triggers
26. Overdue detection scheduler

### Phase 3 (Polish — ~5 files) ✅ COMPLETE
27. Admin Dashboard KPIs — treatment queue stats, overdue count, completion rates added to hospital-admin and group-admin dashboards
28. Notification service — `treatment_notification.py` created with admin, doctor, reception notifications for overdue, completed, assigned, lab delay, patient waiting events; wired into treatment_plans.py router and overdue_detection.py
29. Patient Timeline events — added record_timeline_event() calls to treatment_plan_items.py router (create, update, delete, approve)
30. Audit log completeness — verified all 3 services (TreatmentPlanService, TreatmentPlanItemService, TreatmentSittingService) have audit logs for all CRUD operations
31. Performance optimizations — doctor queue uses SQL-level CASE categorization instead of Python filtering; treatment_plan_repository eager loads assigned_doctor, assistant_doctor, treatment_type; treatment_plan_item_repository eager loads dependency_item
32. Responsive UI polish — verified all treatment pages (list, detail, queue, approval) have proper mobile/tablet/desktop layouts

---

## Files Summary

### Backend — New Files (5)
1. `app/models/treatment_plan_item.py`
2. `app/services/treatment_plan_item_service.py`
3. `app/services/treatment_generator.py`
4. `app/routers/treatment_plan_items.py`
5. `app/schemas/treatment_plan_item.py`

### Backend — New Files Phase 2 (4)
6. `app/routers/doctor_queue.py`
7. `app/services/crm_rule_engine.py`
8. `app/services/overdue_detection.py`
9. `app/services/treatment_notification.py`

### Backend — Modified Files (10)
10. `app/models/case.py` — treatment_plan_items relationship, approval fields
11. `app/models/treatment_plan.py` — new columns, new status enum
12. `app/models/treatment_sitting.py` — new columns
13. `app/services/case_service.py` — TreatmentPlanItem creation on save
14. `app/services/treatment_plan_service.py` — new methods
15. `app/services/treatment_sitting_service.py` — enhanced fields
16. `app/routers/treatment_plans.py` — new endpoints
17. `app/routers/treatment_sittings.py` — enhanced fields
18. `app/schemas/treatment_plan.py` — new response fields
19. `app/schemas/treatment_sitting.py` — new fields

### Backend — Modified Files Phase 2 (3)
20. `app/core/permissions.py` — new permissions
21. `app/utils/scheduler.py` — overdue detection
22. `app/services/treatment_enquiry_service.py` — CRM automation

### Frontend — New Files (2)
23. `frontend/src/pages/cases/treatment-plan.tsx`
24. `frontend/src/pages/treatments/doctor-queue.tsx`

### Frontend — Modified Files (5)
25. `frontend/src/types/index.ts`
26. `frontend/src/services/endpoints.ts`
27. `frontend/src/pages/treatments/list.tsx` — full rewrite
28. `frontend/src/pages/treatments/detail.tsx` — full rewrite
29. `frontend/src/pages/cases/detail.tsx` — live treatment summary

### Frontend — Modified Files Phase 2 (1)
30. `frontend/src/pages/dashboard/hospital-admin.tsx` — KPIs

**Total: ~30 files** (9 new backend, 4 new frontend, 17 modified)
