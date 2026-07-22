-- ============================================================================
-- PHASE 3.2: Treatment-Driven CRM Automation
-- Migration: Extend treatment_follow_up_rules + Create generated_enquiries
-- ============================================================================

-- 1. Extend treatment_follow_up_rules with Phase 3.2 columns
-- Visit-Aware Rules
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS visit_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS visit_trigger VARCHAR(20) NOT NULL DEFAULT 'EVERY';
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS visit_specific_number INTEGER;
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS visit_delay_days INTEGER NOT NULL DEFAULT 2;
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS visit_enquiry_type VARCHAR(50) NOT NULL DEFAULT 'WELLNESS';
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS visit_whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS visit_whatsapp_template_id VARCHAR(36);
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS visit_notes TEXT;

-- Appointment Reminder Rules
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS reminder_days_before VARCHAR(50) NOT NULL DEFAULT '1';
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS reminder_whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS reminder_whatsapp_template_id VARCHAR(36);
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS reminder_notes TEXT;

-- Post-Treatment Completion Rules
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS completion_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS completion_delay_days INTEGER NOT NULL DEFAULT 3;
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS completion_enquiry_type VARCHAR(50) NOT NULL DEFAULT 'TREATMENT_COMPLETION';
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS completion_whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS completion_whatsapp_template_id VARCHAR(36);
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS completion_notes TEXT;

-- Recall Rules
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS recall_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS recall_days INTEGER NOT NULL DEFAULT 90;
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS recall_enquiry_type VARCHAR(50) NOT NULL DEFAULT 'RECALL_REMINDER';
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS recall_whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS recall_whatsapp_template_id VARCHAR(36);
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS recall_notes TEXT;

-- Missed Appointment Rules
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS missed_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS missed_delay_days INTEGER NOT NULL DEFAULT 1;
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS missed_whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS missed_whatsapp_template_id VARCHAR(36);
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS missed_notes TEXT;

-- Auto-Assignment + Priority
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS auto_assign_role VARCHAR(30) NOT NULL DEFAULT 'ASSIGNED_DOCTOR';
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'MEDIUM';

-- Template Overrides
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS whatsapp_template_id VARCHAR(36);
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS email_template_id VARCHAR(36);
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS sms_template_id VARCHAR(36);

-- Audit timestamps
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE treatment_follow_up_rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Create generated_enquiries table
CREATE TABLE IF NOT EXISTS generated_enquiries (
    id VARCHAR(36) PRIMARY KEY,
    hospital_id VARCHAR(36) NOT NULL REFERENCES hospitals(id),
    patient_id VARCHAR(36) NOT NULL REFERENCES patients(id),
    treatment_plan_id VARCHAR(36) REFERENCES treatment_plans(id),
    treatment_type_id VARCHAR(36) REFERENCES treatment_types(id),
    appointment_id VARCHAR(36) REFERENCES appointments(id),
    doctor_id VARCHAR(36) REFERENCES users(id),
    assigned_staff_id VARCHAR(36) REFERENCES users(id),
    rule_id VARCHAR(36) REFERENCES treatment_follow_up_rules(id),
    trigger_event VARCHAR(50) NOT NULL,
    treatment_name VARCHAR(255),
    visit_number INTEGER,
    total_visits INTEGER,
    visit_stage VARCHAR(20),
    enquiry_type VARCHAR(50) NOT NULL,
    notes TEXT,
    due_date DATE NOT NULL,
    priority VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
    follow_up_id VARCHAR(36) REFERENCES follow_ups(id),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ge_hospital ON generated_enquiries(hospital_id);
CREATE INDEX IF NOT EXISTS idx_ge_patient ON generated_enquiries(patient_id);
CREATE INDEX IF NOT EXISTS idx_ge_due_date ON generated_enquiries(due_date);
CREATE INDEX IF NOT EXISTS idx_ge_status ON generated_enquiries(status);
CREATE INDEX IF NOT EXISTS idx_ge_trigger ON generated_enquiries(trigger_event);
CREATE INDEX IF NOT EXISTS idx_ge_rule ON generated_enquiries(rule_id);
CREATE INDEX IF NOT EXISTS idx_ge_treatment_plan ON generated_enquiries(treatment_plan_id);
