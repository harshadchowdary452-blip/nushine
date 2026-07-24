-- Phase 3.3: Add scope column to crm_rules and case_id to generated_enquiries
-- scope: LEAD | VISIT | APPOINTMENT | CASE

ALTER TABLE crm_rules ADD COLUMN IF NOT EXISTS scope VARCHAR(20) DEFAULT 'VISIT';
ALTER TABLE generated_enquiries ADD COLUMN IF NOT EXISTS case_id VARCHAR(36) NULL;

CREATE INDEX IF NOT EXISTS idx_crm_rules_scope ON crm_rules(scope);
CREATE INDEX IF NOT EXISTS idx_generated_enquiries_case_id ON generated_enquiries(case_id);

-- Backfill scope for existing rules
UPDATE crm_rules SET scope = 'LEAD' WHERE rule_type = 'LEAD' AND (scope IS NULL OR scope = 'VISIT');
UPDATE crm_rules SET scope = 'VISIT' WHERE rule_type = 'TREATMENT' AND trigger_event = 'VISIT_COMPLETED';
UPDATE crm_rules SET scope = 'APPOINTMENT' WHERE rule_type = 'TREATMENT' AND trigger_event = 'APPOINTMENT_CREATED';
UPDATE crm_rules SET scope = 'CASE' WHERE rule_type = 'TREATMENT' AND trigger_event IN ('TREATMENT_COMPLETED', 'TREATMENT_COMPLETED_RECALL');
