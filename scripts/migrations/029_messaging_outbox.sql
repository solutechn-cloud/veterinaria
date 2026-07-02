-- 029: Email messaging outbox, delivery events, permissions and plan feature.

CREATE TABLE IF NOT EXISTS messaging_messages (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL DEFAULT 'email',
    source VARCHAR(80),
    event_key VARCHAR(80),
    template_key VARCHAR(80),
    from_email VARCHAR(255),
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(180),
    subject TEXT NOT NULL,
    html_body TEXT,
    text_body TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'queued',
    provider VARCHAR(30) NOT NULL DEFAULT 'resend',
    provider_message_id VARCHAR(255),
    related_table VARCHAR(80),
    related_id VARCHAR(120),
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (channel IN ('email')),
    CHECK (status IN ('queued','sending','sent','delivered','opened','clicked','bounced','complained','failed','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_messaging_messages_tenant_created
    ON messaging_messages (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messaging_messages_tenant_status
    ON messaging_messages (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messaging_messages_tenant_event
    ON messaging_messages (tenant_id, event_key, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_messaging_messages_provider_id
    ON messaging_messages (provider, provider_message_id)
    WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS messaging_events (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    message_id BIGINT REFERENCES messaging_messages(id) ON DELETE CASCADE,
    provider VARCHAR(30) NOT NULL DEFAULT 'resend',
    provider_event_id VARCHAR(255),
    event_type VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messaging_events_tenant_message
    ON messaging_events (tenant_id, message_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_messaging_events_tenant_type
    ON messaging_events (tenant_id, event_type, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_messaging_events_provider_event
    ON messaging_events (provider, provider_event_id)
    WHERE provider_event_id IS NOT NULL;

ALTER TABLE messaging_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE messaging_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_messaging_messages ON messaging_messages;
CREATE POLICY tenant_isolation_messaging_messages ON messaging_messages
    USING (rls_bypass_active() OR tenant_id = current_tenant_id())
    WITH CHECK (rls_bypass_active() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_messaging_events ON messaging_events;
CREATE POLICY tenant_isolation_messaging_events ON messaging_events
    USING (rls_bypass_active() OR tenant_id = current_tenant_id())
    WITH CHECK (rls_bypass_active() OR tenant_id = current_tenant_id());

INSERT INTO permisos (idPermiso, nombre, modulo) VALUES
    ('VER_MENSAJERIA', 'Ver Mensajeria por Correo', 'Administracion'),
    ('GESTIONAR_MENSAJERIA', 'Gestionar Mensajeria por Correo', 'Administracion')
ON CONFLICT (idPermiso) DO UPDATE
SET nombre = EXCLUDED.nombre,
    modulo = EXCLUDED.modulo;

INSERT INTO rol_permisos (idRol, idPermiso)
SELECT r.idrol, p.idPermiso
FROM roles r
CROSS JOIN permisos p
WHERE LOWER(r.nombre) IN ('administrador', 'admin', 'superadmin')
  AND p.idPermiso IN ('VER_MENSAJERIA', 'GESTIONAR_MENSAJERIA')
ON CONFLICT DO NOTHING;

INSERT INTO rol_permisos (idRol, idPermiso)
SELECT DISTINCT rp.idRol, v.new_perm
FROM rol_permisos rp
JOIN (VALUES
    ('CONFIGURAR_EMPRESA', 'VER_MENSAJERIA'),
    ('CONFIGURAR_EMPRESA', 'GESTIONAR_MENSAJERIA')
) AS v(old_perm, new_perm) ON rp.idPermiso = v.old_perm
ON CONFLICT DO NOTHING;

INSERT INTO plan_features (plan, feature_key, descripcion) VALUES
    ('basico', 'modulo_mensajeria', 'Bitacora y reenvio de correos transaccionales'),
    ('profesional', 'modulo_mensajeria', 'Bitacora y reenvio de correos transaccionales'),
    ('enterprise', 'modulo_mensajeria', 'Bitacora y reenvio de correos transaccionales')
ON CONFLICT (plan, feature_key) DO UPDATE SET
    descripcion = EXCLUDED.descripcion;

INSERT INTO saas_features (feature_key, nombre, modulo, tipo, descripcion, orden)
VALUES ('modulo_mensajeria', 'Mensajeria por correo', 'Administracion', 'modulo', 'Bitacora, auditoria y reenvio de correos enviados por la clinica.', 90)
ON CONFLICT (feature_key) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    modulo = EXCLUDED.modulo,
    tipo = EXCLUDED.tipo,
    descripcion = EXCLUDED.descripcion,
    orden = EXCLUDED.orden,
    estado = 'activo',
    updated_at = NOW();

INSERT INTO saas_plan_features (plan_slug, feature_key, enabled)
SELECT p.slug, 'modulo_mensajeria', TRUE
FROM saas_plans p
WHERE p.slug IN ('basico', 'profesional', 'enterprise')
ON CONFLICT (plan_slug, feature_key) DO UPDATE SET
    enabled = TRUE,
    updated_at = NOW();
