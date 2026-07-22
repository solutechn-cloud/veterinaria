-- ============================================================
-- Migration 043: Snapshot del CAI en cada venta fiscal
--
-- Bug: la factura impresa mostraba el CAI, rango autorizado y fecha
-- límite del objeto `empresa` (tabla `configuracion`, editado desde
-- Configuración → PUT /config), en vez del CAI realmente usado para
-- numerar esa venta en `cai_facturacion` (POST /admin/cai). Como
-- `configuracion.cai/rangoinicial/rangofinal/fechalimite` nunca se
-- actualiza cuando se registra un CAI nuevo, la factura impresa podía
-- quedar mostrando datos de un CAI anterior/agotado.
--
-- Fix: cada venta fiscal guarda una copia (snapshot) del CAI que
-- `generateFacturaCorrelativo` usó realmente para asignarle su
-- numero_factura, así la impresión (nueva o reimpresión histórica)
-- siempre refleja el CAI que autorizó ese número, sin depender de la
-- config "actual" de la empresa.
-- ============================================================

ALTER TABLE ventas
    ADD COLUMN IF NOT EXISTS cai              VARCHAR(255),
    ADD COLUMN IF NOT EXISTS cai_rango_inicial VARCHAR(100),
    ADD COLUMN IF NOT EXISTS cai_rango_final   VARCHAR(100),
    ADD COLUMN IF NOT EXISTS cai_fecha_limite  DATE;
