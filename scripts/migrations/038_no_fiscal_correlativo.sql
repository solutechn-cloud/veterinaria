-- Correlativo independiente para facturas internas (no fiscales), separado
-- del correlativo CAI (factura_correlativo_actual) para que crear una
-- factura interna nunca consuma ni afecte la numeración fiscal autorizada.
ALTER TABLE configuracion
    ADD COLUMN IF NOT EXISTS no_fiscal_correlativo_actual BIGINT DEFAULT 1;

ALTER TABLE ventas
    ADD COLUMN IF NOT EXISTS numero_no_fiscal VARCHAR(30);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_numero_no_fiscal
    ON ventas(tenant_id, numero_no_fiscal) WHERE numero_no_fiscal IS NOT NULL;
