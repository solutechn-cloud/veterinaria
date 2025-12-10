
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
  Paquete
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
        // Intentar parsear el JSON de error
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error del servidor (${response.status})`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error en API ${endpoint}`, error);
    throw error;
  }
}

export const PackagesService = {
  getAll: () => request<Paquete[]>('/paquetes').then(res => Array.isArray(res) ? res : []),
  create: (data: Partial<Paquete>) => request('/paquetes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Paquete>) => request(`/paquetes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/paquetes/${id}`, { method: 'DELETE' }),
};

export const CostsService = {
  getAll: () => request<Costo[]>('/costos').then(res => Array.isArray(res) ? res : []),
  create: (data: Partial<Costo>) => request('/costos', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Costo>) => request(`/costos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/costos/${id}`, { method: 'DELETE' }),
};

export const CashService = {
  getActiveArqueo: () => request<Arqueo | null>(`/arqueo/active`),
  getSaldosToday: () => request<Saldo[]>('/saldos/today').then(res => Array.isArray(res) ? res : []),
  openCaja: (data: { montoInicial: number, saldoTigoInicial: number, saldoClaroInicial: number }) => request('/arqueo/open', { method: 'POST', body: JSON.stringify(data) }),
  closeCaja: (idArqueo: string) => request<{ message: string, resumen: any }>('/arqueo/close', { method: 'POST', body: JSON.stringify({ idArqueo }) }),
  
  getIngresos: (idCaja: string) => request<Ingreso[]>(`/ingresos?idCaja=${idCaja}`).then(res => Array.isArray(res) ? res : []),
  getEgresos: (idCaja: string) => request<Egreso[]>(`/egresos?idCaja=${idCaja}`).then(res => Array.isArray(res) ? res : []),
  
  createIngreso: (data: Partial<Ingreso>) => request<Ingreso>('/ingresos', { method: 'POST', body: JSON.stringify(data) }),
  updateIngreso: (id: string, data: Partial<Ingreso>) => request(`/ingresos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteIngreso: (id: string) => request(`/ingresos/${id}`, { method: 'DELETE' }),

  createEgreso: (data: Partial<Egreso>) => request<Egreso>('/egresos', { method: 'POST', body: JSON.stringify(data) }),
  updateEgreso: (id: string, data: Partial<Egreso>) => request(`/egresos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEgreso: (id: string) => request(`/egresos/${id}`, { method: 'DELETE' }),
  
  createRecarga: (data: any) => request('/recargas', { method: 'POST', body: JSON.stringify(data) }),
  buySaldo: (data: { red: string, montoPagado: number, montoRecibido: number }) => request('/saldos/buy', { method: 'POST', body: JSON.stringify(data) }),

  // Admin Functions
  getAdminBoxesStatus: () => request<any[]>('/admin/cajas-status').then(res => Array.isArray(res) ? res : []),
  reopenBox: (idArqueo: string) => request('/admin/reopen-box', { method: 'POST', body: JSON.stringify({ idArqueo }) }),
};

export const InventoryService = {
  getUnifiedProducts: () => request<any[]>('/productos/unificados').then(res => Array.isArray(res) ? res : []), 
  getTelefonos: () => request<Telefono[]>('/inventory/telefonos').then(res => Array.isArray(res) ? res : []),
  createTelefono: (data: Partial<Telefono>) => request('/inventory/telefonos', { method: 'POST', body: JSON.stringify(data) }),
  updateTelefono: (id: string, data: Partial<Telefono>) => request(`/inventory/telefonos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTelefono: (id: string) => request(`/inventory/telefonos/${id}`, { method: 'DELETE' }),

  getStockAccesorios: () => request<Inventario[]>('/inventory/stock').then(res => Array.isArray(res) ? res : []),
  createStock: (data: Partial<Inventario>) => request('/inventory/stock', { method: 'POST', body: JSON.stringify(data) }),
  updateStock: (id: string, data: Partial<Inventario>) => request(`/inventory/stock/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStock: (id: string) => request(`/inventory/stock/${id}`, { method: 'DELETE' }),
  
  getAccesoriosMaster: () => request<Accesorio[]>('/inventory/accesorios-master').then(res => Array.isArray(res) ? res : []),
  createAccesorioMaster: (data: Partial<Accesorio>) => request('/inventory/accesorios-master', { method: 'POST', body: JSON.stringify(data) }),
  updateAccesorioMaster: (id: string, data: Partial<Accesorio>) => request(`/inventory/accesorios-master/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccesorioMaster: (id: string) => request(`/inventory/accesorios-master/${id}`, { method: 'DELETE' }),

  getCategorias: () => request<Categoria[]>('/inventory/categorias').then(res => Array.isArray(res) ? res : []),
  createCategoria: (data: Partial<Categoria>) => request('/inventory/categorias', { method: 'POST', body: JSON.stringify(data) }),
  updateCategoria: (id: string, data: Partial<Categoria>) => request(`/inventory/categorias/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategoria: (id: string) => request(`/inventory/categorias/${id}`, { method: 'DELETE' }),

  getUbicaciones: () => request<Ubicacion[]>('/inventory/ubicaciones').then(res => Array.isArray(res) ? res : []),
  createUbicacion: (data: Partial<Ubicacion>) => request('/inventory/ubicaciones', { method: 'POST', body: JSON.stringify(data) }),
  updateUbicacion: (id: string, data: Partial<Ubicacion>) => request(`/inventory/ubicaciones/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUbicacion: (id: string) => request(`/inventory/ubicaciones/${id}`, { method: 'DELETE' }),

  getProveedores: () => request<Proveedor[]>('/proveedores').then(res => Array.isArray(res) ? res : []),
  createProveedor: (data: Partial<Proveedor>) => request('/proveedores', { method: 'POST', body: JSON.stringify(data) }),
  updateProveedor: (id: string, data: Partial<Proveedor>) => request(`/proveedores/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProveedor: (id: string) => request(`/proveedores/${id}`, { method: 'DELETE' }),
};

export const SalesService = {
  createVenta: (venta: VentaPayload) => request<{ message: string; codVenta: string }>('/ventas', { method: 'POST', body: JSON.stringify(venta) }),
  getVentasDiarias: (fecha: string) => request<Venta[]>(`/ventas/historial?fecha=${fecha}`).then(res => Array.isArray(res) ? res : []),
  anularVenta: (id: string) => request(`/ventas/${id}/anular`, { method: 'PUT' }),
};

export const AdminService = {
  getUsers: () => request<Usuario[]>('/users').then(res => Array.isArray(res) ? res : []),
  createUser: (data: any) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: string) => request(`/users/${id}`, { method: 'DELETE' }),
  
  getEmpleados: () => request<Empleado[]>('/empleados').then(res => Array.isArray(res) ? res : []),
  createEmpleado: (data: Empleado) => request('/empleados', { method: 'POST', body: JSON.stringify(data) }),
  updateEmpleado: (id: string, data: Partial<Empleado>) => request(`/empleados/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmpleado: (id: string) => request(`/empleados/${id}`, { method: 'DELETE' }),
  
  getRoles: () => request<Rol[]>('/roles').then(res => Array.isArray(res) ? res : []),
  createRol: (data: {nombre: string, permisos: string[]}) => request('/roles', { method: 'POST', body: JSON.stringify(data) }),
  updateRol: (id: string, data: Partial<Rol>) => request(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRol: (id: string) => request(`/roles/${id}`, { method: 'DELETE' }),
  getPermisos: () => request<Permiso[]>('/permisos').then(res => Array.isArray(res) ? res : []),

  getCajas: () => request<Caja[]>('/cajas').then(res => Array.isArray(res) ? res : []),
  createCaja: (nombre: string) => request('/cajas', { method: 'POST', body: JSON.stringify({ nombre }) }),
  updateCaja: (id: string, data: Partial<Caja>) => request(`/cajas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCaja: (id: string) => request(`/cajas/${id}`, { method: 'DELETE' }),
  
  getRecargas: (idRecargas: string) => request<any>(`/recargas/${idRecargas}`),
};

export const ClientService = {
  getAll: () => request<Cliente[]>('/clientes').then(res => Array.isArray(res) ? res : []),
  create: (data: Cliente) => request('/clientes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Cliente>) => request(`/clientes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/clientes/${id}`, { method: 'DELETE' }),
};
