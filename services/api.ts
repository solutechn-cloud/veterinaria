
import { 
  Telefono, 
  Inventario, 
  Accesorio, 
  Cliente, 
  VentaPayload, 
  Venta,
  Arqueo, 
  Ingreso, 
  Egreso,
  Usuario,
  Empleado,
  Rol,
  Caja,
  Categoria,
  Ubicacion,
  Proveedor,
  Costo,
  Saldo,
  Permiso,
  Paquete,
  ProductoUnified,
  DetalleVenta
} from '../types';

const API_URL = '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('smartcloud_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    
    // Lógica para interceptar 401/403 SOLO si NO es el endpoint de login
    const isLoginEndpoint = endpoint.includes('/auth/login');

    if ((response.status === 401 || response.status === 403) && !isLoginEndpoint) {
      localStorage.removeItem('smartcloud_token');
      localStorage.removeItem('smartcloud_user');
      window.location.href = '#/login';
      throw new Error('Sesión expirada');
    }

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error del servidor (${response.status})`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error en API ${endpoint}`, error);
    throw error;
  }
}

export const ReportsService = {
  getSalesTrend: (year: number) => request<any[]>(`/reports/sales-trend?year=${year}`),
  getTopProducts: (start: string, end: string) => request<any[]>(`/reports/top-products?startDate=${start}&endDate=${end}`),
  getRechargesProfit: (year: number) => request<any[]>(`/reports/recharges-profit?year=${year}`),
  getInventoryValuation: () => request<any[]>(`/reports/inventory-valuation`),
  getTopClients: (start: string, end: string) => request<any[]>(`/reports/top-clients?startDate=${start}&endDate=${end}`),
  getDailySales: (start: string, end: string) => request<any[]>(`/reports/daily-sales?startDate=${start}&endDate=${end}`),
};

export const SalesService = {
  createVenta: (payload: VentaPayload) => request<{message: string, codVenta: string}>('/ventas', { method: 'POST', body: JSON.stringify(payload) }),
  updateVenta: (id: string, payload: VentaPayload) => request<{message: string, codVenta: string}>(`/ventas/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  getVentasDiarias: (fecha: string) => request<Venta[]>(`/ventas/historial?fecha=${fecha}`),
  getDetallesVenta: (id: string) => request<DetalleVenta[]>(`/ventas/${id}/detalles`),
  anularVenta: (id: string) => request<{message: string}>(`/ventas/${id}/anular`, { method: 'PUT' }),
};

export const InventoryService = {
  getUnifiedProducts: () => request<ProductoUnified[]>('/productos/unificados'),
  
  // Telefonos
  getTelefonos: () => request<Telefono[]>('/inventory/telefonos'),
  createTelefono: (data: Partial<Telefono>) => request('/inventory/telefonos', { method: 'POST', body: JSON.stringify(data) }),
  updateTelefono: (id: string, data: Partial<Telefono>) => request(`/inventory/telefonos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTelefono: (id: string) => request(`/inventory/telefonos/${id}`, { method: 'DELETE' }),

  // Stock
  getStockAccesorios: () => request<Inventario[]>('/inventory/stock'),
  createStock: (data: Partial<Inventario>) => request('/inventory/stock', { method: 'POST', body: JSON.stringify(data) }),
  updateStock: (id: string, data: Partial<Inventario>) => request(`/inventory/stock/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStock: (id: string) => request(`/inventory/stock/${id}`, { method: 'DELETE' }),

  // Maestro Accesorios
  getAccesoriosMaster: () => request<Accesorio[]>('/inventory/accesorios-master'),
  createAccesorioMaster: (data: Partial<Accesorio>) => request('/inventory/accesorios-master', { method: 'POST', body: JSON.stringify(data) }),
  updateAccesorioMaster: (id: string, data: Partial<Accesorio>) => request(`/inventory/accesorios-master/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccesorioMaster: (id: string) => request(`/inventory/accesorios-master/${id}`, { method: 'DELETE' }),

  // Categorias
  getCategorias: () => request<Categoria[]>('/inventory/categorias'),
  createCategoria: (data: Partial<Categoria>) => request('/inventory/categorias', { method: 'POST', body: JSON.stringify(data) }),
  updateCategoria: (id: string, data: Partial<Categoria>) => request(`/inventory/categorias/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategoria: (id: string) => request(`/inventory/categorias/${id}`, { method: 'DELETE' }),

  // Ubicaciones
  getUbicaciones: () => request<Ubicacion[]>('/inventory/ubicaciones'),
  createUbicacion: (data: Partial<Ubicacion>) => request('/inventory/ubicaciones', { method: 'POST', body: JSON.stringify(data) }),
  updateUbicacion: (id: string, data: Partial<Ubicacion>) => request(`/inventory/ubicaciones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUbicacion: (id: string) => request(`/inventory/ubicaciones/${id}`, { method: 'DELETE' }),

  // Proveedores
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

export const CostsService = {
  getAll: () => request<Costo[]>('/costos'),
  create: (data: Partial<Costo>) => request('/costos', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Costo>) => request(`/costos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/costos/${id}`, { method: 'DELETE' }),
};

export const CashService = {
  getActiveArqueo: () => request<Arqueo | null>('/arqueo/active'),
  openCaja: (data: { montoInicial: number, saldoTigoInicial?: number, saldoClaroInicial?: number, fechaLocal: string }) => request('/arqueo/open', { method: 'POST', body: JSON.stringify(data) }),
  closeCaja: (idArqueo: string) => request<{message: string, resumen: any}>('/arqueo/close', { method: 'POST', body: JSON.stringify({ idArqueo }) }),
  
  getIngresos: (idCaja: string) => request<Ingreso[]>(`/ingresos?idCaja=${idCaja}`),
  createIngreso: (data: { descripcion: string, monto: number, costo?: number }) => request('/ingresos', { method: 'POST', body: JSON.stringify(data) }),
  updateIngreso: (id: string, data: any) => request(`/ingresos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteIngreso: (id: string) => request(`/ingresos/${id}`, { method: 'DELETE' }),

  getEgresos: (idCaja: string) => request<Egreso[]>(`/egresos?idCaja=${idCaja}`),
  createEgreso: (data: { descripcion: string, monto: number }) => request('/egresos', { method: 'POST', body: JSON.stringify(data) }),
  updateEgreso: (id: string, data: any) => request(`/egresos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEgreso: (id: string) => request(`/egresos/${id}`, { method: 'DELETE' }),

  getSaldosToday: (fechaLocal: string) => request<Saldo[]>(`/saldos/today?fecha=${fechaLocal}`),
  getSaldosStatus: (fechaLocal: string) => request<{tigo: boolean, claro: boolean}>(`/saldos/status?fecha=${fechaLocal}`),
  buySaldo: (data: { red: string, montoPagado: number, montoRecibido: number, fechaLocal: string }) => request('/saldos/buy', { method: 'POST', body: JSON.stringify(data) }),

  createRecarga: (data: { red: string, tipo: string, descripcion: string, precioCobrado: number, precioPagado: number, fechaLocal: string }) => request('/recargas', { method: 'POST', body: JSON.stringify(data) }),

  getAdminBoxesStatus: () => request<any[]>('/admin/cajas-status'),
  reopenBox: (idArqueo: string) => request('/admin/reopen-box', { method: 'POST', body: JSON.stringify({ idArqueo }) }),
};

export const PackagesService = {
  getAll: () => request<Paquete[]>('/paquetes'),
  create: (data: Partial<Paquete>) => request('/paquetes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Paquete>) => request(`/paquetes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/paquetes/${id}`, { method: 'DELETE' }),
};

export const AdminService = {
  getUsers: () => request<Usuario[]>('/users'),
  createUser: (data: any) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: string) => request(`/users/${id}`, { method: 'DELETE' }),

  getEmpleados: () => request<Empleado[]>('/empleados'),
  createEmpleado: (data: any) => request('/empleados', { method: 'POST', body: JSON.stringify(data) }),
  updateEmpleado: (id: string, data: any) => request(`/empleados/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmpleado: (id: string) => request(`/empleados/${id}`, { method: 'DELETE' }),

  getRoles: () => request<Rol[]>('/roles'),
  createRol: (data: any) => request('/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRol: (id: string, data: any) => request(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRol: (id: string) => request(`/roles/${id}`, { method: 'DELETE' }),
  getPermisos: () => request<Permiso[]>('/permisos'),

  getCajas: () => request<Caja[]>('/cajas'),
  createCaja: (nombre: string) => request('/cajas', { method: 'POST', body: JSON.stringify({ nombre }) }),
  updateCaja: (id: string, data: any) => request(`/cajas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCaja: (id: string) => request(`/cajas/${id}`, { method: 'DELETE' }),
};
