-- 019: Agenda profesional, disponibilidad de veterinarios y permisos asociados.

CREATE TABLE IF NOT EXISTS agenda_disponibilidad (
    id_disponibilidad SERIAL PRIMARY KEY,
    tenant_id          UUID NOT NULL,
    id_veterinario     VARCHAR(100) NOT NULL,
    id_sucursal        INT,
    dia_semana         INT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    hora_inicio        TIME NOT NULL,
    hora_fin           TIME NOT NULL,
    intervalo_minutos  INT NOT NULL DEFAULT 30,
    tipo               VARCHAR(20) NOT NULL DEFAULT 'Disponible',
    notas              TEXT,
    activo             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW(),
    CHECK (hora_fin > hora_inicio),
    CHECK (intervalo_minutos BETWEEN 10 AND 240),
    CHECK (tipo IN ('Disponible','Bloqueado')),
    UNIQUE(tenant_id, id_veterinario, dia_semana, hora_inicio, hora_fin, tipo)
);

CREATE INDEX IF NOT EXISTS idx_agenda_disponibilidad_vet_dia
    ON agenda_disponibilidad(tenant_id, id_veterinario, dia_semana, activo);

CREATE INDEX IF NOT EXISTS idx_agenda_disponibilidad_sucursal
    ON agenda_disponibilidad(tenant_id, id_sucursal, dia_semana, activo);

INSERT INTO permisos (idPermiso, nombre, modulo) VALUES
    ('VER_AGENDA_PERSONAL',          'Ver Agenda Personal',             'Clinica'),
    ('VER_DISPONIBILIDAD_AGENDA',    'Ver Disponibilidad de Agenda',    'Clinica'),
    ('GESTIONAR_DISPONIBILIDAD',     'Gestionar Disponibilidad Agenda', 'Clinica')
ON CONFLICT (idPermiso) DO UPDATE
SET nombre = EXCLUDED.nombre,
    modulo = EXCLUDED.modulo;

INSERT INTO rol_permisos (idRol, idPermiso)
SELECT DISTINCT rp.idRol, v.new_perm
FROM rol_permisos rp
JOIN (VALUES
    ('VER_CITAS',       'VER_AGENDA_PERSONAL'),
    ('VER_CITAS',       'VER_DISPONIBILIDAD_AGENDA'),
    ('GESTIONAR_CITAS', 'GESTIONAR_DISPONIBILIDAD')
) AS v(old_perm, new_perm) ON rp.idPermiso = v.old_perm
ON CONFLICT DO NOTHING;

INSERT INTO rol_permisos (idRol, idPermiso)
SELECT r.idrol, p.idPermiso
FROM roles r
CROSS JOIN permisos p
WHERE LOWER(r.nombre) IN ('administrador', 'admin', 'superadmin')
  AND p.idPermiso IN ('VER_AGENDA_PERSONAL', 'VER_DISPONIBILIDAD_AGENDA', 'GESTIONAR_DISPONIBILIDAD')
ON CONFLICT DO NOTHING;
