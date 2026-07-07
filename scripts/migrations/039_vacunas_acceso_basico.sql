-- Asegura que clientes en plan basico puedan ver el modulo de vacunas.
-- Refuerza la migracion 025 (feature del plan) y corrige roles clinicos
-- creados antes de que existieran los permisos VER_VACUNAS/GESTIONAR_VACUNAS,
-- que de otra forma quedarian sin acceso aunque el plan si lo permita.

INSERT INTO plan_features (plan, feature_key, descripcion) VALUES
    ('basico', 'modulo_vacunas', 'Vacunas y medicina preventiva')
ON CONFLICT (plan, feature_key) DO UPDATE SET
    descripcion = EXCLUDED.descripcion;

INSERT INTO saas_plan_features (plan_slug, feature_key, enabled)
VALUES
    ('basico', 'modulo_vacunas', TRUE)
ON CONFLICT (plan_slug, feature_key) DO UPDATE SET
    enabled = TRUE,
    updated_at = NOW();

-- Cualquier rol que ya pueda ver pacientes (personal clinico) tambien
-- deberia poder ver/gestionar vacunas, tomar el producto de inventario
-- (el modal de aplicar vacuna lista medicamentos via VER_INVENTARIO) y
-- facturar la vacunacion en el punto de venta (VER_POS), sin importar
-- cuando se creo el rol.
INSERT INTO rol_permisos (idRol, idPermiso)
SELECT rp.idRol, p.idPermiso
FROM rol_permisos rp
CROSS JOIN (VALUES
    ('VER_VACUNAS'),
    ('GESTIONAR_VACUNAS'),
    ('VER_INVENTARIO'),
    ('VER_POS')
) AS p(idPermiso)
WHERE rp.idPermiso = 'VER_PACIENTES'
ON CONFLICT (idRol, idPermiso) DO NOTHING;
