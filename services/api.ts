
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
  Consignacion
} from '../types';

const API_URL = '/api';

// request helper function
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('smartcloud_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export const InventoryService = {
  getUnifiedProducts: () => request<any[]>('/productos/unificados'),
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
  updateStatus: (id: number, estado: string) => request(`/reparaciones/${id}/estado`, { method: 'PUT', body: JSON.stringify({ estado }) }),
  payTechnician: (id: number) => request(`/reparaciones/${id}/pago-tecnico`, { method: 'PUT' }),
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
  reopenBox: (idArqueo: string) => request(`/arqueo/${idArqueo}/reopen`, { method: 'PUT' }),
  getSessionDetails: (idArqueo: string) => request<any>(`/arqueo/${idArqueo}/details`),
  updateInitialAmount: (idArqueo: string, monto: number) => request(`/arqueo/${idArqueo}/initial`, { method: 'PUT', body: JSON.stringify({ montoInicial: monto }) }),
  getSaldosByDate: (fecha: string) => request<Saldo[]>(`/admin/saldos?fecha=${fecha}`),
  updateSaldo: (id: string, data: any) => request(`/admin/saldos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

export const ReportsService = {
  getSalesTrend: (year: number) => request<any[]>(`/reports/sales-trend?year=${year}`),
  getTopProducts: (startDate: string, endDate: string) => request<any[]>(`/reports/top-products?startDate=${startDate}&endDate=${endDate}`),
  getRechargesProfit: (year: number) => request<any[]>(`/reports/recharges-profit?year=${year}`),
  getInventoryValuation: () => request<any[]>('/reports/inventory-valuation'),
  getTopClients: (startDate: string, endDate: string) => request<any[]>(`/reports/top-clients?startDate=${startDate}&endDate=${endDate}`),
  getDailySales: (startDate: string, endDate: string) => request<any[]>(`/reports/daily-sales?startDate=${startDate}&endDate=${endDate}`),
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

export const AccountingService = {
  getAuditTransactions: (date: string) => request<any[]>(`/accounting/audit/transactions?date=${date}`),
  getProfitabilityReport: (date: string) => request<any>(`/accounting/report/profitability?date=${date}`),
  getSocios: () => request<Socio[]>('/accounting/socios'),
  updateAuditTransaction: (tipo: string, id: string, data: any) => request(`/accounting/audit/transactions/${tipo}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};
