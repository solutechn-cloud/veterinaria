ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS tipo_identificacion VARCHAR(30) DEFAULT 'identidad',
    ADD COLUMN IF NOT EXISTS sin_correo BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ciudad_municipio VARCHAR(120),
    ADD COLUMN IF NOT EXISTS departamento VARCHAR(120),
    ADD COLUMN IF NOT EXISTS contacto_autorizado_nombre VARCHAR(150),
    ADD COLUMN IF NOT EXISTS contacto_autorizado_telefono VARCHAR(40),
    ADD COLUMN IF NOT EXISTS telefono_alternativo VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_clientes_tenant_telefono ON clientes(tenant_id, telefono);
CREATE INDEX IF NOT EXISTS idx_clientes_tenant_ciudad ON clientes(tenant_id, ciudad_municipio);
