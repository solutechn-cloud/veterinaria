-- ============================================================
-- Migration 044: Backfill del snapshot de CAI en ventas ya emitidas
--
-- 043 agregó columnas para guardar en cada venta el CAI que realmente
-- se usó al numerarla, pero solo las ventas creadas DESPUÉS de esa
-- migración las tienen pobladas. Las facturas fiscales emitidas antes
-- seguirían mostrando, al reimprimirse, el CAI "actual" de
-- Configuración (que puede ya no ser el que las autorizó).
--
-- Este backfill reconstruye ese snapshot para las ventas existentes:
-- para cada venta fiscal con numero_factura, busca en cai_facturacion
-- (del mismo tenant) el CAI cuyo rango autorizado contiene ese número
-- (mismo prefijo establecimiento-puntoemision-tipodoc, y el correlativo
-- numérico dentro de [rangoinicial, rangofinal]). Es una reconstrucción
-- por rango, no por orden de fecha, así que es correcta aunque el
-- tenant ya haya rotado por varios CAI desde entonces.
-- ============================================================

SELECT set_config('app.bypass_rls', 'true', false);

UPDATE ventas v
SET cai               = m.cai,
    cai_rango_inicial = m.rangoinicial,
    cai_rango_final   = m.rangofinal,
    cai_fecha_limite  = m.fechalimite
FROM LATERAL (
    SELECT cf.cai, cf.rangoinicial, cf.rangofinal, cf.fechalimite
    FROM cai_facturacion cf
    WHERE cf.tenant_id = v.tenant_id
      AND split_part(v.numero_factura, '-', 1) = split_part(cf.rangoinicial, '-', 1)
      AND split_part(v.numero_factura, '-', 2) = split_part(cf.rangoinicial, '-', 2)
      AND split_part(v.numero_factura, '-', 3) = split_part(cf.rangoinicial, '-', 3)
      AND split_part(v.numero_factura, '-', 4) ~ '^\d+$'
      AND split_part(cf.rangoinicial, '-', 4) ~ '^\d+$'
      AND split_part(cf.rangofinal, '-', 4) ~ '^\d+$'
      AND split_part(v.numero_factura, '-', 4)::BIGINT
          BETWEEN split_part(cf.rangoinicial, '-', 4)::BIGINT
              AND split_part(cf.rangofinal, '-', 4)::BIGINT
    ORDER BY cf.fecha_registro ASC
    LIMIT 1
) m
WHERE v.numero_factura IS NOT NULL
  AND v.cai IS NULL;

SELECT set_config('app.bypass_rls', '', false);
