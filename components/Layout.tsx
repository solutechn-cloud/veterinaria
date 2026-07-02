
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
const { Link, useLocation, useNavigate } = ReactRouterDOM as any;
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { AuthService, AIService, AIQuotaStatus, NotificationService, AppNotification, ConfigService } from '../services/api';
import {
  LayoutDashboard, ShoppingCart, Users, DollarSign, FileText, LogOut, Menu, X, Bell,
  Pill, ShieldCheck, Truck, ChevronDown, ChevronRight, ChevronLeft, Package,
  Briefcase, Box, UserCog, Calculator, Activity, Tag, Settings, PieChart,
  AlertTriangle, Building2, ArrowLeftRight, ShoppingBag,
  KeyRound, Eye, EyeOff, BookOpen, Sparkles, Info, CheckCheck, Trash2, Zap, Star,
  PawPrint, CalendarDays, CalendarClock, FileHeart, Syringe, Stethoscope, HeartPulse,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days} día${days > 1 ? 's' : ''}`;
  return new Date(dateStr).toLocaleDateString('es-HN', { day: '2-digit', month: 'short' });
}

const NOTIF_STYLE: Record<string, { bg: string; icon: React.ReactNode }> = {
  alerta_cuota_ia: { bg: 'bg-indigo-100 text-indigo-600', icon: <Sparkles size={14} /> },
  sistema:         { bg: 'bg-blue-100 text-blue-600',     icon: <Info size={14} /> },
  stock_critico:   { bg: 'bg-amber-100 text-amber-600',   icon: <AlertTriangle size={14} /> },
  backup_ok:       { bg: 'bg-emerald-100 text-emerald-600', icon: <CheckCheck size={14} /> },
  backup_error:    { bg: 'bg-red-100 text-red-600',       icon: <X size={14} /> },
  vencimiento:     { bg: 'bg-orange-100 text-orange-600', icon: <AlertTriangle size={14} /> },
  info:            { bg: 'bg-sky-100 text-sky-600',       icon: <Info size={14} /> },
  advertencia:     { bg: 'bg-amber-100 text-amber-600',   icon: <AlertTriangle size={14} /> },
  error:           { bg: 'bg-red-100 text-red-600',       icon: <X size={14} /> },
  default:         { bg: 'bg-slate-100 text-slate-500',   icon: <Bell size={14} /> },
};

interface LayoutProps { children?: React.ReactNode; }
interface NavItem {
  name: string;
  path?: string;
  icon: React.ReactNode;
  permission?: string;
  planFeature?: string;
  minimumPlan?: string;
  subItems?: NavItem[];
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['Comercial', 'Clínica', 'Inventario', 'Finanzas', 'Administración']);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: '', next: '', confirm: '' });
  const [pwdError, setPwdError] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [aiQuota, setAiQuota] = useState<AIQuotaStatus | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  // Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [notifOpen, setNotifOpen]         = useState(false);
  const [notifLoading, setNotifLoading]   = useState(false);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const notifBtnRef   = useRef<HTMLButtonElement>(null);

  const { user, logout, hasPermission, hasPlanFeature, clearPasswordChangeFlag } = useAuth();
  const isAdmin = ['administrador', 'admin', 'superadmin'].includes(String(user?.rol || '').toLowerCase());
  const hasAIPlan = hasPlanFeature('ia_basica') || hasPlanFeature('ia_avanzada');

  const loadNotifications = useCallback(async (silent = false) => {
    if (!silent) setNotifLoading(true);
    try {
      const [notifs, countRes] = await Promise.allSettled([
        NotificationService.getAll(),
        NotificationService.getUnreadCount(),
      ]);
      if (notifs.status === 'fulfilled') setNotifications(notifs.value);
      if (countRes.status === 'fulfilled') setUnreadCount(countRes.value.count);
    } catch { /* fail silently */ } finally {
      setNotifLoading(false);
    }
  }, []);

  const handleMarkRead = useCallback(async (id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    await NotificationService.markRead(id).catch(() => {});
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, leida: true })));
    setUnreadCount(0);
    await NotificationService.markAllRead().catch(() => {});
  }, []);

  const handleDeleteNotif = useCallback(async (id: number, wasUnread: boolean) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
    await NotificationService.remove(id).catch(() => {});
  }, []);

  // Load quota (admin only) + notifications + company logo + polling
  useEffect(() => {
    if (isAdmin && hasAIPlan) AIService.getQuotaStatus().then(setAiQuota).catch(() => {});
    else setAiQuota(null);
    loadNotifications();
    ConfigService.get().then(cfg => {
      if (cfg?.logoBase64) setCompanyLogo(cfg.logoBase64);
      if (cfg?.nombreEmpresa) updateTheme({ appName: cfg.nombreEmpresa });
    }).catch(() => {});
    const interval = setInterval(() => loadNotifications(true), 60000);
    return () => clearInterval(interval);
  }, [isAdmin, hasAIPlan, loadNotifications]);

  // Close panel on click-outside
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        notifPanelRef.current && !notifPanelRef.current.contains(e.target as Node) &&
        notifBtnRef.current  && !notifBtnRef.current.contains(e.target as Node)
      ) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  // Refresh when panel opens
  useEffect(() => {
    if (notifOpen) loadNotifications();
  }, [notifOpen, loadNotifications]);
  const { theme, updateTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const showCashRegisterStatus = hasPermission('VER_POS') || hasPermission('VER_CAJA');
  const assignedCashRegister = user?.idCaja && user.idCaja !== 'Sin Caja' ? user.idCaja : null;

  const handleChangePwd = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    if (pwdForm.next !== pwdForm.confirm) { setPwdError('Las contraseñas nuevas no coinciden'); return; }
    if (pwdForm.next.length < 8) { setPwdError('La contraseña debe tener al menos 8 caracteres'); return; }
    if (!/[A-Z]/.test(pwdForm.next)) { setPwdError('La contraseña debe contener al menos una letra mayúscula'); return; }
    if (!/[0-9]/.test(pwdForm.next)) { setPwdError('La contraseña debe contener al menos un número'); return; }
    setPwdLoading(true);
    try {
      await AuthService.changePassword(pwdForm.current, pwdForm.next);
      clearPasswordChangeFlag();
      setShowChangePwd(false);
      setPwdForm({ current: '', next: '', confirm: '' });
    } catch (err: any) {
      setPwdError(err.message || 'Error al cambiar contraseña');
    } finally { setPwdLoading(false); }
  };

  const handleLogout = () => {
    const tenantSlug = user?.tenantSlug || localStorage.getItem('last_tenant_slug');
    logout();
    navigate(tenantSlug ? `/login/${tenantSlug}` : '/login');
  };

  const toggleMenu = (name: string) => {
    setExpandedMenus(prev => prev.includes(name) ? prev.filter(i => i !== name) : [...prev, name]);
  };

  const navigationStructure: NavItem[] = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
    {
      name: 'Comercial', icon: <ShoppingCart size={20} />, permission: 'VER_POS',
      subItems: [
        { name: 'Punto de Venta', path: '/pos', icon: <ShoppingCart size={18} />, permission: 'VER_POS' },
        { name: 'Historial', path: '/historial', icon: <FileText size={18} />, permission: 'VER_POS' },
        { name: 'Tutores', path: '/clients', icon: <Users size={18} />, permission: 'VER_CLIENTES' },
        { name: 'Servicios', path: '/servicios-veterinarios', icon: <Stethoscope size={18} />, permission: 'VER_SERVICIOS_VET' },
      ]
    },
    {
      name: 'Clínica', icon: <HeartPulse size={20} />,
      subItems: [
        { name: 'Pacientes', path: '/pacientes', icon: <PawPrint size={18} />, permission: 'VER_PACIENTES', planFeature: 'modulo_pacientes', minimumPlan: 'basico' },
        { name: 'Agenda General', path: '/agenda', icon: <CalendarDays size={18} />, permission: 'VER_CITAS', planFeature: 'modulo_citas', minimumPlan: 'basico' },
        { name: 'Agenda Personal', path: '/agenda-personal', icon: <Stethoscope size={18} />, permission: 'VER_AGENDA_PERSONAL', planFeature: 'modulo_citas', minimumPlan: 'basico' },
        { name: 'Disponibilidad', path: '/agenda/disponibilidad', icon: <CalendarClock size={18} />, permission: 'VER_DISPONIBILIDAD_AGENDA', planFeature: 'modulo_citas', minimumPlan: 'basico' },
        { name: 'Consultorio', path: '/consultorio', icon: <FileHeart size={18} />, permission: 'VER_CONSULTORIO', planFeature: 'modulo_consultorio', minimumPlan: 'profesional' },
        { name: 'Vacunas', path: '/vacunas', icon: <Syringe size={18} />, permission: 'VER_VACUNAS', planFeature: 'modulo_vacunas', minimumPlan: 'profesional' },
        { name: 'Flowboard', path: '/flowboard', icon: <Activity size={18} />, permission: 'VER_FLOWBOARD', planFeature: 'modulo_hospitalizacion', minimumPlan: 'enterprise' },
      ]
    },
    {
      name: 'Inventario', icon: <Pill size={20} />, permission: 'VER_INVENTARIO',
      subItems: [
        { name: 'Inventario Clínico', path: '/medicamentos', icon: <Pill size={18} />, permission: 'VER_INVENTARIO' },
        { name: 'Catálogos', path: '/catalogos', icon: <BookOpen size={18} />, permission: 'VER_INVENTARIO' },
        { name: 'Control Vencimientos', path: '/vencimientos', icon: <AlertTriangle size={18} />, permission: 'VER_VENCIMIENTOS', planFeature: 'modulo_vencimientos', minimumPlan: 'profesional' },
        { name: 'Transferencias', path: '/transferencias', icon: <ArrowLeftRight size={18} />, permission: 'VER_TRANSFERENCIAS', planFeature: 'modulo_transferencias', minimumPlan: 'enterprise' },
        { name: 'Entregas Sucursal', path: '/cross-branch/deliveries', icon: <Truck size={18} />, permission: 'VER_ENTREGAS', planFeature: 'modulo_entregas', minimumPlan: 'enterprise' },
        { name: 'Programa de Lealtad', path: '/lealtad', icon: <Star size={18} />, permission: 'VER_LEALTAD', planFeature: 'modulo_lealtad', minimumPlan: 'profesional' },
        { name: 'Órdenes de Compra', path: '/ordenes-compra', icon: <ShoppingBag size={18} />, permission: 'VER_ORDENES_COMPRA', planFeature: 'modulo_ordenes_compra', minimumPlan: 'profesional' },
        { name: 'Proveedores', path: '/providers', icon: <Truck size={18} />, permission: 'VER_PROVEEDORES', planFeature: 'modulo_proveedores', minimumPlan: 'profesional' },
        { name: 'Etiquetas', path: '/label-designer', icon: <Tag size={18} />, permission: 'DISEÑAR_ETIQUETAS', planFeature: 'modulo_etiquetas', minimumPlan: 'profesional' },
      ]
    },
    {
      name: 'Finanzas', icon: <DollarSign size={20} />, permission: 'VER_CAJA',
      subItems: [
        { name: 'Caja y Movimientos', path: '/cash', icon: <DollarSign size={18} />, permission: 'VER_CAJA' },
        { name: 'Contabilidad', path: '/accounting', icon: <PieChart size={18} />, permission: 'VER_CONTABILIDAD', planFeature: 'modulo_contabilidad', minimumPlan: 'profesional' },
      ]
    },
    {
      name: 'Administración', icon: <ShieldCheck size={20} />, permission: 'VER_ADMIN',
      subItems: [
        { name: 'Sucursales', path: '/sucursales', icon: <Building2 size={18} />, permission: 'VER_SUCURSALES', planFeature: 'modulo_sucursales', minimumPlan: 'enterprise' },
        { name: 'Panel Cajas', path: '/admin/cash-dashboard', icon: <Activity size={18} />, permission: 'VER_PANEL_CAJAS', planFeature: 'modulo_panel_cajas', minimumPlan: 'enterprise' },
        { name: 'Usuarios', path: '/admin/users', icon: <UserCog size={18} />, permission: 'GESTIONAR_USUARIOS' },
        { name: 'Empleados', path: '/admin/employees', icon: <Briefcase size={18} />, permission: 'GESTIONAR_USUARIOS' },
        { name: 'Roles', path: '/admin/roles', icon: <ShieldCheck size={18} />, permission: 'GESTIONAR_ROLES' },
        { name: 'Cajas', path: '/admin/boxes', icon: <Box size={18} />, permission: 'GESTIONAR_CAJAS' },
        { name: 'Reportes', path: '/reports', icon: <FileText size={18} />, permission: 'VER_REPORTES' },
        { name: 'Configuración', path: '/admin/config', icon: <Settings size={18} />, permission: 'CONFIGURAR_EMPRESA' },
        { name: 'IA y Cuotas', path: '/admin/ai', icon: <Sparkles size={18} />, permission: 'VER_IA_CUOTAS', planFeature: 'ia_basica' },
      ]
    }
  ];

  const allNavItems = navigationStructure.flatMap(i => i.subItems ? i.subItems : [i]);
  const activeNavItem = [...allNavItems]
    .filter(i => i.path)
    .sort((a, b) => (b.path?.length || 0) - (a.path?.length || 0))
    .find(i => i.path === location.pathname || (i.path !== '/' && location.pathname.startsWith(`${i.path}/`)));
  const activePath = activeNavItem?.path;
  const isActivePath = (path?: string) => Boolean(path && activePath === path);

  const getPageTitle = () => activeNavItem ? activeNavItem.name : theme.appName;

  // Icono del módulo activo para el header cuando el nav está colapsado
  const getActiveIcon = () => activeNavItem?.icon || null;

  // Modo colapsado: todos los ítems individuales en lista plana (sin grupos)
  const renderCollapsedItems = () => {
    const flatItems: NavItem[] = [];
    for (const item of navigationStructure) {
      if (!item.subItems) {
        if (!item.permission || hasPermission(item.permission)) flatItems.push(item);
      } else {
        item.subItems.filter(s => hasPermission(s.permission) && (!s.planFeature || hasPlanFeature(s.planFeature))).forEach(s => flatItems.push(s));
      }
    }
    return flatItems.map(item => {
      const isActive = isActivePath(item.path);
      return (
        <div key={item.path} className="relative group mb-1">
          <Link
            to={item.path!}
            title={item.name}
            className={`flex items-center justify-center p-3 rounded-xl transition-all duration-200 ${
              isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
            }`}
          >
            {item.icon}
          </Link>
          <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-slate-800 text-white text-xs font-medium px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
            {item.name}
          </div>
        </div>
      );
    });
  };

  const renderNavItems = (items: NavItem[], isMobile = false) => {
    return items.map((item) => {
      if (item.subItems) {
        const subItemsToRender = item.subItems.filter(sub => {
          if (!hasPermission(sub.permission)) return false;
          return !sub.planFeature || hasPlanFeature(sub.planFeature);
        });
        if (subItemsToRender.length === 0) return null;

        const isExpanded = expandedMenus.includes(item.name);
        const hasActiveChild = subItemsToRender.some(sub => isActivePath(sub.path));

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
                {subItemsToRender.map(subItem => {
                  const isActive = isActivePath(subItem.path);
                  return (
                    <li key={subItem.path}>
                      <Link
                        to={subItem.path!}
                        onClick={() => isMobile && setIsMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-all ${
                          isActive ? 'text-white font-medium bg-indigo-600/20 border border-indigo-500/30' : 'text-slate-500 hover:text-slate-300'
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

      if (item.permission && !hasPermission(item.permission)) return null;
      const isActive = isActivePath(item.path);

      return (
        <li key={item.path} className="mb-2">
          <Link
            to={item.path!}
            onClick={() => isMobile && setIsMobileMenuOpen(false)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
              isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
            }`}
          >
            <span className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}>{item.icon}</span>
            <span className="font-medium text-sm">{item.name}</span>
          </Link>
        </li>
      );
    });
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* ── SIDEBAR DESKTOP ── */}
      <aside className={`hidden md:flex flex-col ${isCollapsed ? 'w-16' : 'w-64'} text-white shadow-2xl z-30 transition-all duration-300 shrink-0 overflow-x-hidden`} style={{ backgroundColor: theme.sidebarHex }}>
        {/* Logo + branding + toggle */}
        <div className={`h-20 flex items-center border-b border-slate-800/40 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800/80 transition-all duration-300 ${isCollapsed ? 'flex-col justify-center gap-2 px-2' : 'gap-3 px-4'}`}>
          {/* Logo de la empresa */}
          {companyLogo ? (
            <div className={`shrink-0 rounded-xl overflow-hidden border border-white/10 shadow-lg bg-white transition-all duration-300 ${isCollapsed ? 'w-8 h-8' : 'w-10 h-10'}`}>
              <img src={companyLogo} alt={theme.appName} className="w-full h-full object-contain p-0.5" />
            </div>
          ) : (
            <div className={`shrink-0 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 transition-all duration-300 ${isCollapsed ? 'w-8 h-8' : 'w-10 h-10'}`}>
              <Pill className="text-white" size={isCollapsed ? 16 : 20} strokeWidth={2.5} />
            </div>
          )}

          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-sm tracking-tight leading-tight text-white truncate">{theme.appName}</h1>
              <p className="text-[10px] text-indigo-300/60 font-medium tracking-widest mt-0.5 uppercase">ERP Veterinaria</p>
            </div>
          )}

          {/* Botón colapsar/expandir */}
          <button
            onClick={() => setIsCollapsed(v => !v)}
            className={`text-slate-500 hover:text-white hover:bg-slate-700/60 rounded-lg transition-all ${isCollapsed ? 'p-1 shrink-0' : 'p-1.5 shrink-0'}`}
            title={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2 custom-scrollbar">
          {isCollapsed
            ? <div className="space-y-1">{renderCollapsedItems()}</div>
            : <ul className="space-y-1">{renderNavItems(navigationStructure)}</ul>
          }
        </nav>

        {/* Footer usuario */}
        <div className={`border-t border-slate-800 bg-slate-900/50 ${isCollapsed ? 'p-2' : 'p-4'}`}>
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs shadow-md">
                {user?.usuario.substring(0, 2).toUpperCase() || 'US'}
              </div>
              <button onClick={handleLogout} title="Cerrar Sesión" className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4 px-2">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs shadow-md shrink-0">
                  {user?.usuario.substring(0, 2).toUpperCase() || 'US'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{user?.nombreEmpleado || 'Usuario'}</p>
                  <p className="text-xs text-slate-400 truncate">{user?.rol || 'Sin Rol'}</p>
                </div>
              </div>
              {/* AI token indicator — admin only */}
              {isAdmin && aiQuota && (
                <Link to="/admin/ai" className="block mb-3 group">
                  <div className={`rounded-xl px-3 py-2.5 border transition-colors ${
                    aiQuota.estado === 'agotado' ? 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20' :
                    aiQuota.estado === 'alerta'  ? 'bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20' :
                    'bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20'
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Sparkles size={12} className={
                          aiQuota.estado === 'agotado' ? 'text-red-400' :
                          aiQuota.estado === 'alerta'  ? 'text-amber-400' :
                          'text-indigo-400'
                        } />
                        <span className="text-[11px] font-semibold text-slate-300">Tokens IA</span>
                      </div>
                      <span className={`text-[10px] font-bold ${
                        aiQuota.estado === 'agotado' ? 'text-red-400' :
                        aiQuota.estado === 'alerta'  ? 'text-amber-400' :
                        'text-indigo-400'
                      }`}>
                        {(100 - aiQuota.pct_tokens_usado).toFixed(0)}% libre
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-700 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${
                        aiQuota.estado === 'agotado' ? 'bg-red-400' :
                        aiQuota.estado === 'alerta'  ? 'bg-amber-400' :
                        'bg-indigo-400'
                      }`} style={{ width: `${Math.min(aiQuota.pct_tokens_usado, 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 text-right group-hover:text-slate-400">Ver detalles →</p>
                  </div>
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 text-slate-300 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-xs font-medium border border-transparent hover:border-red-500/20"
              >
                <LogOut size={16} /><span>Cerrar Sesión</span>
              </button>
            </>
          )}
        </div>
      </aside>

      {/* ── CONTENIDO PRINCIPAL ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#f8fafc]">
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 h-16 md:h-20 flex items-center justify-between px-4 md:px-8 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {/* Hamburger móvil */}
            <button
              className="md:hidden text-slate-600 hover:text-slate-900 p-2 rounded-lg hover:bg-slate-100"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu size={24} />
            </button>
            {/* Icono del módulo activo cuando está colapsado */}
            {isCollapsed && (
              <span className="hidden md:flex items-center justify-center w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg">
                {getActiveIcon()}
              </span>
            )}
            <h1 className="text-lg md:text-2xl font-bold text-slate-800 tracking-tight truncate">{getPageTitle()}</h1>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {showCashRegisterStatus && (
              <div className="text-right hidden sm:block mr-1">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Caja asignada</p>
                <p className={`text-sm font-bold ${assignedCashRegister ? 'text-indigo-600' : 'text-amber-600'}`}>
                  {assignedCashRegister || 'Sin caja asignada'}
                </p>
              </div>
            )}

            {/* Change password */}
            <button
              onClick={() => { setPwdForm({ current: '', next: '', confirm: '' }); setPwdError(''); setShowChangePwd(true); }}
              title="Cambiar contraseña"
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
            >
              <KeyRound size={18} />
            </button>

            {/* Notification bell + panel */}
            <div className="relative">
              <button
                ref={notifBtnRef}
                onClick={() => setNotifOpen(v => !v)}
                title="Notificaciones"
                className={`relative p-2 rounded-xl transition-all ${notifOpen ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-0.5 border-2 border-white leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* ── Notification panel ── */}
              {notifOpen && (
                <div
                  ref={notifPanelRef}
                  className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[80] overflow-hidden"
                  style={{ maxHeight: '80vh' }}
                >
                  {/* Panel header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-indigo-50/40">
                    <div className="flex items-center gap-2">
                      <Bell size={15} className="text-indigo-600" />
                      <span className="font-bold text-sm text-slate-800">Notificaciones</span>
                      {unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-black px-1.5 h-4 rounded-full flex items-center">{unreadCount}</span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button onClick={handleMarkAllRead} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold transition-colors">
                        <CheckCheck size={13} /> Leer todas
                      </button>
                    )}
                  </div>

                  {/* Notification list */}
                  <div className="overflow-y-auto" style={{ maxHeight: 'calc(min(80vh, 440px) - 100px)' }}>
                    {notifLoading ? (
                      <div className="py-10 flex flex-col items-center gap-2 text-slate-300">
                        <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="py-10 text-center">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Bell size={22} className="text-slate-300" />
                        </div>
                        <p className="text-sm font-semibold text-slate-400">Sin notificaciones</p>
                        <p className="text-xs text-slate-300 mt-0.5">Estás al día</p>
                      </div>
                    ) : (
                      <div>
                        {notifications.map(n => {
                          const style = NOTIF_STYLE[n.tipo] || NOTIF_STYLE.default;
                          return (
                            <div
                              key={n.id}
                              className={`group flex gap-3 px-4 py-3 border-b border-slate-50 transition-colors cursor-pointer ${!n.leida ? 'bg-indigo-50/40 hover:bg-indigo-50/70' : 'hover:bg-slate-50'}`}
                              onClick={() => !n.leida && handleMarkRead(n.id)}
                            >
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${style.bg}`}>
                                {style.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-1">
                                  <p className={`text-xs font-bold leading-snug ${!n.leida ? 'text-slate-800' : 'text-slate-500'}`}>
                                    {n.titulo}
                                  </p>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {!n.leida && <span className="w-2 h-2 bg-indigo-500 rounded-full shrink-0" />}
                                    <button
                                      onClick={e => { e.stopPropagation(); handleDeleteNotif(n.id, !n.leida); }}
                                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all p-0.5"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                </div>
                                {n.cuerpo && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{n.cuerpo}</p>}
                                <p className="text-[10px] text-slate-300 mt-1">{timeAgo(n.fecha_creacion)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Panel footer */}
                  <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                    <p className="text-[11px] text-slate-300">{notifications.length} notificaciones</p>
                    <button onClick={() => setNotifOpen(false)} className="text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors">
                      Cerrar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
          <div className="max-w-7xl mx-auto animate-fade-in pb-20 md:pb-0">
            {children}
          </div>
        </main>
      </div>

      {/* ── MENÚ MÓVIL ── */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative w-80 h-full shadow-2xl flex flex-col" style={{ backgroundColor: theme.sidebarHex }}>
            <div className="px-5 py-4 flex justify-between items-center border-b border-slate-800/60 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800/80">
              <div className="flex items-center gap-3">
                {companyLogo ? (
                  <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 shadow-lg bg-white shrink-0">
                    <img src={companyLogo} alt={theme.appName} className="w-full h-full object-contain p-0.5" />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
                    <Pill className="text-white" size={20} strokeWidth={2.5} />
                  </div>
                )}
                <div className="min-w-0">
                  <span className="font-bold text-base text-white leading-tight block truncate max-w-[180px]">{theme.appName}</span>
                  <span className="text-[10px] text-indigo-300/60 tracking-widest uppercase font-medium">ERP Veterinaria</span>
                </div>
              </div>
              <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400 hover:text-white hover:bg-slate-700/50 p-2 rounded-lg transition-all shrink-0">
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 py-6 px-4 overflow-y-auto">
              <ul className="space-y-1">{renderNavItems(navigationStructure, true)}</ul>
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
              <button onClick={() => { setIsMobileMenuOpen(false); setPwdForm({ current: '', next: '', confirm: '' }); setPwdError(''); setShowChangePwd(true); }} className="w-full py-2.5 mb-2 bg-indigo-600/10 text-indigo-400 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                <KeyRound size={16} /> Cambiar Contraseña
              </button>
              <button onClick={handleLogout} className="w-full py-3 bg-red-600/10 text-red-400 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                <LogOut size={16} /> Salir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CAMBIAR CONTRASEÑA ── */}
      {showChangePwd && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 animate-fade-in">
            <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <KeyRound className="text-indigo-500" size={22} />
                <h3 className="text-lg font-bold text-slate-800">Cambiar Contraseña</h3>
              </div>
              <button onClick={() => setShowChangePwd(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={22} /></button>
            </div>
            <form onSubmit={handleChangePwd} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Contraseña Actual</label>
                <div className="relative mt-1">
                  <input type={showCurrent ? 'text' : 'password'} required
                    className="w-full p-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={pwdForm.current} onChange={e => setPwdForm({ ...pwdForm, current: e.target.value })} placeholder="Contraseña actual" />
                  <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600">
                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Nueva Contraseña</label>
                <div className="relative mt-1">
                  <input type={showNext ? 'text' : 'password'} required
                    className="w-full p-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={pwdForm.next} onChange={e => setPwdForm({ ...pwdForm, next: e.target.value })} placeholder="Mínimo 6 caracteres" />
                  <button type="button" onClick={() => setShowNext(v => !v)} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600">
                    {showNext ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Confirmar Contraseña</label>
                <input type="password" required
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={pwdForm.confirm} onChange={e => setPwdForm({ ...pwdForm, confirm: e.target.value })} placeholder="Repetir contraseña" />
              </div>
              {pwdError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{pwdError}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowChangePwd(false)} className="flex-1 py-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold transition-colors">Cancelar</button>
                <button type="submit" disabled={pwdLoading} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                  {pwdLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <KeyRound size={14} />}
                  {pwdLoading ? 'Guardando...' : 'Actualizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
