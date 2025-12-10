
import React, { useState, useEffect } from 'react';
import { Usuario, Empleado, Rol, Caja, EstadoGeneral, Permiso } from '../types';
import { AdminService } from '../services/api';
import { Users, Shield, Box, Briefcase, PlusCircle, X, Edit2, Trash2, CheckCircle, AlertCircle, CheckSquare, Square } from 'lucide-react';
import Swal from 'sweetalert2';

type Tab = 'USERS' | 'EMPLOYEES' | 'ROLES' | 'CAJAS';

interface AdminUsersProps {
  initialView: Tab;
}

const AdminUsers: React.FC<AdminUsersProps> = ({ initialView }) => {
  const [activeTab, setActiveTab] = useState<Tab>(initialView);
  
  const [users, setUsers] = useState<Usuario[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [loading, setLoading] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  // Forms State
  const [userForm, setUserForm] = useState({ usuario: '', password: '', identidad: '', idrol: '', idCaja: '', estado: 'Activo' });
  const [empForm, setEmpForm] = useState({ identidad: '', nombre: '', apellido: '', direccion: '', telefono: '', estado: 'Activo' });
  // Expanded Rol Form
  const [rolForm, setRolForm] = useState<{nombre: string, estado: string, permisos: string[]}>({ nombre: '', estado: 'Activo', permisos: [] });
  // Simple Form for Caja
  const [simpleForm, setSimpleForm] = useState({ nombre: '', estado: 'Activo' });

  // Sync activeTab when initialView prop changes (User navigation)
  useEffect(() => {
    setActiveTab(initialView);
  }, [initialView]);

  // Load data whenever tab changes
  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'USERS') {
         const [u, e, r, c] = await Promise.all([
            AdminService.getUsers(),
            AdminService.getEmpleados(),
            AdminService.getRoles(),
            AdminService.getCajas()
         ]);
         setUsers(u || []);
         setEmpleados(e || []);
         setRoles(r || []);
         setCajas(c || []);
      } else if (activeTab === 'EMPLOYEES') {
         const data = await AdminService.getEmpleados();
         setEmpleados(data || []);
      } else if (activeTab === 'ROLES') {
         const [r, p] = await Promise.all([
             AdminService.getRoles(),
             AdminService.getPermisos()
         ]);
         setRoles(r || []);
         setPermisos(p || []);
      } else if (activeTab === 'CAJAS') {
         const data = await AdminService.getCajas();
         setCajas(data || []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch(activeTab) {
      case 'USERS': return 'Gestión de Usuarios';
      case 'EMPLOYEES': return 'Gestión de Empleados';
      case 'ROLES': return 'Roles y Permisos';
      case 'CAJAS': return 'Cajas Registradoras';
      default: return 'Administración';
    }
  };

  const openModal = (data?: any) => {
    setIsEditing(!!data);
    setCurrentId(data ? (data.codUsuario || data.identidad || data.idrol || data.idCaja) : null);

    // Reset Forms based on current tab
    if (activeTab === 'USERS') {
      setUserForm(data ? { 
        usuario: data.usuario || '', 
        password: '', // Never fill password
        identidad: data.identidad || '', 
        idrol: data.idrol || '', 
        idCaja: data.idCaja || '',
        estado: data.estado || 'Activo'
      } : { usuario: '', password: '', identidad: '', idrol: '', idCaja: '', estado: 'Activo' });
    } else if (activeTab === 'EMPLOYEES') {
      setEmpForm(data ? { 
        identidad: data.identidad || '', 
        nombre: data.nombre || '', 
        apellido: data.apellido || '', 
        direccion: data.direccion || '', 
        telefono: data.telefono || '',
        estado: data.estado || 'Activo'
      } : { identidad: '', nombre: '', apellido: '', direccion: '', telefono: '', estado: 'Activo' });
    } else if (activeTab === 'ROLES') {
        setRolForm(data ? {
            nombre: data.nombre || '',
            estado: data.estado || 'Activo',
            permisos: data.permisos || []
        } : { nombre: '', estado: 'Activo', permisos: [] });
    } else {
      setSimpleForm(data ? { nombre: data.nombre || '', estado: data.estado || 'Activo' } : { nombre: '', estado: 'Activo' });
    }
    
    setShowModal(true);
  };

  const togglePermiso = (idPermiso: string) => {
      setRolForm(prev => {
          const exists = prev.permisos.includes(idPermiso);
          return {
              ...prev,
              permisos: exists 
                 ? prev.permisos.filter(p => p !== idPermiso)
                 : [...prev.permisos, idPermiso]
          };
      });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (activeTab === 'USERS') {
        if (!userForm.identidad || !userForm.idrol || !userForm.idCaja) {
           return Swal.fire('Error', 'Seleccione Empleado, Rol y Caja', 'warning');
        }
        if(isEditing) await AdminService.updateUser(currentId!, userForm);
        else await AdminService.createUser(userForm);
      } else if (activeTab === 'EMPLOYEES') {
        const empPayload = { ...empForm, estado: empForm.estado as EstadoGeneral };
        if (isEditing) await AdminService.updateEmpleado(currentId!, empPayload);
        else await AdminService.createEmpleado({ ...empPayload, estado: 'Activo' });
      } else if (activeTab === 'ROLES') {
        const rolPayload = { ...rolForm, estado: rolForm.estado as EstadoGeneral };
        if (isEditing) await AdminService.updateRol(currentId!, rolPayload);
        else await AdminService.createRol(rolPayload);
      } else if (activeTab === 'CAJAS') {
        const cajaPayload = { ...simpleForm, estado: simpleForm.estado as Caja['estado'] };
        if (isEditing) await AdminService.updateCaja(currentId!, cajaPayload);
        else await AdminService.createCaja(simpleForm.nombre);
      }
      
      Swal.fire({
        icon: 'success',
        title: isEditing ? 'Registro actualizado' : 'Registro creado',
        showConfirmButton: false,
        timer: 1500
      });

      setShowModal(false);
      loadData();
    } catch (error: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Error desconocido'
      });
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: "No podrás revertir esto.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            if (activeTab === 'USERS') await AdminService.deleteUser(id);
            else if (activeTab === 'EMPLOYEES') await AdminService.deleteEmpleado(id);
            else if (activeTab === 'ROLES') await AdminService.deleteRol(id);
            else if (activeTab === 'CAJAS') await AdminService.deleteCaja(id);
            
            Swal.fire('Eliminado', 'Registro eliminado.', 'success');
            loadData();
        } catch (error: any) {
            Swal.fire('Error', error.message, 'error');
        }
    }
  };

  // Agrupar permisos por modulo
  const groupedPermisos = permisos.reduce((acc, curr) => {
      if(!acc[curr.modulo]) acc[curr.modulo] = [];
      acc[curr.modulo].push(curr);
      return acc;
  }, {} as Record<string, Permiso[]>);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            {activeTab === 'USERS' && <Users className="text-indigo-500"/>}
            {activeTab === 'EMPLOYEES' && <Briefcase className="text-indigo-500"/>}
            {(activeTab === 'ROLES' || activeTab === 'CAJAS') && <Shield className="text-indigo-500"/>}
            {getTitle()}
          </h2>
          <p className="text-slate-500 mt-1 text-sm">Administración del sistema</p>
        </div>
        <button 
            onClick={() => openModal()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all w-full md:w-auto justify-center"
          >
            <PlusCircle size={18} /> Nuevo Registro
          </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex-1 flex flex-col relative">
        {loading && (
             <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center">
                 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
             </div>
        )}
        
        <div className="overflow-x-auto w-full flex-1">
            <table className="w-full text-left min-w-[600px]">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold sticky top-0">
                 <tr>
                    {activeTab === 'USERS' && (
                      <>
                        <th className="p-4">Usuario / Empleado</th>
                        <th className="p-4">Rol / Caja</th>
                        <th className="p-4">Estado</th>
                        <th className="p-4 text-right">Acciones</th>
                      </>
                    )}
                    {activeTab === 'EMPLOYEES' && (
                      <>
                        <th className="p-4">Empleado</th>
                        <th className="p-4">Dirección</th>
                        <th className="p-4">Teléfono</th>
                        <th className="p-4">Estado</th>
                        <th className="p-4 text-right">Acciones</th>
                      </>
                    )}
                    {(activeTab === 'ROLES' || activeTab === 'CAJAS') && (
                       <>
                        <th className="p-4">ID</th>
                        <th className="p-4">Nombre</th>
                        <th className="p-4">Estado</th>
                        {activeTab === 'ROLES' && <th className="p-4">Permisos</th>}
                        <th className="p-4 text-right">Acciones</th>
                       </>
                    )}
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeTab === 'USERS' && users.map(u => (
                  <tr key={u.codUsuario} className="hover:bg-slate-50">
                     <td className="p-4">
                        <div className="font-bold text-slate-700">{u.usuario}</div>
                        <div className="text-xs text-slate-400">{u.nombreEmpleado}</div>
                     </td>
                     <td className="p-4 text-xs">
                        <div className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded inline-block mb-1 font-bold">{u.nombreRol || u.idrol}</div>
                        <div className="text-slate-500">{cajas.find(c => c.idCaja === u.idCaja)?.nombre || u.idCaja}</div>
                     </td>
                     <td className="p-4"><span className={`text-xs font-bold px-2 py-1 rounded-full ${u.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{u.estado}</span></td>
                     <td className="p-4 text-right">
                        <button onClick={() => openModal(u)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition-colors"><Edit2 size={16}/></button>
                        <button onClick={() => handleDelete(u.codUsuario)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors ml-2"><Trash2 size={16}/></button>
                     </td>
                  </tr>
                ))}
                
                {activeTab === 'EMPLOYEES' && empleados.map(e => (
                   <tr key={e.identidad} className="hover:bg-slate-50">
                      <td className="p-4">
                         <div className="font-bold text-slate-800">{e.nombre} {e.apellido}</div>
                         <div className="text-xs font-mono text-slate-500">{e.identidad}</div>
                      </td>
                      <td className="p-4 text-xs text-slate-600">{e.direccion}</td>
                      <td className="p-4 text-xs font-mono">{e.telefono}</td>
                      <td className="p-4"><span className={`text-xs font-bold px-2 py-1 rounded-full ${e.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{e.estado}</span></td>
                      <td className="p-4 text-right">
                         <button onClick={() => openModal(e)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition-colors"><Edit2 size={16}/></button>
                         <button onClick={() => handleDelete(e.identidad)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors ml-2"><Trash2 size={16}/></button>
                      </td>
                   </tr>
                ))}

                {(activeTab === 'ROLES' || activeTab === 'CAJAS') && (activeTab === 'ROLES' ? roles : cajas).map((item: any) => (
                    <tr key={item.idrol || item.idCaja} className="hover:bg-slate-50">
                        <td className="p-4 text-xs font-mono text-slate-500">{item.idrol || item.idCaja}</td>
                        <td className="p-4 font-bold text-slate-800">{item.nombre}</td>
                        <td className="p-4"><span className={`text-xs font-bold px-2 py-1 rounded-full ${item.estado === 'Activo' || item.estado === 'Activa' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.estado}</span></td>
                        {activeTab === 'ROLES' && (
                            <td className="p-4">
                                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                                    {(item.permisos?.length || 0)} accesos
                                </span>
                            </td>
                        )}
                        <td className="p-4 text-right">
                           <button onClick={() => openModal(item)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition-colors"><Edit2 size={16}/></button>
                           <button onClick={() => handleDelete(item.idrol || item.idCaja)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors ml-2"><Trash2 size={16}/></button>
                        </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
             <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                <h3 className="text-xl font-bold text-slate-800">
                    {isEditing ? 'Editar' : 'Nuevo'} {activeTab === 'USERS' ? 'Usuario' : activeTab === 'EMPLOYEES' ? 'Empleado' : activeTab === 'ROLES' ? 'Rol y Permisos' : 'Caja'}
                </h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24}/></button>
             </div>
             
             <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* --- FORMULARIO USUARIOS --- */}
                {activeTab === 'USERS' && (
                    <>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Usuario</label>
                            <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                value={userForm.usuario} onChange={e => setUserForm({...userForm, usuario: e.target.value})} placeholder="Ej: admin" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Contraseña {isEditing && '(Dejar en blanco para mantener)'}</label>
                            <input type="password" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} placeholder={isEditing ? "******" : "Contraseña"} required={!isEditing}/>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Vincular a Empleado</label>
                            <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 focus:ring-2 focus:ring-indigo-500 outline-none" 
                                value={userForm.identidad} onChange={e => setUserForm({...userForm, identidad: e.target.value})} required>
                                <option value="">-- Seleccionar Empleado --</option>
                                {empleados.map(e => (
                                    <option key={e.identidad} value={e.identidad}>{e.nombre} {e.apellido}</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Rol</label>
                                <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                    value={userForm.idrol} onChange={e => setUserForm({...userForm, idrol: e.target.value})} required>
                                    <option value="">-- Rol --</option>
                                    {roles.map(r => <option key={r.idrol} value={r.idrol}>{r.nombre}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Caja Asignada</label>
                                <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                    value={userForm.idCaja} onChange={e => setUserForm({...userForm, idCaja: e.target.value})} required>
                                    <option value="">-- Caja --</option>
                                    {cajas.map(c => <option key={c.idCaja} value={c.idCaja}>{c.nombre}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                             <label className="text-xs font-bold text-slate-500 uppercase">Estado</label>
                             <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                value={userForm.estado} onChange={e => setUserForm({...userForm, estado: e.target.value})}>
                                <option value="Activo">Activo</option>
                                <option value="Inactivo">Inactivo</option>
                             </select>
                        </div>
                    </>
                )}

                {/* --- FORMULARIO EMPLEADOS --- */}
                {activeTab === 'EMPLOYEES' && (
                    <>
                         <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Número Identidad</label>
                            <input required disabled={isEditing} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 disabled:bg-slate-200" 
                                value={empForm.identidad} onChange={e => setEmpForm({...empForm, identidad: e.target.value})} placeholder="0000-0000-00000" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Nombre</label>
                                <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                    value={empForm.nombre} onChange={e => setEmpForm({...empForm, nombre: e.target.value})} />
                             </div>
                             <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Apellido</label>
                                <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                    value={empForm.apellido} onChange={e => setEmpForm({...empForm, apellido: e.target.value})} />
                             </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Dirección</label>
                            <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                value={empForm.direccion} onChange={e => setEmpForm({...empForm, direccion: e.target.value})} />
                        </div>
                         <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Teléfono</label>
                            <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                value={empForm.telefono} onChange={e => setEmpForm({...empForm, telefono: e.target.value})} />
                        </div>
                    </>
                )}

                {/* --- FORMULARIO ROLES (AVANZADO) --- */}
                {activeTab === 'ROLES' && (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Nombre del Rol</label>
                                <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                    value={rolForm.nombre} onChange={e => setRolForm({...rolForm, nombre: e.target.value})} placeholder="Ej: Vendedor" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Estado</label>
                                <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                    value={rolForm.estado} onChange={e => setRolForm({...rolForm, estado: e.target.value})}>
                                    <option value="Activo">Activo</option>
                                    <option value="Inactivo">Inactivo</option>
                                </select>
                            </div>
                        </div>
                        
                        <div className="mt-4">
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-3">Asignar Permisos</label>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-[300px] overflow-y-auto">
                                {Object.entries(groupedPermisos).map(([modulo, perms]) => (
                                    <div key={modulo} className="mb-4 last:mb-0">
                                        <h4 className="text-xs font-bold text-indigo-600 uppercase mb-2 border-b border-indigo-100 pb-1">{modulo}</h4>
                                        <div className="grid grid-cols-2 gap-2">
                                            {perms.map(p => {
                                                const isSelected = rolForm.permisos.includes(p.idPermiso);
                                                return (
                                                    <div 
                                                        key={p.idPermiso} 
                                                        onClick={() => togglePermiso(p.idPermiso)}
                                                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${isSelected ? 'bg-white shadow-sm border border-indigo-200' : 'hover:bg-slate-100'}`}
                                                    >
                                                        <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${isSelected ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                                                            {isSelected && <CheckSquare size={14} className="text-white"/>}
                                                        </div>
                                                        <span className={`text-sm ${isSelected ? 'font-bold text-slate-800' : 'text-slate-600'}`}>{p.nombre}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {/* --- FORMULARIO CAJAS --- */}
                {activeTab === 'CAJAS' && (
                    <>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Nombre / Descripción</label>
                            <input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                value={simpleForm.nombre} onChange={e => setSimpleForm({...simpleForm, nombre: e.target.value})} />
                        </div>
                        <div>
                             <label className="text-xs font-bold text-slate-500 uppercase">Estado</label>
                             <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1" 
                                value={simpleForm.estado} onChange={e => setSimpleForm({...simpleForm, estado: e.target.value})}>
                                <option value="Activo">Activo</option>
                                <option value="Inactivo">Inactivo</option>
                             </select>
                        </div>
                    </>
                )}

                <div className="pt-4 flex gap-3">
                   <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancelar</button>
                   <button type="submit" className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all">Guardar</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
