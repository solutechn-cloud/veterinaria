-- Fiscal invoice correlative number, separate from the internal codVenta PK.
-- Lets a business already in operation continue its real CAI numbering
-- instead of restarting at 1 when they start using the system.

ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS factura_correlativo_actual BIGINT DEFAULT 1;

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS numero_factura VARCHAR(30);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_numero_factura
    ON ventas(tenant_id, numero_factura)
    WHERE numero_factura IS NOT NULL;
