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

// Al usar ruta relativa vacía o solo '/api', el navegador usará automáticamente el mismo dominio
// donde está alojada la web (tu servidor Render).
const API_URL = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    
    // Si la API real falla (ej. tabla no existe, error 500), lanzamos error para usar Mock
    if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    // Verificamos si la respuesta es JSON
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        return await response.json();
    } else {
        throw new Error("Respuesta no es JSON");
    }

  } catch (error) {
    console.warn(`Fallo conectando a API Real en ${endpoint}. Usando Datos de Prueba (Mock).`, error);
    return handleMockFallback<T>(endpoint);
  }
}

// Fallback simulator: Si la BD está vacía o falla la conexión, mostramos datos falsos
function handleMockFallback<T>(endpoint: string): any {
  // Inventory
  if (endpoint === '/productos/unificados') return getMockUnifiedProducts();
  if (endpoint === '/telefonos') return MOCK_TELEFONOS;
  if (endpoint === '/accesorios') return MOCK_ACCESORIOS;
  
  // Clients
  if (endpoint === '/clientes') return MOCK_CLIENTES;
  
  // Sales
  if (endpoint === '/ventas') return []; 
  
  // Cash / Arqueo
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
