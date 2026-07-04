-- Vincula cada cotización al paciente de la visita, para poder consolidar
-- todo el consumo de una consulta (servicios, recetas, vacunas,
-- desparasitaciones) en una sola cotización por paciente/día, sin importar
-- desde qué sección del expediente clínico se generó el cargo.

ALTER TABLE cotizaciones
    ADD COLUMN IF NOT EXISTS id_paciente INTEGER REFERENCES pacientes(id_paciente) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cotizaciones_tenant_paciente_estado
    ON cotizaciones(tenant_id, id_paciente, estado);
