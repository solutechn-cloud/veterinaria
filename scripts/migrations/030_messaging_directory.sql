ALTER TABLE automation_recipients
    ADD COLUMN IF NOT EXISTS cargo VARCHAR(120),
    ADD COLUMN IF NOT EXISTS telefono VARCHAR(40),
    ADD COLUMN IF NOT EXISTS descripcion TEXT,
    ADD COLUMN IF NOT EXISTS notas TEXT;

CREATE INDEX IF NOT EXISTS idx_automation_recipients_tenant_active
    ON automation_recipients(tenant_id, activo, tipo);
