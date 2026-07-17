-- ============================================================
-- Migration 040: Listado de CAI vigentes para facturación
--
-- Reemplaza el CAI único guardado en `configuracion` por un listado
-- histórico: cada CAI que la empresa registra (obtenido de la SAR)
-- queda como una fila con su propio correlativo y rango. El sistema
-- usa el más antiguo "vigente" hasta agotar su rango numérico o
-- vencer su fecha límite, momento en el que exige registrar uno
-- nuevo antes de seguir emitiendo facturas fiscales (ver
-- generateFacturaCorrelativo en config/db.js).
--
-- Reutiliza la tabla `configuracion_cai_historial` (existía en el
-- esquema desde 000_core_schema.sql pero ningún endpoint la usaba)
-- en vez de crear una tabla nueva.
-- ============================================================

ALTER TABLE IF EXISTS configuracion_cai_historial RENAME TO cai_facturacion;

ALTER TABLE cai_facturacion
    ADD COLUMN IF NOT EXISTS correlativo_actual BIGINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'vigente',
    ADD COLUMN IF NOT EXISTS activado_en TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS agotado_en TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cai_facturacion_tenant_estado
    ON cai_facturacion (tenant_id, estado, fecha_registro);

-- RLS: la tabla ya quedó cubierta por el loop dinámico de 023_enable_rls.sql
-- (tenía tenant_id desde 001_saas_tenant_hardening.sql), pero se reafirma
-- aquí de forma idempotente por si se reconstruye la BD desde cero y el
-- rename cambia el orden de evaluación de esa migración.
DO $do$
BEGIN
    EXECUTE 'ALTER TABLE public.cai_facturacion ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.cai_facturacion FORCE ROW LEVEL SECURITY';
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'cai_facturacion' AND policyname = 'tenant_isolation'
    ) THEN
        EXECUTE 'CREATE POLICY tenant_isolation ON public.cai_facturacion FOR ALL '
             || 'USING (rls_bypass_active() OR tenant_id = current_tenant_id()) '
             || 'WITH CHECK (rls_bypass_active() OR tenant_id = current_tenant_id())';
    END IF;
END
$do$;

-- Backfill: migra el CAI único que cada tenant tenía en `configuracion`
-- hacia el listado, calculando su estado real (vigente/agotado/vencido)
-- para que la numeración fiscal continúe sin reingreso manual.
INSERT INTO cai_facturacion (tenant_id, cai, rangoinicial, rangofinal, fechalimite, correlativo_actual, estado, fecha_registro, registrado_por)
SELECT
    c.tenant_id,
    c.cai,
    c.rangoinicial,
    c.rangofinal,
    c.fechalimite,
    COALESCE(c.factura_correlativo_actual, 1),
    CASE
        WHEN c.fechalimite IS NOT NULL AND c.fechalimite < CURRENT_DATE THEN 'vencido'
        WHEN split_part(c.rangofinal, '-', 4) ~ '^\d+$'
             AND COALESCE(c.factura_correlativo_actual, 1) > split_part(c.rangofinal, '-', 4)::BIGINT THEN 'agotado'
        ELSE 'vigente'
    END,
    NOW(),
    'Migración automática (CAI existente)'
FROM configuracion c
WHERE c.tenant_id IS NOT NULL
  AND c.fechalimite IS NOT NULL
  AND COALESCE(NULLIF(TRIM(c.cai), ''), '') <> ''
  AND COALESCE(NULLIF(TRIM(c.rangoinicial), ''), '') <> ''
  AND COALESCE(NULLIF(TRIM(c.rangofinal), ''), '') <> ''
  AND NOT EXISTS (
      SELECT 1 FROM cai_facturacion cf WHERE cf.tenant_id = c.tenant_id AND cf.cai = c.cai
  );
