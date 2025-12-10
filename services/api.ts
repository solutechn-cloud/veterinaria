import { 
  Telefono, 
  InventarioAccesorio, 
  Accesorio, 
  Cliente, 
  Venta, 
  Arqueo, 
  Ingreso, 
  Egreso 
} from '../types';
import { 
  MOCK_TELEFONOS, 
  MOCK_INVENTARIO, 
  MOCK_ACCESORIOS, 
  MOCK_CLIENTES, 
  MOCK_ARQUEO, 
  MOCK_INGRESOS, 
  MOCK_EGRESOS,
  getMockUnifiedProducts
} from './mockData';

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
      // Token expirado o inválido, limpieza básica (idealmente usar el AuthContext)
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
        // En caso de que el backend devuelva 200 OK pero vacío o texto
        return {} as T;
    }

  } catch (error) {
    console.warn(`Fallo conectando a API Real en ${endpoint} o error de auth.`, error);
    // En producción, aquí lanzarías el error. Para demo, fallback a Mock.
    // Solo usamos fallback si NO es error de autenticación (401 ya manejado arriba)
    if (endpoint.includes('auth')) throw error;
    
    return handleMockFallback<T>(endpoint);
  }
}

// Fallback simulator
function handleMockFallback<T>(endpoint: string): any {
  if (endpoint === '/productos/unificados') return getMockUnifiedProducts();
  if (endpoint === '/telefonos') return MOCK_TELEFONOS;
  if (endpoint === '/accesorios') return MOCK_ACCESORIOS;
  if (endpoint === '/clientes') return MOCK_CLIENTES;
  if (endpoint === '/ventas') return []; 
  if (endpoint.includes('/arqueo/active')) return MOCK_ARQUEO;
  if (endpoint.includes('/ingresos')) return MOCK_INGRESOS;
  if (endpoint.includes('/egresos')) return MOCK_EGRESOS;
  return [];
}

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