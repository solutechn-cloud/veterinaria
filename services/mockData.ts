import { 
  Telefono, 
  Accesorio, 
  InventarioAccesorio, 
  Cliente, 
  Venta, 
  Arqueo, 
  Ingreso, 
  Egreso, 
  ProductoUnified 
} from '../types';

// --- DATA ---

export const MOCK_TELEFONOS: Telefono[] = [
  {
    codigo: 'TEL-001',
    imei1: '865432109876543',
    imei2: '865432109876544',
    marca: 'Samsung',
    modelo: 'Galaxy S23 Ultra',
    precioCompra: 20000,
    precioVenta: 28000,
    codProveedor: 'PROV-01',
    idubicacion: 'UBI-01',
    estado: 'Disponible',
    fecha: '2023-10-01'
  },
  {
    codigo: 'TEL-002',
    imei1: '354829102938472',
    imei2: '354829102938473',
    marca: 'Apple',
    modelo: 'iPhone 14 Pro Max',
    precioCompra: 25000,
    precioVenta: 32000,
    codProveedor: 'PROV-02',
    idubicacion: 'UBI-02',
    estado: 'Disponible',
    fecha: '2023-10-05'
  }
];

export const MOCK_ACCESORIOS: Accesorio[] = [
  { codAccesorio: 'ACC-001', codCategoria: 'CAT-01', descripcion: 'Funda Silicona S23' },
  { codAccesorio: 'ACC-002', codCategoria: 'CAT-02', descripcion: 'Cargador 25W Samsung' }
];

export const MOCK_INVENTARIO: InventarioAccesorio[] = [
  {
    codInventario: 'INV-001',
    codAccesorio: 'ACC-001',
    cantidad: 15,
    precioCompra: 100,
    precioVenta: 250,
    codProveedor: 'PROV-01',
    idubicacion: 'UBI-03',
    estado: 'Activo',
    fecha: '2023-09-01'
  },
  {
    codInventario: 'INV-002',
    codAccesorio: 'ACC-002',
    cantidad: 8,
    precioCompra: 300,
    precioVenta: 600,
    codProveedor: 'PROV-01',
    idubicacion: 'UBI-03',
    estado: 'Activo',
    fecha: '2023-09-01'
  }
];

export const MOCK_CLIENTES: Cliente[] = [
  {
    identidad: '0801199012345',
    nombre: 'Juan',
    apellido: 'Perez',
    direccion: 'Col. Kennedy',
    telefono: '99998888',
    correo: 'juan@mail.com',
    fechaCreacion: '2023-01-01'
  },
  {
    identidad: '0501199554321',
    nombre: 'Maria',
    apellido: 'Lopez',
    direccion: 'San Pedro Sula',
    telefono: '33334444',
    correo: 'maria@mail.com',
    fechaCreacion: '2023-02-01'
  }
];

export const MOCK_ARQUEO: Arqueo = {
  idArqueo: 'ARQ-20231027-01',
  idCaja: 'CAJA-01',
  idUsuario: 'USER-01',
  fechaApertura: '2023-10-27T08:00:00',
  montoInicial: 1000.00,
  estado: 'Abierta',
  totalVentas: 0,
  totalGastos: 0
};

export const MOCK_INGRESOS: Ingreso[] = [
  {
    idIngreso: 'ING-001',
    idCaja: 'CAJA-01',
    descripcion: 'Venta Factura #001',
    monto: 28250.00,
    costo: 20100.00,
    fechaCreacion: '2023-10-27T10:30:00',
    estado: 'Registrado'
  }
];

export const MOCK_EGRESOS: Egreso[] = [
  {
    idegresos: 'EGR-001',
    idCaja: 'CAJA-01',
    descripcion: 'Pago de Almuerzo',
    monto: 150.00,
    fechaCreacion: '2023-10-27T12:00:00',
    estado: 'Registrado'
  }
];

export const MOCK_SALES = [
  {
    id: '1001',
    date: '2023-10-27T09:30:00',
    clientName: 'Juan Perez',
    total: 3500,
    estado: 'Completada'
  },
  {
    id: '1002',
    date: '2023-10-27T10:15:00',
    clientName: 'Maria Lopez',
    total: 12500,
    estado: 'Completada'
  },
  {
    id: '1003',
    date: '2023-10-27T11:00:00',
    clientName: 'Consumidor Final',
    total: 450,
    estado: 'Completada'
  },
  {
    id: '1004',
    date: '2023-10-27T14:20:00',
    clientName: 'Pedro Martinez',
    total: 2800,
    estado: 'Completada'
  },
  {
    id: '1005',
    date: '2023-10-26T16:45:00',
    clientName: 'Ana Hernandez',
    total: 15000,
    estado: 'Completada'
  }
];

// Helper to simulate the Backend View Query for Products
export const getMockUnifiedProducts = (): ProductoUnified[] => {
  const unified: ProductoUnified[] = [];

  // Add Phones
  MOCK_TELEFONOS.forEach(t => {
    if(t.estado === 'Disponible') {
      unified.push({
        id: t.codigo,
        tipo: 'TELEFONO',
        nombre: `${t.marca} ${t.modelo}`,
        codigo: t.codigo,
        precioVenta: t.precioVenta,
        stock: 1, // Phones are unique
        imei: t.imei1,
        ubicacion: t.idubicacion
      });
    }
  });

  // Add Accessories (Join Accesorio + Inventario)
  MOCK_INVENTARIO.forEach(inv => {
    const acc = MOCK_ACCESORIOS.find(a => a.codAccesorio === inv.codAccesorio);
    if(acc) {
      unified.push({
        id: acc.codAccesorio,
        tipo: 'ACCESORIO',
        nombre: acc.descripcion,
        codigo: acc.codAccesorio,
        precioVenta: inv.precioVenta,
        stock: inv.cantidad,
        ubicacion: inv.idubicacion
      });
    }
  });

  return unified;
};