import React, { useState, useEffect } from 'react';
import { Usuario, Empleado, Rol, Caja } from '../types';
import { AdminService } from '../services/api';
import { Users, UserPlus, Shield, Box, Search, Briefcase, PlusCircle, Save, X, Edit2 } from 'lucide-react';

type Tab = 'USERS' | 'EMPLOYEES' | 'ROLES' | 'CAJAS';

const AdminUsers: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('USERS');
  
  // Data State
  const [users, setUsers] = useState<Usuario[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<Tab>('USERS');

  // Form States
  const [userForm, setUserForm] = useState({ usuario: '', password: '', identidad: '', idrol: '', idCaja: '' });
  const [empForm, setEmpForm] = useState({ identidad: '', nombre: '', apellido: '', direccion: '', telefono: '' });
  const [simpleForm, setSimpleForm] = useState({ nombre: '' }); // Para Roles y Cajas

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [u, e, r, c] = await Promise.all([
        AdminService.getUsers(),
        AdminService.getEmpleados(),
        AdminService.getRoles(),
        AdminService.getCajas()
      ]);
      setUsers(u);
      setEmpleados(e);
      setRoles(r);
      setCajas(c);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (type: Tab) => {
    setModalType(type);
    setUserForm({ usuario: '', password: '', identidad: '', idrol: '', idCaja: '' });
    setEmpForm({ identidad: '', nombre: '', apellido: '', direccion: '', telefono: '' });
    setSimpleForm({ nombre: '' });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (modalType === 'USERS') {
        await AdminService.createUser(userForm);
      } else if (modalType === 'EMPLOYEES') {
        await AdminService.createEmpleado({ ...empForm, estado: 'Activo' });
      } else if (modalType === 'ROLES') {
        await AdminService.createRol(simpleForm.nombre);
      } else if (modalType === 'CAJAS') {
        await AdminService.createCaja(simpleForm.nombre);
      }
      
      alert('Registro creado exitosamente');
      setShowModal(false);
      loadAllData();
    } catch (error) {
      alert('Error al crear registro');
    }
  };

  const toggleUserStatus = async (user: Usuario) => {
    const newStatus = user.estado === 'Activo' ? 'Inactivo' : 'Activo';
    if (confirm(`¿Cambiar estado de ${user.usuario} a ${newStatus}?`)) {
      await AdminService.toggleUserStatus(user.codUsuario, newStatus);
      loadAllData();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Panel de Administración</h2>
          <p className="text-slate-500 mt-1">Gestión de Empleados, Usuarios y Permisos</p>
        </div>
      </div>

      {/* TABS DE NAVEGACIÓN */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        <button 
          onClick={() => setActiveTab('USERS')}
          className={`px-5 py-2.5 rounded-t-xl font-bold text-sm flex items-center gap-2 transition-all ${activeTab === 'USERS' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
        >
          <Users size={18} /> Usuarios
        </button>
        <button 
          onClick={() => setActiveTab('EMPLOYEES')}
          className={`px-5 py-2.5 rounded-t-xl font-bold text-sm flex items-center gap-2 transition-all ${activeTab === 'EMPLOYEES' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
        >
          <Briefcase size={18} /> Empleados
        </button>
        <button 
          onClick={() => setActiveTab('ROLES')}
          className={`px-5 py-2.5 rounded-t-xl font-bold text-sm flex items-center gap-2 transition-all ${activeTab === 'ROLES' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
        >
          <Shield size={18} /> Roles
        </button>
        <button 
          onClick={() => setActiveTab('CAJAS')}
          className={`px-5 py-2.5 rounded-t-xl font-bold text-sm flex items-center gap-2 transition-all ${activeTab === 'CAJAS' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
        >
          <Box size={18} /> Cajas
        </button>
      </div>

      {/* AREA DE CONTENIDO */}
      <div className="bg-white rounded-b-2xl rounded-tr-2xl shadow-sm border border-slate-100 overflow-hidden min-h-[400px]">
        
        {/* BARRA DE ACCIÓN */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-end">
          <button 
            onClick={() => openModal(activeTab)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold text-sm shadow-sm transition-all"
          >
            <PlusCircle size={18} /> Nuevo Registro
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-500">Cargando datos...</div>
        ) : (
          <div className="overflow-x-auto">
            {/* TABLA USUARIOS */}
            {activeTab === 'USERS' && (
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold">
                  <tr>
                    <th className="p-4">Código</th>
                    <th className="p-4">Usuario</th>
                    <th className="p-4">Empleado</th>
                    <th className="p-4">Rol</th>
                    <th className="p-4">Caja</th>
                    <th className="p-4 text-center">Estado</th>
                    <th className="p-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map(u => (
                    <tr key={u.codUsuario} className="hover:bg-slate-50">
                      <td className="p-4 text-xs font-mono text-slate-400">{u.codUsuario}</td>
                      <td className="p-4 font-bold text-slate-700">{u.usuario}</td>
                      <td className="p-4 text-sm">{u.nombreEmpleado}</td>
                      <td className="p-4"><span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-bold">{u.nombreRol}</span></td>
                      <td className="p-4 text-xs">{u.idCaja}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${u.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {u.estado}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <button onClick={() => toggleUserStatus(u)} className="text-slate-400 hover:text-indigo-600 p-1">
                          <Edit2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* TABLA EMPLEADOS */}
            {activeTab === 'EMPLOYEES' && (
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold">
                  <tr>
                    <th className="p-4">Identidad</th>
                    <th className="p-4">Nombre Completo</th>
                    <th className="p-4">Dirección</th>
                    <th className="p-4">Teléfono</th>
                    <th className="p-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {empleados.map(e => (
                    <tr key={e.identidad} className="hover:bg-slate-50">
                      <td className="p-4 font-mono font-bold text-slate-600">{e.identidad}</td>
                      <td className="p-4 text-slate-800">{e.nombre} {e.apellido}</td>
                      <td className="p-4 text-sm text-slate-500">{e.direccion}</td>
                      <td className="p-4 text-sm">{e.telefono}</td>
                      <td className="p-4 text-sm">{e.estado}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* TABLA ROLES */}
            {activeTab === 'ROLES' && (
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold">
                  <tr>
                    <th className="p-4">ID Rol</th>
                    <th className="p-4">Nombre del Rol</th>
                    <th className="p-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roles.map(r => (
                    <tr key={r.idrol} className="hover:bg-slate-50">
                      <td className="p-4 font-mono text-slate-500">{r.idrol}</td>
                      <td className="p-4 font-bold text-slate-700">{r.nombre}</td>
                      <td className="p-4"><span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">{r.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

             {/* TABLA CAJAS */}
             {activeTab === 'CAJAS' && (
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold">
                  <tr>
                    <th className="p-4">ID Caja</th>
                    <th className="p-4">Nombre de Caja</th>
                    <th className="p-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cajas.map(c => (
                    <tr key={c.idCaja} className="hover:bg-slate-50">
                      <td className="p-4 font-mono text-slate-500">{c.idCaja}</td>
                      <td className="p-4 font-bold text-slate-700">{c.nombre}</td>
                      <td className="p-4"><span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">{c.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* MODAL UNIVERSAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 animate-fade-in">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">
                {modalType === 'USERS' && 'Crear Nuevo Usuario'}
                {modalType === 'EMPLOYEES' && 'Registrar Empleado'}
                {modalType === 'ROLES' && 'Crear Nuevo Rol'}
                {modalType === 'CAJAS' && 'Registrar Caja'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X size={24}/></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* FORMULARIO USUARIOS */}
              {modalType === 'USERS' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500">Usuario (Login)</label>
                      <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={userForm.usuario} onChange={e => setUserForm({...userForm, usuario: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500">Contraseña</label>
                      <input required type="password" className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500">Empleado Vinculado</label>
                    <select required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={userForm.identidad} onChange={e => setUserForm({...userForm, identidad: e.target.value})}>
                      <option value="">Seleccione...</option>
                      {empleados.map(e => <option key={e.identidad} value={e.identidad}>{e.nombre} {e.apellido}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500">Rol</label>
                      <select required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={userForm.idrol} onChange={e => setUserForm({...userForm, idrol: e.target.value})}>
                        <option value="">Seleccione...</option>
                        {roles.map(r => <option key={r.idrol} value={r.idrol}>{r.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500">Caja Asignada</label>
                      <select required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={userForm.idCaja} onChange={e => setUserForm({...userForm, idCaja: e.target.value})}>
                        <option value="">Seleccione...</option>
                        {cajas.map(c => <option key={c.idCaja} value={c.idCaja}>{c.nombre}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* FORMULARIO EMPLEADOS */}
              {modalType === 'EMPLOYEES' && (
                <>
                  <div>
                    <label className="text-xs font-bold text-slate-500">Número de Identidad (DNI)</label>
                    <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" placeholder="0801..." value={empForm.identidad} onChange={e => setEmpForm({...empForm, identidad: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500">Nombre</label>
                      <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={empForm.nombre} onChange={e => setEmpForm({...empForm, nombre: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500">Apellido</label>
                      <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={empForm.apellido} onChange={e => setEmpForm({...empForm, apellido: e.target.value})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="text-xs font-bold text-slate-500">Teléfono</label>
                       <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={empForm.telefono} onChange={e => setEmpForm({...empForm, telefono: e.target.value})} />
                    </div>
                    <div>
                       <label className="text-xs font-bold text-slate-500">Dirección</label>
                       <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={empForm.direccion} onChange={e => setEmpForm({...empForm, direccion: e.target.value})} />
                    </div>
                  </div>
                </>
              )}

              {/* FORMULARIO SIMPLE (Roles y Cajas) */}
              {(modalType === 'ROLES' || modalType === 'CAJAS') && (
                <div>
                   <label className="text-xs font-bold text-slate-500">Nombre / Descripción</label>
                   <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" placeholder={`Nombre del ${modalType === 'ROLES' ? 'Rol' : 'Caja'}`} value={simpleForm.nombre} onChange={e => setSimpleForm({...simpleForm, nombre: e.target.value})} />
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/20">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;