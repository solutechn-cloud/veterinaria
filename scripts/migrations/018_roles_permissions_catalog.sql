-- 018: Catalogo completo y normalizado de roles/permisos para la plataforma veterinaria.
-- Inserta permisos faltantes, corrige nombres/modulos existentes y migra IDs corruptos de etiquetas.

INSERT INTO permisos (idPermiso, nombre, modulo) VALUES
    ('VER_POS',                    'Ver Punto de Venta',                 'Comercial'),
    ('ANULAR_VENTA',               'Anular Ventas',                      'Comercial'),
    ('VER_CLIENTES',               'Ver Tutores',                        'Comercial'),
    ('VER_SERVICIOS_VET',          'Ver Servicios Veterinarios',         'Comercial'),
    ('GESTIONAR_SERVICIOS_VET',    'Gestionar Servicios Veterinarios',   'Comercial'),
    ('VER_RECETAS',                'Ver Recetas Veterinarias',           'Comercial'),
    ('AUTORIZAR_PSICOFARMACOS',    'Autorizar Psicofarmacos',            'Comercial'),

    ('VER_PACIENTES',              'Ver Pacientes',                      'Clinica'),
    ('GESTIONAR_PACIENTES',        'Gestionar Pacientes',                'Clinica'),
    ('VER_CITAS',                  'Ver Agenda y Citas',                 'Clinica'),
    ('GESTIONAR_CITAS',            'Gestionar Agenda y Citas',           'Clinica'),
    ('VER_FLOWBOARD',              'Ver Flowboard Clinico',              'Clinica'),
    ('VER_EXPEDIENTE',             'Ver Expediente Clinico',             'Clinica'),
    ('EDITAR_EXPEDIENTE',          'Editar Expediente Clinico',          'Clinica'),
    ('VER_VACUNAS',                'Ver Vacunas',                        'Clinica'),
    ('GESTIONAR_VACUNAS',          'Gestionar Vacunas',                  'Clinica'),
    ('VER_RECORDATORIOS',          'Ver Recordatorios',                  'Clinica'),
    ('GESTIONAR_RECORDATORIOS',    'Gestionar Recordatorios',            'Clinica'),

    ('VER_INVENTARIO',             'Ver Inventario Clinico',             'Inventario'),
    ('GESTIONAR_INVENTARIO',       'Gestionar Inventario Clinico',       'Inventario'),
    ('VER_VENCIMIENTOS',           'Ver Control de Vencimientos',        'Inventario'),
    ('VER_ORDENES_COMPRA',         'Ver Ordenes de Compra',              'Inventario'),
    ('GESTIONAR_ORDENES_COMPRA',   'Gestionar Ordenes de Compra',        'Inventario'),
    ('VER_TRANSFERENCIAS',         'Ver Transferencias',                 'Inventario'),
    ('GESTIONAR_TRANSFERENCIAS',   'Gestionar Transferencias',           'Inventario'),
    ('VER_ENTREGAS',               'Ver Entregas Sucursal',              'Inventario'),
    ('GESTIONAR_ENTREGAS',         'Gestionar Entregas Sucursal',        'Inventario'),
    ('VER_PROVEEDORES',            'Ver Proveedores',                    'Inventario'),
    ('ELIMINAR_MEDICAMENTO',       'Eliminar/Desactivar Productos',      'Inventario'),
    ('DISEÑAR_ETIQUETAS',          'Diseñar Etiquetas y Documentos',     'Inventario'),
    ('VER_LEALTAD',                'Ver Programa de Lealtad',            'Inventario'),
    ('CONFIGURAR_LEALTAD',         'Configurar Programa de Lealtad',     'Inventario'),
    ('AJUSTAR_PUNTOS_LEALTAD',     'Ajustar Puntos de Lealtad',          'Inventario'),

    ('VER_CAJA',                   'Ver Caja y Movimientos',             'Finanzas'),
    ('GESTIONAR_CAJA',             'Abrir/Cerrar Caja y Arqueos',        'Finanzas'),
    ('VER_CONTABILIDAD',           'Ver Contabilidad',                   'Finanzas'),
    ('VER_REPORTES',               'Ver Reportes',                       'Finanzas'),
    ('EXPORTAR_REPORTES',          'Exportar Reportes a PDF/Excel',      'Finanzas'),

    ('VER_ADMIN',                  'Ver Administracion',                 'Administracion'),
    ('VER_SUCURSALES',             'Ver Sucursales',                     'Administracion'),
    ('GESTIONAR_SUCURSALES',       'Gestionar Sucursales',               'Administracion'),
    ('VER_PANEL_CAJAS',            'Ver Panel de Cajas',                 'Administracion'),
    ('GESTIONAR_PANEL_CAJAS',      'Gestionar Panel de Cajas',           'Administracion'),
    ('GESTIONAR_CAJAS',            'Gestionar Cajas Registradoras',      'Administracion'),
    ('GESTIONAR_USUARIOS',         'Gestionar Usuarios y Empleados',     'Administracion'),
    ('GESTIONAR_ROLES',            'Gestionar Roles y Permisos',         'Administracion'),
    ('CONFIGURAR_EMPRESA',         'Configurar Empresa',                 'Administracion'),
    ('VER_AUTOMATIZACIONES',       'Ver Automatizaciones',               'Administracion'),
    ('GESTIONAR_AUTOMATIZACIONES', 'Gestionar Automatizaciones',         'Administracion'),
    ('VER_BACKUPS',                'Ver Backups',                        'Administracion'),
    ('GESTIONAR_BACKUPS',          'Gestionar Backups',                  'Administracion'),
    ('VER_IA_CUOTAS',              'Ver IA y Cuotas',                    'Administracion')
ON CONFLICT (idPermiso) DO UPDATE
SET nombre = EXCLUDED.nombre,
    modulo = EXCLUDED.modulo;

INSERT INTO rol_permisos (idRol, idPermiso)
SELECT rp.idRol, 'DISEÑAR_ETIQUETAS'
FROM rol_permisos rp
WHERE rp.idPermiso IN ('DISEÃ‘AR_ETIQUETAS', 'DISEÃƒâ€˜AR_ETIQUETAS', 'DISE?AR_ETIQUETAS')
ON CONFLICT DO NOTHING;

DELETE FROM rol_permisos
WHERE idPermiso IN ('DISEÃ‘AR_ETIQUETAS', 'DISEÃƒâ€˜AR_ETIQUETAS', 'DISE?AR_ETIQUETAS');

DELETE FROM permisos
WHERE idPermiso IN ('DISEÃ‘AR_ETIQUETAS', 'DISEÃƒâ€˜AR_ETIQUETAS', 'DISE?AR_ETIQUETAS');

INSERT INTO rol_permisos (idRol, idPermiso)
SELECT DISTINCT rp.idRol, v.new_perm
FROM rol_permisos rp
JOIN (VALUES
    ('VER_INVENTARIO',        'GESTIONAR_INVENTARIO'),
    ('VER_INVENTARIO',        'VER_VENCIMIENTOS'),
    ('VER_INVENTARIO',        'VER_ORDENES_COMPRA'),
    ('VER_INVENTARIO',        'GESTIONAR_ORDENES_COMPRA'),
    ('VER_INVENTARIO',        'VER_TRANSFERENCIAS'),
    ('VER_INVENTARIO',        'GESTIONAR_TRANSFERENCIAS'),
    ('VER_INVENTARIO',        'VER_ENTREGAS'),
    ('VER_INVENTARIO',        'GESTIONAR_ENTREGAS'),
    ('VER_CITAS',             'VER_FLOWBOARD'),
    ('VER_SERVICIOS_VET',     'GESTIONAR_SERVICIOS_VET'),
    ('VER_REPORTES',          'EXPORTAR_REPORTES'),
    ('VER_CAJA',              'GESTIONAR_CAJA'),
    ('GESTIONAR_PANEL_CAJAS', 'VER_SUCURSALES'),
    ('GESTIONAR_PANEL_CAJAS', 'GESTIONAR_SUCURSALES'),
    ('GESTIONAR_PANEL_CAJAS', 'VER_PANEL_CAJAS'),
    ('GESTIONAR_PANEL_CAJAS', 'GESTIONAR_CAJAS'),
    ('CONFIGURAR_EMPRESA',    'VER_AUTOMATIZACIONES'),
    ('CONFIGURAR_EMPRESA',    'GESTIONAR_AUTOMATIZACIONES'),
    ('CONFIGURAR_EMPRESA',    'VER_BACKUPS'),
    ('CONFIGURAR_EMPRESA',    'GESTIONAR_BACKUPS'),
    ('CONFIGURAR_EMPRESA',    'VER_IA_CUOTAS')
) AS v(old_perm, new_perm) ON rp.idPermiso = v.old_perm
ON CONFLICT DO NOTHING;

INSERT INTO rol_permisos (idRol, idPermiso)
SELECT r.idrol, p.idPermiso
FROM roles r
CROSS JOIN permisos p
WHERE LOWER(r.nombre) IN ('administrador', 'admin', 'superadmin')
  AND NOT EXISTS (
    SELECT 1
    FROM rol_permisos rp
    WHERE rp.idRol = r.idrol
      AND rp.idPermiso = p.idPermiso
  );
