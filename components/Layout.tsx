
import React, { useState } from 'react';
import { Link, useLocation, useHistory } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, ShoppingCart, Users, DollarSign, FileText, LogOut, Menu, X, Bell, CloudLightning, ShieldCheck, Truck, ChevronDown, ChevronRight, Package, Briefcase, Box, UserCog, Calculator, Smartphone, Activity, Tag
} from 'lucide-react';

interface LayoutProps {
  children?: React.ReactNode;
}

interface NavItem {
  name: string;
  path?: string;
  icon: React.ReactNode;
  permission?: string; // ID del permiso en BD (ej: 'VER_POS')
  subItems?: NavItem[];
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['Comercial', 'Logística', 'Finanzas', 'Administración']); 
  const { user, logout, hasPermission } = useAuth();
  const location = useLocation();
  const history = useHistory();

  const handleLogout = () => {
    logout();
    history.push('/login');
  };

  const toggleMenu = (name: string) => {
    setExpandedMenus(prev => 
      prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name]
    );
  };

  // Estructura basada en los permisos insertados en la Base de Datos
  const navigationStructure: NavItem[] = [
    { 
      name: 'Dashboard', 
      path: '/', 
      icon: <LayoutDashboard size={20} />
      // Sin permiso = visible para todos los logueados
    },
    {
      name: 'Comercial',
      icon: <ShoppingCart size={20} />,
      permission: 'VER_POS', // Permiso padre o genérico
      subItems: [
        { name: 'Punto de Venta', path: '/pos', icon: <ShoppingCart size={18} />, permission: 'VER_POS' },
        { name: 'Clientes', path: '/clients', icon: <Users size={18} />, permission: 'VER_CLIENTES' },
        { name: 'Paquetes Recarga', path: '/packages', icon: <Smartphone size={18} />, permission: 'GESTIONAR_INVENTARIO' },
      ]
    },
    {
      name: 'Logística',
      icon: <Package size={20} />,
      permission: 'VER_INVENTARIO', // Se muestra si tiene acceso al menos al inventario
      subItems: [
        { name: 'Inventario General', path: '/inventory', icon: <Package size={18} />, permission: 'VER_INVENTARIO' },
        { name: 'Proveedores', path: '/providers', icon: <Truck size={18} />, permission: 'VER_PROVEEDORES' },
        { name: 'Diseñador Etiquetas', path: '/label-designer', icon: <Tag size={18} />, permission: 'DISEÑAR_ETIQUETAS' },
      ]
    },
    {
      name: 'Finanzas',
      icon: <DollarSign size={20} />,
      permission: 'VER_CAJA', // Visible si puede ver caja o costos (validación abajo)
      subItems: [
        { name: 'Caja y Movimientos', path: '/cash', icon: <DollarSign size={18} />, permission: 'VER_CAJA' },
        { name: 'Costos y Gastos', path: '/costs', icon: <Calculator size={18} />, permission: 'VER_COSTOS' },
      ]
    },
    {
      name: 'Administración',
      icon: <ShieldCheck size={20} />,
      permission: 'VER_ADMIN',
      subItems: [
        { name: 'Panel Cajas', path: '/admin/cash-dashboard', icon: <Activity size={18} />, permission: 'GESTIONAR_PANEL_CAJAS' },
        { name: 'Usuarios', path: '/admin/users', icon: <UserCog size={18} />, permission: 'GESTIONAR_USUARIOS' },
        { name: 'Empleados', path: '/admin/employees', icon: <Briefcase size={18} />, permission: 'GESTIONAR_USUARIOS' },
        { name: 'Roles', path: '/admin/roles', icon: <ShieldCheck size={18} />, permission: 'GESTIONAR_ROLES' },
        { name: 'Cajas', path: '/admin/boxes', icon: <Box size={18} />, permission: 'GESTIONAR_ROLES' },
        { name: 'Reportes', path: '/reports', icon: <FileText size={18} />, permission: 'VER_REPORTES' },
      ]
    }
  ];

  const getPageTitle = () => {
    const allItems = navigationStructure.flatMap(i => i.subItems ? i.subItems : [i]);
    const item = allItems.find(i => i.path === location.pathname);
    return item ? item.name : 'SmartCloud ERP';
  };

  const renderNavItems = (items: NavItem[], isMobile = false) => {
    return items.map((item) => {
      
      // Lógica para submenús
      if (item.subItems) {
        // Filtrar subitems visibles según permisos
        const visibleSubItems = item.subItems.filter(sub => hasPermission(sub.permission));
        
        // Si no hay subitems visibles, no renderizar el padre
        if (visibleSubItems.length === 0) return null;

        const isExpanded = expandedMenus.includes(item.name);
        const hasActiveChild = visibleSubItems.some(sub => sub.path === location.pathname);
        
        return (
          <div key={item.name} className="mb-2">
            <button
              onClick={() => toggleMenu(item.name)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${
                hasActiveChild ? 'bg-slate-800/40 text-white' : 'text-slate-400 hover:bg-slate-800/30 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={hasActiveChild ? 'text-indigo-400' : 'group-hover:text-indigo-400'}>{item.icon}</span>
                <span className="font-medium text-sm">{item.name}</span>
              </div>
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
              <ul className="pl-4 space-y-1 border-l-2 border-slate-800 ml-6 my-1">
                {visibleSubItems.map(subItem => {
                   const isActive = location.pathname === subItem.path;
                   return (
                     <li key={subItem.path}>
                       <Link
                         to={subItem.path!}
                         onClick={() => isMobile && setIsMobileMenuOpen(false)}
                         className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all ${
                           isActive 
                             ? 'text-white font-medium bg-indigo-600/20 border border-indigo-500/30' 
                             : 'text-slate-500 hover:text-slate-300'
                         }`}
                       >
                         {subItem.icon}
                         {subItem.name}
                       </Link>
                     </li>
                   );
                })}
              </ul>
            </div>
          </div>
        );
      }

      // Lógica para ítems individuales
      if (item.permission && !hasPermission(item.permission)) return null;

      const isActive = location.pathname === item.path;
      return (
        <li key={item.path} className="mb-2">
          <Link
            to={item.path!}
            onClick={() => isMobile && setIsMobileMenuOpen(false)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
              isActive 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' 
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
            }`}
          >
            <span className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}>
              {item.icon}
            </span>
            <span className="font-medium text-sm">{item.name}</span>
          </Link>
        </li>
      );
    });
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-[#0f172a] text-white shadow-2xl z-30 transition-all duration-300 shrink-0">
        <div className="h-20 flex items-center gap-3 px-6 border-b border-slate-800/50 bg-gradient-to-r from-slate-900 to-slate-800">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
            <CloudLightning className="text-white" size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight leading-none text-white">SmartCloud</h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-wider mt-1 uppercase">ERP System</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-3 custom-scrollbar">
          <ul className="space-y-1">
            {renderNavItems(navigationStructure)}
          </ul>
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs shadow-md shrink-0">
              {user?.usuario.substring(0, 2).toUpperCase() || 'US'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user?.nombreEmpleado || 'Usuario'}</p>
              <p className="text-xs text-slate-400 truncate">{user?.rol || 'Sin Rol'}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full px-4 py-2 text-slate-300 hover:text-white hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-colors text-xs font-medium border border-transparent hover:border-red-500/20"
          >
            <LogOut size={16} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#f8fafc]">
        {/* Header Responsivo */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 h-16 md:h-20 flex items-center justify-between px-4 md:px-8 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <button 
              className="md:hidden text-slate-600 hover:text-slate-900 p-2 rounded-lg hover:bg-slate-100"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={24} />
            </button>
            <h1 className="text-lg md:text-2xl font-bold text-slate-800 tracking-tight truncate">{getPageTitle()}</h1>
          </div>
          
          <div className="flex items-center gap-4 md:gap-6">
             <div className="text-right hidden sm:block">
                 <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Caja Asignada</p>
                 <p className="text-sm font-bold text-indigo-600">{user?.idCaja}</p>
             </div>
             <button className="relative p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all">
               <Bell size={20} />
               <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
             </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          <div className="max-w-7xl mx-auto animate-fade-in pb-20 md:pb-0">
             {children}
          </div>
        </main>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative w-80 bg-[#0f172a] h-full shadow-2xl flex flex-col transform transition-transform duration-300">
            <div className="p-6 flex justify-between items-center border-b border-slate-800">
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <CloudLightning className="text-white" size={18} />
                 </div>
                 <span className="font-bold text-lg text-white">SmartCloud</span>
              </div>
              <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <nav className="flex-1 py-6 px-4 overflow-y-auto">
              <ul className="space-y-1">
                {renderNavItems(navigationStructure, true)}
              </ul>
            </nav>
            <div className="p-4 border-t border-slate-800">
                <div className="flex items-center gap-3 text-slate-300 mb-4 px-2">
                    <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-xs">
                        {user?.usuario.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white">{user?.usuario}</p>
                        <p className="text-xs">{user?.rol}</p>
                    </div>
                </div>
                <button onClick={handleLogout} className="w-full py-3 bg-red-600/10 text-red-400 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                    <LogOut size={16}/> Salir
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
