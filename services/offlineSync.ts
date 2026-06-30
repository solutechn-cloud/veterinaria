/**
 * offlineSync.ts
 * Servicio de precarga proactiva de cache offline.
 * Al hacer login (o reconectarse), precarga TODOS los endpoints críticos
 * en IndexedDB para que el usuario pueda acceder a cualquier módulo sin internet.
 */

import { offlineDB } from './offlineDB';
import { getAccessToken, getCurrentTenantId, getStoredUser } from './authSession';

const CACHE_TTL_MASTER  = 24 * 60 * 60 * 1000; // 24h — datos maestros (categorías, roles, etc.)
const CACHE_TTL_TRANSAC =       60 * 60 * 1000; // 1h  — datos transaccionales (ventas, reparaciones)

interface WarmEndpoint {
  key: string;
  url: string;
  ttl: number;
  permission?: string;
}

const API_ORIGIN = (() => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port === '5173') {
    return 'http://localhost:3000';
  }
  return '';
})();

// Lista completa de endpoints de lectura que necesitan estar disponibles offline
export const WARM_ENDPOINTS: WarmEndpoint[] = [
  // Veterinaria — catálogo y ventas
  { key: 'cache:/medicamentos',                url: '/api/medicamentos',                  ttl: CACHE_TTL_TRANSAC, permission: 'VER_INVENTARIO' },
  { key: 'cache:/productos/unificados',        url: '/api/productos/unificados',          ttl: CACHE_TTL_TRANSAC, permission: 'VER_POS' },
  // Clientes y proveedores
  { key: 'cache:/clientes',                    url: '/api/clientes',                      ttl: CACHE_TTL_TRANSAC, permission: 'VER_CLIENTES' },
  { key: 'cache:/proveedores',                 url: '/api/proveedores',                   ttl: CACHE_TTL_MASTER,  permission: 'VER_PROVEEDORES' },
  // Finanzas
  { key: 'cache:/arqueo/active',               url: '/api/arqueo/active',                 ttl: CACHE_TTL_TRANSAC, permission: 'VER_CAJA' },
  // Datos maestros
  { key: 'cache:/config',                      url: '/api/config',                        ttl: CACHE_TTL_MASTER  },
  { key: 'cache:/labels',                      url: '/api/labels',                        ttl: CACHE_TTL_MASTER,  permission: 'DISEÑAR_ETIQUETAS' },
  // Admin
  { key: 'cache:/roles',                       url: '/api/roles',                         ttl: CACHE_TTL_MASTER,  permission: 'GESTIONAR_ROLES' },
  { key: 'cache:/cajas',                       url: '/api/cajas',                         ttl: CACHE_TTL_MASTER,  permission: 'GESTIONAR_PANEL_CAJAS' },
  { key: 'cache:/empleados',                   url: '/api/empleados',                     ttl: CACHE_TTL_MASTER,  permission: 'GESTIONAR_USUARIOS' },
  { key: 'cache:/users',                       url: '/api/users',                         ttl: CACHE_TTL_MASTER,  permission: 'GESTIONAR_USUARIOS' },
];

function tenantCacheKey(key: string): string {
  const tenantId = getCurrentTenantId();
  return tenantId ? `cache:t:${tenantId}:${key.replace(/^cache:/, '')}` : key;
}

function hasPermission(permission?: string): boolean {
  if (!permission) return true;
  const user = getStoredUser();
  if (!user) return false;
  const role = String(user.rol || '').toLowerCase();
  if (role === 'administrador' || role === 'admin' || role === 'superadmin') return true;
  return Array.isArray(user.permisos) && user.permisos.includes(permission);
}

async function fetchAndCache(ep: WarmEndpoint): Promise<void> {
  if (!hasPermission(ep.permission)) return;
  const token = getAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const url = ep.url.startsWith('/api') ? `${API_ORIGIN}${ep.url}` : ep.url;
    const res = await fetch(url, { headers, credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      await offlineDB.cacheData(tenantCacheKey(ep.key), data);
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
      const age = await offlineDB.getCacheAge(tenantCacheKey(ep.key));
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
