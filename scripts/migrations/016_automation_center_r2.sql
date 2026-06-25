CREATE TABLE IF NOT EXISTS automation_recipients (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(180) NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'persona',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT automation_recipients_tipo_chk CHECK (tipo IN ('persona', 'grupo')),
    CONSTRAINT automation_recipients_email_unique UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS automation_recipient_events (
    id SERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES automation_recipients(id) ON DELETE CASCADE,
    event_key VARCHAR(80) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    scheduled_time TIME,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT automation_recipient_events_unique UNIQUE (tenant_id, recipient_id, event_key)
);

CREATE TABLE IF NOT EXISTS automation_schedules (
    id SERIAL PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    event_key VARCHAR(80) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    frecuencia VARCHAR(20) NOT NULL DEFAULT 'daily',
    hora TIME NOT NULL DEFAULT '06:00',
    fecha_programada TIMESTAMPTZ,
    timezone VARCHAR(80) NOT NULL DEFAULT 'America/Tegucigalpa',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT automation_schedules_freq_chk CHECK (frecuencia IN ('manual', 'once', 'daily', 'weekly', 'monthly'))
);

CREATE TABLE IF NOT EXISTS automation_email_templates (
    id SERIAL PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    event_key VARCHAR(80) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    subject TEXT NOT NULL,
    html TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backup_jobs (
    id SERIAL PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    scope VARCHAR(20) NOT NULL DEFAULT 'all_tenants',
    provider VARCHAR(30) NOT NULL DEFAULT 'cloudflare_r2',
    estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    object_key TEXT,
    size_bytes BIGINT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT backup_jobs_scope_chk CHECK (scope IN ('tenant', 'all_tenants')),
    CONSTRAINT backup_jobs_estado_chk CHECK (estado IN ('Pendiente', 'Ejecutando', 'Completado', 'Error'))
);

ALTER TABLE configuracion
    ADD COLUMN IF NOT EXISTS automation_sender_name VARCHAR(120),
    ADD COLUMN IF NOT EXISTS backup_r2_prefix VARCHAR(255) DEFAULT 'backups',
    ADD COLUMN IF NOT EXISTS backup_retention_days INTEGER DEFAULT 30,
    ADD COLUMN IF NOT EXISTS backup_enabled BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS backup_time TIME DEFAULT '02:30';

CREATE INDEX IF NOT EXISTS idx_automation_recipients_tenant ON automation_recipients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_automation_events_tenant_event ON automation_recipient_events(tenant_id, event_key);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_created_at ON backup_jobs(created_at DESC);
