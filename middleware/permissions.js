'use strict';

const APP_SHELL_PERMISSIONS = [
    'VER_POS',
    'VER_CAJA',
    'VER_INVENTARIO',
    'VER_REPORTES',
    'VER_CONTABILIDAD',
    'VER_ADMIN',
    'VER_CLIENTES',
    'VER_PROVEEDORES',
    'VER_PACIENTES',
    'VER_CITAS',
    'VER_AGENDA_PERSONAL',
    'VER_DISPONIBILIDAD_AGENDA',
    'VER_CONSULTORIO',
    'VER_VACUNAS',
    'VER_FLOWBOARD',
    'VER_SERVICIOS_VET',
    'VER_SUCURSALES',
    'VER_PANEL_CAJAS',
    'VER_VENCIMIENTOS',
    'VER_TRANSFERENCIAS',
    'VER_ENTREGAS',
    'VER_LEALTAD',
    'VER_ORDENES_COMPRA',
    'DISE\u00d1AR_ETIQUETAS',
    'CONFIGURAR_EMPRESA',
    'VER_MENSAJERIA',
    'VER_IA_CUOTAS',
    'GESTIONAR_USUARIOS',
    'GESTIONAR_ROLES',
    'GESTIONAR_CAJAS',
];

const ADMIN_DASHBOARD_PERMISSIONS = ['VER_REPORTES', 'VER_CONTABILIDAD', 'GESTIONAR_PANEL_CAJAS', 'VER_ADMIN'];

const PERMISSION_RULES = [
    { pattern: /^\/api\/accounting\b/,                 permission: 'VER_CONTABILIDAD'     },
    { pattern: /^\/api\/admin\/boxes\b/,               permission: 'GESTIONAR_PANEL_CAJAS' },
    { pattern: /^\/api\/admin\/arqueo\b/,              permission: 'GESTIONAR_PANEL_CAJAS' },
    { pattern: /^\/api\/admin\/automation\b/,          permissions: ['CONFIGURAR_EMPRESA', 'GESTIONAR_MENSAJERIA'] },
    { pattern: /^\/api\/admin\/security\/permission-audit\b/, permission: 'GESTIONAR_ROLES' },
    { pattern: /^\/api\/config\b/, methods: ['GET'],   permissions: APP_SHELL_PERMISSIONS },
    { pattern: /^\/api\/config\b/,                     permission: 'CONFIGURAR_EMPRESA'   },
    { pattern: /^\/api\/dashboard\/admin\b/,           permissions: ADMIN_DASHBOARD_PERMISSIONS },
    { pattern: /^\/api\/dashboard\/cashier\b/,         permissions: ['VER_POS', 'VER_CAJA'] },
    { pattern: /^\/api\/dashboard\/inventory\b/,       permission: 'VER_INVENTARIO'        },
    { pattern: /^\/api\/dashboard\/finance\b/,         permissions: ['VER_CONTABILIDAD', 'VER_REPORTES'] },
    { pattern: /^\/api\/dashboard\/me\b/,              permissions: APP_SHELL_PERMISSIONS },
    { pattern: /^\/api\/notifications\/(?:broadcast|test-daily-report|test-repair-ready|backup-now)\b/, permission: 'VER_ADMIN' },
    { pattern: /^\/api\/notifications\b/,              permissions: APP_SHELL_PERMISSIONS },
    { pattern: /^\/api\/messaging\/campaigns\/[^/]+\/send\b/, methods: ['POST'], permission: 'GESTIONAR_MENSAJERIA' },
    { pattern: /^\/api\/messaging\/campaigns\b/, methods: ['POST', 'PUT', 'PATCH', 'DELETE'], permission: 'GESTIONAR_MENSAJERIA' },
    { pattern: /^\/api\/messaging\/templates\b/, methods: ['POST', 'PUT', 'PATCH', 'DELETE'], permission: 'GESTIONAR_MENSAJERIA' },
    { pattern: /^\/api\/messaging\/messages\/[^/]+\/resend\b/, methods: ['POST'], permission: 'GESTIONAR_MENSAJERIA' },
    { pattern: /^\/api\/messaging\/messages\b/, methods: ['POST'], permission: 'GESTIONAR_MENSAJERIA' },
    { pattern: /^\/api\/messaging\b/,                  permission: 'VER_MENSAJERIA'       },
    { pattern: /^\/api\/users\b/,                      permission: 'GESTIONAR_USUARIOS'    },
    { pattern: /^\/api\/empleados\b/,                  permission: 'GESTIONAR_USUARIOS'    },
    { pattern: /^\/api\/roles\b/,                      permission: 'GESTIONAR_ROLES'       },
    { pattern: /^\/api\/permisos\b/,                   permission: 'GESTIONAR_ROLES'       },
    { pattern: /^\/api\/cajas\b/,                      permission: 'GESTIONAR_PANEL_CAJAS' },
    { pattern: /^\/api\/sucursales\b/, methods: ['GET'], permissions: ['GESTIONAR_PANEL_CAJAS', 'VER_CITAS', 'VER_INVENTARIO', 'VER_POS'] },
    { pattern: /^\/api\/sucursales\b/,                 permission: 'GESTIONAR_PANEL_CAJAS' },
    { pattern: /^\/api\/reports\b/,                    permission: 'VER_REPORTES'          },
    { pattern: /^\/api\/search\b/,                     permission: 'VER_REPORTES'          },
    { pattern: /^\/api\/schema\b/,                     permission: 'DISEÑAR_ETIQUETAS'     },
    { pattern: /^\/api\/labels\b/,                     permission: 'DISEÑAR_ETIQUETAS'     },
    { pattern: /^\/api\/proveedores\b/, methods: ['GET'], permissions: ['VER_PROVEEDORES', 'VER_INVENTARIO'] },
    { pattern: /^\/api\/proveedores\b/,                permission: 'VER_PROVEEDORES'       },
    { pattern: /^\/api\/clientes\b/, methods: ['GET'], permissions: ['VER_CLIENTES', 'VER_PACIENTES'] },
    { pattern: /^\/api\/clientes\b/, methods: ['POST', 'PUT', 'DELETE'], permissions: ['VER_CLIENTES', 'GESTIONAR_PACIENTES'] },
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
    { pattern: /^\/api\/cotizaciones\b/,               permission: 'VER_POS'               },
    { pattern: /^\/api\/productos\/unificados\b/,      permission: 'VER_POS'               },
    { pattern: /^\/api\/medicamentos\/[^/]+\/disponibilidad-sucursales\b/, permission: 'VER_POS' },
    { pattern: /^\/api\/arqueo\b/,                     permission: 'VER_CAJA'              },
    { pattern: /^\/api\/pagos-venta\b/,                permission: 'VER_CAJA'              },
    { pattern: /^\/api\/kardex\b/,                     permission: 'VER_CAJA'              },
    { pattern: /^\/api\/notificaciones\b/,             permission: 'VER_CAJA'              },
    { pattern: /^\/api\/ai\/quota\b/,                  permission: 'VER_IA_CUOTAS'         },
    { pattern: /^\/api\/ai\/medicamentos\b/,                  permission: 'VER_INVENTARIO'        },
    { pattern: /^\/api\/ai\/(?:recommendations\/symptoms|recomendar-por-sintomas|verificar-interacciones)\b/, permission: 'VER_INVENTARIO' },
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

const AUDIT_LIMIT = Math.max(10, parseInt(process.env.PERMISSIONS_AUDIT_LIMIT || '200', 10) || 200);
const permissionAudit = {
    unmatchedRequests: 0,
    firstSeenAt: null,
    lastSeenAt: null,
    routes: new Map(),
};

function isAdminRole(role) {
    return ['administrador', 'admin', 'superadmin'].includes(String(role || '').toLowerCase());
}

function isPermissionStrictMode() {
    return String(process.env.PERMISSIONS_STRICT_MODE || '').toLowerCase() === 'true';
}

function normalizeAuditPath(path) {
    return String(path || '')
        .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,36}(?=\/|$)/gi, '/:id')
        .replace(/\/[^/]*\d[^/]*(?=\/|$)/g, '/:id');
}

function recordUnmatchedPermissionRoute(method, path, user) {
    const now = new Date().toISOString();
    const normalizedPath = normalizeAuditPath(path);
    const key = `${method} ${normalizedPath}`;
    permissionAudit.unmatchedRequests += 1;
    permissionAudit.firstSeenAt = permissionAudit.firstSeenAt || now;
    permissionAudit.lastSeenAt = now;

    const current = permissionAudit.routes.get(key) || {
        method,
        path: normalizedPath,
        count: 0,
        firstSeenAt: now,
        lastSeenAt: now,
        lastRole: null,
    };
    current.count += 1;
    current.lastSeenAt = now;
    current.lastRole = user?.rol || null;
    permissionAudit.routes.set(key, current);

    if (current.count === 1 && permissionAudit.routes.size <= AUDIT_LIMIT) {
        console.warn(`[permissions] Endpoint protegido sin regla: ${key}. Defina una regla antes de activar PERMISSIONS_STRICT_MODE.`);
    }
}

function getPermissionGuardStats() {
    const routes = Array.from(permissionAudit.routes.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, AUDIT_LIMIT);
    return {
        strictMode: isPermissionStrictMode(),
        unmatchedRequests: permissionAudit.unmatchedRequests,
        unmatchedRouteCount: permissionAudit.routes.size,
        firstSeenAt: permissionAudit.firstSeenAt,
        lastSeenAt: permissionAudit.lastSeenAt,
        routes,
    };
}

function __resetPermissionGuardStatsForTests() {
    permissionAudit.unmatchedRequests = 0;
    permissionAudit.firstSeenAt = null;
    permissionAudit.lastSeenAt = null;
    permissionAudit.routes.clear();
}

function endpointPermissionGuard(req, res, next) {
    const method = String(req.method || '').toUpperCase();
    const path = req.originalUrl.split('?')[0];
    const rule = PERMISSION_RULES.find(r => {
        if (!r.pattern.test(path)) return false;
        if (!Array.isArray(r.methods)) return true;
        return r.methods.includes(method);
    });

    if (!rule) {
        recordUnmatchedPermissionRoute(method, path, req.user);
        if (!isPermissionStrictMode() || isAdminRole(req.user?.rol)) return next();
        return res.status(403).json({
            error: 'Acceso denegado: este endpoint no tiene una regla de permiso configurada',
            code: 'PERMISSION_RULE_MISSING',
            requiredPermission: 'PERMISSION_RULE_REQUIRED',
        });
    }

    if (isAdminRole(req.user?.rol)) return next();

    const permisos = Array.isArray(req.user?.permisos) ? req.user.permisos : [];
    const acceptedPermissions = rule.permissions || [rule.permission];
    if (acceptedPermissions.some(permission => permisos.includes(permission))) return next();

    return res.status(403).json({
        error: 'Acceso denegado: permiso insuficiente',
        requiredPermission: rule.permission || acceptedPermissions.join('|'),
    });
}

module.exports = { PERMISSION_RULES, endpointPermissionGuard, getPermissionGuardStats, isPermissionStrictMode, __resetPermissionGuardStatsForTests };
