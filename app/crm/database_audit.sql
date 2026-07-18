-- CRM Database Audit & Migration Script
-- Idempotent — safe to run multiple times
-- Generated: 2025-01-XX

-- ============================================================
-- 1. INDEXES on foreign key columns
-- ============================================================

-- follow_ups
CREATE INDEX IF NOT EXISTS idx_follow_ups_patient_id ON follow_ups(patient_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_hospital_id ON follow_ups(hospital_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_doctor_id ON follow_ups(doctor_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_case_id ON follow_ups(case_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);
CREATE INDEX IF NOT EXISTS idx_follow_ups_follow_up_date ON follow_ups(follow_up_date);
CREATE INDEX IF NOT EXISTS idx_follow_ups_rule_id ON follow_ups(rule_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_template_id ON follow_ups(template_id);

-- communication_logs
CREATE INDEX IF NOT EXISTS idx_comm_logs_patient_id ON communication_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_comm_logs_hospital_id ON communication_logs(hospital_id);
CREATE INDEX IF NOT EXISTS idx_comm_logs_lead_id ON communication_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_comm_logs_channel ON communication_logs(channel);
CREATE INDEX IF NOT EXISTS idx_comm_logs_created_at ON communication_logs(created_at);

-- campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_hospital_id ON campaigns(hospital_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- campaign_recipients
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_patient_id ON campaign_recipients(patient_id);

-- leads
CREATE INDEX IF NOT EXISTS idx_leads_hospital_id ON leads(hospital_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_doctor_id ON leads(doctor_id);

-- lead_communications
CREATE INDEX IF NOT EXISTS idx_lead_communications_lead_id ON lead_communications(lead_id);

-- lead_calls
CREATE INDEX IF NOT EXISTS idx_lead_calls_lead_id ON lead_calls(lead_id);

-- enquiries
CREATE INDEX IF NOT EXISTS idx_enquiries_hospital_id ON enquiries(hospital_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_patient_id ON enquiries(patient_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);

-- enquiry_follow_ups
CREATE INDEX IF NOT EXISTS idx_enquiry_follow_ups_enquiry_id ON enquiry_follow_ups(enquiry_id);

-- follow_up_templates
CREATE INDEX IF NOT EXISTS idx_fu_templates_hospital_id ON follow_up_templates(hospital_id);
CREATE INDEX IF NOT EXISTS idx_fu_templates_procedure ON follow_up_templates(procedure);
CREATE INDEX IF NOT EXISTS idx_fu_templates_trigger_event ON follow_up_templates(trigger_event);

-- automation_rules
CREATE INDEX IF NOT EXISTS idx_auto_rules_hospital_id ON automation_rules(hospital_id);
CREATE INDEX IF NOT EXISTS idx_auto_rules_trigger_event ON automation_rules(trigger_event);
CREATE INDEX IF NOT EXISTS idx_auto_rules_procedure ON automation_rules(procedure);
CREATE INDEX IF NOT EXISTS idx_auto_rules_active ON automation_rules(is_active);

-- treatment_follow_up_rules
CREATE INDEX IF NOT EXISTS idx_tfur_hospital_id ON treatment_follow_up_rules(hospital_id);
CREATE INDEX IF NOT EXISTS idx_tfur_treatment_type_id ON treatment_follow_up_rules(treatment_type_id);

-- patient_feedback
CREATE INDEX IF NOT EXISTS idx_feedback_patient_id ON patient_feedback(patient_id);
CREATE INDEX IF NOT EXISTS idx_feedback_hospital_id ON patient_feedback(hospital_id);
CREATE INDEX IF NOT EXISTS idx_feedback_doctor_id ON patient_feedback(doctor_id);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- whatsapp_templates
CREATE INDEX IF NOT EXISTS idx_wa_templates_hospital_id ON whatsapp_templates(hospital_id);

-- email_templates
CREATE INDEX IF NOT EXISTS idx_email_templates_hospital_id ON email_templates(hospital_id);

-- ============================================================
-- 2. MISSING FOREIGN KEY CONSTRAINTS (safe additions only)
-- ============================================================

-- follow_ups → patients (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_follow_ups_patient'
    ) THEN
        ALTER TABLE follow_ups
            ADD CONSTRAINT fk_follow_ups_patient
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
    END IF;
END $$;

-- follow_ups → automation_rules (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_follow_ups_rule'
    ) THEN
        ALTER TABLE follow_ups
            ADD CONSTRAINT fk_follow_ups_rule
            FOREIGN KEY (rule_id) REFERENCES automation_rules(id) ON DELETE SET NULL;
    END IF;
END $$;

-- follow_ups → follow_up_templates (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_follow_ups_template'
    ) THEN
        ALTER TABLE follow_ups
            ADD CONSTRAINT fk_follow_ups_template
            FOREIGN KEY (template_id) REFERENCES follow_up_templates(id) ON DELETE SET NULL;
    END IF;
END $$;

-- follow_up_templates → hospitals (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_fu_templates_hospital'
    ) THEN
        ALTER TABLE follow_up_templates
            ADD CONSTRAINT fk_fu_templates_hospital
            FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE;
    END IF;
END $$;

-- automation_rules → hospitals (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_auto_rules_hospital'
    ) THEN
        ALTER TABLE automation_rules
            ADD CONSTRAINT fk_auto_rules_hospital
            FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE;
    END IF;
END $$;

-- automation_rules → follow_up_templates (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_auto_rules_template'
    ) THEN
        ALTER TABLE automation_rules
            ADD CONSTRAINT fk_auto_rules_template
            FOREIGN KEY (template_id) REFERENCES follow_up_templates(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================================
-- 3. AUDIT COLUMNS (ensure updated_at exists)
-- ============================================================

-- follow_ups
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_name='follow_ups' AND column_name='updated_at'
    ) THEN
        ALTER TABLE follow_ups ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- follow_up_templates
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_name='follow_up_templates' AND column_name='updated_at'
    ) THEN
        ALTER TABLE follow_up_templates ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- automation_rules
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_name='automation_rules' AND column_name='updated_at'
    ) THEN
        ALTER TABLE automation_rules ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- ============================================================
-- 4. SOFT DELETE (ensure is_active exists)
-- ============================================================

-- campaigns
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='is_active'
    ) THEN
        ALTER TABLE campaigns ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;
END $$;

-- ============================================================
-- 5. COMPLETION LOG
-- ============================================================

DO $$ BEGIN RAISE NOTICE 'CRM database audit complete — indexes, FKs, and audit columns verified.'; END $$;
