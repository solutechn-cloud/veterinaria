-- ============================================================
-- Migration 042: Corrige el backfill de cai_facturacion (bug de RLS)
--
-- La migración 041 hacía `INSERT INTO cai_facturacion SELECT ... FROM
-- configuracion` sin bypass de RLS. Como ambas tablas tienen
-- FORCE ROW LEVEL SECURITY (023_enable_rls.sql), el SELECT corrió sin
-- contexto de tenant y vio 0 filas, así que el backfill no insertó nada
-- en ningún ambiente donde ya se había aplicado 041 (p.ej. producción) —
-- sin lanzar ningún error, porque insertar 0 filas no es un fallo.
--
-- Esta migración repite el mismo backfill, esta vez con
-- app.bypass_rls activo, y usa el mismo NOT EXISTS de 041 para no
-- duplicar nada en ambientes donde el backfill sí funcionó (p.ej. bases
-- locales creadas desde cero).
-- ============================================================

SELECT set_config('app.bypass_rls', 'true', false);

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

SELECT set_config('app.bypass_rls', '', false);
