-- Event Log table migration
-- Idempotent — safe to run multiple times

CREATE TABLE IF NOT EXISTS event_log (
    id VARCHAR(36) PRIMARY KEY,
    event_id VARCHAR(36) UNIQUE NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    source_module VARCHAR(30) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(36) NOT NULL,
    hospital_id VARCHAR(36),
    group_id VARCHAR(36),
    patient_id VARCHAR(36),
    doctor_id VARCHAR(36),
    triggered_by VARCHAR(36),
    correlation_id VARCHAR(36),
    payload_json TEXT,
    metadata_json TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    processing_time_ms FLOAT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_log_event_id ON event_log(event_id);
CREATE INDEX IF NOT EXISTS idx_event_log_event_type ON event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_source_module ON event_log(source_module);
CREATE INDEX IF NOT EXISTS idx_event_log_entity_id ON event_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_event_log_hospital_id ON event_log(hospital_id);
CREATE INDEX IF NOT EXISTS idx_event_log_patient_id ON event_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_event_log_correlation_id ON event_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_event_log_status ON event_log(status);
CREATE INDEX IF NOT EXISTS idx_event_log_created_at ON event_log(created_at);

-- Completion notice
DO $$ BEGIN RAISE NOTICE 'event_log table created with indexes.'; END $$;
