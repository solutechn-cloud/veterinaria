-- ─── 014: Sistema de permisos v2 + feature gates por plan ───────────────────
-- Nuevos permisos granulares + tabla plan_features para feature flags por plan

-- Tabla plan_features: qué módulos incluye cada plan
CREATE TABLE IF NOT EXISTS plan_features (
    plan        VARCHAR(20)  NOT NULL CHECK (plan IN ('basico','profesional','enterprise')),
    feature_key VARCHAR(100) NOT NULL,
    descripcion TEXT,
    PRIMARY KEY (plan, feature_key)
);

-- ── Seed: Plan Básico ──────────────────────────────────────────────────────
INSERT INTO plan_features (plan, feature_key, descripcion) VALUES
('basico','modulo_pos',          'Punto de Venta'),
('basico','modulo_medicamentos', 'Inventario de Medicamentos'),
('basico','modulo_clientes',     'Gestión de Clientes'),
('basico','modulo_caja',         'Caja y Movimientos'),
('basico','modulo_config',       'Configuración de Empresa'),
('basico','ia_basica',           'IA básica: síntomas e interacciones')
ON CONFLICT DO NOTHING;

-- ── Seed: Plan Profesional (incluye todo el básico + módulos avanzados) ────
INSERT INTO plan_features (plan, feature_key, descripcion) VALUES
('profesional','modulo_pos',          'Punto de Venta'),
('profesional','modulo_medicamentos', 'Inventario de Medicamentos'),
('profesional','modulo_clientes',     'Gestión de Clientes'),
('profesional','modulo_caja',         'Caja y Movimientos'),
('profesional','modulo_config',       'Configuración de Empresa'),
('profesional','ia_basica',           'IA básica: síntomas e interacciones'),
('profesional','modulo_lealtad',      'Programa de Lealtad de Clientes'),
('profesional','modulo_ordenes_compra','Órdenes de Compra a Proveedores'),
('profesional','modulo_vencimientos', 'Control de Vencimientos de Medicamentos'),
('profesional','modulo_proveedores',  'Gestión de Proveedores'),
('profesional','modulo_contabilidad', 'Módulo de Contabilidad'),
('profesional','modulo_etiquetas',    'Diseñador de Etiquetas'),
('profesional','reportes_exportar',   'Exportación de Reportes PDF/Excel'),
('profesional','ia_avanzada',         'IA avanzada: todos los procesos')
ON CONFLICT DO NOTHING;

-- ── Seed: Plan Enterprise (todo lo profesional + multi-sucursal) ───────────
INSERT INTO plan_features (plan, feature_key, descripcion)
SELECT 'enterprise', feature_key, descripcion
FROM plan_features WHERE plan = 'profesional'
ON CONFLICT DO NOTHING;

INSERT INTO plan_features (plan, feature_key, descripcion) VALUES
('enterprise','modulo_sucursales',    'Gestión de Múltiples Sucursales'),
('enterprise','modulo_transferencias','Transferencias entre Sucursales'),
('enterprise','modulo_entregas',      'Seguimiento de Entregas Cross-Sucursal'),
('enterprise','modulo_panel_cajas',   'Panel de Administración de Cajas')
ON CONFLICT DO NOTHING;

-- ── Nuevos permisos ────────────────────────────────────────────────────────
INSERT INTO permisos (idPermiso, nombre, modulo) VALUES
('VER_LEALTAD',             'Ver Programa de Lealtad',          'Ventas'),
('ANULAR_VENTA',            'Anular Ventas',                    'Ventas'),
('GESTIONAR_CAJA',          'Abrir/Cerrar Caja y Arqueos',      'Finanzas'),
('EXPORTAR_REPORTES',       'Exportar Reportes a PDF/Excel',    'Administración'),
('ELIMINAR_MEDICAMENTO',    'Eliminar/Desactivar Medicamentos', 'Inventario'),
('CONFIGURAR_LEALTAD',      'Configurar Programa de Lealtad',   'Inventario'),
('AJUSTAR_PUNTOS_LEALTAD',  'Ajustar Puntos de Lealtad',        'Inventario')
ON CONFLICT DO NOTHING;

-- ── Retrocompatibilidad: dar nuevos permisos a roles con equivalente antiguo ─
-- Roles con VER_CAJA → reciben también VER_LEALTAD, GESTIONAR_CAJA
INSERT INTO rol_permisos (idRol, idPermiso)
SELECT rp.idRol, 'VER_LEALTAD'
FROM rol_permisos rp
WHERE rp.idPermiso = 'VER_CAJA'
ON CONFLICT DO NOTHING;

INSERT INTO rol_permisos (idRol, idPermiso)
SELECT rp.idRol, 'GESTIONAR_CAJA'
FROM rol_permisos rp
WHERE rp.idPermiso = 'VER_CAJA'
ON CONFLICT DO NOTHING;

-- Roles con VER_POS → reciben ANULAR_VENTA
INSERT INTO rol_permisos (idRol, idPermiso)
SELECT rp.idRol, 'ANULAR_VENTA'
FROM rol_permisos rp
WHERE rp.idPermiso = 'VER_POS'
ON CONFLICT DO NOTHING;

-- Roles con VER_REPORTES → reciben EXPORTAR_REPORTES
INSERT INTO rol_permisos (idRol, idPermiso)
SELECT rp.idRol, 'EXPORTAR_REPORTES'
FROM rol_permisos rp
WHERE rp.idPermiso = 'VER_REPORTES'
ON CONFLICT DO NOTHING;

-- Roles con VER_INVENTARIO → reciben ELIMINAR_MEDICAMENTO
INSERT INTO rol_permisos (idRol, idPermiso)
SELECT rp.idRol, 'ELIMINAR_MEDICAMENTO'
FROM rol_permisos rp
WHERE rp.idPermiso = 'VER_INVENTARIO'
ON CONFLICT DO NOTHING;
