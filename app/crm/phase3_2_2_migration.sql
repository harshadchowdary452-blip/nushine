-- Phase 3.2.2: Create crm_rules table (single source of truth for automation rules)
-- This replaces JSON rules stored in crm_configs

CREATE TABLE IF NOT EXISTS crm_rules (
    id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    hospital_id VARCHAR(36) NOT NULL REFERENCES hospitals(id),
    rule_name VARCHAR(255) NOT NULL,
    rule_type VARCHAR(20) NOT NULL DEFAULT 'TREATMENT',
    description TEXT,
    trigger_event VARCHAR(50) NOT NULL,
    treatment_type_id VARCHAR(36) REFERENCES treatment_types(id),
    visit_stage VARCHAR(20),
    delay_value INTEGER NOT NULL DEFAULT 0,
    delay_unit VARCHAR(10) NOT NULL DEFAULT 'DAYS',
    action VARCHAR(50) NOT NULL DEFAULT 'GENERAL_FOLLOW_UP',
    assign_to VARCHAR(30) NOT NULL DEFAULT 'RECEPTION',
    send_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
    send_notification BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR(36),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_rules_hospital ON crm_rules(hospital_id);
CREATE INDEX IF NOT EXISTS idx_crm_rules_trigger ON crm_rules(trigger_event);
CREATE INDEX IF NOT EXISTS idx_crm_rules_active ON crm_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_crm_rules_treatment_type ON crm_rules(treatment_type_id);

-- Migrate existing JSON rules from crm_configs to crm_rules
-- Lead rules (stored as JSON array in crm_configs.config_value where config_key='lead_rules')
DO $$
DECLARE
    rec RECORD;
    rule JSONB;
    r JSONB;
    lead_triggers JSONB := '{"NEW_ENQUIRY":"PATIENT_REGISTERED","NO_ACTIVITY":"PATIENT_INACTIVE","MISSED_APPOINTMENT":"APPOINTMENT_MISSED","MANUAL":"MANUAL"}'::jsonb;
    treatment_triggers JSONB := '{"VISIT_COMPLETED":"VISIT_COMPLETED","TREATMENT_COMPLETED":"TREATMENT_COMPLETED","APPOINTMENT_MISSED":"APPOINTMENT_MISSED","APPOINTMENT_SCHEDULED":"APPOINTMENT_CREATED","MANUAL":"MANUAL"}'::jsonb;
    action_map JSONB := '{"FOLLOW_UP_ENQUIRY":"GENERAL_FOLLOW_UP","CREATE_REMINDER":"APPOINTMENT_REMINDER","NOTIFY_STAFF":"GENERAL_FOLLOW_UP","WELLNESS_ENQUIRY":"WELLNESS_ENQUIRY","PAIN_ASSESSMENT":"PAIN_ASSESSMENT","MEDICATION_REMINDER":"MEDICATION_REMINDER","RECOVERY_FOLLOW_UP":"RECOVERY_FOLLOW_UP","RECALL":"RECALL_REMINDER","GENERAL_FOLLOW_UP":"GENERAL_FOLLOW_UP"}'::jsonb;
    wait_days JSONB := '{"IMMEDIATELY":0,"1_DAY":1,"2_DAYS":2,"3_DAYS":3,"7_DAYS":7,"15_DAYS":15,"30_DAYS":30,"180_DAYS":180,"CUSTOM":0}'::jsonb;
BEGIN
    FOR rec IN SELECT hospital_id, config_value FROM crm_configs WHERE config_key = 'lead_rules' AND config_value IS NOT NULL
    LOOP
        FOR r IN SELECT jsonb_array_elements(rec.config_value::jsonb)
        LOOP
            INSERT INTO crm_rules (hospital_id, rule_name, rule_type, trigger_event, delay_value, delay_unit, action, assign_to, send_whatsapp, send_notification, is_active, created_at)
            VALUES (
                rec.hospital_id,
                COALESCE(r->>'name', 'Migrated Rule'),
                'LEAD',
                COALESCE(lead_triggers->>(r->>'trigger'), r->>'trigger', 'PATIENT_REGISTERED'),
                COALESCE((wait_days->>(r->>'wait_time'))::int, 0),
                CASE WHEN COALESCE((wait_days->>(r->>'wait_time'))::int, 0) = 0 THEN 'IMMEDIATELY' ELSE 'DAYS' END,
                COALESCE(action_map->>(r->>'action'), 'GENERAL_FOLLOW_UP'),
                COALESCE(r->>'assign_to', 'RECEPTION'),
                COALESCE((r->>'send_whatsapp')::boolean, FALSE),
                COALESCE((r->>'send_notification')::boolean, FALSE),
                COALESCE((r->>'is_active')::boolean, TRUE),
                NOW()
            );
        END LOOP;
    END LOOP;

    FOR rec IN SELECT hospital_id, config_value FROM crm_configs WHERE config_key = 'treatment_rules' AND config_value IS NOT NULL
    LOOP
        FOR r IN SELECT jsonb_array_elements(rec.config_value::jsonb)
        LOOP
            INSERT INTO crm_rules (hospital_id, rule_name, rule_type, trigger_event, treatment_type_id, visit_stage, delay_value, delay_unit, action, assign_to, send_whatsapp, send_notification, is_active, created_at)
            VALUES (
                rec.hospital_id,
                COALESCE(r->>'name', 'Migrated Rule'),
                'TREATMENT',
                COALESCE(treatment_triggers->>(r->>'trigger'), r->>'trigger', 'VISIT_COMPLETED'),
                r->>'treatment_type_id',
                r->>'visit',
                COALESCE((wait_days->>(r->>'wait_time'))::int, 0),
                CASE WHEN COALESCE((wait_days->>(r->>'wait_time'))::int, 0) = 0 THEN 'IMMEDIATELY' ELSE 'DAYS' END,
                COALESCE(action_map->>(r->>'action'), 'GENERAL_FOLLOW_UP'),
                COALESCE(r->>'assign_to', 'RECEPTION'),
                COALESCE((r->>'send_whatsapp')::boolean, FALSE),
                COALESCE((r->>'send_notification')::boolean, FALSE),
                COALESCE((r->>'is_active')::boolean, TRUE),
                NOW()
            );
        END LOOP;
    END LOOP;
END $$;
