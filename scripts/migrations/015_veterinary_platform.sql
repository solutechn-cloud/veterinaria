-- Veterinary platform v1: patients, appointments, clinical records, vaccines,
-- reminders, services, permissions, and product extensions.

ALTER TABLE medicamentos ADD COLUMN IF NOT EXISTS tipo_producto VARCHAR(30) DEFAULT 'Medicamento';
ALTER TABLE medicamentos ADD COLUMN IF NOT EXISTS especies_permitidas TEXT;
ALTER TABLE medicamentos ADD COLUMN IF NOT EXISTS dosis_recomendada TEXT;
ALTER TABLE medicamentos ADD COLUMN IF NOT EXISTS unidad_dosis VARCHAR(40);
ALTER TABLE medicamentos ADD COLUMN IF NOT EXISTS intervalo_dosis VARCHAR(80);
ALTER TABLE medicamentos ADD COLUMN IF NOT EXISTS periodo_retiro TEXT;

ALTER TABLE detalleventa ADD COLUMN IF NOT EXISTS id_servicio INT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS id_paciente INT;

CREATE TABLE IF NOT EXISTS pacientes (
    id_paciente          SERIAL PRIMARY KEY,
    tenant_id            UUID NOT NULL,
    id_tutor             VARCHAR(20) NOT NULL,
    nombre               VARCHAR(120) NOT NULL,
    especie              VARCHAR(60) NOT NULL,
    raza                 VARCHAR(100),
    sexo                 VARCHAR(20),
    color                VARCHAR(80),
    fecha_nacimiento     DATE,
    fecha_nacimiento_estimada BOOLEAN DEFAULT FALSE,
    peso_actual          NUMERIC(8,3),
    microchip            VARCHAR(80),
    estado_reproductivo  VARCHAR(40),
    alergias             TEXT,
    condiciones_cronicas TEXT,
    foto_base64          TEXT,
    estado               VARCHAR(20) DEFAULT 'Activo',
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pacientes_tenant_tutor ON pacientes(tenant_id, id_tutor);
CREATE INDEX IF NOT EXISTS idx_pacientes_tenant_nombre ON pacientes(tenant_id, nombre);

CREATE TABLE IF NOT EXISTS paciente_pesos (
    id            SERIAL PRIMARY KEY,
    tenant_id     UUID NOT NULL,
    id_paciente   INT NOT NULL REFERENCES pacientes(id_paciente) ON DELETE CASCADE,
    peso          NUMERIC(8,3) NOT NULL,
    fecha         TIMESTAMPTZ DEFAULT NOW(),
    registrado_por VARCHAR(100),
    notas         TEXT
);

CREATE INDEX IF NOT EXISTS idx_paciente_pesos_paciente_fecha ON paciente_pesos(tenant_id, id_paciente, fecha DESC);

CREATE TABLE IF NOT EXISTS tipos_cita (
    id_tipo_cita      SERIAL PRIMARY KEY,
    tenant_id         UUID NOT NULL,
    nombre            VARCHAR(100) NOT NULL,
    duracion_minutos  INT NOT NULL DEFAULT 30,
    color             VARCHAR(20) DEFAULT '#4f46e5',
    requiere_veterinario BOOLEAN DEFAULT TRUE,
    activo            BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, nombre)
);

CREATE TABLE IF NOT EXISTS citas (
    id_cita          SERIAL PRIMARY KEY,
    tenant_id        UUID NOT NULL,
    id_paciente      INT REFERENCES pacientes(id_paciente) ON DELETE SET NULL,
    id_tutor         VARCHAR(20),
    id_tipo_cita     INT REFERENCES tipos_cita(id_tipo_cita),
    fecha_inicio     TIMESTAMPTZ NOT NULL,
    fecha_fin        TIMESTAMPTZ NOT NULL,
    id_veterinario   VARCHAR(100),
    id_sucursal      INT,
    sala_recurso     VARCHAR(80),
    estado           VARCHAR(30) NOT NULL DEFAULT 'Programada',
    motivo           TEXT,
    notas            TEXT,
    creado_por       VARCHAR(100),
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW(),
    CHECK (fecha_fin > fecha_inicio),
    CHECK (estado IN ('Programada','Confirmada','En espera','En consulta','Completada','No asistio','Cancelada'))
);

CREATE INDEX IF NOT EXISTS idx_citas_tenant_fecha ON citas(tenant_id, fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_citas_tenant_paciente ON citas(tenant_id, id_paciente, fecha_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_citas_tenant_vet ON citas(tenant_id, id_veterinario, fecha_inicio);

CREATE TABLE IF NOT EXISTS consultas (
    id_consulta       SERIAL PRIMARY KEY,
    tenant_id         UUID NOT NULL,
    id_paciente       INT NOT NULL REFERENCES pacientes(id_paciente) ON DELETE CASCADE,
    id_tutor          VARCHAR(20),
    id_cita           INT REFERENCES citas(id_cita) ON DELETE SET NULL,
    id_veterinario    VARCHAR(100),
    fecha             TIMESTAMPTZ DEFAULT NOW(),
    motivo            TEXT,
    subjetivo         TEXT,
    objetivo          TEXT,
    evaluacion        TEXT,
    plan              TEXT,
    peso              NUMERIC(8,3),
    temperatura       NUMERIC(5,2),
    frecuencia_cardiaca INT,
    frecuencia_respiratoria INT,
    condicion_corporal VARCHAR(20),
    notas_alta        TEXT,
    estado            VARCHAR(20) DEFAULT 'Abierta',
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    CHECK (estado IN ('Abierta','Cerrada','Anulada'))
);

CREATE INDEX IF NOT EXISTS idx_consultas_tenant_paciente_fecha ON consultas(tenant_id, id_paciente, fecha DESC);

CREATE TABLE IF NOT EXISTS consulta_diagnosticos (
    id              SERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL,
    id_consulta     INT NOT NULL REFERENCES consultas(id_consulta) ON DELETE CASCADE,
    diagnostico     VARCHAR(255) NOT NULL,
    codigo          VARCHAR(50),
    notas           TEXT
);

CREATE TABLE IF NOT EXISTS consulta_tratamientos (
    id              SERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL,
    id_consulta     INT NOT NULL REFERENCES consultas(id_consulta) ON DELETE CASCADE,
    descripcion     TEXT NOT NULL,
    id_medicamento  VARCHAR(20),
    dosis           VARCHAR(120),
    frecuencia      VARCHAR(120),
    duracion        VARCHAR(120),
    instrucciones   TEXT
);

CREATE TABLE IF NOT EXISTS vacunas_protocolos (
    id_protocolo       SERIAL PRIMARY KEY,
    tenant_id          UUID NOT NULL,
    nombre             VARCHAR(120) NOT NULL,
    especie            VARCHAR(60) NOT NULL,
    edad_inicial_dias  INT DEFAULT 0,
    intervalo_dias     INT,
    dosis_totales      INT DEFAULT 1,
    id_medicamento     VARCHAR(20),
    activo             BOOLEAN DEFAULT TRUE,
    UNIQUE(tenant_id, nombre, especie)
);

CREATE TABLE IF NOT EXISTS vacunas_aplicadas (
    id_vacuna_aplicada SERIAL PRIMARY KEY,
    tenant_id          UUID NOT NULL,
    id_paciente        INT NOT NULL REFERENCES pacientes(id_paciente) ON DELETE CASCADE,
    id_protocolo       INT REFERENCES vacunas_protocolos(id_protocolo),
    id_medicamento     VARCHAR(20),
    id_lote            INT,
    nombre_vacuna      VARCHAR(160) NOT NULL,
    fecha_aplicacion   DATE NOT NULL DEFAULT CURRENT_DATE,
    proxima_dosis      DATE,
    veterinario        VARCHAR(100),
    notas              TEXT,
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vacunas_paciente_fecha ON vacunas_aplicadas(tenant_id, id_paciente, fecha_aplicacion DESC);
CREATE INDEX IF NOT EXISTS idx_vacunas_proxima ON vacunas_aplicadas(tenant_id, proxima_dosis);

CREATE TABLE IF NOT EXISTS recordatorios (
    id_recordatorio SERIAL PRIMARY KEY,
    tenant_id       UUID NOT NULL,
    tipo            VARCHAR(50) NOT NULL,
    referencia_tabla VARCHAR(80),
    referencia_id   INT,
    id_tutor        VARCHAR(20),
    id_paciente     INT,
    correo_destino  VARCHAR(120),
    asunto          VARCHAR(255) NOT NULL,
    cuerpo          TEXT,
    fecha_programada TIMESTAMPTZ NOT NULL,
    fecha_envio     TIMESTAMPTZ,
    estado          VARCHAR(20) DEFAULT 'Pendiente',
    intentos        INT DEFAULT 0,
    ultimo_error    TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, tipo, referencia_tabla, referencia_id, fecha_programada)
);

CREATE INDEX IF NOT EXISTS idx_recordatorios_pendientes ON recordatorios(tenant_id, estado, fecha_programada);

CREATE TABLE IF NOT EXISTS servicios_veterinarios (
    id_servicio      SERIAL PRIMARY KEY,
    tenant_id        UUID NOT NULL,
    codigo           VARCHAR(30),
    nombre           VARCHAR(150) NOT NULL,
    categoria        VARCHAR(60) DEFAULT 'Consulta',
    descripcion      TEXT,
    duracion_minutos INT DEFAULT 30,
    precio           NUMERIC(12,2) NOT NULL DEFAULT 0,
    tipo_isv         VARCHAR(10) DEFAULT 'exento',
    requiere_paciente BOOLEAN DEFAULT TRUE,
    activo           BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_servicios_tenant_activo ON servicios_veterinarios(tenant_id, activo, categoria);

CREATE TABLE IF NOT EXISTS consentimientos (
    id_consentimiento SERIAL PRIMARY KEY,
    tenant_id         UUID NOT NULL,
    id_paciente       INT REFERENCES pacientes(id_paciente) ON DELETE SET NULL,
    id_tutor          VARCHAR(20),
    id_consulta       INT REFERENCES consultas(id_consulta) ON DELETE SET NULL,
    tipo              VARCHAR(80) NOT NULL,
    contenido         TEXT,
    firmado_por       VARCHAR(150),
    fecha_firma       TIMESTAMPTZ,
    archivo_url       TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO tipos_cita (tenant_id, nombre, duracion_minutos, color)
SELECT id, 'Consulta general', 30, '#4f46e5' FROM tenants
ON CONFLICT (tenant_id, nombre) DO NOTHING;

INSERT INTO tipos_cita (tenant_id, nombre, duracion_minutos, color)
SELECT id, 'Vacunacion', 20, '#059669' FROM tenants
ON CONFLICT (tenant_id, nombre) DO NOTHING;

INSERT INTO servicios_veterinarios (tenant_id, codigo, nombre, categoria, precio, tipo_isv)
SELECT id, 'SERV-CONS', 'Consulta general', 'Consulta', 0, 'exento' FROM tenants
ON CONFLICT (tenant_id, nombre) DO NOTHING;

INSERT INTO permisos (idPermiso, nombre, modulo) VALUES
    ('VER_PACIENTES',       'Ver Pacientes',              'Clinica'),
    ('GESTIONAR_PACIENTES', 'Gestionar Pacientes',        'Clinica'),
    ('VER_CITAS',           'Ver Agenda y Citas',         'Clinica'),
    ('GESTIONAR_CITAS',     'Gestionar Agenda y Citas',   'Clinica'),
    ('VER_EXPEDIENTE',      'Ver Expediente Clinico',     'Clinica'),
    ('EDITAR_EXPEDIENTE',   'Editar Expediente Clinico',  'Clinica'),
    ('VER_VACUNAS',         'Ver Vacunas',                'Clinica'),
    ('GESTIONAR_VACUNAS',   'Gestionar Vacunas',          'Clinica'),
    ('VER_SERVICIOS_VET',   'Ver Servicios Veterinarios', 'Clinica')
ON CONFLICT (idPermiso) DO NOTHING;

INSERT INTO plan_features (plan, feature_key, descripcion) VALUES
    ('basico',      'modulo_pacientes',     'Tutores y pacientes veterinarios'),
    ('basico',      'modulo_citas',         'Agenda veterinaria'),
    ('profesional', 'modulo_expediente',    'Expediente clinico veterinario'),
    ('profesional', 'modulo_recordatorios', 'Recordatorios por correo'),
    ('profesional', 'modulo_vacunas',       'Vacunas y medicina preventiva'),
    ('enterprise',  'modulo_hospitalizacion','Flowboard y hospitalizacion')
ON CONFLICT (plan, feature_key) DO NOTHING;

INSERT INTO plan_features (plan, feature_key, descripcion)
SELECT 'profesional', feature_key, descripcion FROM plan_features
WHERE plan = 'basico' AND feature_key IN ('modulo_pacientes','modulo_citas')
ON CONFLICT (plan, feature_key) DO NOTHING;

INSERT INTO plan_features (plan, feature_key, descripcion)
SELECT 'enterprise', feature_key, descripcion FROM plan_features
WHERE plan IN ('basico','profesional')
ON CONFLICT (plan, feature_key) DO NOTHING;

INSERT INTO rol_permisos (idRol, idPermiso)
SELECT r.idrol, p.idPermiso
FROM roles r
CROSS JOIN permisos p
WHERE LOWER(r.nombre) IN ('administrador', 'admin', 'superadmin')
  AND NOT EXISTS (
    SELECT 1 FROM rol_permisos rp
    WHERE rp.idRol = r.idrol AND rp.idPermiso = p.idPermiso
  );
