
import React, { useState, useEffect, useMemo } from 'react';
import { Usuario, Empleado, Rol, Caja, EstadoGeneral, Permiso } from '../types';
import { AdminService, SucursalesService } from '../services/api';
import { Sucursal } from '../types';
import {
  Users, Shield, Box, Briefcase, PlusCircle, X, Edit2, Trash2,
  CheckSquare, RefreshCw, ArrowRightLeft, Building2
} from 'lucide-react';
import Swal from 'sweetalert2';

type Tab = 'USERS' | 'EMPLOYEES' | 'ROLES' | 'CAJAS';

interface AdminUsersProps { initialView: Tab; }

const inp = 'w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500 outline-none text-sm';
const lbl = 'text-xs font-bold text-slate-500 uppercase';

const AdminUsers: React.FC<AdminUsersProps> = ({ initialView }) => {
  const [activeTab, setActiveTab] = useState<Tab>(initialView);

  const [users, setUsers]         = useState<any[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [roles, setRoles]         = useState<Rol[]>([]);
  const [cajas, setCajas]         = useState<Caja[]>([]);
  const [permisos, setPermisos]   = useState<Permiso[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);

  // ── Main modal ────────────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const [userForm, setUserForm]   = useState({ usuario: '', password: '', identidad: '', idrol: '', idCaja: '', estado: 'Activo', id_sucursal: '' });
  const [empForm, setEmpForm]     = useState({ identidad: '', nombre: '', apellido: '', direccion: '', telefono: '', estado: 'Activo', id_sucursal: '' });
  const [rolForm, setRolForm]     = useState<{ nombre: string; estado: string; permisos: string[] }>({ nombre: '', estado: 'Activo', permisos: [] });
  const [permissionSearch, setPermissionSearch] = useState('');
  const [cajaForm, setCajaForm]   = useState({ nombre: '', estado: 'Activo', id_sucursal: '' });

  // ── Transfer modal ────────────────────────────────────────────────────────
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferEmp, setTransferEmp]   = useState<Empleado | null>(null);
  const [transferForm, setTransferForm] = useState({ id_sucursal_destino: '', nueva_idCaja: '' });
  const [cajasFiltradas, setCajasFiltradas] = useState<Caja[]>([]);

  useEffect(() => { setActiveTab(initialView); }, [initialView]);
  useEffect(() => { loadData(); }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const suc = await SucursalesService.getAll().catch(() => []);
      setSucursales(suc);

      if (activeTab === 'USERS') {
        const [u, e, r, c] = await Promise.all([
          AdminService.getUsers(), AdminService.getEmpleados(),
          AdminService.getRoles(), AdminService.getCajas(),
        ]);
        setUsers(u || []); setEmpleados(e || []); setRoles(r || []); setCajas(c || []);
      } else if (activeTab === 'EMPLOYEES') {
        const [e, c] = await Promise.all([AdminService.getEmpleados(), AdminService.getCajas()]);
        setEmpleados(e || []); setCajas(c || []);
      } else if (activeTab === 'ROLES') {
        const [r, p] = await Promise.all([AdminService.getRoles(), AdminService.getPermisos()]);
        setRoles(r || []); setPermisos(p || []);
      } else if (activeTab === 'CAJAS') {
        const c = await AdminService.getCajas();
        setCajas(c || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // Filter cajas when sucursal changes in user form
  const cajasFiltUser = useMemo(() => {
    const sucId = Number(userForm.id_sucursal);
    const assignedCajaIds = new Set(
      users
        .filter(u => String(u.codUsuario) !== String(currentId || ''))
        .filter(u => u.estado === 'Activo')
        .map(u => u.idCaja)
        .filter(Boolean)
    );
    return cajas
      .filter(c => !sucId || c.id_sucursal === sucId)
      .filter(c => !assignedCajaIds.has(c.idCaja));
  }, [cajas, currentId, userForm.id_sucursal, users]);

  const selectedRole = useMemo(() => roles.find(r => String(r.idrol) === String(userForm.idrol)), [roles, userForm.idrol]);
  const selectedRoleRequiresCaja = useMemo(() => {
    const name = (selectedRole?.nombre || '').toLowerCase();
    if (['administrador', 'admin', 'superadmin', 'super admin'].includes(name)) return false;
    const rolePerms = selectedRole?.permisos || [];
    return rolePerms.some(p => ['VER_POS', 'VER_CAJA', 'perm_ventas_crear', 'perm_caja_abrir', 'perm_caja_cerrar'].includes(p));
  }, [selectedRole]);

  // When employee is selected in user form, auto-fill sucursal
  const handleUserEmpChange = (identidad: string) => {
    const emp = empleados.find(e => e.identidad === identidad);
    setUserForm(f => ({
      ...f,
      identidad,
      id_sucursal: emp?.id_sucursal ? String(emp.id_sucursal) : f.id_sucursal,
      idCaja: '',
    }));
  };

  const openModal = (data?: any) => {
    setIsEditing(!!data);
    setCurrentId(data ? (data.codUsuario || data.identidad || data.idrol || data.idCaja) : null);
    setPermissionSearch('');
    if (activeTab === 'USERS') {
      setUserForm(data ? {
        usuario: data.usuario || '', password: '',
        identidad: data.identidad || '', idrol: data.idrol || '',
        idCaja: data.idCaja && data.idCaja !== 'Sin Caja' ? data.idCaja : '', estado: data.estado || 'Activo',
        id_sucursal: data.id_sucursal ? String(data.id_sucursal) : '',
      } : { usuario: '', password: '', identidad: '', idrol: '', idCaja: '', estado: 'Activo', id_sucursal: '' });
    } else if (activeTab === 'EMPLOYEES') {
      setEmpForm(data ? {
        identidad: data.identidad || '', nombre: data.nombre || '',
        apellido: data.apellido || '', direccion: data.direccion || '',
        telefono: data.telefono || '', estado: data.estado || 'Activo',
        id_sucursal: data.id_sucursal ? String(data.id_sucursal) : '',
      } : { identidad: '', nombre: '', apellido: '', direccion: '', telefono: '', estado: 'Activo', id_sucursal: '' });
    } else if (activeTab === 'ROLES') {
      setRolForm(data ? { nombre: data.nombre || '', estado: data.estado || 'Activo', permisos: data.permisos || [] }
        : { nombre: '', estado: 'Activo', permisos: [] });
    } else {
      setCajaForm(data ? { nombre: data.nombre || '', estado: data.estado || 'Activo', id_sucursal: data.id_sucursal ? String(data.id_sucursal) : '' }
        : { nombre: '', estado: 'Activo', id_sucursal: '' });
    }
    setShowModal(true);
  };

  const togglePermiso = (id: string) =>
    setRolForm(p => ({ ...p, permisos: p.permisos.includes(id) ? p.permisos.filter(x => x !== id) : [...p.permisos, id] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (activeTab === 'USERS') {
        if (!userForm.identidad || !userForm.idrol)
          return Swal.fire('Error', 'Seleccione Empleado y Rol', 'warning');
        if (selectedRoleRequiresCaja && !userForm.idCaja)
          return Swal.fire('Error', 'Este rol requiere una caja asignada', 'warning');
        if (isEditing) await AdminService.updateUser(currentId!, userForm);
        else {
          const result: any = await AdminService.createUser(userForm);
          setShowModal(false); loadData();
          await Swal.fire({
            icon: 'success', title: 'Usuario creado',
            html: `<p class="text-sm mb-2">Contraseña temporal:</p>
                   <div class="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-lg font-mono font-bold text-amber-700">${result.tempPassword}</div>
                   <p class="text-xs text-slate-400 mt-2">El usuario deberá cambiarla en su primer inicio de sesión.</p>`,
            confirmButtonText: 'Entendido', confirmButtonColor: '#4f46e5'
          });
          return;
        }
      } else if (activeTab === 'EMPLOYEES') {
        const payload = { ...empForm, id_sucursal: empForm.id_sucursal ? Number(empForm.id_sucursal) : null };
        if (isEditing) await AdminService.updateEmpleado(currentId!, payload);
        else await AdminService.createEmpleado({ ...payload, estado: 'Activo' });
      } else if (activeTab === 'ROLES') {
        if (isEditing) await AdminService.updateRol(currentId!, rolForm);
        else await AdminService.createRol(rolForm);
      } else if (activeTab === 'CAJAS') {
        if (!cajaForm.id_sucursal)
          return Swal.fire('Error', 'Seleccione una sucursal para la caja', 'warning');
        const payload = { ...cajaForm, id_sucursal: Number(cajaForm.id_sucursal) };
        if (isEditing) await AdminService.updateCaja(currentId!, payload);
        else await AdminService.createCaja(cajaForm.nombre, Number(cajaForm.id_sucursal));
      }
      Swal.fire({ icon: 'success', title: isEditing ? 'Registro actualizado' : 'Registro creado', showConfirmButton: false, timer: 1500 });
      setShowModal(false); loadData();
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message || 'Error desconocido' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const r = await Swal.fire({ title: '¿Eliminar?', text: 'No podrás revertir esto.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar' });
    if (!r.isConfirmed) return;
    try {
      if (activeTab === 'USERS') await AdminService.deleteUser(id);
      else if (activeTab === 'EMPLOYEES') await AdminService.deleteEmpleado(id);
      else if (activeTab === 'ROLES') await AdminService.deleteRol(id);
      else if (activeTab === 'CAJAS') await AdminService.deleteCaja(id);
      Swal.fire({ icon: 'success', title: 'Eliminado', showConfirmButton: false, timer: 1200 });
      loadData();
    } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  // ── Transfer employee ─────────────────────────────────────────────────────
  const openTransfer = async (emp: Empleado) => {
    setTransferEmp(emp);
    setTransferForm({ id_sucursal_destino: '', nueva_idCaja: '' });
    setCajasFiltradas([]);
    setShowTransfer(true);
  };

  const handleTransferSucursalChange = async (id_sucursal: string) => {
    setTransferForm(f => ({ ...f, id_sucursal_destino: id_sucursal, nueva_idCaja: '' }));
    if (id_sucursal) {
      const c = await AdminService.getCajas(Number(id_sucursal)).catch(() => []);
      setCajasFiltradas(c);
    } else {
      setCajasFiltradas([]);
    }
  };

  const handleTransfer = async () => {
    if (!transferEmp || !transferForm.id_sucursal_destino)
      return Swal.fire('Error', 'Seleccione una sucursal de destino', 'warning');
    try {
      await AdminService.transferirEmpleado(
        transferEmp.identidad,
        Number(transferForm.id_sucursal_destino),
        transferForm.nueva_idCaja || undefined
      );
      Swal.fire({ icon: 'success', title: 'Empleado transferido', showConfirmButton: false, timer: 1800 });
      setShowTransfer(false); loadData();
    } catch (err: any) { Swal.fire('Error', err.message, 'error'); }
  };

  const permissionQuery = permissionSearch.trim().toLowerCase();
  const groupedPermisos = permisos.filter(p => {
    if (!permissionQuery) return true;
    return `${p.nombre} ${p.idPermiso} ${p.modulo}`.toLowerCase().includes(permissionQuery);
  }).reduce((acc, p) => {
    if (!acc[p.modulo]) acc[p.modulo] = [];
    acc[p.modulo].push(p);
    return acc;
  }, {} as Record<string, Permiso[]>);

  const getTitle = () => ({ USERS: 'Gestión de Usuarios', EMPLOYEES: 'Gestión de Empleados', ROLES: 'Roles y Permisos', CAJAS: 'Cajas Registradoras' })[activeTab];

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            {(activeTab === 'USERS') && <Users className="text-indigo-500" />}
            {(activeTab === 'EMPLOYEES') && <Briefcase className="text-indigo-500" />}
            {(activeTab === 'ROLES' || activeTab === 'CAJAS') && <Shield className="text-indigo-500" />}
            {getTitle()}
          </h2>
          <p className="text-slate-500 mt-1 text-sm">Administración del sistema</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="p-2.5 text-slate-500 hover:bg-white rounded-xl border border-transparent hover:border-slate-200">
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => openModal()} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all">
            <PlusCircle size={18} /> Nuevo Registro
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex-1 flex flex-col relative">
        {loading && (
          <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        )}

        <div className="overflow-x-auto w-full flex-1">
          <table className="w-full text-left min-w-[600px]">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold sticky top-0">
              <tr>
                {activeTab === 'USERS' && (<><th className="p-4">Usuario / Empleado</th><th className="p-4">Rol / Caja</th><th className="p-4">Sucursal</th><th className="p-4">Estado</th><th className="p-4 text-right">Acciones</th></>)}
                {activeTab === 'EMPLOYEES' && (<><th className="p-4">Empleado</th><th className="p-4">Sucursal</th><th className="p-4">Teléfono</th><th className="p-4">Estado</th><th className="p-4 text-right">Acciones</th></>)}
                {(activeTab === 'ROLES' || activeTab === 'CAJAS') && (<><th className="p-4">ID</th><th className="p-4">Nombre</th>{activeTab === 'CAJAS' && <th className="p-4">Sucursal</th>}<th className="p-4">Estado</th>{activeTab === 'ROLES' && <th className="p-4">Permisos</th>}<th className="p-4 text-right">Acciones</th></>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">

              {activeTab === 'USERS' && users.map(u => (
                <tr key={u.codUsuario} className="hover:bg-slate-50">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-700">{u.usuario}</span>
                      {u.requiresPasswordChange && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full border border-amber-300">Temp</span>}
                    </div>
                    <div className="text-xs text-slate-400">{u.nombreEmpleado}</div>
                  </td>
                  <td className="p-4 text-xs">
                    <div className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded inline-block mb-1 font-bold">{u.nombreRol || u.idrol}</div>
                    <div className="text-slate-500">{cajas.find(c => c.idCaja === u.idCaja)?.nombre || u.idCaja}</div>
                  </td>
                  <td className="p-4">
                    {(u as any).sucursal_nombre
                      ? <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{(u as any).sucursal_nombre}</span>
                      : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td className="p-4"><span className={`text-xs font-bold px-2 py-1 rounded-full ${u.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{u.estado}</span></td>
                  <td className="p-4 text-right">
                    <button onClick={() => openModal(u)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(u.codUsuario)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg ml-2"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}

              {activeTab === 'EMPLOYEES' && empleados.map(emp => (
                <tr key={emp.identidad} className="hover:bg-slate-50">
                  <td className="p-4">
                    <div className="font-bold text-slate-800">{emp.nombre} {emp.apellido}</div>
                    <div className="text-xs font-mono text-slate-500">{emp.identidad}</div>
                  </td>
                  <td className="p-4">
                    {emp.sucursal_nombre
                      ? <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 w-fit"><Building2 size={11} />{emp.sucursal_nombre}</span>
                      : <span className="text-xs text-slate-300">Sin sucursal</span>}
                  </td>
                  <td className="p-4 text-xs font-mono text-slate-600">{emp.telefono}</td>
                  <td className="p-4"><span className={`text-xs font-bold px-2 py-1 rounded-full ${emp.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{emp.estado}</span></td>
                  <td className="p-4 text-right space-x-1">
                    <button onClick={() => openTransfer(emp)} className="text-amber-500 hover:bg-amber-50 p-2 rounded-lg" title="Transferir sucursal"><ArrowRightLeft size={15} /></button>
                    <button onClick={() => openModal(emp)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(emp.identidad)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}

              {(activeTab === 'ROLES' || activeTab === 'CAJAS') && (activeTab === 'ROLES' ? roles : cajas).map((item: any) => (
                <tr key={item.idrol || item.idCaja} className="hover:bg-slate-50">
                  <td className="p-4 text-xs font-mono text-slate-500">{item.idrol || item.idCaja}</td>
                  <td className="p-4 font-bold text-slate-800">{item.nombre}</td>
                  {activeTab === 'CAJAS' && (
                    <td className="p-4">
                      {item.sucursal_nombre
                        ? <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 w-fit"><Building2 size={11} />{item.sucursal_nombre}</span>
                        : <span className="text-xs text-slate-300">Sin sucursal</span>}
                    </td>
                  )}
                  <td className="p-4"><span className={`text-xs font-bold px-2 py-1 rounded-full ${item.estado === 'Activo' || item.estado === 'Activa' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.estado}</span></td>
                  {activeTab === 'ROLES' && <td className="p-4"><span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">{item.permisos?.length || 0} accesos</span></td>}
                  <td className="p-4 text-right">
                    <button onClick={() => openModal(item)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(item.idrol || item.idCaja)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg ml-2"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}

            </tbody>
          </table>
        </div>
      </div>

      {/* ── Main modal ─────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h3 className="text-xl font-bold text-slate-800">
                {isEditing ? 'Editar' : 'Nuevo'} {activeTab === 'USERS' ? 'Usuario' : activeTab === 'EMPLOYEES' ? 'Empleado' : activeTab === 'ROLES' ? 'Rol y Permisos' : 'Caja'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24} /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

              {activeTab === 'USERS' && (
                <>
                  <div><label className={lbl}>Usuario</label>
                    <input required className={inp} value={userForm.usuario} onChange={e => setUserForm({ ...userForm, usuario: e.target.value })} placeholder="Ej: admin" />
                  </div>
                  {isEditing && (
                    <div><label className={lbl}>Nueva Contraseña <span className="text-slate-400 normal-case font-normal">(dejar en blanco para mantener)</span></label>
                      <input type="password" className={inp} value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} />
                    </div>
                  )}
                  <div><label className={lbl}>Sucursal</label>
                    <select className={inp} value={userForm.id_sucursal} onChange={e => setUserForm({ ...userForm, id_sucursal: e.target.value, idCaja: '' })}>
                      <option value="">— Todas las sucursales —</option>
                      {sucursales.map(s => <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={lbl}>Vincular a Empleado</label>
                    <select required className={inp} value={userForm.identidad} onChange={e => handleUserEmpChange(e.target.value)}>
                      <option value="">— Seleccionar Empleado —</option>
                      {empleados.map(e => <option key={e.identidad} value={e.identidad}>{e.nombre} {e.apellido} {e.sucursal_nombre ? `(${e.sucursal_nombre})` : ''}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={lbl}>Rol</label>
                      <select required className={inp} value={userForm.idrol} onChange={e => setUserForm({ ...userForm, idrol: e.target.value })}>
                        <option value="">— Rol —</option>
                        {roles.map(r => <option key={r.idrol} value={r.idrol}>{r.nombre}</option>)}
                      </select>
                    </div>
                    <div><label className={lbl}>Caja Asignada {selectedRoleRequiresCaja ? '*' : '(opcional)'}</label>
                      {!selectedRoleRequiresCaja && <p className="text-xs text-slate-400 mt-1">Roles administrativos, bodega o roles sin ventas pueden operar sin caja.</p>}
                      <select required={selectedRoleRequiresCaja} className={inp} value={userForm.idCaja} onChange={e => setUserForm({ ...userForm, idCaja: e.target.value })}>
                        <option value="">— Caja —</option>
                        {cajasFiltUser.map(c => <option key={c.idCaja} value={c.idCaja}>{c.nombre} {c.sucursal_nombre ? `· ${c.sucursal_nombre}` : ''}</option>)}
                      </select>
                    </div>
                  </div>
                  <div><label className={lbl}>Estado</label>
                    <select className={inp} value={userForm.estado} onChange={e => setUserForm({ ...userForm, estado: e.target.value })}>
                      <option value="Activo">Activo</option><option value="Inactivo">Inactivo</option>
                    </select>
                  </div>
                </>
              )}

              {activeTab === 'EMPLOYEES' && (
                <>
                  <div><label className={lbl}>Número de Identidad</label>
                    <input required disabled={isEditing} className={`${inp} disabled:bg-slate-200`} value={empForm.identidad} onChange={e => setEmpForm({ ...empForm, identidad: e.target.value })} placeholder="0000-0000-00000" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={lbl}>Nombre</label><input required className={inp} value={empForm.nombre} onChange={e => setEmpForm({ ...empForm, nombre: e.target.value })} /></div>
                    <div><label className={lbl}>Apellido</label><input required className={inp} value={empForm.apellido} onChange={e => setEmpForm({ ...empForm, apellido: e.target.value })} /></div>
                  </div>
                  <div><label className={lbl}>Sucursal Asignada</label>
                    <select className={inp} value={empForm.id_sucursal} onChange={e => setEmpForm({ ...empForm, id_sucursal: e.target.value })}>
                      <option value="">— Sin asignar —</option>
                      {sucursales.map(s => <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={lbl}>Dirección</label><input className={inp} value={empForm.direccion} onChange={e => setEmpForm({ ...empForm, direccion: e.target.value })} /></div>
                  <div><label className={lbl}>Teléfono</label><input className={inp} value={empForm.telefono} onChange={e => setEmpForm({ ...empForm, telefono: e.target.value })} /></div>
                </>
              )}

              {activeTab === 'ROLES' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={lbl}>Nombre del Rol</label><input required className={inp} value={rolForm.nombre} onChange={e => setRolForm({ ...rolForm, nombre: e.target.value })} placeholder="Ej: Vendedor" /></div>
                    <div><label className={lbl}>Estado</label>
                      <select className={inp} value={rolForm.estado} onChange={e => setRolForm({ ...rolForm, estado: e.target.value })}>
                        <option value="Activo">Activo</option><option value="Inactivo">Inactivo</option>
                      </select>
                    </div>
                  </div>
                  <div><label className={`${lbl} block mb-3`}>Asignar Permisos</label>
                    <input
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl mb-3 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      value={permissionSearch}
                      onChange={e => setPermissionSearch(e.target.value)}
                      placeholder="Buscar permiso por modulo, nombre o codigo..."
                    />
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-[420px] overflow-y-auto">
                      {(Object.entries(groupedPermisos) as [string, Permiso[]][]).length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-6">No hay permisos que coincidan con la busqueda.</p>
                      )}
                      {(Object.entries(groupedPermisos) as [string, Permiso[]][]).map(([modulo, perms]) => (
                        <div key={modulo} className="mb-4 last:mb-0">
                          <h4 className="text-xs font-bold text-indigo-600 uppercase mb-2 border-b border-indigo-100 pb-1">{modulo}</h4>
                          <div className="grid grid-cols-2 gap-2">
                            {perms.map(p => {
                              const sel = rolForm.permisos.includes(p.idPermiso);
                              return (
                                <div key={p.idPermiso} onClick={() => togglePermiso(p.idPermiso)}
                                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${sel ? 'bg-white shadow-sm border border-indigo-200' : 'hover:bg-slate-100'}`}>
                                  <div className={`w-5 h-5 rounded flex items-center justify-center ${sel ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                                    {sel && <CheckSquare size={14} className="text-white" />}
                                  </div>
                                  <span className="text-sm">{p.nombre}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'CAJAS' && (
                <>
                  <div><label className={lbl}>Sucursal <span className="text-red-500">*</span></label>
                    <select required className={inp} value={cajaForm.id_sucursal} onChange={e => setCajaForm({ ...cajaForm, id_sucursal: e.target.value })}>
                      <option value="">— Seleccionar Sucursal —</option>
                      {sucursales.map(s => <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre}</option>)}
                    </select>
                  </div>
                  <div><label className={lbl}>Nombre / Descripción</label>
                    <input required className={inp} value={cajaForm.nombre} onChange={e => setCajaForm({ ...cajaForm, nombre: e.target.value })} placeholder="Ej: Caja Principal" />
                  </div>
                  {isEditing && (
                    <div><label className={lbl}>Estado</label>
                      <select className={inp} value={cajaForm.estado} onChange={e => setCajaForm({ ...cajaForm, estado: e.target.value })}>
                        <option value="Activo">Activo</option><option value="Inactivo">Inactivo</option>
                      </select>
                    </div>
                  )}
                </>
              )}

              <div className="pt-4 flex gap-3">
                <button type="button" disabled={saving} onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 disabled:opacity-60">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 disabled:opacity-60 disabled:cursor-not-allowed">{saving ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Transfer modal ──────────────────────────────────────────────────── */}
      {showTransfer && transferEmp && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><ArrowRightLeft size={18} className="text-amber-500" /> Transferir Empleado</h3>
                <p className="text-sm text-slate-500 mt-0.5">{transferEmp.nombre} {transferEmp.apellido}</p>
              </div>
              <button onClick={() => setShowTransfer(false)} className="text-slate-400 hover:text-red-500"><X size={22} /></button>
            </div>

            {transferEmp.sucursal_nombre && (
              <div className="mb-4 bg-slate-50 rounded-xl p-3 text-sm text-slate-600 flex items-center gap-2">
                <Building2 size={15} className="text-slate-400" />
                Sucursal actual: <strong>{transferEmp.sucursal_nombre}</strong>
              </div>
            )}

            <div className="space-y-4">
              <div><label className={lbl}>Sucursal de Destino <span className="text-red-500">*</span></label>
                <select className={inp} value={transferForm.id_sucursal_destino} onChange={e => handleTransferSucursalChange(e.target.value)}>
                  <option value="">— Seleccionar sucursal —</option>
                  {sucursales.filter(s => s.id_sucursal !== transferEmp.id_sucursal && s.estado === 'Activa').map(s =>
                    <option key={s.id_sucursal} value={s.id_sucursal}>{s.nombre}</option>
                  )}
                </select>
              </div>
              <div><label className={lbl}>Nueva Caja Asignada <span className="text-slate-400 normal-case font-normal">(opcional)</span></label>
                <select className={inp} value={transferForm.nueva_idCaja} onChange={e => setTransferForm(f => ({ ...f, nueva_idCaja: e.target.value }))} disabled={!transferForm.id_sucursal_destino}>
                  <option value="">— Mantener caja actual / sin asignar —</option>
                  {cajasFiltradas.map(c => <option key={c.idCaja} value={c.idCaja}>{c.nombre}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowTransfer(false)} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">Cancelar</button>
              <button onClick={handleTransfer} className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl flex items-center justify-center gap-2">
                <ArrowRightLeft size={16} /> Transferir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
