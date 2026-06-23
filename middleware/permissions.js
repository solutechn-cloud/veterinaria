'use strict';

const PERMISSION_RULES = [
    { pattern: /^\/api\/accounting\b/,                 permission: 'VER_CONTABILIDAD'     },
    { pattern: /^\/api\/admin\/boxes\b/,               permission: 'GESTIONAR_PANEL_CAJAS' },
    { pattern: /^\/api\/admin\/arqueo\b/,              permission: 'GESTIONAR_PANEL_CAJAS' },
    { pattern: /^\/api\/users\b/,                      permission: 'GESTIONAR_USUARIOS'    },
    { pattern: /^\/api\/empleados\b/,                  permission: 'GESTIONAR_USUARIOS'    },
    { pattern: /^\/api\/roles\b/,                      permission: 'GESTIONAR_ROLES'       },
    { pattern: /^\/api\/permisos\b/,                   permission: 'GESTIONAR_ROLES'       },
    { pattern: /^\/api\/cajas\b/,                      permission: 'GESTIONAR_PANEL_CAJAS' },
    { pattern: /^\/api\/sucursales\b/,                 permission: 'GESTIONAR_PANEL_CAJAS' },
    { pattern: /^\/api\/reports\b/,                    permission: 'VER_REPORTES'          },
    { pattern: /^\/api\/search\b/,                     permission: 'VER_REPORTES'          },
    { pattern: /^\/api\/schema\b/,                     permission: 'DISEÑAR_ETIQUETAS'     },
    { pattern: /^\/api\/labels\b/,                     permission: 'DISEÑAR_ETIQUETAS'     },
    { pattern: /^\/api\/proveedores\b/,                permission: 'VER_PROVEEDORES'       },
    { pattern: /^\/api\/clientes\b/,                   permission: 'VER_CLIENTES'          },
    { pattern: /^\/api\/tutores\b/,                    permission: 'VER_PACIENTES'         },
    { pattern: /^\/api\/pacientes\b/,                  permission: 'VER_PACIENTES'         },
    { pattern: /^\/api\/citas\b/,                      permission: 'VER_CITAS'             },
    { pattern: /^\/api\/tipos-cita\b/,                 permission: 'VER_CITAS'             },
    { pattern: /^\/api\/consultas\b/,                  permission: 'VER_EXPEDIENTE'        },
    { pattern: /^\/api\/vacunas\b/,                    permission: 'VER_VACUNAS'           },
    { pattern: /^\/api\/recordatorios\b/,              permission: 'VER_CITAS'             },
    { pattern: /^\/api\/servicios-veterinarios\b/,     permission: 'VER_SERVICIOS_VET'     },
    { pattern: /^\/api\/clinica\/flowboard\b/,         permission: 'VER_CITAS'             },
    { pattern: /^\/api\/ventas\b/,                     permission: 'VER_POS'               },
    { pattern: /^\/api\/productos\/unificados\b/,      permission: 'VER_POS'               },
    { pattern: /^\/api\/medicamentos\/[^/]+\/disponibilidad-sucursales\b/, permission: 'VER_POS' },
    { pattern: /^\/api\/recetas\b/,                    permission: 'VER_RECETAS'           },
    { pattern: /^\/api\/recetas-retenidas\b/,          permission: 'VER_RECETAS'           },
    { pattern: /^\/api\/libro-psicofarmacos\b/,        permission: 'VER_RECETAS'           },
    { pattern: /^\/api\/arqueo\b/,                     permission: 'VER_CAJA'              },
    { pattern: /^\/api\/pagos-venta\b/,                permission: 'VER_CAJA'              },
    { pattern: /^\/api\/kardex\b/,                     permission: 'VER_CAJA'              },
    { pattern: /^\/api\/notificaciones\b/,             permission: 'VER_CAJA'              },
    { pattern: /^\/api\/ai\/medicamentos\b/,                  permission: 'VER_INVENTARIO'        },
    { pattern: /^\/api\/ai\/analizar-cliente\b/,              permission: 'VER_CLIENTES'          },
    { pattern: /^\/api\/ai\/anomaly-check\b/,                 permission: 'VER_CAJA'              },
    { pattern: /^\/api\/ai\/predecir-reabastecimiento\b/,     permission: 'VER_INVENTARIO'        },
    { pattern: /^\/api\/medicamentos\b/,               permission: 'VER_INVENTARIO'        },
    { pattern: /^\/api\/presentaciones\b/,             permission: 'VER_INVENTARIO'        },
    { pattern: /^\/api\/categorias-terapeuticas\b/,    permission: 'VER_INVENTARIO'        },
    { pattern: /^\/api\/formas-farmaceuticas\b/,       permission: 'VER_INVENTARIO'        },
    { pattern: /^\/api\/principios-activos\b/,         permission: 'VER_INVENTARIO'        },
    { pattern: /^\/api\/inventory\b/,                  permission: 'VER_INVENTARIO'        },
    { pattern: /^\/api\/transferencias\b/,             permission: 'VER_INVENTARIO'        },
    { pattern: /^\/api\/ordenes-compra\b/,             permission: 'VER_INVENTARIO'        },
    { pattern: /^\/api\/entregas\b/,                   permission: 'VER_INVENTARIO'        },
    { pattern: /^\/api\/loyalty\b/,                    permission: 'VER_LEALTAD'           },
];

function endpointPermissionGuard(req, res, next) {
    const rule = PERMISSION_RULES.find(r => r.pattern.test(req.originalUrl.split('?')[0]));
    if (!rule) return next();

    const role = String(req.user?.rol || '').toLowerCase();
    if (role === 'administrador' || role === 'admin' || role === 'superadmin') return next();

    const permisos = Array.isArray(req.user?.permisos) ? req.user.permisos : [];
    if (permisos.includes(rule.permission)) return next();

    return res.status(403).json({
        error: 'Acceso denegado: permiso insuficiente',
        requiredPermission: rule.permission,
    });
}

module.exports = { PERMISSION_RULES, endpointPermissionGuard };
