
import { 
  Usuario, Empleado, Rol, Caja, Permiso, 
  Cliente, Proveedor, Telefono, Inventario, Accesorio, Categoria, Ubicacion, ProductoUnified,
  Venta, DetalleVenta, VentaPayload,
  Arqueo, Ingreso, Egreso, Saldo, Paquete, Costo,
  LabelTemplate
} from '../types';

const API_URL = '/api';

const getHeaders = () => {
  const token = localStorage.getItem('smartcloud_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  };
};

const request = async <T>(endpoint: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: { ...getHeaders(), ...options?.headers }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || 'Error en la petición');
  }
  return data;
};

export const InventoryService = {
  getTelefonos: () => request<Telefono[]>('/inventory/telefonos'),
  createTelefono: (data: Partial<Telefono>) => request('/inventory/telefonos', { method: 'POST', body: JSON.stringify(data) }),
  updateTelefono: (id: string, data: Partial<Telefono>) => request(`/inventory/telefonos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
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

  getProveedores: () => request<Proveedor[]>('/proveedores'),
  createProveedor: (data: Partial<Proveedor>) => request('/proveedores', { method: 'POST', body: JSON.stringify(data) }),
  updateProveedor: (id: string, data: Partial<Proveedor>) => request(`/proveedores/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProveedor: (id: string) => request(`/proveedores/${id}`, { method: 'DELETE' }),

  getUnifiedProducts: () => request<ProductoUnified[]>('/productos/unificados'),
};

export const ClientService = {
  getAll: () => request<Cliente[]>('/clientes'),
  create: (data: Cliente) => request('/clientes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Cliente>) => request(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/clientes/${id}`, { method: 'DELETE' }),
};

export const SalesService = {
  getVentasDiarias: (fecha?: string) => request<Venta[]>(`/ventas/historial${fecha ? `?fecha=${fecha}` : ''}`),
  getVenta: (id: string) => request<Venta>(`/ventas/${id}`),
  createVenta: (data: VentaPayload) => request<{message: string, codVenta: string}>('/ventas', { method: 'POST', body: JSON.stringify(data) }),
  updateVenta: (id: string, data: VentaPayload) => request<{message: string, codVenta: string}>(`/ventas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getDetallesVenta: (id: string) => request<DetalleVenta[]>(`/ventas/${id}/detalles`),
  anularVenta: (id: string) => request(`/ventas/${id}/anular`, { method: 'PUT' }),
};

export const CashService = {
  getActiveArqueo: () => request<Arqueo | null>('/arqueo/active'),
  openCaja: (data: { montoInicial: number, saldoTigoInicial?: number, saldoClaroInicial?: number, fechaLocal?: string }) => request('/arqueo/open', { method: 'POST', body: JSON.stringify(data) }),
  closeCaja: (idArqueo: string) => request<{resumen: any}>('/arqueo/close', { method: 'POST', body: JSON.stringify({ idArqueo }) }),

  getIngresos: (idCaja: string, fecha?: string) => request<Ingreso[]>(`/ingresos?idCaja=${idCaja}${fecha ? `&fecha=${fecha}` : ''}`),
  createIngreso: (data: { descripcion: string, monto: number, costo?: number, fechaCreacion?: string }) => request('/ingresos', { method: 'POST', body: JSON.stringify(data) }),
  updateIngreso: (id: string, data: { descripcion: string, monto: number, costo?: number }) => request(`/ingresos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteIngreso: (id: string) => request(`/ingresos/${id}`, { method: 'DELETE' }),

  getEgresos: (idCaja: string, fecha?: string) => request<Egreso[]>(`/egresos?idCaja=${idCaja}${fecha ? `&fecha=${fecha}` : ''}`),
  createEgreso: (data: { descripcion: string, monto: number, fechaCreacion?: string }) => request('/egresos', { method: 'POST', body: JSON.stringify(data) }),
  updateEgreso: (id: string, data: { descripcion: string, monto: number }) => request(`/egresos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEgreso: (id: string) => request(`/egresos/${id}`, { method: 'DELETE' }),

  getSaldosToday: (fecha?: string) => request<Saldo[]>(`/saldos/today${fecha ? `?fecha=${fecha}` : ''}`),
  getSaldosStatus: (fecha?: string) => request<{tigo: boolean, claro: boolean}>(`/saldos/status${fecha ? `?fecha=${fecha}` : ''}`),
  buySaldo: (data: { red: string, montoPagado: number, montoRecibido: number, fechaLocal?: string }) => request('/saldos/buy', { method: 'POST', body: JSON.stringify(data) }),
  createRecarga: (data: { red: string, tipo: string, descripcion: string, precioCobrado: number, precioPagado: number, fechaLocal?: string }) => request('/recargas', { method: 'POST', body: JSON.stringify(data) }),

  getAdminBoxesStatus: () => request<any[]>('/admin/boxes/status'), 
  reopenBox: (idArqueo: string) => request(`/arqueo/${idArqueo}/reopen`, { method: 'PUT' }),
  getSessionDetails: (idArqueo: string) => request<{arqueo: Arqueo, ingresos: Ingreso[], egresos: Egreso[]}>(`/arqueo/${idArqueo}/details`),
  updateInitialAmount: (idArqueo: string, monto: number) => request(`/arqueo/${idArqueo}/initial`, { method: 'PUT', body: JSON.stringify({ montoInicial: monto }) }),
};

export const CostsService = {
  getAll: () => request<Costo[]>('/costs'),
  create: (data: Partial<Costo>) => request('/costs', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Costo>) => request(`/costs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/costs/${id}`, { method: 'DELETE' }),
};

export const PackagesService = {
  getAll: () => request<Paquete[]>('/paquetes'),
  create: (data: Partial<Paquete>) => request('/paquetes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Paquete>) => request(`/paquetes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/paquetes/${id}`, { method: 'DELETE' }),
};

export const AdminService = {
  getUsers: () => request<Usuario[]>('/users'),
  createUser: (data: Partial<Usuario>) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: Partial<Usuario>) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: string) => request(`/users/${id}`, { method: 'DELETE' }),

  getEmpleados: () => request<Empleado[]>('/empleados'),
  createEmpleado: (data: Partial<Empleado>) => request('/empleados', { method: 'POST', body: JSON.stringify(data) }),
  updateEmpleado: (id: string, data: Partial<Empleado>) => request(`/empleados/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmpleado: (id: string) => request(`/empleados/${id}`, { method: 'DELETE' }),

  getRoles: () => request<Rol[]>('/roles'),
  createRol: (data: Partial<Rol>) => request('/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRol: (id: string, data: Partial<Rol>) => request(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRol: (id: string) => request(`/roles/${id}`, { method: 'DELETE' }),
  getPermisos: () => request<Permiso[]>('/permisos'),

  getCajas: () => request<Caja[]>('/cajas'),
  createCaja: (nombre: string) => request('/cajas', { method: 'POST', body: JSON.stringify({ nombre }) }),
  updateCaja: (id: string, data: { nombre: string, estado: string }) => request(`/cajas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCaja: (id: string) => request(`/cajas/${id}`, { method: 'DELETE' }),

  getSchema: () => request<any>('/schema'),
};

export const ReportsService = {
  getSalesTrend: (year: number) => request<any[]>(`/reports/sales-trend?year=${year}`),
  getTopProducts: (start: string, end: string) => request<any[]>(`/reports/top-products?startDate=${start}&endDate=${end}`),
  getRechargesProfit: (year: number) => request<any[]>(`/reports/recharges-profit?year=${year}`),
  getInventoryValuation: () => request<any[]>('/reports/inventory-valuation'),
  getTopClients: (start: string, end: string) => request<any[]>(`/reports/top-clients?startDate=${start}&endDate=${end}`),
  getDailySales: (start: string, end: string) => request<any[]>(`/reports/daily-sales?startDate=${start}&endDate=${end}`),
};

export const LabelService = {
  getAll: () => request<LabelTemplate[]>('/labels'),
  getDefault: (category?: string) => request<LabelTemplate | null>(`/labels/default${category ? `?category=${category}` : ''}`),
  create: (data: Partial<LabelTemplate>) => request<{message: string, id: string}>('/labels', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<LabelTemplate>) => request(`/labels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/labels/${id}`, { method: 'DELETE' }),
};
