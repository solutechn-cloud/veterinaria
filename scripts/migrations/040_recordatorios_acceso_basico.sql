-- El plan basico ya tiene acceso a Vacunas (migracion 039), pero la pantalla de
-- Vacunas tambien carga los recordatorios de proxima dosis via
-- GET /api/recordatorios?tipo=vacuna_proxima, que exige la feature
-- modulo_recordatorios. Sin ella el plan basico recibe 403 y muestra
-- "Modulo no disponible en el plan basico". Aqui habilitamos esa feature para
-- basico en ambas fuentes que lee planFeaturesCache (UNION de las dos tablas).

INSERT INTO plan_features (plan, feature_key, descripcion) VALUES
    ('basico', 'modulo_recordatorios', 'Recordatorios de vacunas y seguimientos')
ON CONFLICT (plan, feature_key) DO UPDATE SET
    descripcion = EXCLUDED.descripcion;

INSERT INTO saas_plan_features (plan_slug, feature_key, enabled)
VALUES
    ('basico', 'modulo_recordatorios', TRUE)
ON CONFLICT (plan_slug, feature_key) DO UPDATE SET
    enabled = TRUE,
    updated_at = NOW();
