"""sync_models_with_spec_v2

Revision ID: 5a4cc7c861eb
Revises: 8dd832621ad0
Create Date: 2026-06-14 06:57:12.174645

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '5a4cc7c861eb'
down_revision: Union[str, None] = '8dd832621ad0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


old_case_status = sa.Enum('NEW', 'DIAGNOSIS_PENDING', 'TREATMENT_PLANNED', 'IN_PROGRESS', 'FOLLOW_UP', 'COMPLETED', 'CANCELLED', name='casestatus')
new_case_status = sa.Enum('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED', name='casestatus')

old_payment_status = sa.Enum('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'REFUNDED', name='paymentstatus')
new_payment_status = sa.Enum('DRAFT', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED', name='paymentstatus')

old_appointment_type = sa.Enum('NEW', 'CONSULTATION', 'CHECKUP', 'SURGERY', 'FOLLOW_UP', 'TREATMENT', 'EMERGENCY', name='appointmenttype')
new_appointment_type = sa.Enum('CONSULTATION', 'FOLLOW_UP', 'TREATMENT', 'EMERGENCY', 'REVIEW', name='appointmenttype')


def upgrade() -> None:
    # Add new columns
    op.add_column('appointments', sa.Column('appointment_number', sa.String(length=20), nullable=True))
    op.create_unique_constraint(None, 'appointments', ['appointment_number'])
    op.add_column('cases', sa.Column('case_number', sa.String(length=20), nullable=True))
    op.create_unique_constraint(None, 'cases', ['case_number'])
    op.add_column('follow_up_responses', sa.Column('outcome', sa.String(length=30), nullable=True))
    op.add_column('patients', sa.Column('emergency_contact', sa.String(length=255), nullable=True))
    op.add_column('treatment_plans', sa.Column('treatment_number', sa.String(length=20), nullable=True))
    op.add_column('treatment_plans', sa.Column('total_sittings', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('treatment_plans', sa.Column('completed_sittings', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('treatment_plans', sa.Column('remaining_sittings', sa.Integer(), nullable=False, server_default='0'))
    op.create_unique_constraint(None, 'treatment_plans', ['treatment_number'])
    op.add_column('treatment_sittings', sa.Column('sitting_date', sa.Date(), nullable=True))
    op.add_column('treatment_sittings', sa.Column('doctor_id', sa.String(length=36), nullable=True))
    op.create_foreign_key(None, 'treatment_sittings', 'users', ['doctor_id'], ['id'])

    # --- Migrate CaseStatus enum ---
    op.execute("ALTER TYPE casestatus RENAME TO casestatus_old")
    new_case_status.create(op.get_bind())
    op.execute("ALTER TABLE cases ALTER COLUMN status TYPE casestatus USING "
               "CASE status::text "
               "  WHEN 'NEW' THEN 'OPEN'::casestatus "
               "  WHEN 'DIAGNOSIS_PENDING' THEN 'IN_PROGRESS'::casestatus "
               "  WHEN 'TREATMENT_PLANNED' THEN 'IN_PROGRESS'::casestatus "
               "  WHEN 'FOLLOW_UP' THEN 'ON_HOLD'::casestatus "
               "  ELSE status::text::casestatus "
               "END")
    op.execute("ALTER TABLE cases ALTER COLUMN status SET DEFAULT 'OPEN'::casestatus")
    op.execute("DROP TYPE casestatus_old")

    # --- Migrate PaymentStatus enum ---
    op.execute("ALTER TYPE paymentstatus RENAME TO paymentstatus_old")
    new_payment_status.create(op.get_bind())
    op.execute("ALTER TABLE billings ALTER COLUMN payment_status TYPE paymentstatus USING "
               "CASE payment_status::text "
               "  WHEN 'PENDING' THEN 'DRAFT'::paymentstatus "
               "  WHEN 'REFUNDED' THEN 'CANCELLED'::paymentstatus "
               "  ELSE payment_status::text::paymentstatus "
               "END")
    op.execute("ALTER TABLE billings ALTER COLUMN payment_status SET DEFAULT 'DRAFT'::paymentstatus")
    op.execute("DROP TYPE paymentstatus_old")

    # --- Migrate AppointmentType enum ---
    op.execute("ALTER TYPE appointmenttype RENAME TO appointmenttype_old")
    new_appointment_type.create(op.get_bind())
    op.execute("ALTER TABLE appointments ALTER COLUMN appointment_type TYPE appointmenttype USING "
               "CASE appointment_type::text "
               "  WHEN 'CHECKUP' THEN 'CONSULTATION'::appointmenttype "
               "  WHEN 'SURGERY' THEN 'TREATMENT'::appointmenttype "
               "  WHEN 'NEW' THEN 'CONSULTATION'::appointmenttype "
               "  ELSE appointment_type::text::appointmenttype "
               "END")
    op.execute("DROP TYPE appointmenttype_old")

    # --- FollowUpResponse: change status column to SAEnum ---
    op.execute("ALTER TABLE follow_up_responses ALTER COLUMN response_status TYPE varchar(30)")
    op.execute("DROP TYPE IF EXISTS followupresponsestatus")
    op.execute("CREATE TYPE followupresponsestatus AS ENUM ('POSITIVE', 'NEGATIVE', 'NEEDS_ATTENTION', 'COMPLAINT', 'EMERGENCY', 'NO_RESPONSE', 'NOT_INTERESTED')")
    op.execute("ALTER TABLE follow_up_responses ALTER COLUMN response_status TYPE followupresponsestatus USING response_status::text::followupresponsestatus")
    op.execute("ALTER TABLE follow_up_responses ALTER COLUMN response_status SET DEFAULT 'NO_RESPONSE'")

    # --- FollowUp: change status to varchar(20) (was already but ensure) ---
    op.execute("ALTER TABLE follow_ups ALTER COLUMN status TYPE varchar(20)")
    op.execute("UPDATE follow_ups SET status = 'OPEN' WHERE status = 'PENDING'")
    op.execute("UPDATE follow_ups SET status = 'CANCELLED' WHERE status NOT IN ('OPEN','SCHEDULED','COMPLETED','CANCELLED')")
    op.execute("DROP TYPE IF EXISTS followupstatus")

    # --- Set computed sittings for existing treatment plans ---
    op.execute("""
        UPDATE treatment_plans tp SET
            total_sittings = COALESCE(subq.cnt, 0),
            completed_sittings = COALESCE(subq.done, 0),
            remaining_sittings = COALESCE(subq.cnt, 0) - COALESCE(subq.done, 0)
        FROM (
            SELECT
                ts.treatment_plan_id,
                COUNT(*) AS cnt,
                COUNT(*) FILTER (WHERE ts.status = 'COMPLETED') AS done
            FROM treatment_sittings ts
            GROUP BY ts.treatment_plan_id
        ) subq
        WHERE tp.id = subq.treatment_plan_id
    """)


def downgrade() -> None:
    op.drop_column('treatment_sittings', 'doctor_id')
    op.drop_column('treatment_sittings', 'sitting_date')
    op.drop_column('treatment_plans', 'remaining_sittings')
    op.drop_column('treatment_plans', 'completed_sittings')
    op.drop_column('treatment_plans', 'total_sittings')
    op.drop_column('treatment_plans', 'treatment_number')
    op.drop_column('patients', 'emergency_contact')
    op.drop_column('follow_up_responses', 'outcome')
    op.drop_column('cases', 'case_number')
    op.drop_column('appointments', 'appointment_number')
