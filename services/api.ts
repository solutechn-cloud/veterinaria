
import {
  Proveedor,
  Cliente,
  Venta,
  VentaPayload,
  Cotizacion,
  CotizacionPayload,
  CotizacionResumen,
  VentaResumen,
  DetalleVenta,
  Arqueo,
  LabelTemplate,
  Tenant,
  TenantStats,
  CreateTenantPayload,
  AIMedicationAnalysisResult,
  AIMedicationImagePayload,
  AISymptomRecommendationPayload,
  AISymptomRecommendationResult,
  EstadoEntrega,
  EntregaSucursal,
  LoyaltyConfig,
  LoyaltyAccount,
  LoyaltyTransaction,
  LoyaltyPreview,
  LoyaltyAccountList,
  LoyaltyStats,
  Paciente,
  Cita,
  TipoCita,
  AgendaDisponibilidad,
  AgendaSlot,
  AgendaVeterinario,
  Consulta,
  VacunaProtocolo,
  VacunaAplicada,
  RecordatorioVet,
  ServicioVeterinario,
  ConsultorioBusquedaItem,
  ConsultorioEvento,
  ConsultorioPacienteDetalle,
  ConsultorioTipo,
} from '../types';
import { offlineDB } from './offlineDB';
import { getAccessToken, getCurrentSucursalId, getCurrentTenantId, setAccessToken, setStoredUser } from './authSession';

const API_URL = (() => {
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl) return String(envUrl).replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port === '5173') {
    return 'http://localhost:3000/api';
  }
  return '/api';
})();

// Error especial para operaciones encoladas offline (mantenido por compatibilidad)
export class OfflineQueuedError extends Error {
  constructor() { super('OFFLINE_QUEUED'); this.name = 'OfflineQueuedError'; }
}

// Mapa de colecciones: prefijo de endpoint → campo ID + clave de cache
const ENTITY_MAP: { prefix: string; idField: string; cacheKey?: string }[] = [
  { prefix: '/ventas',                       idField: 'codVenta', cacheKey: '/ventas/historial' },
  { prefix: '/cotizaciones',                 idField: 'codigo' },
  { prefix: '/clientes',                     idField: 'identidad' },
  { prefix: '/proveedores',                  idField: 'id' },
  { prefix: '/empleados',                    idField: 'id' },
  { prefix: '/users',                        idField: 'id' },
  { prefix: '/roles',                        idField: 'id' },
  { prefix: '/cajas',                        idField: 'id' },
  { prefix: '/labels',                       idField: 'id' },
  { prefix: '/medicamentos',                 idField: 'codigo' },
  { prefix: '/ordenes-compra',               idField: 'codigo' },
  { prefix: '/transferencias',               idField: 'codigo' },
  { prefix: '/sucursales',                   idField: 'id_sucursal' },
  { prefix: '/pacientes',                    idField: 'id_paciente' },
  { prefix: '/citas',                        idField: 'id_cita' },
  { prefix: '/consultas',                    idField: 'id_consulta' },
  { prefix: '/servicios-veterinarios',       idField: 'id_servicio' },
];

interface EndpointInfo { collection: string; urlId: string | null; idField: string; cacheKey: string; }

async function readJsonResponse(response: Response, endpoint: string): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();

  const text = await response.text();
  const looksLikeHtml = text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html');
  if (looksLikeHtml) {
    console.error('[API Error]', endpoint, 'La ruta devolvio HTML en vez de JSON. Revise que el backend este reiniciado y que el proxy apunte a /api.');
    throw new Error('El servidor devolvio una pagina HTML en vez de datos JSON. Reinicie el backend y recargue la aplicacion.');
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || 'Respuesta invalida del servidor.');
  }
}

function parseEndpoint(endpoint: string, method: string): EndpointInfo | null {
  const sorted = [...ENTITY_MAP].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const col of sorted) {
    if (endpoint === col.prefix || endpoint.startsWith(col.prefix + '/') || endpoint.startsWith(col.prefix + '?')) {
      const rest = endpoint.slice(col.prefix.length);
      const urlId = method !== 'POST' && rest.startsWith('/')
        ? (rest.slice(1).split('/')[0].split('?')[0] || null)
        : null;
      return { collection: col.prefix, urlId, idField: col.idField, cacheKey: col.cacheKey || col.prefix };
    }
  }
  return null;
}

// Returns a tenant-scoped prefix for IndexedDB cache keys so data from
// different tenants on the same browser never collides.
function getCacheTenantPrefix(): string {
  const tenantId = getCurrentTenantId();
  return tenantId ? `t:${tenantId}:` : '';
}

// request helper function — offline-aware
export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const method = (options.method || 'GET').toUpperCase();
  const isRead = method === 'GET';
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  // Sin red: responder INMEDIATAMENTE desde IndexedDB sin tocar la red
  if (!navigator.onLine) {
    if (!isRead) {
      const parsedBody = options.body ? JSON.parse(options.body as string) : null;
      const queueTenantId = getCurrentTenantId();
      await offlineDB.addToQueue(method, `${API_URL}${endpoint}`, parsedBody, queueTenantId);

      // Escritura optimista: parchear el cache local para que la UI vea el cambio inmediatamente
      const epInfo = parseEndpoint(endpoint, method);
      let tempResult: any = parsedBody || {};

      if (epInfo) {
        const tempId = `LOCAL_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const tp = getCacheTenantPrefix();

        if (method === 'POST') {
          // Para ventas, el caller espera { codVenta }
          if (epInfo.collection === '/ventas') {
            tempResult = { codVenta: tempId, _offline: true };
          } else {
            tempResult = { ...parsedBody, [epInfo.idField]: tempId, _offline: true };
          }
          // patchCacheByPrefix cubre tanto cache:/ingresos como cache:/ingresos?idCaja=x&fecha=y
          await offlineDB.patchCacheByPrefix(`cache:${tp}${epInfo.cacheKey}`, 'POST', null, tempResult, epInfo.idField);
        } else if (method === 'PUT' || method === 'PATCH') {
          await offlineDB.patchCacheByPrefix(`cache:${tp}${epInfo.cacheKey}`, 'PUT', epInfo.urlId, parsedBody, epInfo.idField);
          tempResult = parsedBody || {};
        } else if (method === 'DELETE') {
          await offlineDB.patchCacheByPrefix(`cache:${tp}${epInfo.cacheKey}`, 'DELETE', epInfo.urlId, null, epInfo.idField);
          tempResult = {};
        }
      }

      window.dispatchEvent(new CustomEvent('smartcloud:write-queued', { detail: { endpoint, method } }));
      return tempResult as T;
    }
    // GET offline → cache directo, sin fetch
    const cachedOffline = await offlineDB.getCachedData<T>(`cache:${getCacheTenantPrefix()}${endpoint}`);
    if (cachedOffline !== null) {
      window.dispatchEvent(new CustomEvent('smartcloud:cache-fallback', { detail: { endpoint } }));
      return cachedOffline;
    }
    throw new Error('Sin conexión. No hay datos en cache para este módulo.');
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers, credentials: 'include' });
    if (!response.ok) {
      const errorData = await readJsonResponse(response, endpoint).catch(() => ({}));
      // Si el token expiró, intentar refresh silencioso y reintentar una vez
      if (response.status === 401 && errorData.code === 'TOKEN_EXPIRED') {
        try {
          const refreshRes = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            setAccessToken(refreshData.token);
            setStoredUser(refreshData.user);
            window.dispatchEvent(new CustomEvent('smartcloud:token-refreshed', { detail: refreshData }));
            // Reintentar con el nuevo token
            const retryHeaders = { ...headers, 'Authorization': `Bearer ${refreshData.token}` };
            const retryResponse = await fetch(`${API_URL}${endpoint}`, { ...options, headers: retryHeaders, credentials: 'include' });
            if (retryResponse.ok) return readJsonResponse(retryResponse, endpoint) as Promise<T>;
          }
        } catch { /* si falla el refresh, continuar al throw original */ }
      }
      // No exponer detalles internos de errores 5xx al cliente
      if (response.status >= 500) {
        const dbMsg = errorData?.error || errorData?.message || '';
        console.error('[API Error]', endpoint, dbMsg || errorData);
        throw new Error(dbMsg || 'Error interno del servidor. Por favor contacte al administrador.');
      }
      throw new Error(errorData.error || `Error ${response.status}`);
    }
    const data = await readJsonResponse(response, endpoint);
    // Cachear respuestas GET en IndexedDB para uso offline (tenant-scoped key)
    if (isRead) {
      offlineDB.cacheData(`cache:${getCacheTenantPrefix()}${endpoint}`, data).catch(() => {});
    }
    return data;
  } catch (err) {
    if (err instanceof OfflineQueuedError) throw err;
    // Fallback a cache IndexedDB para GETs (ej: red inestable, timeout)
    if (isRead) {
      const cached = await offlineDB.getCachedData<T>(`cache:${getCacheTenantPrefix()}${endpoint}`);
      if (cached !== null) {
        window.dispatchEvent(new CustomEvent('smartcloud:cache-fallback', { detail: { endpoint } }));
        return cached;
      }
    }
    throw err;
  }
}

export const InventoryService = {
  getUnifiedProducts: (params?: { q?: string; id_sucursal?: number; include_zero_stock?: '1' }) => {
    const paramsWithSucursal = { id_sucursal: getCurrentSucursalId(), ...(params || {}) };
    const query = new URLSearchParams(Object.entries(paramsWithSucursal).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString();
    const qs = query ? `?${query}` : '';
    return request<any[]>(`/productos/unificados${qs}`);
  },

  getProveedores: () => request<Proveedor[]>('/proveedores'),
  createProveedor: (data: Partial<Proveedor>) => request('/proveedores', { method: 'POST', body: JSON.stringify(data) }),
  updateProveedor: (id: string, data: Partial<Proveedor>) => request(`/proveedores/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProveedor: (id: string) => request(`/proveedores/${id}`, { method: 'DELETE' }),
};

export const ClientService = {
  getAll: () => request<Cliente[]>('/clientes'),
  create: (data: Cliente) => request('/clientes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Cliente>) => request(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/clientes/${id}`, { method: 'DELETE' }),
};

export const PacientesService = {
  getAll: (params?: { q?: string; id_tutor?: string; estado?: string; especie?: string; sexo?: string; alertas?: string; limit?: number; offset?: number }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
    return request<Paciente[]>(`/pacientes${qs}`);
  },
  getByTutor: (idTutor: string) => request<Paciente[]>(`/tutores/${encodeURIComponent(idTutor)}/pacientes`),
  getById: (id: number) => request<Paciente>(`/pacientes/${id}`),
  create: (data: Partial<Paciente>) => request<{ id_paciente: number }>('/pacientes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Paciente>) => request(`/pacientes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  addPeso: (id: number, data: { peso: number; notas?: string }) => request(`/pacientes/${id}/pesos`, { method: 'POST', body: JSON.stringify(data) }),
};

export const CitasService = {
  getTipos: () => request<TipoCita[]>('/tipos-cita'),
  createTipo: (data: Partial<TipoCita>) => request<TipoCita>('/tipos-cita', { method: 'POST', body: JSON.stringify(data) }),
  getAll: (params?: { fecha_desde?: string; fecha_hasta?: string; estado?: string; id_paciente?: number; id_veterinario?: string; id_sucursal?: number }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
    return request<Cita[]>(`/citas${qs}`);
  },
  create: (data: Partial<Cita>) => request<{ id_cita: number }>('/citas', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Cita>) => request(`/citas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateEstado: (id: number, estado: Cita['estado']) => request(`/citas/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado }) }),
  checkIn: (id: number) => request(`/citas/${id}/check-in`, { method: 'POST' }),
  getFlowboard: (fecha?: string) => request<Cita[]>(`/clinica/flowboard${fecha ? `?fecha=${fecha}` : ''}`),
  getVeterinarios: () => request<AgendaVeterinario[]>('/agenda/veterinarios'),
  getDisponibilidad: (params?: { id_veterinario?: string; id_sucursal?: number; dia_semana?: number; activo?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
    return request<AgendaDisponibilidad[]>(`/agenda/disponibilidad${qs}`);
  },
  createDisponibilidad: (data: Partial<AgendaDisponibilidad>) => request<AgendaDisponibilidad>('/agenda/disponibilidad', { method: 'POST', body: JSON.stringify(data) }),
  updateDisponibilidad: (id: number, data: Partial<AgendaDisponibilidad>) => request(`/agenda/disponibilidad/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDisponibilidad: (id: number) => request(`/agenda/disponibilidad/${id}`, { method: 'DELETE' }),
  getSlots: (params: { fecha: string; id_veterinario: string; id_sucursal?: number; duracion?: number }) => {
    const qs = '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();
    return request<{ modo: string; slots: AgendaSlot[] }>(`/agenda/disponibilidad/slots${qs}`);
  },
};

export const ConsultasService = {
  getAll: (params?: { id_paciente?: number; estado?: string; q?: string; desde?: string; hasta?: string; limit?: number; offset?: number }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
    return request<Consulta[]>(`/consultas${qs}`);
  },
  getById: (id: number) => request<Consulta>(`/consultas/${id}`),
  create: (data: Partial<Consulta>) => request<{ id_consulta: number }>('/consultas', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Consulta>) => request(`/consultas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

export const VacunasService = {
  getProtocolos: () => request<VacunaProtocolo[]>('/vacunas/protocolos'),
  createProtocolo: (data: Partial<VacunaProtocolo>) => request<VacunaProtocolo>('/vacunas/protocolos', { method: 'POST', body: JSON.stringify(data) }),
  getAplicadas: (params?: { id_paciente?: number; desde?: string; hasta?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
    return request<VacunaAplicada[]>(`/vacunas/aplicadas${qs}`);
  },
  aplicar: (data: Partial<VacunaAplicada> & {
    id_paciente: number;
    nombre_vacuna: string;
    id_presentacion?: number | string | null;
    cantidad?: number;
    precio_unitario?: number;
    tipo_isv?: 'exento' | '15' | '18';
    generar_cotizacion?: boolean;
    generar_cargo?: boolean;
    preparar_cobro?: boolean;
    observaciones_cotizacion?: string;
    valido_hasta?: string | null;
  }) =>
    request<{ id_vacuna_aplicada: number; codigo_cotizacion?: string | null }>('/vacunas/aplicar', { method: 'POST', body: JSON.stringify(data) }),
};

export const RecordatoriosService = {
  getAll: (params?: { estado?: string; tipo?: string; id_paciente?: number }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
    return request<RecordatorioVet[]>(`/recordatorios${qs}`);
  },
  enviar: (id: number) => request(`/recordatorios/${id}/enviar`, { method: 'POST' }),
};

export const ConsultorioService = {
  search: (params?: { q?: string; limit?: number; offset?: number }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
    return request<ConsultorioBusquedaItem[]>(`/consultorio/search${qs}`);
  },
  getProfesionales: (params?: { q?: string; limit?: number }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
    return request<any[]>(`/consultorio/catalogos/profesionales${qs}`);
  },
  getLaboratorioPruebas: (params?: { q?: string; limit?: number }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
    return request<any[]>(`/consultorio/catalogos/laboratorio-pruebas${qs}`);
  },
  createLaboratorioPrueba: (data: { nombre: string; categoria?: string; descripcion?: string }) =>
    request<any>('/consultorio/catalogos/laboratorio-pruebas', { method: 'POST', body: JSON.stringify(data) }),
  getPaciente: (id: number) => request<ConsultorioPacienteDetalle>(`/consultorio/pacientes/${id}`),
  getTimeline: (id: number, params?: { tipo?: ConsultorioTipo; q?: string; limit?: number; offset?: number }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
    return request<ConsultorioEvento[]>(`/consultorio/pacientes/${id}/timeline${qs}`);
  },
  getEventos: (id: number, params?: { tipo?: ConsultorioTipo; q?: string; desde?: string; hasta?: string; limit?: number; offset?: number }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
    return request<ConsultorioEvento[]>(`/consultorio/pacientes/${id}/eventos${qs}`);
  },
  createEvento: (id: number, data: Partial<ConsultorioEvento>) =>
    request<ConsultorioEvento>(`/consultorio/pacientes/${id}/eventos`, { method: 'POST', body: JSON.stringify(data) }),
  updateEvento: (id: number, data: Partial<ConsultorioEvento>) =>
    request<ConsultorioEvento>(`/consultorio/eventos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEvento: (id: number) =>
    request<{ message: string; id_evento: number }>(`/consultorio/eventos/${id}`, { method: 'DELETE' }),
  uploadAdjunto: (id: number, data: { filename: string; mime: string; size: number; base64: string; tipo?: string; categoria?: string }) =>
    request<any>(`/consultorio/pacientes/${id}/adjuntos`, { method: 'POST', body: JSON.stringify(data) }),
};

export const ServiciosVeterinariosService = {
  getAll: (params?: { q?: string; categoria?: string; activo?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
    return request<ServicioVeterinario[]>(`/servicios-veterinarios${qs}`);
  },
  create: (data: Partial<ServicioVeterinario>) => request<ServicioVeterinario>('/servicios-veterinarios', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ServicioVeterinario>) => request(`/servicios-veterinarios/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

export const SalesService = {
  getVentasDiDaily: (fecha?: string) => request<Venta[]>(`/ventas/historial${fecha ? `?fecha=${fecha}` : ''}`),
  getVenta: (id: string) => request<Venta>(`/ventas/${id}`),
  createVenta: (data: VentaPayload) => request<{codVenta: string; numeroFactura?: string | null; tipoDocumento?: string}>('/ventas', { method: 'POST', body: JSON.stringify(data) }),
  updateVenta: (id: string, data: VentaPayload) => request<{codVenta: string}>(`/ventas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getDetallesVenta: (id: string) => request<DetalleVenta[]>(`/ventas/${id}/detalles`),
  anularVenta: (id: string) => request(`/ventas/${id}/anular`, { method: 'PUT' }),
  buscar: (desde: string, hasta: string, q?: string) =>
    request<VentaResumen[]>(`/ventas/buscar?desde=${desde}&hasta=${hasta}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
};

export const QuoteService = {
  create: (data: CotizacionPayload) =>
    request<{ codigo: string; codCotizacion?: string }>('/cotizaciones', { method: 'POST', body: JSON.stringify(data) }),
  get: (id: string) => request<Cotizacion>(`/cotizaciones/${id}`),
  getDetalles: (id: string) => request<DetalleVenta[]>(`/cotizaciones/${id}/detalles`),
  list: (desde: string, hasta: string, estado?: string, q?: string) =>
    request<CotizacionResumen[]>(`/cotizaciones?desde=${desde}&hasta=${hasta}${estado ? `&estado=${estado}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  updateEstado: (id: string, estado: string) =>
    request(`/cotizaciones/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado }) }),
};


export const CashService = {
  getActiveArqueo: () => request<Arqueo | null>('/arqueo/active'),
  getSessionDetails: (idArqueo: string) => request<{arqueo: Arqueo, ventas: any[]}>(`/arqueo/${idArqueo}/details`),
  openCaja: (data: any) => request('/arqueo/open', { method: 'POST', body: JSON.stringify(data) }),
  closeCaja: (idArqueo: string) => request<{resumen: any}>('/arqueo/close', { method: 'POST', body: JSON.stringify({ idArqueo }) }),
  getAdminBoxesStatus: () => request<any[]>('/admin/boxes/status'),
  getBoxHistory: (idCaja: string) => request<any[]>(`/admin/boxes/${idCaja}/history`),
  reopenCaja: (idArqueo: string) => request(`/admin/arqueo/${idArqueo}/reopen`, { method: 'PUT' }),
  updateInitialAmount: (idArqueo: string, montoInicial: number) => request(`/arqueo/${idArqueo}/initial`, { method: 'PUT', body: JSON.stringify({ montoInicial }) }),
};

export const ReportsService = {
  getSalesTrend: (year: number) => request<any[]>(`/reports/sales-trend?year=${year}`),
  getTopProducts: (startDate: string, endDate: string) => request<any[]>(`/reports/top-products?startDate=${startDate}&endDate=${endDate}`),
  getInventoryValuation: () => request<any[]>('/reports/inventory-valuation'),
  getTopClients: (startDate: string, endDate: string) => request<any[]>(`/reports/top-clients?startDate=${startDate}&endDate=${endDate}`),
  getDailySales: (startDate: string, endDate: string) => request<any[]>(`/reports/daily-sales?startDate=${startDate}&endDate=${endDate}`),
  getKpiSummary: (startDate: string, endDate: string) => request<any>(`/reports/kpi-summary?startDate=${startDate}&endDate=${endDate}`),
  getSalesBySeller: (startDate: string, endDate: string) => request<any[]>(`/reports/sales-by-seller?startDate=${startDate}&endDate=${endDate}`),
  sendMonthly: () => request<any>('/reports/send-monthly', { method: 'POST' }),
};

export const DashboardService = {
  getMe: () => request<any>('/dashboard/me'),
  getAdmin: () => request<any>(`/dashboard/admin?year=${new Date().getFullYear()}`),
  getCashier: () => request<any>('/dashboard/cashier'),
  getInventory: () => request<any>('/dashboard/inventory'),
  getFinance: () => request<any>('/dashboard/finance'),
};

export const AdminService = {
  getUsers: () => request<any[]>('/users'),
  createUser: (data: any) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: string) => request(`/users/${id}`, { method: 'DELETE' }),
  getEmpleados: (id_sucursal?: number) => request<any[]>(`/empleados${id_sucursal ? `?id_sucursal=${id_sucursal}` : ''}`),
  createEmpleado: (data: any) => request('/empleados', { method: 'POST', body: JSON.stringify(data) }),
  updateEmpleado: (id: string, data: any) => request(`/empleados/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  transferirEmpleado: (id: string, id_sucursal_destino: number, nueva_idCaja?: string) =>
    request(`/empleados/${id}/transferir`, { method: 'POST', body: JSON.stringify({ id_sucursal_destino, nueva_idCaja }) }),
  deleteEmpleado: (id: string) => request(`/empleados/${id}`, { method: 'DELETE' }),
  getRoles: () => request<any[]>('/roles'),
  createRol: (data: any) => request('/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRol: (id: string, data: any) => request(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRol: (id: string) => request(`/roles/${id}`, { method: 'DELETE' }),
  getPermisos: () => request<any[]>('/permisos'),
  getCajas: (id_sucursal?: number) => request<any[]>(`/cajas${id_sucursal ? `?id_sucursal=${id_sucursal}` : ''}`),
  createCaja: (nombre: string, id_sucursal: number) => request('/cajas', { method: 'POST', body: JSON.stringify({ nombre, id_sucursal }) }),
  updateCaja: (id: string, data: any) => request(`/cajas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCaja: (id: string) => request(`/cajas/${id}`, { method: 'DELETE' }),
  getSchema: () => request('/schema'),
};


export const ConfigService = {
  get: () => request<any>('/config'),
  update: (data: any) => request('/config', { method: 'PUT', body: JSON.stringify(data) }),
};

export interface AutomationEvent {
  key: string;
  label: string;
  category: string;
  recommendedTime: string;
  description: string;
}

export interface AutomationRecipientEvent {
  eventKey: string;
  enabled: boolean;
  scheduledTime?: string | null;
}

export interface AutomationRecipient {
  id: number;
  nombre: string;
  email: string;
  tipo: 'persona' | 'grupo';
  activo: boolean;
  cargo?: string | null;
  telefono?: string | null;
  descripcion?: string | null;
  notas?: string | null;
  events: AutomationRecipientEvent[];
}

export interface BackupJob {
  id: number;
  tenant_id: string | null;
  scope: string;
  provider: string;
  estado: 'Pendiente' | 'Ejecutando' | 'Completado' | 'Error';
  object_key?: string | null;
  size_bytes?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
  created_at: string;
}

export const AutomationService = {
  getEvents: () => request<AutomationEvent[]>('/admin/automation/events'),
  getRecipients: () => request<AutomationRecipient[]>('/admin/automation/recipients'),
  createRecipient: (data: Partial<AutomationRecipient>) =>
    request<AutomationRecipient>('/admin/automation/recipients', { method: 'POST', body: JSON.stringify(data) }),
  updateRecipient: (id: number, data: Partial<AutomationRecipient>) =>
    request<AutomationRecipient>(`/admin/automation/recipients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateRecipientEvents: (id: number, events: AutomationRecipientEvent[]) =>
    request<void>(`/admin/automation/recipients/${id}/events`, { method: 'PUT', body: JSON.stringify({ events }) }),
  deleteRecipient: (id: number) => request<void>(`/admin/automation/recipients/${id}`, { method: 'DELETE' }),
  getBackups: () => request<BackupJob[]>('/admin/automation/backups'),
  runBackupNow: () => request<any>('/admin/automation/backup-now', { method: 'POST' }),
};

export const LabelService = {
  getAll: () => request<LabelTemplate[]>('/labels'),
  getDefault: (category: string) => request<LabelTemplate>(`/labels/default?category=${category}`),
  create: (data: Partial<LabelTemplate>) => request('/labels', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<LabelTemplate>) => request(`/labels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/labels/${id}`, { method: 'DELETE' }),
};


export const AuthService = {
  login: (usuario: string, password: string, tenantSlug: string) =>
    request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usuario, password, tenantSlug }),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

// ─── SAAS SERVICE ─────────────────────────────────────────────────────────────

// Helper to make requests using the super-admin token instead of the regular user token
async function saasRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const adminToken = localStorage.getItem('saas_admin_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {}),
    ...((options.headers || {}) as Record<string, string>),
  };
  const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Error ${response.status}`);
  }
  const json = await response.json();
  return ((json as any).data ?? json) as T;
}

function mapTenantRow(row: any): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    nombreEmpresa: row.nombre_empresa ?? row.nombreEmpresa ?? '',
    emailContacto: row.email_contacto ?? row.emailContacto ?? '',
    telefono: row.telefono,
    pais: row.pais ?? '',
    plan: row.plan,
    estado: row.estado,
    maxSucursales: row.max_sucursales ?? row.maxSucursales ?? 0,
    maxUsuarios: row.max_usuarios ?? row.maxUsuarios ?? 0,
    maxMedicamentos: row.max_medicamentos ?? row.maxMedicamentos ?? 0,
    fechaInicio: row.fecha_inicio ?? row.fechaInicio ?? row.created_at ?? '',
    fechaVencimiento: row.fecha_vencimiento ?? row.fechaVencimiento,
    createdAt: row.created_at ?? row.createdAt ?? '',
  };
}

export class SaasService {
  static async adminLogin(secret: string): Promise<{ token: string }> {
    const response = await fetch(`${API_URL}/saas/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Credenciales incorrectas');
    }
    const json = await response.json();
    const payload = (json as any).data ?? json;
    return { token: payload.token };
  }

  static async getTenants(): Promise<Tenant[]> {
    const rows = await saasRequest<any[]>('/saas/tenants');
    return rows.map(mapTenantRow);
  }

  static async createTenant(data: CreateTenantPayload): Promise<Tenant> {
    const payload = {
      slug: data.slug,
      nombre_empresa: data.nombreEmpresa,
      plan: data.plan,
      admin_email: data.adminUsuario,
      admin_password: data.adminPassword,
      max_sucursales: data.maxSucursales,
      max_usuarios: data.maxUsuarios,
      max_medicamentos: data.maxMedicamentos,
      fecha_vencimiento: data.fechaVencimiento || null,
    };
    const result = await saasRequest<{ tenant: any; roles: any[]; admin: any }>('/saas/tenants', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return mapTenantRow(result.tenant);
  }

  static async updateTenant(id: string, data: Partial<Tenant>): Promise<Tenant> {
    const payload: Record<string, any> = {};
    if (data.nombreEmpresa !== undefined) payload.nombre_empresa = data.nombreEmpresa;
    if (data.plan !== undefined) payload.plan = data.plan;
    if (data.estado !== undefined) payload.estado = data.estado;
    if (data.maxSucursales !== undefined) payload.max_sucursales = data.maxSucursales;
    if (data.maxUsuarios !== undefined) payload.max_usuarios = data.maxUsuarios;
    if (data.maxMedicamentos !== undefined) payload.max_medicamentos = data.maxMedicamentos;
    if (data.fechaVencimiento !== undefined) payload.fecha_vencimiento = data.fechaVencimiento;
    const row = await saasRequest<any>(`/saas/tenants/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return mapTenantRow(row);
  }

  static suspendTenant(id: string): Promise<void> {
    return saasRequest<void>(`/saas/tenants/${id}/suspend`, { method: 'POST' });
  }

  static activateTenant(id: string): Promise<void> {
    return saasRequest<void>(`/saas/tenants/${id}/activate`, { method: 'POST' });
  }

  static async getTenantStats(id: string): Promise<TenantStats> {
    const result = await saasRequest<{ tenant: any; stats: any }>(`/saas/tenants/${id}/stats`);
    const s = result.stats;
    return {
      tenantId: result.tenant?.id ?? id,
      totalUsuarios: s.usuarios ?? 0,
      totalSucursales: s.sucursales ?? 0,
      totalMedicamentos: s.medicamentos ?? 0,
      totalVentasMes: s.ventas_monto ?? 0,
      totalVentasHoy: 0,
    };
  }

  static async checkSlugAvailable(slug: string): Promise<boolean> {
    const result = await saasRequest<{ available: boolean }>(`/saas/tenants/check-slug?slug=${encodeURIComponent(slug)}`);
    return result.available;
  }

  static async getTenantAIQuota(id: string): Promise<AIQuotaStatus & { ai_habilitado: boolean }> {
    const result = await saasRequest<{ data: any }>(`/saas/tenants/${id}/ai-quota`);
    return (result as any).data ?? result;
  }

  static async updateTenantAIQuota(id: string, data: {
    ai_habilitado?: boolean;
    ai_tokens_override?: number | null;
    ai_requests_override?: number | null;
    ai_req_diario_override?: number | null;
  }): Promise<void> {
    await saasRequest<void>(`/saas/tenants/${id}/ai-quota`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  static async getAIQuotaPlans(): Promise<any[]> {
    const result = await saasRequest<{ data: any[] }>('/saas/ai/quota-plans');
    return (result as any).data ?? result;
  }
}

export interface AppNotification {
  id: number;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  leida: boolean;
  fecha_creacion: string;
  fecha_lectura: string | null;
  para_usuario: string | null;
}

export const NotificationService = {
  getAll: () => request<AppNotification[]>('/notifications'),
  getUnreadCount: () => request<{ count: number }>('/notifications/unread-count'),
  markRead: (id: number) => request<void>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request<void>('/notifications/read-all', { method: 'PATCH' }),
  remove: (id: number) => request<void>(`/notifications/${id}`, { method: 'DELETE' }),
  broadcast: (data: { titulo: string; cuerpo?: string; tipo?: string }) =>
    request<{ ok: boolean; notification: AppNotification }>('/notifications/broadcast', { method: 'POST', body: JSON.stringify(data) }),
};

export type MessagingStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'failed' | 'cancelled';

export interface MessagingMessage {
  id: number;
  channel: 'email';
  source: string | null;
  eventKey: string | null;
  templateKey: string | null;
  fromEmail: string | null;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  status: MessagingStatus;
  provider: string;
  providerMessageId: string | null;
  relatedTable: string | null;
  relatedId: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  failedAt: string | null;
  attempts: number;
  lastError: string | null;
  metadata: Record<string, any>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessagingEvent {
  id: number;
  eventType: string;
  providerEventId: string | null;
  payload: Record<string, any>;
  occurredAt: string;
  createdAt: string;
}

export interface MessagingListResponse {
  data: MessagingMessage[];
  total: number;
  page: number;
  pageSize: number;
  summary: Record<string, number>;
}

export interface MessagingFilters {
  q?: string;
  status?: string;
  eventKey?: string;
  desde?: string;
  hasta?: string;
  page?: number;
  pageSize?: number;
}

export interface MessagingMetricCount {
  key: string;
  label: string;
  total: number;
}

export interface MessagingDailyMetric {
  day: string;
  total: number;
  sent: number;
  failed: number;
}

export interface MessagingCampaignMetric {
  id: number;
  name: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  scheduledAt: string | null;
  sentAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface MessagingFailureMetric {
  id: number;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  status: string;
  eventKey: string | null;
  lastError: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessagingAnalytics {
  range: { desde: string; hasta: string };
  totals: {
    total: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    failed: number;
    inProcess: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    failureRate: number;
  };
  byStatus: MessagingMetricCount[];
  byEvent: MessagingMetricCount[];
  bySource: MessagingMetricCount[];
  providerEvents: MessagingMetricCount[];
  dailyTrend: MessagingDailyMetric[];
  campaigns: {
    summary: {
      total: number;
      scheduled: number;
      sent: number;
      failed: number;
      totalRecipients: number;
      sentCount: number;
      failedCount: number;
      skippedCount: number;
    };
    top: MessagingCampaignMetric[];
    upcoming: MessagingCampaignMetric[];
  };
  recentFailures: MessagingFailureMetric[];
}

export type MessagingCampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
export type MessagingAudienceType =
  | 'all_tutors'
  | 'active_patients'
  | 'recent_tutors'
  | 'appointment_upcoming'
  | 'appointment_tomorrow'
  | 'vaccines_due'
  | 'vaccines_next_30'
  | 'inactive_tutors'
  | 'species_canine'
  | 'species_feline';

export interface MessagingCampaign {
  id: number;
  name: string;
  subject: string;
  body: string;
  audienceType: MessagingAudienceType;
  templateId: number | null;
  status: MessagingCampaignStatus;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  metadata: Record<string, any>;
  createdBy: string | null;
  scheduledAt: string | null;
  queuedAt: string | null;
  sentAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessagingCampaignRecipient {
  id: number;
  campaignId: number;
  clienteId: string | null;
  recipientEmail: string;
  recipientName: string | null;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  messageId: number | null;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessagingCampaignListResponse {
  data: MessagingCampaign[];
  total: number;
  page: number;
  pageSize: number;
}

export type MessagingTemplateCategory = 'marketing' | 'clinical' | 'operations' | 'reports' | 'custom';

export interface MessagingTemplate {
  id: number;
  name: string;
  category: MessagingTemplateCategory;
  subject: string;
  body: string;
  active: boolean;
  systemKey: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessagingTemplateListResponse {
  data: MessagingTemplate[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MessagingAudienceDefinition {
  value: MessagingAudienceType;
  label: string;
  hint: string;
  group: string;
}

export interface MessagingAudiencePreview {
  audienceType: MessagingAudienceType;
  total: number;
  definition?: MessagingAudienceDefinition | null;
  sample: Array<{ clienteId: string; recipientEmail: string; recipientName: string }>;
}

export type MessagingAutomationFrequency = 'daily' | 'weekly' | 'monthly';
export type MessagingAutomationStatus = 'active' | 'paused' | 'archived';
export type MessagingAutomationSendMode = 'schedule' | 'send_now';

export interface MessagingAutomationRule {
  id: number;
  name: string;
  audienceType: MessagingAudienceType;
  templateId: number;
  templateName: string | null;
  templateSubject: string | null;
  frequency: MessagingAutomationFrequency;
  runTime: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  sendMode: MessagingAutomationSendMode;
  status: MessagingAutomationStatus;
  metadata: Record<string, any>;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessagingAutomationRun {
  id: number;
  automationId: number;
  campaignId: number | null;
  campaignName: string | null;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  recipientsCount: number;
  error: string | null;
  metadata: Record<string, any>;
  startedAt: string;
  finishedAt: string | null;
}

function toQuery(params: Record<string, any>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  const value = query.toString();
  return value ? `?${value}` : '';
}

export const MessagingService = {
  getAnalytics: (filters: { desde?: string; hasta?: string } = {}) =>
    request<MessagingAnalytics>(`/messaging/analytics${toQuery(filters)}`),
  getMessages: (filters: MessagingFilters = {}) =>
    request<MessagingListResponse>(`/messaging/messages${toQuery(filters)}`),
  getEvents: (id: number) =>
    request<MessagingEvent[]>(`/messaging/messages/${id}/events`),
  resend: (id: number) =>
    request<{ success: boolean; providerMessageId?: string }>(`/messaging/messages/${id}/resend`, { method: 'POST' }),
  sendManual: (data: { to: string; subject: string; body: string }) =>
    request<{ success: boolean; id?: number }>('/messaging/messages', { method: 'POST', body: JSON.stringify(data) }),
  getTemplates: (filters: { q?: string; category?: string; active?: boolean; page?: number; pageSize?: number } = {}) =>
    request<MessagingTemplateListResponse>(`/messaging/templates${toQuery(filters)}`),
  createTemplate: (data: { name: string; category: MessagingTemplateCategory; subject: string; body: string }) =>
    request<MessagingTemplate>('/messaging/templates', { method: 'POST', body: JSON.stringify(data) }),
  updateTemplate: (id: number, data: Partial<{ name: string; category: MessagingTemplateCategory; subject: string; body: string; active: boolean }>) =>
    request<MessagingTemplate>(`/messaging/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  archiveTemplate: (id: number) =>
    request<MessagingTemplate>(`/messaging/templates/${id}`, { method: 'DELETE' }),
  getCampaigns: (filters: { q?: string; status?: string; page?: number; pageSize?: number } = {}) =>
    request<MessagingCampaignListResponse>(`/messaging/campaigns${toQuery(filters)}`),
  getAudienceOptions: () =>
    request<MessagingAudienceDefinition[]>('/messaging/campaigns/audience/options'),
  previewAudience: (audienceType: MessagingAudienceType) =>
    request<MessagingAudiencePreview>(`/messaging/campaigns/audience/preview${toQuery({ audienceType })}`),
  getAutomations: () =>
    request<MessagingAutomationRule[]>('/messaging/automations'),
  createAutomation: (data: Partial<MessagingAutomationRule>) =>
    request<MessagingAutomationRule>('/messaging/automations', { method: 'POST', body: JSON.stringify(data) }),
  updateAutomation: (id: number, data: Partial<MessagingAutomationRule>) =>
    request<MessagingAutomationRule>(`/messaging/automations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  runAutomation: (id: number) =>
    request<MessagingAutomationRun>(`/messaging/automations/${id}/run`, { method: 'POST' }),
  getAutomationRuns: (id: number) =>
    request<MessagingAutomationRun[]>(`/messaging/automations/${id}/runs`),
  createCampaign: (data: { name: string; subject: string; body: string; audienceType: MessagingAudienceType; templateId?: number | null; scheduledAt?: string | null }) =>
    request<MessagingCampaign>('/messaging/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  updateCampaign: (id: number, data: Partial<{ name: string; subject: string; body: string; audienceType: MessagingAudienceType; templateId: number | null; scheduledAt: string | null }>) =>
    request<MessagingCampaign>(`/messaging/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  scheduleCampaign: (id: number, scheduledAt: string) =>
    request<MessagingCampaign>(`/messaging/campaigns/${id}/schedule`, { method: 'POST', body: JSON.stringify({ scheduledAt }) }),
  cancelCampaign: (id: number) =>
    request<MessagingCampaign>(`/messaging/campaigns/${id}/cancel`, { method: 'POST' }),
  sendCampaign: (id: number) =>
    request<MessagingCampaign>(`/messaging/campaigns/${id}/send`, { method: 'POST' }),
  getCampaignRecipients: (id: number) =>
    request<MessagingCampaignRecipient[]>(`/messaging/campaigns/${id}/recipients`),
};

export type AuditTransactionsFiltro = {
  startDate: string;
  endDate: string;
  estado?: string;
  numeroFactura?: string;
  limit?: number;
  offset?: number;
};

export type AuditTransactionsListado = {
  rows: any[];
  total: number;
  limit: number;
  offset: number;
};

export const AccountingService = {
  getAuditTransactions: (filtro: AuditTransactionsFiltro) => {
    const params = new URLSearchParams();
    Object.entries(filtro).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    });
    return request<AuditTransactionsListado>(`/accounting/audit/transactions?${params.toString()}`);
  },
  getProfitabilityReport: (startDate: string, endDate: string) => request<any>(`/accounting/report/profitability?startDate=${startDate}&endDate=${endDate}`),
};

export interface AIQuotaStatus {
  plan: string;
  ai_habilitado: boolean;
  periodo: string;
  tokens_consumidos: number;
  tokens_limite: number;
  pct_tokens_usado: number;
  requests_totales: number;
  requests_limite: number;
  requests_hoy: number;
  req_diario_limite: number;
  procesos_habilitados: string[];
  estado: 'ok' | 'alerta' | 'agotado' | 'deshabilitado';
}

export const AIService = {
  analyzeMedicationImages: (data: { images?: AIMedicationImagePayload[]; imageIds?: number[]; context?: Record<string, any> }) =>
    request<AIMedicationAnalysisResult>('/ai/medicamentos/analyze-images', { method: 'POST', body: JSON.stringify(data) }),
  analyzeClient: (idCliente: string) =>
    request<any>('/ai/analizar-cliente', { method: 'POST', body: JSON.stringify({ idCliente }) }),
  checkAnomaly: (idArqueo: string) =>
    request<any>(`/ai/anomaly-check/${idArqueo}`),
  recomendarPorSintomas: (data: any) =>
    request<any>('/ai/recomendar-por-sintomas', { method: 'POST', body: JSON.stringify(data) }),
  recommendBySymptoms: (data: AISymptomRecommendationPayload) =>
    request<AISymptomRecommendationResult>('/ai/recommendations/symptoms', { method: 'POST', body: JSON.stringify(data) }),
  verificarInteracciones: (data: { medicamento_nuevo: string; id_cliente?: string }) =>
    request<any>('/ai/verificar-interacciones', { method: 'POST', body: JSON.stringify(data) }),
  predecirReabastecimiento: (codMedicamento: string) =>
    request<any>(`/ai/predecir-reabastecimiento/${codMedicamento}`),
  getQuotaStatus: () =>
    request<AIQuotaStatus>('/ai/quota/status'),
  requestTokenUpgrade: (data: { paquete_solicitado: string; motivo?: string }) =>
    request<{ message: string; id: number; created_at: string }>('/ai/quota/request-upgrade', { method: 'POST', body: JSON.stringify(data) }),
  getUpgradeRequests: () =>
    request<any[]>('/ai/quota/upgrade-requests'),
};

// ─── SERVICIOS VETERINARIA ──────────────────────────────────────────────────────
import type {
  Medicamento, PresentacionVenta, LoteMedicamento, ImagenMedicamento,
  AlertaVencimiento, StockCritico, Sucursal,
  CategoriaTerapeutica, FormaFarmaceutica, ViaAdministracion
} from '../types';

export const MedicamentosService = {
  getAll: (params?: { q?: string; id_categoria?: number; tipo_isv?: string; requiere_receta?: boolean; es_controlado?: boolean; estado_catalogo?: string; id_sucursal?: number | null }) => {
    const paramsWithSucursal = { id_sucursal: getCurrentSucursalId(), ...(params || {}) };
    const qs = '?' + new URLSearchParams(Object.entries(paramsWithSucursal).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString();
    return request<Medicamento[]>(`/medicamentos${qs}`);
  },
  getById: (id: string) => request<Medicamento>(`/medicamentos/${id}`),
  create: (data: Partial<Medicamento>) => request<{ mensaje: string; codigo: string }>('/medicamentos', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Medicamento>) => request(`/medicamentos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/medicamentos/${id}`, { method: 'DELETE' }),

  getPresentaciones: (id: string) => request<PresentacionVenta[]>(`/medicamentos/${id}/presentaciones`),
  createPresentacion: (id: string, data: Partial<PresentacionVenta>) => request<{ id_presentacion: number }>(`/medicamentos/${id}/presentaciones`, { method: 'POST', body: JSON.stringify(data) }),
  updatePresentacion: (id: number, data: Partial<PresentacionVenta>) => request(`/presentaciones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePresentacion: (id: number) => request(`/presentaciones/${id}`, { method: 'DELETE' }),

  getLotesAll: (id_sucursal?: number | null) => {
    const sucursalId = id_sucursal === undefined ? getCurrentSucursalId() : id_sucursal;
    const qs = sucursalId ? `?id_sucursal=${sucursalId}` : '';
    return request<any[]>(`/medicamentos/lotes/all${qs}`);
  },
  getLotes: (id: string, id_sucursal?: number | null) => {
    const sucursalId = id_sucursal === undefined ? getCurrentSucursalId() : id_sucursal;
    const qs = sucursalId ? `?id_sucursal=${sucursalId}` : '';
    return request<LoteMedicamento[]>(`/medicamentos/${id}/lotes${qs}`);
  },
  createLote: (id: string, data: any) => request<{ id_lote: number }>(`/medicamentos/${id}/lotes`, { method: 'POST', body: JSON.stringify(data) }),
  updateLote: (id: number, data: any) => request(`/lotes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLote: (id: number, motivo?: string) => request(`/lotes/${id}`, { method: 'DELETE', body: JSON.stringify({ motivo }) }),

  getImagenes: (id: string) => request<ImagenMedicamento[]>(`/medicamentos/${id}/imagenes`),
  createImagen: (id: string, data: Partial<ImagenMedicamento>) => request<{ id_imagen: number }>(`/medicamentos/${id}/imagenes`, { method: 'POST', body: JSON.stringify(data) }),
  deleteImagen: (id: number) => request(`/medicamentos/imagenes/${id}`, { method: 'DELETE' }),
  setPrincipalImagen: (id: number) => request(`/medicamentos/imagenes/${id}/set-principal`, { method: 'PATCH' }),

  getAlertasVencimiento: (dias = 90, id_sucursal?: number | null) => {
    const sucursalId = id_sucursal === undefined ? getCurrentSucursalId() : id_sucursal;
    const qs = `?dias=${dias}${sucursalId ? `&id_sucursal=${sucursalId}` : ''}`;
    return request<AlertaVencimiento[]>(`/medicamentos/alertas/vencimientos${qs}`);
  },
  getStockCritico: (id_sucursal?: number | null) => {
    const sucursalId = id_sucursal === undefined ? getCurrentSucursalId() : id_sucursal;
    return request<StockCritico[]>(`/medicamentos/alertas/stock-critico${sucursalId ? `?id_sucursal=${sucursalId}` : ''}`);
  },
  getDisponibilidadSucursales: (codigo: string) =>
    request<any[]>(`/medicamentos/${codigo}/disponibilidad-sucursales`),
};

export const CatalogoService = {
  getCategorias: () => request<CategoriaTerapeutica[]>('/categorias-terapeuticas'),
  createCategoria: (data: Partial<CategoriaTerapeutica>) => request('/categorias-terapeuticas', { method: 'POST', body: JSON.stringify(data) }),
  updateCategoria: (id: number, data: any) => request(`/categorias-terapeuticas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getFormas: () => request<FormaFarmaceutica[]>('/formas-farmaceuticas'),
  createForma: (data: Partial<FormaFarmaceutica>) => request('/formas-farmaceuticas', { method: 'POST', body: JSON.stringify(data) }),
  updateForma: (id: number, data: any) => request(`/formas-farmaceuticas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getVias: () => request<ViaAdministracion[]>('/vias-administracion'),
  createVia: (data: Partial<ViaAdministracion>) => request('/vias-administracion', { method: 'POST', body: JSON.stringify(data) }),
  updateVia: (id: number, data: any) => request(`/vias-administracion/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getPrincipios: (q?: string) => request<any[]>(`/principios-activos${q ? `?q=${encodeURIComponent(q)}` : ''}`),
};

export const SucursalesService = {
  getAll: () => request<Sucursal[]>('/sucursales'),
  getById: (id: number) => request<Sucursal>(`/sucursales/${id}`),
  getSummary: (id: number) => request<any>(`/sucursales/${id}/summary`),
  create: (data: Partial<Sucursal>) => request<{ id_sucursal: number; codigo: string }>('/sucursales', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Sucursal>) => request(`/sucursales/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

export const TransferenciasService = {
  getAll: (params?: { id_sucursal?: number; estado?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString() : '';
    return request<any[]>(`/transferencias${qs}`);
  },
  create: (data: any) => request<{ codigo: string }>('/transferencias', { method: 'POST', body: JSON.stringify(data) }),
  updateEstado: (codigo: string, estado: 'Aceptada' | 'Rechazada') =>
    request(`/transferencias/${codigo}/estado`, { method: 'PUT', body: JSON.stringify({ estado }) }),
};

export const EntregasService = {
  getPendientes: (estado: EstadoEntrega | 'TODAS' = 'Pendiente') =>
    request<EntregaSucursal[]>(`/entregas/pendientes?estado=${estado}`),
  marcarEntregado: (id: number, notas?: string) =>
    request<{ ok: boolean }>(`/entregas/${id}/marcar-entregado`,
      { method: 'PATCH', body: JSON.stringify({ notas }) }),
  cancelar: (id: number, notas?: string) =>
    request<{ ok: boolean }>(`/entregas/${id}/cancelar`,
      { method: 'PATCH', body: JSON.stringify({ notas }) }),
};

export const LoyaltyService = {
  getConfig: (idSucursal?: number) => {
    const qs = idSucursal != null ? `?id_sucursal=${idSucursal}` : '';
    return request<LoyaltyConfig>(`/loyalty/config${qs}`);
  },
  getAllConfigs: () => request<LoyaltyConfig[]>('/loyalty/configs'),
  saveConfig: (data: Partial<LoyaltyConfig> & { idSucursal?: number | null }) =>
    request<LoyaltyConfig>('/loyalty/config', { method: 'PUT', body: JSON.stringify(data) }),

  getAccount: (identidad: string) =>
    request<LoyaltyAccount & { preview: LoyaltyPreview }>(`/loyalty/account/${encodeURIComponent(identidad)}`),
  getAccounts: (params?: { limit?: number; offset?: number; search?: string }) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ).toString() : '';
    return request<LoyaltyAccountList>(`/loyalty/accounts${qs}`);
  },

  getTransactions: (identidad: string, limit?: number) => {
    const qs = limit ? `?limit=${limit}` : '';
    return request<LoyaltyTransaction[]>(`/loyalty/transactions/${encodeURIComponent(identidad)}${qs}`);
  },

  preview: (identidadCliente: string, totalAmount: number, idSucursal?: number) =>
    request<LoyaltyPreview>('/loyalty/preview', {
      method: 'POST',
      body: JSON.stringify({ identidadCliente, totalAmount, idSucursal }),
    }),
  earn: (identidadCliente: string, codVenta: string, amount: number, idSucursal?: number) =>
    request<{ ok: boolean; puntosGanados: number; puntosDespues: number; tierActual: string }>(
      '/loyalty/earn',
      { method: 'POST', body: JSON.stringify({ identidadCliente, codVenta, amount, idSucursal }) }
    ),
  redeem: (identidadCliente: string, codVenta: string, puntos: number, idSucursal?: number) =>
    request<{ ok: boolean; puntosUsados: number; valorDescuento: number; puntosDespues: number }>(
      '/loyalty/redeem',
      { method: 'POST', body: JSON.stringify({ identidadCliente, codVenta, puntos, idSucursal }) }
    ),
  reverse: (codVenta: string) =>
    request<{ ok: boolean; redReversals: number; earnReversals: number }>(
      '/loyalty/reverse',
      { method: 'POST', body: JSON.stringify({ codVenta }) }
    ),
  adjust: (accountId: number, delta: number, descripcion?: string) =>
    request<{ ok: boolean; puntosAntes: number; puntosDespues: number }>(
      '/loyalty/adjust',
      { method: 'POST', body: JSON.stringify({ accountId, delta, descripcion }) }
    ),
  getStats: () => request<LoyaltyStats>('/loyalty/stats'),
};

export const OrdenesCompraService = {
  getAll: (params?: any) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString() : '';
    return request<any[]>(`/ordenes-compra${qs}`);
  },
  create: (data: any) => request<{ codigo: string }>('/ordenes-compra', { method: 'POST', body: JSON.stringify(data) }),
  updateEstado: (codigo: string, estado: string) =>
    request(`/ordenes-compra/${codigo}/estado`, { method: 'PUT', body: JSON.stringify({ estado }) }),
};
