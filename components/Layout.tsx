import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Smartphone, 
  ShoppingCart, 
  Users, 
  DollarSign, 
  FileText, 
  LogOut,
  Menu,
  X,
  Search,
  Bell,
  CloudLightning
} from 'lucide-react';

const Layout: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    { name: 'Punto de Venta', path: '/pos', icon: <ShoppingCart size={20} /> },
    { name: 'Inventario', path: '/inventory', icon: <Smartphone size={20} /> },
    { name: 'Clientes', path: '/clients', icon: <Users size={20} /> },
    { name: 'Caja y Movimientos', path: '/cash', icon: <DollarSign size={20} /> },
    { name: 'Reportes', path: '/reports', icon: <FileText size={20} /> },
  ];

  const getPageTitle = () => {
    const item = navItems.find(i => i.path === location.pathname);
    return item ? item.name : 'SmartCloud ERP';
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex flex-col w-72 bg-[#0f172a] text-white shadow-2xl z-30 transition-all duration-300">
        {/* Brand Logo */}
        <div className="h-20 flex items-center gap-3 px-8 border-b border-slate-800/50 bg-gradient-to-r from-slate-900 to-slate-800">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <CloudLightning className="text-white" size={22} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight leading-none text-white">SmartCloud</h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-wider mt-1 uppercase">Enterprise ERP</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-8 px-4">
          <div className="mb-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Menú Principal</div>
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 group ${
                      isActive 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 translate-x-1' 
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-white hover:translate-x-1'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}>
                        {item.icon}
                      </span>
                      <span className="font-medium text-sm">{item.name}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* User Profile / Logout */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
              AD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">Administrador</p>
              <p className="text-xs text-slate-400 truncate">admin@smartcloud.com</p>
            </div>
          </div>
          <button className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-slate-300 hover:text-white hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-colors text-sm font-medium border border-transparent hover:border-red-500/20">
            <LogOut size={18} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#f8fafc]">
        {/* Top Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 h-20 flex items-center justify-between px-8 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <button 
              className="md:hidden text-slate-500 hover:text-slate-800 p-2 rounded-lg hover:bg-slate-100"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={24} />
            </button>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{getPageTitle()}</h1>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center bg-slate-100/80 rounded-xl px-4 py-2.5 border border-slate-200/50 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all w-80">
              <Search size={18} className="text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar (Ctrl + K)" 
                className="bg-transparent border-none focus:outline-none text-sm ml-3 w-full text-slate-700 placeholder:text-slate-400"
              />
            </div>
            
            <button className="relative p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-8 scroll-smooth">
          <div className="max-w-7xl mx-auto animate-fade-in">
            <Outlet />
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
          <div className="relative w-72 bg-[#0f172a] h-full shadow-2xl flex flex-col transform transition-transform">
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
              <ul className="space-y-2">
                {navItems.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-4 py-3 rounded-xl font-medium ${
                          isActive 
                            ? 'bg-indigo-600 text-white shadow-lg' 
                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`
                      }
                    >
                      {item.icon}
                      <span>{item.name}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;