/**
 * offlineSync.ts
 * Servicio de precarga proactiva de cache offline.
 * Al hacer login (o reconectarse), precarga TODOS los endpoints críticos
 * en IndexedDB para que el usuario pueda acceder a cualquier módulo sin internet.
 */

import { offlineDB } from './offlineDB';

const CACHE_TTL_MASTER  = 24 * 60 * 60 * 1000; // 24h — datos maestros (categorías, roles, etc.)
const CACHE_TTL_TRANSAC =       60 * 60 * 1000; // 1h  — datos transaccionales (ventas, reparaciones)

interface WarmEndpoint {
  key: string;
  url: string;
  ttl: number;
}

// Lista completa de endpoints de lectura que necesitan estar disponibles offline
export const WARM_ENDPOINTS: WarmEndpoint[] = [
  // POS e Inventario
  { key: 'cache:/productos/unificados',        url: '/api/productos/unificados',          ttl: CACHE_TTL_TRANSAC },
  { key: 'cache:/inventory/telefonos',         url: '/api/inventory/telefonos',           ttl: CACHE_TTL_TRANSAC },
  { key: 'cache:/inventory/stock',             url: '/api/inventory/stock',               ttl: CACHE_TTL_TRANSAC },
  { key: 'cache:/inventory/accesorios-master', url: '/api/inventory/accesorios-master',   ttl: CACHE_TTL_MASTER  },
  { key: 'cache:/inventory/categorias',        url: '/api/inventory/categorias',          ttl: CACHE_TTL_MASTER  },
  { key: 'cache:/inventory/ubicaciones',       url: '/api/inventory/ubicaciones',         ttl: CACHE_TTL_MASTER  },
  // Clientes
  { key: 'cache:/clientes',                    url: '/api/clientes',                      ttl: CACHE_TTL_TRANSAC },
  // Servicios post-venta
  { key: 'cache:/reparaciones',                url: '/api/reparaciones',                  ttl: CACHE_TTL_TRANSAC },
  { key: 'cache:/garantias',                   url: '/api/garantias',                     ttl: CACHE_TTL_TRANSAC },
  { key: 'cache:/consignaciones',              url: '/api/consignaciones',                ttl: CACHE_TTL_TRANSAC },
  // Finanzas
  { key: 'cache:/arqueo/active',               url: '/api/arqueo/active',                 ttl: CACHE_TTL_TRANSAC },
  { key: 'cache:/saldos/today',                url: '/api/saldos/today',                  ttl: CACHE_TTL_TRANSAC },
  // Datos maestros
  { key: 'cache:/proveedores',                 url: '/api/proveedores',                   ttl: CACHE_TTL_MASTER  },
  { key: 'cache:/paquetes',                    url: '/api/paquetes',                      ttl: CACHE_TTL_MASTER  },
  { key: 'cache:/costos',                      url: '/api/costos',                        ttl: CACHE_TTL_MASTER  },
  { key: 'cache:/config',                      url: '/api/config',                        ttl: CACHE_TTL_MASTER  },
  { key: 'cache:/labels',                      url: '/api/labels',                        ttl: CACHE_TTL_MASTER  },
  // Admin
  { key: 'cache:/roles',                       url: '/api/roles',                         ttl: CACHE_TTL_MASTER  },
  { key: 'cache:/permisos',                    url: '/api/permisos',                      ttl: CACHE_TTL_MASTER  },
  { key: 'cache:/cajas',                       url: '/api/cajas',                         ttl: CACHE_TTL_MASTER  },
  { key: 'cache:/empleados',                   url: '/api/empleados',                     ttl: CACHE_TTL_MASTER  },
  { key: 'cache:/users',                       url: '/api/users',                         ttl: CACHE_TTL_MASTER  },
];

async function fetchAndCache(ep: WarmEndpoint): Promise<void> {
  const token = localStorage.getItem('sc_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(ep.url, { headers });
    if (res.ok) {
      const data = await res.json();
      await offlineDB.cacheData(ep.key, data);
    }
  } catch {
    // Silencioso — si no hay red, simplemente no cachea
  }
}

/**
 * Precarga todos los endpoints críticos en IndexedDB.
 * Se llama al hacer login. No bloquea la UI (es async en background).
 */
export async function warmAllCaches(): Promise<void> {
  if (!navigator.onLine) return;
  const BATCH = 5; // Lotes para no saturar la red
  for (let i = 0; i < WARM_ENDPOINTS.length; i += BATCH) {
    await Promise.allSettled(WARM_ENDPOINTS.slice(i, i + BATCH).map(fetchAndCache));
  }
}

/**
 * Refresca solo los endpoints cuyo cache ha vencido.
 * Se llama al reconectarse y cada 15 minutos.
 */
export async function refreshStaleCaches(): Promise<void> {
  if (!navigator.onLine) return;
  const checks = await Promise.all(
    WARM_ENDPOINTS.map(async ep => {
      const age = await offlineDB.getCacheAge(ep.key);
      return age === null || age > ep.ttl ? ep : null;
    })
  );
  const stale = checks.filter((ep): ep is WarmEndpoint => ep !== null);
  await Promise.allSettled(stale.map(fetchAndCache));
}

let warmInterval: ReturnType<typeof setInterval> | null = null;

/** Inicia el refresco periódico de caches (cada 15 minutos). */
export function startPeriodicWarm(): void {
  if (warmInterval) return;
  warmInterval = setInterval(() => {
    if (navigator.onLine) refreshStaleCaches();
  }, 15 * 60 * 1000);
}

/** Detiene el refresco periódico. */
export function stopPeriodicWarm(): void {
  if (warmInterval) {
    clearInterval(warmInterval);
    warmInterval = null;
  }
}
