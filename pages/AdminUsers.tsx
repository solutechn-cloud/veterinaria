import React, { useState, useEffect } from 'react';
import { Usuario, Empleado, Rol, Caja } from '../types';
import { Users, UserPlus, Shield, Box, Search } from 'lucide-react';

// Se necesitaría agregar estos métodos en services/api.ts, pero por simplicidad los definimos inline para la estructura
// En un entorno real, estos fetch irían en el archivo api.ts

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<Usuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [cajas, setCajas] = useState<Caja[]>([]);
  
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    usuario: '',
    password: '',
    identidad: '', // Empleado
    idrol: '',
    idCaja: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const token = localStorage.getItem('smartcloud_token');
    const headers = { 'Authorization': `Bearer ${token}` };

    try {
      const [uRes, rRes, eRes, cRes] = await Promise.all([
        fetch('/api/users', { headers }),
        fetch('/api/roles', { headers }),
        fetch('/api/empleados', { headers }),
        fetch('/api/cajas', { headers })
      ]);

      setUsers(await uRes.json());
      setRoles(await rRes.json());
      setEmpleados(await eRes.json());
      setCajas(await cRes.json());
    } catch (error) {
      console.error("Error cargando datos de admin", error);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('smartcloud_token');
    
    // Generar ID único simple
    const codUsuario = `USER-${Date.now()}`;

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ ...formData, codUsuario })
      });

      if (res.ok) {
        setShowModal(false);
        fetchData();
        setFormData({ usuario: '', password: '', identidad: '', idrol: '', idCaja: '' });
        alert('Usuario creado con éxito');
      } else {
        alert('Error al crear usuario');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Gestión de Usuarios</h2>
          <p className="text-slate-500 mt-1">Configuración de accesos y roles de empleados</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-medium shadow-lg shadow-indigo-600/20"
        >
          <UserPlus size={20} /> Nuevo Usuario
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-bold border-b border-slate-100">
            <tr>
              <th className="p-5">Usuario / Login</th>
              <th className="p-5">Empleado Asignado</th>
              <th className="p-5">Rol / Privilegios</th>
              <th className="p-5">Caja Asignada</th>
              <th className="p-5 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {users.map((u) => (
              <tr key={u.codUsuario} className="hover:bg-slate-50/50">
                <td className="p-5 font-medium text-slate-800 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                    <Users size={16} />
                  </div>
                  {u.usuario}
                </td>
                <td className="p-5 text-sm text-slate-600">{u.nombreEmpleado}</td>
                <td className="p-5">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border ${u.nombreRol === 'Administrador' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                    <Shield size={12} /> {u.nombreRol}
                  </span>
                </td>
                <td className="p-5 text-sm text-slate-500 font-mono">{u.idCaja}</td>
                <td className="p-5 text-center">
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-bold">Activo</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de Creación */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-4">Crear Nuevo Usuario</h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Usuario (Login)</label>
                  <input required className="w-full p-2 border rounded-lg" value={formData.usuario} onChange={e => setFormData({...formData, usuario: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Contraseña</label>
                  <input required type="password" className="w-full p-2 border rounded-lg" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Empleado</label>
                <select required className="w-full p-2 border rounded-lg" value={formData.identidad} onChange={e => setFormData({...formData, identidad: e.target.value})}>
                  <option value="">Seleccione Empleado...</option>
                  {empleados.map(e => <option key={e.identidad} value={e.identidad}>{e.nombre} {e.apellido}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Rol</label>
                  <select required className="w-full p-2 border rounded-lg" value={formData.idrol} onChange={e => setFormData({...formData, idrol: e.target.value})}>
                     <option value="">Seleccione...</option>
                     {roles.map(r => <option key={r.idrol} value={r.idrol}>{r.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Caja Asignada</label>
                  <select required className="w-full p-2 border rounded-lg" value={formData.idCaja} onChange={e => setFormData({...formData, idCaja: e.target.value})}>
                     <option value="">Seleccione...</option>
                     {cajas.map(c => <option key={c.idCaja} value={c.idCaja}>{c.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700">Guardar Usuario</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;