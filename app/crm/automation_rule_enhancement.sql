-- Enhanced Automation Rule tables migration
-- Idempotent — safe to run multiple times

-- Add new columns to automation_rules
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS group_id VARCHAR(36);
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS created_by VARCHAR(36);
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS modified_by VARCHAR(36);
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS is_system_rule BOOLEAN DEFAULT FALSE;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS allow_override BOOLEAN DEFAULT TRUE;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS condition_logic VARCHAR(10) DEFAULT 'AND';
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS escalation_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS escalation_days_1 INTEGER;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS escalation_role_1 VARCHAR(30);
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS escalation_days_2 INTEGER;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS escalation_role_2 VARCHAR(30);
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS escalation_days_3 INTEGER;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS escalation_role_3 VARCHAR(30);
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS business_hours_only BOOLEAN DEFAULT FALSE;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS weekend_handling VARCHAR(20) DEFAULT 'SKIP';
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC';
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS execution_count INTEGER DEFAULT 0;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS success_count INTEGER DEFAULT 0;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS last_executed_at TIMESTAMP WITH TIME ZONE;

-- automation_rule_conditions
CREATE TABLE IF NOT EXISTS automation_rule_conditions (
    id VARCHAR(36) PRIMARY KEY,
    rule_id VARCHAR(36) NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    operator VARCHAR(20) NOT NULL DEFAULT 'EQUALS',
    value TEXT,
    value_type VARCHAR(20) DEFAULT 'STRING',
    group_key VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_arc_rule_id ON automation_rule_conditions(rule_id);

-- automation_rule_actions
CREATE TABLE IF NOT EXISTS automation_rule_actions (
    id VARCHAR(36) PRIMARY KEY,
    rule_id VARCHAR(36) NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    action_config TEXT,
    delay_days INTEGER DEFAULT 0,
    delay_hours INTEGER DEFAULT 0,
    responsible_role VARCHAR(30),
    priority VARCHAR(10) DEFAULT 'MEDIUM',
    max_retries INTEGER DEFAULT 1,
    retry_delay_hours INTEGER DEFAULT 24,
    business_hours_only BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ara_rule_id ON automation_rule_actions(rule_id);

-- automation_rule_versions
CREATE TABLE IF NOT EXISTS automation_rule_versions (
    id VARCHAR(36) PRIMARY KEY,
    rule_id VARCHAR(36) NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    rule_snapshot TEXT NOT NULL,
    change_summary TEXT,
    created_by VARCHAR(36),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_arv_rule_id ON automation_rule_versions(rule_id);

-- automation_rule_logs
CREATE TABLE IF NOT EXISTS automation_rule_logs (
    id VARCHAR(36) PRIMARY KEY,
    rule_id VARCHAR(36) REFERENCES automation_rules(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(36),
    hospital_id VARCHAR(36),
    patient_id VARCHAR(36),
    triggered_by VARCHAR(36),
    action_type VARCHAR(50),
    action_result TEXT,
    execution_status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    execution_time_ms FLOAT,
    error_message TEXT,
    conditions_matched TEXT,
    is_test VARCHAR(1) DEFAULT 'N',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_arl_rule_id ON automation_rule_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_arl_hospital_id ON automation_rule_logs(hospital_id);
CREATE INDEX IF NOT EXISTS idx_arl_created_at ON automation_rule_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_arl_status ON automation_rule_logs(execution_status);

-- automation_execution_queue
CREATE TABLE IF NOT EXISTS automation_execution_queue (
    id VARCHAR(36) PRIMARY KEY,
    rule_id VARCHAR(36) REFERENCES automation_rules(id) ON DELETE SET NULL,
    action_id VARCHAR(36) REFERENCES automation_rule_actions(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(36),
    hospital_id VARCHAR(36),
    patient_id VARCHAR(36),
    action_type VARCHAR(50) NOT NULL,
    action_config TEXT,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    execute_after TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    priority VARCHAR(10) DEFAULT 'MEDIUM',
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    retry_delay_hours INTEGER DEFAULT 24,
    error_message TEXT,
    result TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_aeq_status ON automation_execution_queue(status);
CREATE INDEX IF NOT EXISTS idx_aeq_scheduled_at ON automation_execution_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_aeq_hospital_id ON automation_execution_queue(hospital_id);

-- completion notice
DO $$ BEGIN RAISE NOTICE 'Automation rule enhancement migration complete.'; END $$;
