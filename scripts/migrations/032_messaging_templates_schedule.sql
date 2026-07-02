ALTER TABLE messaging_campaigns
    ADD COLUMN IF NOT EXISTS template_id BIGINT,
    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;

ALTER TABLE messaging_campaigns DROP CONSTRAINT IF EXISTS messaging_campaigns_status_check;

DO $$
DECLARE
    old_constraint TEXT;
BEGIN
    SELECT conname
    INTO old_constraint
    FROM pg_constraint
    WHERE conrelid = 'messaging_campaigns'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
      AND pg_get_constraintdef(oid) ILIKE '%draft%'
      AND pg_get_constraintdef(oid) ILIKE '%sending%'
    LIMIT 1;

    IF old_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE messaging_campaigns DROP CONSTRAINT %I', old_constraint);
    END IF;
END $$;

ALTER TABLE messaging_campaigns
    ADD CONSTRAINT messaging_campaigns_status_check
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'));

CREATE TABLE IF NOT EXISTS messaging_templates (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(180) NOT NULL,
    category VARCHAR(40) NOT NULL DEFAULT 'custom',
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    system_key VARCHAR(80),
    created_by VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (category IN ('marketing', 'clinical', 'operations', 'reports', 'custom')),
    UNIQUE (tenant_id, name)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'messaging_campaigns_template_id_fkey'
          AND conrelid = 'messaging_campaigns'::regclass
    ) THEN
        ALTER TABLE messaging_campaigns
            ADD CONSTRAINT messaging_campaigns_template_id_fkey
            FOREIGN KEY (template_id) REFERENCES messaging_templates(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messaging_campaigns_tenant_schedule
    ON messaging_campaigns(tenant_id, status, scheduled_at)
    WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_messaging_templates_tenant_category
    ON messaging_templates(tenant_id, category, active);

SELECT set_config('app.bypass_rls', 'true', false);

INSERT INTO messaging_templates (tenant_id, name, category, subject, body, system_key)
SELECT t.id, seed.name, seed.category, seed.subject, seed.body, seed.system_key
FROM tenants t
CROSS JOIN (
    VALUES
    (
        'Recordatorio de cita',
        'clinical',
        'Recordatorio de cita para {{nombre}}',
        'Hola {{nombre}}, te recordamos tu proxima cita en {{empresa}}. Si necesitas reprogramar, responde a este correo o comunicate con recepcion.',
        'appointment_reminder'
    ),
    (
        'Seguimiento postconsulta',
        'clinical',
        'Seguimiento de tu visita en {{empresa}}',
        'Hola {{nombre}}, queremos saber como sigue tu mascota despues de la consulta. Si notas cambios importantes, contactanos para orientarte.',
        'post_visit_follow_up'
    ),
    (
        'Campana preventiva mensual',
        'marketing',
        'Cuidados preventivos para tu mascota',
        'Hola {{nombre}}, en {{empresa}} recomendamos mantener al dia vacunas, desparasitaciones y controles preventivos. Agenda tu visita con nuestro equipo.',
        'monthly_preventive_campaign'
    ),
    (
        'Agenda de citas del dia',
        'operations',
        'Agenda veterinaria de {{empresa}}',
        'Equipo, este es el resumen operativo de citas programadas. Revisen confirmaciones, pacientes pendientes y seguimientos antes de iniciar la jornada.',
        'daily_agenda_summary'
    )
) AS seed(name, category, subject, body, system_key)
WHERE t.estado = 'activo'
ON CONFLICT (tenant_id, name) DO NOTHING;

ALTER TABLE messaging_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_messaging_templates ON messaging_templates;
CREATE POLICY tenant_isolation_messaging_templates ON messaging_templates
    USING (rls_bypass_active() OR tenant_id = current_tenant_id())
    WITH CHECK (rls_bypass_active() OR tenant_id = current_tenant_id());

SELECT set_config('app.bypass_rls', '', false);
