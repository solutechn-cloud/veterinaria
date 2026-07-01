-- ============================================================
-- Migration 023: Habilita Row-Level Security (RLS) multi-tenant
--
-- Consolida en el runner automático el aislamiento que hasta ahora solo vivía
-- en scripts/saas_migration.sql (aplicado a mano). A partir de aquí, cualquier
-- BD construida desde scripts/migrations/ tiene aislamiento real a nivel de BD.
--
-- Contrato con la aplicación (config/db.js):
--   * Peticiones de tenant  -> SET app.current_tenant_id = <uuid>  (RLS filtra)
--   * Caminos cross-tenant   -> SET app.bypass_rls = 'true'         (login, super-
--     admin, cron, registro público). Se activa vía withRequestBypass/setRequestBypass.
--
-- Idempotente: se puede re-ejecutar sin efectos adversos.
-- ============================================================

-- ---------- Funciones de contexto ----------
-- Robustas ante valor vacío/no seteado: devuelven NULL/false en vez de lanzar,
-- para que una conexión sin contexto no rompa la evaluación de las políticas.
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE plpgsql STABLE AS $fn$
DECLARE v text;
BEGIN
    v := current_setting('app.current_tenant_id', true);
    IF v IS NULL OR v = '' THEN
        RETURN NULL;
    END IF;
    RETURN v::uuid;
EXCEPTION WHEN others THEN
    RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION rls_bypass_active() RETURNS boolean
LANGUAGE plpgsql STABLE AS $fn$
BEGIN
    RETURN COALESCE(current_setting('app.bypass_rls', true), '') = 'true';
EXCEPTION WHEN others THEN
    RETURN false;
END;
$fn$;

-- ---------- Tabla maestra: tenants (política especial) ----------
-- Un tenant solo se ve a sí mismo; el super-admin (bypass) ve/modifica todos.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_tenants_select ON tenants;
CREATE POLICY policy_tenants_select ON tenants
    FOR SELECT USING (rls_bypass_active() OR id = current_tenant_id());

DROP POLICY IF EXISTS policy_tenants_modify ON tenants;
CREATE POLICY policy_tenants_modify ON tenants
    FOR ALL USING (rls_bypass_active()) WITH CHECK (rls_bypass_active());

-- ---------- Todas las tablas de negocio con tenant_id ----------
-- Loop dinámico: cubre las 57 tablas actuales y cualquiera futura que tenga
-- una columna tenant_id, con una política estándar de aislamiento.
DO $do$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_name = c.table_name
         AND t.table_schema = 'public'
         AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = 'public'
          AND c.column_name = 'tenant_id'
          AND c.table_name <> 'tenants'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.table_name);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', r.table_name);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON public.%I FOR ALL '
            || 'USING (rls_bypass_active() OR tenant_id = current_tenant_id()) '
            || 'WITH CHECK (rls_bypass_active() OR tenant_id = current_tenant_id())',
            r.table_name
        );
    END LOOP;
END
$do$;
