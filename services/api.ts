import { 
  Telefono, 
  InventarioAccesorio, 
  Accesorio, 
  Cliente, 
  Venta, 
  Arqueo, 
  Ingreso, 
  Egreso,
  Usuario,
  Empleado,
  Rol,
  Caja
} from '../types';

const API_URL = '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('smartcloud_token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });
    
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('smartcloud_token');
      localStorage.removeItem('smartcloud_user');
      window.location.href = '#/login';
      throw new Error('Sesión expirada');
    }

    if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        return await response.json();
    } else {
        return {} as T;
    }

  } catch (error) {
    console.error(`Error en API ${endpoint}`, error);
    throw error;
  }
}

export const AdminService = {
  // Usuarios
  getUsers: () => request<Usuario[]>('/users'),
  createUser: (data: any) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  toggleUserStatus: (id: string, status: string) => request(`/users/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  
  // Empleados
  getEmpleados: () => request<Empleado[]>('/empleados'),
  createEmpleado: (data: Empleado) => request('/empleados', { method: 'POST', body: JSON.stringify(data) }),
  updateEmpleado: (id: string, data: Partial<Empleado>) => request(`/empleados/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  
  // Roles
  getRoles: () => request<Rol[]>('/roles'),
  createRol: (nombre: string) => request('/roles', { method: 'POST', body: JSON.stringify({ nombre }) }),
  
  // Cajas
  getCajas: () => request<Caja[]>('/cajas'),
  createCaja: (nombre: string) => request('/cajas', { method: 'POST', body: JSON.stringify({ nombre }) }),
  updateCaja: (id: string, data: Partial<Caja>) => request(`/cajas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

export const InventoryService = {
  getUnifiedProducts: () => request<any[]>('/productos/unificados'), 
  getTelefonos: () => request<Telefono[]>('/telefonos'),
  getAccesorios: () => request<Accesorio[]>('/accesorios'),
  createTelefono: (data: Telefono) => request<Telefono>('/telefonos', { method: 'POST', body: JSON.stringify(data) }),
  createAccesorio: (data: Accesorio) => request<Accesorio>('/accesorios', { method: 'POST', body: JSON.stringify(data) }),
};

export const ClientService = {
  getAll: () => request<Cliente[]>('/clientes'),
  getByDni: (dni: string) => request<Cliente>(`/clientes/${dni}`),
  create: (data: Cliente) => request<Cliente>('/clientes', { method: 'POST', body: JSON.stringify(data) }),
};

export const SalesService = {
  createVenta: (venta: Venta) => request<Venta>('/ventas', { method: 'POST', body: JSON.stringify(venta) }),
};

export const CashService = {
  getActiveArqueo: (idUsuario: string) => request<Arqueo>(`/arqueo/active?usuario=${idUsuario}`),
  getIngresos: (idCaja: string) => request<Ingreso[]>(`/ingresos?caja=${idCaja}`),
  getEgresos: (idCaja: string) => request<Egreso[]>(`/egresos?caja=${idCaja}`),
  createIngreso: (data: Ingreso) => request<Ingreso>('/ingresos', { method: 'POST', body: JSON.stringify(data) }),
  createEgreso: (data: Egreso) => request<Egreso>('/egresos', { method: 'POST', body: JSON.stringify(data) }),
};