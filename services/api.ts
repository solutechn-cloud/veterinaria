
import {
  Telefono,
  Inventario,
  Accesorio,
  Categoria,
  Ubicacion,
  Proveedor,
  Cliente,
  Venta,
  VentaPayload,
  DetalleVenta,
  Arqueo,
  Ingreso,
  Egreso,
  Saldo,
  Costo,
  LabelTemplate,
  Socio,
  Reparacion,
  Consignacion,
  Garantia
} from '../types';
import { offlineDB } from './offlineDB';

const API_URL = '/api';

// Error especial para operaciones encoladas offline (mantenido por compatibilidad)
export class OfflineQueuedError extends Error {
  constructor() { super('OFFLINE_QUEUED'); this.name = 'OfflineQueuedError'; }
}

// Mapa de colecciones: prefijo de endpoint → campo ID + clave de cache
const ENTITY_MAP: { prefix: string; idField: string; cacheKey?: string }[] = [
  { prefix: '/inventory/telefonos',          idField: 'idTelefono' },
  { prefix: '/inventory/stock',              idField: 'idInventario' },
  { prefix: '/inventory/accesorios-master',  idField: 'id' },
  { prefix: '/inventory/categorias',         idField: 'id' },
  { prefix: '/inventory/ubicaciones',        idField: 'id' },
  { prefix: '/accounting/socios',            idField: 'id' },
  { prefix: '/ventas',                       idField: 'codVenta', cacheKey: '/ventas/historial' },
  { prefix: '/clientes',                     idField: 'identidad' },
  { prefix: '/reparaciones',                 idField: 'id' },
  { prefix: '/garantias',                    idField: 'id' },
  { prefix: '/consignaciones',               idField: 'id' },
  { prefix: '/proveedores',                  idField: 'id' },
  { prefix: '/paquetes',                     idField: 'id' },
  { prefix: '/costos',                       idField: 'id' },
  { prefix: '/ingresos',                     idField: 'id' },
  { prefix: '/egresos',                      idField: 'id' },
  { prefix: '/empleados',                    idField: 'id' },
  { prefix: '/users',                        idField: 'id' },
  { prefix: '/roles',                        idField: 'id' },
  { prefix: '/cajas',                        idField: 'id' },
  { prefix: '/labels',                       idField: 'id' },
];

interface EndpointInfo { collection: string; urlId: string | null; idField: string; cacheKey: string; }

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

// request helper function — offline-aware
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('sc_token');
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
      await offlineDB.addToQueue(method, `${API_URL}${endpoint}`, parsedBody);

      // Escritura optimista: parchear el cache local para que la UI vea el cambio inmediatamente
      const epInfo = parseEndpoint(endpoint, method);
      let tempResult: any = parsedBody || {};

      if (epInfo) {
        const tempId = `LOCAL_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

        if (method === 'POST') {
          // Para ventas, el caller espera { codVenta }
          if (epInfo.collection === '/ventas') {
            tempResult = { codVenta: tempId, _offline: true };
          } else {
            tempResult = { ...parsedBody, [epInfo.idField]: tempId, _offline: true };
          }
          // patchCacheByPrefix cubre tanto cache:/ingresos como cache:/ingresos?idCaja=x&fecha=y
          await offlineDB.patchCacheByPrefix(`cache:${epInfo.cacheKey}`, 'POST', null, tempResult, epInfo.idField);
        } else if (method === 'PUT' || method === 'PATCH') {
          await offlineDB.patchCacheByPrefix(`cache:${epInfo.cacheKey}`, 'PUT', epInfo.urlId, parsedBody, epInfo.idField);
          tempResult = parsedBody || {};
        } else if (method === 'DELETE') {
          await offlineDB.patchCacheByPrefix(`cache:${epInfo.cacheKey}`, 'DELETE', epInfo.urlId, null, epInfo.idField);
          tempResult = {};
        }
      }

      window.dispatchEvent(new CustomEvent('smartcloud:write-queued', { detail: { endpoint, method } }));
      return tempResult as T;
    }
    // GET offline → cache directo, sin fetch
    const cachedOffline = await offlineDB.getCachedData<T>(`cache:${endpoint}`);
    if (cachedOffline !== null) {
      window.dispatchEvent(new CustomEvent('smartcloud:cache-fallback', { detail: { endpoint } }));
      return cachedOffline;
    }
    throw new Error('Sin conexión. No hay datos en cache para este módulo.');
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // Si el token expiró, intentar refresh silencioso y reintentar una vez
      if (response.status === 401 && errorData.code === 'TOKEN_EXPIRED') {
        const storedRefresh = localStorage.getItem('sc_refresh');
        if (storedRefresh) {
          try {
            const refreshRes = await fetch('/api/auth/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken: storedRefresh }),
            });
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json();
              localStorage.setItem('sc_token', refreshData.token);
              localStorage.setItem('sc_user', JSON.stringify(refreshData.user));
              window.dispatchEvent(new CustomEvent('smartcloud:token-refreshed', { detail: refreshData }));
              // Reintentar con el nuevo token
              const retryHeaders = { ...headers, 'Authorization': `Bearer ${refreshData.token}` };
              const retryResponse = await fetch(`${API_URL}${endpoint}`, { ...options, headers: retryHeaders });
              if (retryResponse.ok) return retryResponse.json() as T;
            }
          } catch { /* si falla el refresh, continuar al throw original */ }
        }
      }
      // No exponer detalles internos de errores 5xx al cliente
      if (response.status >= 500) {
        console.error('[API Error]', endpoint, errorData);
        throw new Error('Error interno del servidor. Por favor contacte al administrador.');
      }
      throw new Error(errorData.error || `Error ${response.status}`);
    }
    const data = await response.json();
    // Cachear respuestas GET en IndexedDB para uso offline
    if (isRead) {
      offlineDB.cacheData(`cache:${endpoint}`, data).catch(() => {});
    }
    return data;
  } catch (err) {
    if (err instanceof OfflineQueuedError) throw err;
    // Fallback a cache IndexedDB para GETs (ej: red inestable, timeout)
    if (isRead) {
      const cached = await offlineDB.getCachedData<T>(`cache:${endpoint}`);
      if (cached !== null) {
        window.dispatchEvent(new CustomEvent('smartcloud:cache-fallback', { detail: { endpoint } }));
        return cached;
      }
    }
    throw err;
  }
}

export const InventoryService = {
  getUnifiedProducts: () => request<any[]>('/productos/unificados'),
  getTelefonos: () => request<Telefono[]>('/inventory/telefonos'),
  createTelefono: (data: Partial<Telefono>) => request('/inventory/telefonos', { method: 'POST', body: JSON.stringify(data) }),
  updateTelefono: (id: string, data: Partial<Telefono>) => request(`/inventory/telefonos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateTelefonoStatus: (id: string, estado: string) => request(`/inventory/telefonos/${id}/status`, { method: 'PUT', body: JSON.stringify({ estado }) }),
  deleteTelefono: (id: string) => request(`/inventory/telefonos/${id}`, { method: 'DELETE' }),
  
  getStockAccesorios: () => request<Inventario[]>('/inventory/stock'),
  createStock: (data: Partial<Inventario>) => request('/inventory/stock', { method: 'POST', body: JSON.stringify(data) }),
  updateStock: (id: string, data: Partial<Inventario>) => request(`/inventory/stock/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStock: (id: string) => request(`/inventory/stock/${id}`, { method: 'DELETE' }),

  getAccesoriosMaster: () => request<Accesorio[]>('/inventory/accesorios-master'),
  createAccesorioMaster: (data: Partial<Accesorio>) => request('/inventory/accesorios-master', { method: 'POST', body: JSON.stringify(data) }),
  updateAccesorioMaster: (id: string, data: Partial<Accesorio>) => request(`/inventory/accesorios-master/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccesorioMaster: (id: string) => request(`/inventory/accesorios-master/${id}`, { method: 'DELETE' }),
  
  getCategorias: () => request<Categoria[]>('/inventory/categorias'),
  createCategoria: (data: Partial<Categoria>) => request('/inventory/categorias', { method: 'POST', body: JSON.stringify(data) }),
  updateCategoria: (id: string, data: Partial<Categoria>) => request(`/inventory/categorias/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategoria: (id: string) => request(`/inventory/categorias/${id}`, { method: 'DELETE' }),
  
  getUbicaciones: () => request<Ubicacion[]>('/inventory/ubicaciones'),
  createUbicacion: (data: Partial<Ubicacion>) => request('/inventory/ubicaciones', { method: 'POST', body: JSON.stringify(data) }),
  updateUbicacion: (id: string, data: Partial<Ubicacion>) => request(`/inventory/ubicaciones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUbicacion: (id: string) => request(`/inventory/ubicaciones/${id}`, { method: 'DELETE' }),
  
  generatePurchaseOrder: () => request<any>('/inventory/purchase-order', { method: 'POST' }),
  getLowStock: () => request<any[]>('/inventory/low-stock'),

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

export const SalesService = {
  getVentasDiDaily: (fecha?: string) => request<Venta[]>(`/ventas/historial${fecha ? `?fecha=${fecha}` : ''}`),
  getVenta: (id: string) => request<Venta>(`/ventas/${id}`),
  createVenta: (data: VentaPayload) => request<{codVenta: string}>('/ventas', { method: 'POST', body: JSON.stringify(data) }),
  updateVenta: (id: string, data: VentaPayload) => request<{codVenta: string}>(`/ventas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getDetallesVenta: (id: string) => request<DetalleVenta[]>(`/ventas/${id}/detalles`),
  anularVenta: (id: string) => request(`/ventas/${id}/anular`, { method: 'PUT' }),
  confirmKrediYaDeposit: (id: string) => request(`/ventas/${id}/deposito-krediya`, { method: 'PUT' }),
};

export const RepairService = {
  getAll: () => request<Reparacion[]>('/reparaciones'),
  create: (data: Partial<Reparacion>) => request('/reparaciones', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Reparacion>) => request(`/reparaciones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateStatus: (id: number, estado: string) => request(`/reparaciones/${id}/estado`, { method: 'PUT', body: JSON.stringify({ estado }) }),
  payTechnician: (id: number) => request(`/reparaciones/${id}/pago-tecnico`, { method: 'PUT' }),
  billRepair: (id: number) => request(`/reparaciones/${id}/facturar`, { method: 'POST' }),
  delete: (id: number) => request(`/reparaciones/${id}`, { method: 'DELETE' }),
};

export const WarrantyService = {
  getAll: () => request<Garantia[]>('/garantias'),
  create: (data: Partial<Garantia>) => request('/garantias', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Garantia>) => request(`/garantias/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/garantias/${id}`, { method: 'DELETE' }),
  // Fix: Added estadoRetorno to the exchange data object type definition
  exchange: (idGarantia: number, data: { idNuevoProducto: string, tipoNuevo: string, diferenciaEfectivo: number, utilidadDiferencia: number, descripcionGastoIngreso: string, estadoRetorno: string }) => 
    request(`/garantias/${idGarantia}/exchange`, { method: 'POST', body: JSON.stringify(data) }),
};

export const ConsignService = {
  getAll: () => request<Consignacion[]>('/consignaciones'),
  create: (data: Partial<Consignacion> | Partial<Consignacion>[]) => request('/consignaciones', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Consignacion>) => request(`/consignaciones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/consignaciones/${id}`, { method: 'DELETE' }),
  liquidate: (id: number) => request(`/consignaciones/${id}/liquidar`, { method: 'PUT' }),
  returnToStock: (id: number) => request(`/consignaciones/${id}/retorno`, { method: 'PUT' }),
};

export const CashService = {
  getActiveArqueo: () => request<Arqueo | null>('/arqueo/active'),
  /**
   * Fix: Added getSessionDetails method to match route and usage in AdminCashDashboard
   */
  getSessionDetails: (idArqueo: string) => request<{arqueo: Arqueo, ingresos: Ingreso[], egresos: Egreso[]}>(`/arqueo/${idArqueo}/details`),
  openCaja: (data: any) => request('/arqueo/open', { method: 'POST', body: JSON.stringify(data) }),
  closeCaja: (idArqueo: string) => request<{resumen: any}>('/arqueo/close', { method: 'POST', body: JSON.stringify({ idArqueo }) }),
  getIngresos: (idCaja: string, fecha?: string) => request<Ingreso[]>(`/ingresos?idCaja=${idCaja}${fecha ? `&fecha=${fecha}` : ''}`),
  getEgresos: (idCaja: string, fecha?: string) => request<Egreso[]>(`/egresos?idCaja=${idCaja}${fecha ? `&fecha=${fecha}` : ''}`),
  getSaldosToday: (fecha?: string) => request<Saldo[]>(`/saldos/today${fecha ? `?fecha=${fecha}` : ''}`),
  getSaldosStatus: (fecha?: string) => request<any>(`/saldos/status${fecha ? `?fecha=${fecha}` : ''}`),
  createIngreso: (data: any) => request('/ingresos', { method: 'POST', body: JSON.stringify(data) }),
  updateIngreso: (id: string, data: any) => request(`/ingresos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteIngreso: (id: string) => request(`/ingresos/${id}`, { method: 'DELETE' }),
  createEgreso: (data: any) => request('/egresos', { method: 'POST', body: JSON.stringify(data) }),
  updateEgreso: (id: string, data: any) => request(`/egresos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEgreso: (id: string) => request(`/egresos/${id}`, { method: 'DELETE' }),
  buySaldo: (data: any) => request('/saldos/buy', { method: 'POST', body: JSON.stringify(data) }),
  createRecarga: (data: any) => request('/recargas', { method: 'POST', body: JSON.stringify(data) }),
  getAdminBoxesStatus: () => request<any[]>('/admin/boxes/status'),
  getBoxHistory: (idCaja: string) => request<any[]>(`/admin/boxes/${idCaja}/history`),
  getSaldosByDate: (fecha: string) => request<Saldo[]>(`/admin/saldos?fecha=${fecha}`),
  updateSaldo: (id: string, data: any) => request(`/admin/saldos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  reopenCaja: (idArqueo: string) => request(`/admin/arqueo/${idArqueo}/reopen`, { method: 'PUT' }),
  /**
   * Fix: Added updateInitialAmount method to match route and usage in AdminCashDashboard
   */
  updateInitialAmount: (idArqueo: string, montoInicial: number) => request(`/arqueo/${idArqueo}/initial`, { method: 'PUT', body: JSON.stringify({ montoInicial }) }),
};

export const ReportsService = {
  getSalesTrend: (year: number) => request<any[]>(`/reports/sales-trend?year=${year}`),
  getTopProducts: (startDate: string, endDate: string) => request<any[]>(`/reports/top-products?startDate=${startDate}&endDate=${endDate}`),
  getRechargesProfit: (year: number) => request<any[]>(`/reports/recharges-profit?year=${year}`),
  getInventoryValuation: () => request<any[]>('/reports/inventory-valuation'),
  getTopClients: (startDate: string, endDate: string) => request<any[]>(`/reports/top-clients?startDate=${startDate}&endDate=${endDate}`),
  getDailySales: (startDate: string, endDate: string) => request<any[]>(`/reports/daily-sales?startDate=${startDate}&endDate=${endDate}`),
  getKpiSummary: (startDate: string, endDate: string) => request<any>(`/reports/kpi-summary?startDate=${startDate}&endDate=${endDate}`),
  getSalesBySeller: (startDate: string, endDate: string) => request<any[]>(`/reports/sales-by-seller?startDate=${startDate}&endDate=${endDate}`),
};

export const AdminService = {
  getUsers: () => request<any[]>('/users'),
  createUser: (data: any) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: string) => request(`/users/${id}`, { method: 'DELETE' }),
  getEmpleados: () => request<any[]>('/empleados'),
  createEmpleado: (data: any) => request('/empleados', { method: 'POST', body: JSON.stringify(data) }),
  updateEmpleado: (id: string, data: any) => request(`/empleados/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmpleado: (id: string) => request(`/empleados/${id}`, { method: 'DELETE' }),
  getRoles: () => request<any[]>('/roles'),
  createRol: (data: any) => request('/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRol: (id: string, data: any) => request(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRol: (id: string) => request(`/roles/${id}`, { method: 'DELETE' }),
  getPermisos: () => request<any[]>('/permisos'),
  getCajas: () => request<any[]>('/cajas'),
  createCaja: (nombre: string) => request('/cajas', { method: 'POST', body: JSON.stringify({ nombre }) }),
  updateCaja: (id: string, data: any) => request(`/cajas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCaja: (id: string) => request(`/cajas/${id}`, { method: 'DELETE' }),
  getSchema: () => request('/schema'),
};

export const PackagesService = {
  getAll: () => request<any[]>('/paquetes'),
  create: (data: any) => request('/paquetes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request(`/paquetes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/paquetes/${id}`, { method: 'DELETE' }),
};

export const ConfigService = {
  get: () => request<any>('/config'),
  update: (data: any) => request('/config', { method: 'PUT', body: JSON.stringify(data) }),
};

export const LabelService = {
  getAll: () => request<LabelTemplate[]>('/labels'),
  getDefault: (category: string) => request<LabelTemplate>(`/labels/default?category=${category}`),
  create: (data: Partial<LabelTemplate>) => request('/labels', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<LabelTemplate>) => request(`/labels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/labels/${id}`, { method: 'DELETE' }),
};

export const CostsService = {
  getAll: () => request<Costo[]>('/costos'),
  create: (data: any) => request('/costos', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) => request(`/costos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/costos/${id}`, { method: 'DELETE' }),
};

export const AuthService = {
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

export const AccountingService = {
  getAuditTransactions: (startDate: string, endDate: string) => request<any[]>(`/accounting/audit/transactions?startDate=${startDate}&endDate=${endDate}`),
  getProfitabilityReport: (startDate: string, endDate: string) => request<any>(`/accounting/report/profitability?startDate=${startDate}&endDate=${endDate}`),
  getOpexReport: (startDate: string, endDate: string) => request<any>(`/accounting/report/opex?startDate=${startDate}&endDate=${endDate}`),
  getSocios: () => request<Socio[]>('/accounting/socios'),
  createSocio: (data: any) => request('/accounting/socios', { method: 'POST', body: JSON.stringify(data) }),
  updateSocio: (id: number, data: any) => request(`/accounting/socios/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSocio: (id: number) => request(`/accounting/socios/${id}`, { method: 'DELETE' }),
  updateAuditTransaction: (tipo: string, id: string, data: any) => request(`/accounting/audit/transactions/${tipo}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

export const AIService = {
  diagnoseRepair: (data: { repairId?: string; deviceDesc: string; issueDescription: string }) =>
    request<any>('/ai/repair-diagnosis', { method: 'POST', body: JSON.stringify(data) }),
  analyzeClient: (idCliente: string) =>
    request<any>('/ai/client-analysis', { method: 'POST', body: JSON.stringify({ idCliente }) }),
  suggestPrice: (modelo: string, precioCompra: number) =>
    request<any>('/ai/price-suggestion', { method: 'POST', body: JSON.stringify({ modelo, precioCompra }) }),
  checkAnomaly: (idArqueo: string) =>
    request<any>(`/ai/anomaly-check/${idArqueo}`),
  predictRecharge: (red: 'TIGO' | 'CLARO') =>
    request<any>(`/ai/recharge-prediction/${red}`),
};
