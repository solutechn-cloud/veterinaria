-- ============================================================
-- Migration 036: Historial de precios de servicios veterinarios
--
-- Cada vez que se edita el precio de un servicio se guarda el precio
-- anterior en esta tabla antes de sobrescribirlo (ver PUT
-- /servicios-veterinarios/:id en routes/veterinaryRoutes.js).
-- ============================================================

CREATE TABLE IF NOT EXISTS servicios_precio_historial (
    id              SERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    id_servicio     INT NOT NULL REFERENCES servicios_veterinarios(id_servicio) ON DELETE CASCADE,
    precio_anterior NUMERIC(12,2) NOT NULL,
    precio_nuevo    NUMERIC(12,2) NOT NULL,
    cambiado_por    INT REFERENCES usuarios(codUsuario),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_servicios_precio_historial_servicio
    ON servicios_precio_historial (id_servicio, created_at DESC);

-- RLS (la tabla es nueva; 023 ya corrió, así que se habilita aquí).
DO $do$
BEGIN
    EXECUTE 'ALTER TABLE public.servicios_precio_historial ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.servicios_precio_historial FORCE ROW LEVEL SECURITY';
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'servicios_precio_historial' AND policyname = 'tenant_isolation'
    ) THEN
        EXECUTE 'CREATE POLICY tenant_isolation ON public.servicios_precio_historial FOR ALL '
             || 'USING (rls_bypass_active() OR tenant_id = current_tenant_id()) '
             || 'WITH CHECK (rls_bypass_active() OR tenant_id = current_tenant_id())';
    END IF;
END
$do$;
