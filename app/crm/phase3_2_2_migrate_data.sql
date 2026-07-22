DO $$
DECLARE
    rec RECORD;
    r JSONB;
    lead_triggers JSONB := '{"NEW_ENQUIRY":"PATIENT_REGISTERED","NO_ACTIVITY":"PATIENT_INACTIVE","MISSED_APPOINTMENT":"APPOINTMENT_MISSED","MANUAL":"MANUAL"}'::jsonb;
    treatment_triggers JSONB := '{"VISIT_COMPLETED":"VISIT_COMPLETED","TREATMENT_COMPLETED":"TREATMENT_COMPLETED","APPOINTMENT_MISSED":"APPOINTMENT_MISSED","APPOINTMENT_SCHEDULED":"APPOINTMENT_CREATED","MANUAL":"MANUAL"}'::jsonb;
    action_map JSONB := '{"FOLLOW_UP_ENQUIRY":"GENERAL_FOLLOW_UP","CREATE_REMINDER":"APPOINTMENT_REMINDER","NOTIFY_STAFF":"GENERAL_FOLLOW_UP","WELLNESS_ENQUIRY":"WELLNESS_ENQUIRY","PAIN_ASSESSMENT":"PAIN_ASSESSMENT","MEDICATION_REMINDER":"MEDICATION_REMINDER","RECOVERY_FOLLOW_UP":"RECOVERY_FOLLOW_UP","RECALL":"RECALL_REMINDER","GENERAL_FOLLOW_UP":"GENERAL_FOLLOW_UP"}'::jsonb;
    wait_days JSONB := '{"IMMEDIATELY":0,"1_DAY":1,"2_DAYS":2,"3_DAYS":3,"7_DAYS":7,"15_DAYS":15,"30_DAYS":30,"180_DAYS":180,"CUSTOM":0}'::jsonb;
BEGIN
    FOR rec IN SELECT hospital_id, config_value FROM crm_configs WHERE config_key = 'lead_rules' AND config_value IS NOT NULL AND hospital_id != ''
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

    FOR rec IN SELECT hospital_id, config_value FROM crm_configs WHERE config_key = 'treatment_rules' AND config_value IS NOT NULL AND hospital_id != ''
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
                CASE WHEN r->>'visit' IS NOT NULL THEN r->>'visit' ELSE 'ANY' END,
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
