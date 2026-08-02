"""Add missing high-traffic indexes for enterprise hardening.

Revision ID: 3f9b7e2a5d1c
Revises: 95e2e0ceb598
Create Date: 2026-08-02

All indexes are created IF NOT EXISTS so the migration is idempotent. They
cover the FK columns and frequently-filtered columns surfaced by the Part 3F
performance audit (list/dashboard/scheduler/tenant-isolation hot paths).
"""

from alembic import op

revision = "3f9b7e2a5d1c"
down_revision = "95e2e0ceb598"
branch_labels = None
depends_on = None


INDEXES = [
    # appointments
    "CREATE INDEX IF NOT EXISTS ix_appointments_patient_id ON appointments (patient_id)",
    "CREATE INDEX IF NOT EXISTS ix_appointments_doctor_id ON appointments (doctor_id)",
    "CREATE INDEX IF NOT EXISTS ix_appointments_appointment_date ON appointments (appointment_date)",
    "CREATE INDEX IF NOT EXISTS ix_appointments_status ON appointments (status)",
    # cases
    "CREATE INDEX IF NOT EXISTS ix_cases_patient_id ON cases (patient_id)",
    "CREATE INDEX IF NOT EXISTS ix_cases_doctor_id ON cases (doctor_id)",
    "CREATE INDEX IF NOT EXISTS ix_cases_status ON cases (status)",
    # patients
    "CREATE INDEX IF NOT EXISTS ix_patients_hospital_id ON patients (hospital_id)",
    "CREATE INDEX IF NOT EXISTS ix_patients_phone ON patients (phone)",
    # treatment plans & sittings
    "CREATE INDEX IF NOT EXISTS ix_treatment_plans_case_id ON treatment_plans (case_id)",
    "CREATE INDEX IF NOT EXISTS ix_treatment_plans_status ON treatment_plans (status)",
    "CREATE INDEX IF NOT EXISTS ix_treatment_sittings_treatment_plan_id ON treatment_sittings (treatment_plan_id)",
    # follow-ups / leads
    "CREATE INDEX IF NOT EXISTS ix_follow_ups_patient_id ON follow_ups (patient_id)",
    "CREATE INDEX IF NOT EXISTS ix_follow_ups_hospital_id ON follow_ups (hospital_id)",
    "CREATE INDEX IF NOT EXISTS ix_follow_ups_status ON follow_ups (status)",
    "CREATE INDEX IF NOT EXISTS ix_leads_hospital_id ON leads (hospital_id)",
    "CREATE INDEX IF NOT EXISTS ix_leads_status ON leads (status)",
    # billings
    "CREATE INDEX IF NOT EXISTS ix_billings_treatment_plan_id ON billings (treatment_plan_id)",
    # notifications
    "CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications (user_id)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_is_read ON notifications (is_read)",
    # pre/post op & findings
    "CREATE INDEX IF NOT EXISTS ix_pre_ops_case_id ON pre_ops (case_id)",
    "CREATE INDEX IF NOT EXISTS ix_post_ops_case_id ON post_ops (case_id)",
    "CREATE INDEX IF NOT EXISTS ix_clinical_findings_case_id ON clinical_findings (case_id)",
    "CREATE INDEX IF NOT EXISTS ix_clinical_findings_doctor_id ON clinical_findings (doctor_id)",
]


def upgrade():
    for stmt in INDEXES:
        op.execute(stmt)


def downgrade():
    names = [
        "ix_appointments_patient_id",
        "ix_appointments_doctor_id",
        "ix_appointments_appointment_date",
        "ix_appointments_status",
        "ix_cases_patient_id",
        "ix_cases_doctor_id",
        "ix_cases_status",
        "ix_patients_hospital_id",
        "ix_patients_phone",
        "ix_treatment_plans_case_id",
        "ix_treatment_plans_status",
        "ix_treatment_sittings_treatment_plan_id",
        "ix_follow_ups_patient_id",
        "ix_follow_ups_hospital_id",
        "ix_follow_ups_status",
        "ix_leads_hospital_id",
        "ix_leads_status",
        "ix_billings_treatment_plan_id",
        "ix_notifications_user_id",
        "ix_notifications_is_read",
        "ix_pre_ops_case_id",
        "ix_post_ops_case_id",
        "ix_clinical_findings_case_id",
        "ix_clinical_findings_doctor_id",
    ]
    for name in names:
        op.execute(f"DROP INDEX IF EXISTS {name}")
