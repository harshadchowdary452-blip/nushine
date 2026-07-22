-- ============================================================================
-- PHASE 3.2.1: Master Data Architecture
-- Migration: Create master data tables + CRM config
-- ============================================================================

-- 1. Lead Source Masters
CREATE TABLE IF NOT EXISTS lead_source_masters (
    id VARCHAR(36) PRIMARY KEY,
    hospital_id VARCHAR(36) REFERENCES hospitals(id),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    color VARCHAR(20),
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lsm_hospital ON lead_source_masters(hospital_id);
CREATE INDEX IF NOT EXISTS idx_lsm_active ON lead_source_masters(is_active);

-- 2. Enquiry Type Masters
CREATE TABLE IF NOT EXISTS enquiry_type_masters (
    id VARCHAR(36) PRIMARY KEY,
    hospital_id VARCHAR(36) REFERENCES hospitals(id),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    color VARCHAR(20),
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_etm_hospital ON enquiry_type_masters(hospital_id);
CREATE INDEX IF NOT EXISTS idx_etm_active ON enquiry_type_masters(is_active);

-- 3. Communication Template Masters
CREATE TABLE IF NOT EXISTS communication_template_masters (
    id VARCHAR(36) PRIMARY KEY,
    hospital_id VARCHAR(36) REFERENCES hospitals(id),
    name VARCHAR(255) NOT NULL,
    channel VARCHAR(30) NOT NULL DEFAULT 'WHATSAPP',
    subject VARCHAR(255),
    message TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ctm_hospital ON communication_template_masters(hospital_id);
CREATE INDEX IF NOT EXISTS idx_ctm_channel ON communication_template_masters(channel);

-- 4. CRM Config (key-value store for CRM settings)
CREATE TABLE IF NOT EXISTS crm_configs (
    id VARCHAR(36) PRIMARY KEY,
    hospital_id VARCHAR(36) REFERENCES hospitals(id),
    config_key VARCHAR(100) NOT NULL,
    config_value TEXT,
    config_group VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crmcfg_hospital ON crm_configs(hospital_id);
CREATE INDEX IF NOT EXISTS idx_crmcfg_group ON crm_configs(config_group);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crmcfg_key_hospital ON crm_configs(hospital_id, config_key) WHERE hospital_id IS NOT NULL;
