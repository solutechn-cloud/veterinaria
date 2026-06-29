
import React, { useState, useEffect } from 'react';
import { AIService, ClientService } from '../services/api';
import { Cliente } from '../types';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { Bot, Search, PlusCircle, Users, Edit2, Trash2, X, RefreshCw, Mail, Phone, MapPin, UserCheck } from 'lucide-react';
import Swal from 'sweetalert2';

const Clients: React.FC = () => {
  const [clients, setClients] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<Partial<Cliente>>({});

  // AI State
  const [clientAI, setClientAI] = useState<{[key: string]: any}>({});
  const [clientAILoading, setClientAILoading] = useState<string | null>(null);

  const displayIdentity = (client: Cliente) => (
    client.tipo_identificacion === 'telefono' || String(client.identidad || '').startsWith('TEL_')
      ? 'Telefono movil'
      : client.identidad
  );

  const handleAIAnalyze = async (identidad: string) => {
    if (clientAI[identidad] || clientAILoading === identidad) return;
    setClientAILoading(identidad);
    try {
      const result = await AIService.analyzeClient(identidad);
      setClientAI(prev => ({ ...prev, [identidad]: result?.error ? { error: true } : result }));
    } catch {
      setClientAI(prev => ({ ...prev, [identidad]: { error: true } }));
    } finally {
      setClientAILoading(null);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await ClientService.getAll();
      setClients(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useOfflineSync(loadClients);

  const openNewModal = () => {
    setIsEditing(false);
    setForm({ tipo_identificacion: 'identidad', sin_correo: false });
    setShowModal(true);
  };

  const openEditModal = (client: Cliente) => {
    setIsEditing(true);
    setForm({ ...client, tipo_identificacion: client.tipo_identificacion || (String(client.identidad || '').startsWith('TEL_') ? 'telefono' : 'identidad') });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const tipo = form.tipo_identificacion || 'identidad';
      if (tipo === 'identidad' && !form.identidad?.trim()) {
        Swal.fire('Identificacion requerida', 'Ingrese el numero de identidad o seleccione Ninguno / telefono movil.', 'warning');
        return;
      }
      if (tipo === 'telefono' && !form.telefono?.trim()) {
        Swal.fire('Telefono requerido', 'Si el tutor no tiene documento, el movil/WhatsApp es obligatorio.', 'warning');
        return;
      }
      const payload = {
        ...form,
        identidad: tipo === 'telefono' ? '' : (form.identidad || '').trim(),
        correo: form.sin_correo ? '' : (form.correo || '').trim(),
      };
      if (isEditing) {
        await ClientService.update(form.identidad!, payload);
      } else {
        await ClientService.create(payload as Cliente);
      }
      setShowModal(false);
      Swal.fire({
        icon: 'success',
        title: isEditing ? 'Tutor Actualizado' : 'Tutor Registrado',
        timer: 1500,
        showConfirmButton: false
      });
      loadClients();
    } catch (error: any) {
      Swal.fire('Error', error.message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: '¿Eliminar tutor?',
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await ClientService.delete(id);
        Swal.fire('Eliminado', 'El tutor ha sido eliminado.', 'success');
        loadClients();
      } catch (error: any) {
        Swal.fire('Error', error.message, 'error');
      }
    }
  };

  const filteredClients = clients.filter(c => {
    const q = searchTerm.toLowerCase();
    return `${c.nombre} ${c.apellido || ''} ${c.identidad} ${c.telefono || ''} ${c.correo || ''} ${c.ciudad_municipio || ''} ${c.contacto_autorizado_nombre || ''}`
      .toLowerCase()
      .includes(q);
  });

  const isPhoneOnly = (form.tipo_identificacion || 'identidad') === 'telefono';
  const hasNoEmail = Boolean(form.sin_correo);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-end mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="text-indigo-600" /> Tutores
          </h2>
          <p className="text-slate-500 text-sm">Gestiona tutores responsables de pacientes veterinarios</p>
        </div>
        <button 
           onClick={openNewModal}
           className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-bold shadow-lg shadow-emerald-600/20 transition-all"
        >
          <PlusCircle size={20} />
          <span>Nuevo Tutor</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50">
           <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por nombre, identidad, telefono, ciudad o autorizado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <button onClick={loadClients} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg border border-slate-200 bg-white">
            <RefreshCw size={20} />
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-xs font-bold text-slate-500 uppercase sticky top-0 z-10">
              <tr>
                <th className="p-4">Identidad</th>
                <th className="p-4">Tutor</th>
                <th className="p-4">Ciudad</th>
                <th className="p-4">Telefono</th>
                <th className="p-4">Autorizado</th>
                <th className="p-4">Correo</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                 <tr><td colSpan={7} className="p-8 text-center text-slate-500">Cargando...</td></tr>
              ) : filteredClients.map(c => (
                <React.Fragment key={c.identidad}>
                  <tr className="hover:bg-slate-50">
                    <td className="p-4 font-mono text-slate-600 font-bold">{displayIdentity(c)}</td>
                    <td className="p-4 text-slate-800 font-medium">{c.nombre} {c.apellido}</td>
                    <td className="p-4 text-sm text-slate-500 truncate max-w-[180px]">{c.ciudad_municipio || c.direccion || '-'}</td>
                    <td className="p-4 text-sm font-mono text-slate-600">{c.telefono}</td>
                    <td className="p-4 text-sm text-slate-500">{c.contacto_autorizado_nombre || '-'}</td>
                    <td className="p-4 text-sm text-blue-600">{c.sin_correo ? <span className="text-slate-400">Sin email</span> : (c.correo || '-')}</td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => handleAIAnalyze(c.identidad)} disabled={clientAILoading === c.identidad} title="Análisis IA" className="text-[10px] font-black px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 transition-all border border-indigo-100 flex items-center gap-1">
                          {clientAILoading === c.identidad ? <span className="inline-block w-2.5 h-2.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/> : <Bot size={12} />}
                          IA
                        </button>
                        <button onClick={() => openEditModal(c)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16}/></button>
                        <button onClick={() => handleDelete(c.identidad)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                      </div>
                    </td>
                  </tr>
                  {clientAI[c.identidad] && (
                    <tr className="bg-indigo-50/40">
                      <td colSpan={7} className="px-6 pb-4 pt-0">
                        {clientAI[c.identidad].error ? (
                          <p className="text-xs text-slate-400 italic py-2">IA no disponible para este cliente.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 py-3">
                            {clientAI[c.identidad].perfilCliente && (
                              <div className="bg-white rounded-xl p-3 border border-indigo-100 shadow-sm">
                                <p className="text-[9px] font-black text-indigo-500 uppercase mb-1">Perfil</p>
                                <p className="text-xs font-bold text-slate-700">{clientAI[c.identidad].perfilCliente}</p>
                              </div>
                            )}
                            {clientAI[c.identidad].resumen && (
                              <div className="bg-white rounded-xl p-3 border border-indigo-100 shadow-sm md:col-span-1">
                                <p className="text-[9px] font-black text-indigo-500 uppercase mb-1">Resumen</p>
                                <p className="text-xs text-slate-600 leading-relaxed">{clientAI[c.identidad].resumen}</p>
                              </div>
                            )}
                            {clientAI[c.identidad].sugerenciaAccion && (
                              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 shadow-sm">
                                <p className="text-[9px] font-black text-amber-600 uppercase mb-1">Acción sugerida</p>
                                <p className="text-xs font-bold text-amber-800">{clientAI[c.identidad].sugerenciaAccion}</p>
                              </div>
                            )}
                            {clientAI[c.identidad].valorEstimadoFuturo != null && (
                              <div className="bg-white rounded-xl p-3 border border-emerald-100 shadow-sm flex flex-col justify-center items-start">
                                <p className="text-[9px] font-black text-emerald-600 uppercase mb-1">Valor futuro est.</p>
                                <span className="text-sm font-black text-emerald-700">L. {Number(clientAI[c.identidad].valorEstimadoFuturo).toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl animate-fade-in overflow-hidden">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">
                {isEditing ? 'Editar Tutor' : 'Registro de Tutor'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X size={24}/></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="text-sm font-semibold text-indigo-900/70 mb-2 block">Identificacion</label>
                  {isPhoneOnly ? (
                    <select disabled={isEditing} className="w-full p-3 bg-white border border-indigo-200 rounded-xl text-slate-600 outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100" value="telefono" onChange={e => setForm({ ...form, tipo_identificacion: e.target.value as any, identidad: '' })}>
                      <option value="telefono">Ninguno / Telefono movil</option>
                      <option value="identidad">Documento</option>
                    </select>
                  ) : (
                    <div className="flex">
                      <select disabled={isEditing} className="w-40 p-3 bg-white border border-slate-200 rounded-l-xl text-slate-600 outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100" value={form.tipo_identificacion || 'identidad'} onChange={e => setForm({ ...form, tipo_identificacion: e.target.value as any, identidad: e.target.value === 'telefono' ? '' : form.identidad })}>
                        <option value="identidad">Documento</option>
                        <option value="telefono">Ninguno / telefono</option>
                      </select>
                      <input disabled={isEditing} className="flex-1 p-3 bg-white border border-l-0 border-slate-200 rounded-r-xl outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100" value={form.identidad || ''} onChange={e => setForm({ ...form, identidad: e.target.value })} placeholder="Numero de documento" />
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-semibold text-indigo-900/70 mb-2 block">Movil / WhatsApp</label>
                  <div className="relative">
                    <Phone size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-500"/>
                    <input required className="w-full pl-10 pr-3 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200" value={form.telefono || ''} onChange={e => setForm({ ...form, telefono: e.target.value })} placeholder="+504 9123-4567" />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold text-indigo-900/70 mb-2 block">Email</label>
                  <div className="flex">
                    <div className="relative flex-1">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                      <input type="email" disabled={hasNoEmail} className="w-full pl-10 pr-3 py-3 bg-white border border-slate-200 rounded-l-xl outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100 disabled:text-slate-400" value={hasNoEmail ? '' : (form.correo || '')} onChange={e => setForm({ ...form, correo: e.target.value })} placeholder={hasNoEmail ? 'Sin email' : 'Correo electronico'} />
                    </div>
                    <label className="w-36 flex items-center justify-center gap-2 border border-l-0 border-slate-200 rounded-r-xl bg-slate-50 text-sm text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={hasNoEmail} onChange={e => setForm({ ...form, sin_correo: e.target.checked, correo: e.target.checked ? '' : form.correo })} className="w-5 h-5 accent-red-500" />
                      No tiene
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold text-indigo-900/70 mb-2 block">Nombre</label>
                  <input required className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200" value={form.nombre || ''} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre/Razon social" />
                </div>

                <div>
                  <label className="text-sm font-semibold text-indigo-900/70 mb-2 block">Direccion</label>
                  <input className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200" value={form.direccion || ''} onChange={e => setForm({ ...form, direccion: e.target.value })} placeholder="Direccion" />
                </div>

                <div>
                  <label className="text-sm font-semibold text-indigo-900/70 mb-2 block">Ciudad o Municipio</label>
                  <div className="flex">
                    <div className="relative flex-1">
                      <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                      <input className="w-full pl-10 pr-3 py-3 bg-white border border-slate-200 rounded-l-xl outline-none focus:ring-2 focus:ring-indigo-200" value={form.ciudad_municipio || ''} onChange={e => setForm({ ...form, ciudad_municipio: e.target.value })} placeholder="Choluteca" />
                    </div>
                    <input className="w-1/2 p-3 bg-white border border-l-0 border-slate-200 rounded-r-xl outline-none focus:ring-2 focus:ring-indigo-200" value={form.departamento || ''} onChange={e => setForm({ ...form, departamento: e.target.value })} placeholder="Departamento" />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">En relacion a la direccion establecida</p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-indigo-900/70 mb-2 block">Contacto autorizado</label>
                  <div className="relative">
                    <UserCheck size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input className="w-full pl-10 pr-3 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200" value={form.contacto_autorizado_nombre || ''} onChange={e => setForm({ ...form, contacto_autorizado_nombre: e.target.value })} placeholder="Nombre" />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Persona alternativa autorizada para llegar por la mascota</p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-indigo-900/70 mb-2 block">Telefono del contacto autorizado</label>
                  <input className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200" value={form.contacto_autorizado_telefono || ''} onChange={e => setForm({ ...form, contacto_autorizado_telefono: e.target.value })} placeholder="Telefono" />
                  <p className="text-xs text-slate-400 mt-1">Numero telefonico del contacto alternativo</p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-indigo-900/70 mb-2 block">Otro telefono <span className="italic text-slate-400">(Opcional)</span></label>
                  <input className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200" value={form.telefono_alternativo || ''} onChange={e => setForm({ ...form, telefono_alternativo: e.target.value })} placeholder="Telefono" />
                </div>
              </div>


              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/20">{isEditing ? 'Actualizar' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;
