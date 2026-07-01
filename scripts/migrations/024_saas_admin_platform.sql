CREATE TABLE IF NOT EXISTS saas_admin_roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_key    VARCHAR(40) UNIQUE NOT NULL,
    nombre      VARCHAR(120) NOT NULL,
    descripcion TEXT,
    permisos    JSONB NOT NULL DEFAULT '[]'::jsonb,
    system_role BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saas_admin_users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          VARCHAR(255) NOT NULL,
    nombre         VARCHAR(160) NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    role_id        UUID REFERENCES saas_admin_roles(id) ON DELETE SET NULL,
    estado         VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo','bloqueado')),
    last_login_at  TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_admin_users_email_lower
    ON saas_admin_users (LOWER(email));

CREATE TABLE IF NOT EXISTS saas_admin_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES saas_admin_users(id) ON DELETE CASCADE,
    token_id    UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    ip_address  INET,
    user_agent  TEXT,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_admin_sessions_token
    ON saas_admin_sessions(token_id) WHERE revoked_at IS NULL;

DO $$
DECLARE c RECORD;
BEGIN
    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'tenants'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%plan%'
    LOOP
        EXECUTE format('ALTER TABLE tenants DROP CONSTRAINT %I', c.conname);
    END LOOP;

    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'plan_features'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%plan%'
    LOOP
        EXECUTE format('ALTER TABLE plan_features DROP CONSTRAINT %I', c.conname);
    END LOOP;

    IF to_regclass('ai_quota_plans') IS NOT NULL THEN
        FOR c IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'ai_quota_plans'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%plan%'
        LOOP
            EXECUTE format('ALTER TABLE ai_quota_plans DROP CONSTRAINT %I', c.conname);
        END LOOP;
    END IF;
END $$;

DROP VIEW IF EXISTS v_ai_quota_status;

ALTER TABLE tenants ALTER COLUMN plan TYPE VARCHAR(80);
ALTER TABLE plan_features ALTER COLUMN plan TYPE VARCHAR(80);

DO $$
BEGIN
    IF to_regclass('ai_quota_plans') IS NOT NULL THEN
        ALTER TABLE ai_quota_plans ALTER COLUMN plan TYPE VARCHAR(80);
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('ai_quota_plans') IS NOT NULL THEN
        EXECUTE $view$
            CREATE OR REPLACE VIEW v_ai_quota_status AS
            SELECT
                t.id               AS tenant_id,
                t.slug,
                t.nombre_empresa,
                t.plan,
                t.ai_habilitado,
                p.tokens_mensual,
                p.requests_mensual,
                p.requests_diario,
                COALESCE(t.ai_tokens_override,   p.tokens_mensual)   AS tokens_limite,
                COALESCE(t.ai_requests_override, p.requests_mensual) AS requests_limite,
                COALESCE(t.ai_req_diario_override, p.requests_diario) AS req_diario_limite,
                TO_CHAR(NOW() AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM') AS periodo_actual,
                COALESCE(u.tokens_consumidos, 0)  AS tokens_consumidos,
                COALESCE(u.requests_totales,  0)  AS requests_totales,
                COALESCE(u.requests_hoy,      0)  AS requests_hoy,
                CASE
                    WHEN NOT t.ai_habilitado THEN 'deshabilitado'
                    WHEN COALESCE(u.tokens_consumidos, 0) >= COALESCE(t.ai_tokens_override, p.tokens_mensual) THEN 'agotado'
                    WHEN COALESCE(u.tokens_consumidos, 0) >= COALESCE(t.ai_tokens_override, p.tokens_mensual) * 0.80 THEN 'alerta'
                    ELSE 'ok'
                END AS estado_cuota,
                ROUND(
                    COALESCE(u.tokens_consumidos, 0) * 100.0
                    / NULLIF(COALESCE(t.ai_tokens_override, p.tokens_mensual), 0)
                , 1) AS pct_tokens_usado,
                u.alerta_80_enviada,
                u.alerta_100_enviada,
                u.ultimo_exceso_at
            FROM tenants t
            JOIN ai_quota_plans p ON p.plan = t.plan
            LEFT JOIN ai_quota_usage u
                ON u.tenant_id = t.id
                AND u.periodo = TO_CHAR(NOW() AT TIME ZONE 'America/Tegucigalpa', 'YYYY-MM')
        $view$;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS saas_plans (
    slug                VARCHAR(80) PRIMARY KEY CHECK (slug ~ '^[a-z0-9_-]{3,80}$'),
    nombre              VARCHAR(140) NOT NULL,
    descripcion         TEXT,
    estado              VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (estado IN ('borrador','activo','archivado')),
    moneda              VARCHAR(3) NOT NULL DEFAULT 'USD',
    precio_mensual      NUMERIC(12,2) NOT NULL DEFAULT 0,
    precio_anual        NUMERIC(12,2) NOT NULL DEFAULT 0,
    max_sucursales      INT NOT NULL DEFAULT 1,
    max_usuarios        INT NOT NULL DEFAULT 5,
    max_medicamentos    INT NOT NULL DEFAULT 500,
    ai_tokens_mensual   BIGINT NOT NULL DEFAULT 100000,
    ai_requests_mensual INT NOT NULL DEFAULT 200,
    ai_requests_diario  INT NOT NULL DEFAULT 30,
    trial_dias          INT NOT NULL DEFAULT 14,
    orden               INT NOT NULL DEFAULT 100,
    metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saas_plan_versions (
    id            BIGSERIAL PRIMARY KEY,
    plan_slug     VARCHAR(80) NOT NULL REFERENCES saas_plans(slug) ON UPDATE CASCADE ON DELETE CASCADE,
    version       INT NOT NULL,
    snapshot      JSONB NOT NULL,
    actor_admin_id UUID REFERENCES saas_admin_users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(plan_slug, version)
);

CREATE TABLE IF NOT EXISTS saas_features (
    feature_key          VARCHAR(100) PRIMARY KEY,
    nombre               VARCHAR(160) NOT NULL,
    modulo               VARCHAR(80) NOT NULL DEFAULT 'General',
    tipo                 VARCHAR(30) NOT NULL DEFAULT 'modulo' CHECK (tipo IN ('modulo','funcion','ia','reporte','integracion')),
    descripcion          TEXT,
    estado               VARCHAR(20) NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
    requiere_feature_key VARCHAR(100) REFERENCES saas_features(feature_key) ON DELETE SET NULL,
    orden                INT NOT NULL DEFAULT 100,
    metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saas_plan_features (
    plan_slug   VARCHAR(80) NOT NULL REFERENCES saas_plans(slug) ON UPDATE CASCADE ON DELETE CASCADE,
    feature_key VARCHAR(100) NOT NULL REFERENCES saas_features(feature_key) ON UPDATE CASCADE ON DELETE CASCADE,
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    limits      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (plan_slug, feature_key)
);

CREATE TABLE IF NOT EXISTS tenant_feature_overrides (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    feature_key    VARCHAR(100) NOT NULL REFERENCES saas_features(feature_key) ON UPDATE CASCADE ON DELETE CASCADE,
    enabled        BOOLEAN NOT NULL,
    reason         TEXT,
    valid_until    TIMESTAMPTZ,
    updated_by     UUID REFERENCES saas_admin_users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, feature_key)
);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_slug            VARCHAR(80) NOT NULL REFERENCES saas_plans(slug) ON UPDATE CASCADE,
    status               VARCHAR(20) NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing','active','past_due','suspended','canceled','expired')),
    billing_cycle        VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('trial','monthly','annual','manual')),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end   TIMESTAMPTZ,
    canceled_at          TIMESTAMPTZ,
    cancel_reason        TEXT,
    is_current           BOOLEAN NOT NULL DEFAULT TRUE,
    limits_snapshot      JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_subscriptions_current
    ON tenant_subscriptions(tenant_id) WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_status
    ON tenant_subscriptions(status, current_period_end);

CREATE TABLE IF NOT EXISTS tenant_subscription_events (
    id              BIGSERIAL PRIMARY KEY,
    subscription_id UUID REFERENCES tenant_subscriptions(id) ON DELETE SET NULL,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type      VARCHAR(60) NOT NULL,
    from_status     VARCHAR(20),
    to_status       VARCHAR(20),
    from_plan_slug  VARCHAR(80),
    to_plan_slug    VARCHAR(80),
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor_admin_id  UUID REFERENCES saas_admin_users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_tenant
    ON tenant_subscription_events(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saas_audit_log (
    id             BIGSERIAL PRIMARY KEY,
    actor_admin_id UUID REFERENCES saas_admin_users(id) ON DELETE SET NULL,
    actor_email    VARCHAR(255),
    action         VARCHAR(100) NOT NULL,
    entity_type    VARCHAR(80) NOT NULL,
    entity_id      VARCHAR(120),
    tenant_id      UUID REFERENCES tenants(id) ON DELETE SET NULL,
    before_data    JSONB,
    after_data     JSONB,
    ip_address     INET,
    user_agent     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_audit_tenant_created
    ON saas_audit_log(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saas_audit_entity
    ON saas_audit_log(entity_type, entity_id, created_at DESC);

INSERT INTO saas_admin_roles (role_key, nombre, descripcion, permisos, system_role)
VALUES
    ('owner', 'Owner SaaS', 'Acceso total al panel SaaS.', '["*"]'::jsonb, TRUE),
    ('soporte', 'Soporte', 'Gestiona tenants y revisa auditoria.', '["tenants:read","tenants:write","subscriptions:read","audit:read"]'::jsonb, TRUE),
    ('finanzas', 'Finanzas', 'Gestiona suscripciones y vencimientos.', '["tenants:read","subscriptions:read","subscriptions:write","audit:read"]'::jsonb, TRUE),
    ('operaciones', 'Operaciones', 'Administra planes, features y entitlements.', '["tenants:read","plans:read","plans:write","features:read","features:write","entitlements:write","audit:read"]'::jsonb, TRUE)
ON CONFLICT (role_key) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    permisos = EXCLUDED.permisos,
    system_role = TRUE,
    updated_at = NOW();

INSERT INTO saas_plans
    (slug, nombre, descripcion, estado, moneda, precio_mensual, precio_anual, max_sucursales, max_usuarios, max_medicamentos, ai_tokens_mensual, ai_requests_mensual, ai_requests_diario, trial_dias, orden)
VALUES
    ('basico', 'Basico', 'Clinicas pequenas con operacion esencial.', 'activo', 'USD', 29, 290, 1, 5, 500, 100000, 200, 30, 14, 10),
    ('profesional', 'Profesional', 'Clinicas en crecimiento con agenda, expediente y reportes.', 'activo', 'USD', 79, 790, 3, 15, 2000, 500000, 1000, 100, 14, 20),
    ('enterprise', 'Enterprise', 'Operaciones multi-sucursal con controles avanzados.', 'activo', 'USD', 199, 1990, 10, 50, 10000, 5000000, 99999, 500, 14, 30)
ON CONFLICT (slug) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    estado = EXCLUDED.estado,
    moneda = EXCLUDED.moneda,
    precio_mensual = EXCLUDED.precio_mensual,
    precio_anual = EXCLUDED.precio_anual,
    max_sucursales = EXCLUDED.max_sucursales,
    max_usuarios = EXCLUDED.max_usuarios,
    max_medicamentos = EXCLUDED.max_medicamentos,
    ai_tokens_mensual = EXCLUDED.ai_tokens_mensual,
    ai_requests_mensual = EXCLUDED.ai_requests_mensual,
    ai_requests_diario = EXCLUDED.ai_requests_diario,
    trial_dias = EXCLUDED.trial_dias,
    orden = EXCLUDED.orden,
    updated_at = NOW();

INSERT INTO saas_features (feature_key, nombre, modulo, tipo, descripcion, orden)
SELECT DISTINCT
    pf.feature_key,
    COALESCE(NULLIF(pf.descripcion, ''), pf.feature_key),
    CASE
        WHEN pf.feature_key LIKE 'modulo_%' THEN 'Modulo'
        WHEN pf.feature_key LIKE 'ia_%' THEN 'IA'
        WHEN pf.feature_key LIKE 'reportes_%' THEN 'Reportes'
        ELSE 'Funciones'
    END,
    CASE
        WHEN pf.feature_key LIKE 'ia_%' THEN 'ia'
        WHEN pf.feature_key LIKE 'reportes_%' THEN 'reporte'
        WHEN pf.feature_key LIKE 'modulo_%' THEN 'modulo'
        ELSE 'funcion'
    END,
    pf.descripcion,
    100
FROM plan_features pf
ON CONFLICT (feature_key) DO UPDATE SET
    nombre = COALESCE(EXCLUDED.nombre, saas_features.nombre),
    modulo = EXCLUDED.modulo,
    tipo = EXCLUDED.tipo,
    descripcion = COALESCE(EXCLUDED.descripcion, saas_features.descripcion),
    updated_at = NOW();

INSERT INTO saas_plan_features (plan_slug, feature_key, enabled)
SELECT pf.plan, pf.feature_key, TRUE
FROM plan_features pf
JOIN saas_plans sp ON sp.slug = pf.plan
JOIN saas_features sf ON sf.feature_key = pf.feature_key
ON CONFLICT (plan_slug, feature_key) DO UPDATE SET
    enabled = TRUE,
    updated_at = NOW();

INSERT INTO ai_quota_plans (plan, tokens_mensual, requests_mensual, requests_diario, procesos_habilitados)
SELECT slug, ai_tokens_mensual, ai_requests_mensual, ai_requests_diario,
       CASE
           WHEN slug = 'basico' THEN ARRAY['symptom_recommendation','drug_interactions']
           ELSE ARRAY['medication_intake','symptom_recommendation','drug_interactions','client_analysis','cash_anomaly','restock_prediction']
       END
FROM saas_plans
ON CONFLICT (plan) DO UPDATE SET
    tokens_mensual = EXCLUDED.tokens_mensual,
    requests_mensual = EXCLUDED.requests_mensual,
    requests_diario = EXCLUDED.requests_diario,
    updated_at = NOW();

INSERT INTO tenant_subscriptions
    (tenant_id, plan_slug, status, billing_cycle, current_period_start, current_period_end, is_current, limits_snapshot)
SELECT
    t.id,
    t.plan,
    CASE
        WHEN t.estado = 'prueba' THEN 'trialing'
        WHEN t.estado = 'activo' AND t.fecha_vencimiento IS NOT NULL AND t.fecha_vencimiento < NOW() THEN 'expired'
        WHEN t.estado = 'activo' THEN 'active'
        WHEN t.estado = 'suspendido' THEN 'suspended'
        WHEN t.estado = 'cancelado' THEN 'canceled'
        ELSE 'trialing'
    END,
    CASE WHEN t.estado = 'prueba' THEN 'trial' ELSE 'monthly' END,
    COALESCE(t.created_at, NOW()),
    t.fecha_vencimiento,
    TRUE,
    jsonb_build_object(
        'max_sucursales', t.max_sucursales,
        'max_usuarios', t.max_usuarios,
        'max_medicamentos', t.max_medicamentos
    )
FROM tenants t
JOIN saas_plans sp ON sp.slug = t.plan
ON CONFLICT DO NOTHING;
