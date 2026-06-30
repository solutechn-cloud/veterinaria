
import React, { useState, useEffect } from 'react';
import { InventoryService } from '../services/api';
import { Proveedor } from '../types';
import { Search, PlusCircle, Truck, Edit2, Trash2, X, RefreshCw } from 'lucide-react';
import Swal from 'sweetalert2';

const Providers: React.FC = () => {
  const [providers, setProviders] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<Partial<Proveedor>>({});

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    setLoading(true);
    try {
      const data = await InventoryService.getProveedores();
      setProviders(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const openNewModal = () => {
    setIsEditing(false);
    setForm({});
    setShowModal(true);
  };

  const openEditModal = (prov: Proveedor) => {
    setIsEditing(true);
    setForm(prov);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditing) {
        await InventoryService.updateProveedor(form.codProveedor!, form);
      } else {
        await InventoryService.createProveedor(form);
      }
      setShowModal(false);
      Swal.fire({
        icon: 'success',
        title: isEditing ? 'Proveedor Actualizado' : 'Proveedor Creado',
        timer: 1500,
        showConfirmButton: false
      });
      loadProviders();
    } catch (error: any) {
      Swal.fire('Error', error.message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: '¿Eliminar Proveedor?',
      text: "Si tiene inventario asociado, no se podrá eliminar.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await InventoryService.deleteProveedor(id);
        Swal.fire('Eliminado', 'El proveedor ha sido eliminado.', 'success');
        loadProviders();
      } catch (error: any) {
        Swal.fire('Error', error.message, 'error');
      }
    }
  };

  const filtered = providers.filter(p => 
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-end mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Truck className="text-indigo-600" /> Registro Proveedores
          </h2>
          <p className="text-slate-500 text-sm">Gestiona tus proveedores de medicamentos, insumos y productos veterinarios</p>
        </div>
        <button 
           onClick={openNewModal}
           className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 font-bold shadow-lg shadow-emerald-600/20 transition-all"
        >
          <PlusCircle size={20} />
          <span>Nuevo Proveedor</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50">
           <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar proveedor..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <button onClick={loadProviders} className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg border border-slate-200 bg-white">
            <RefreshCw size={20} />
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-xs font-bold text-slate-500 uppercase sticky top-0 z-10">
              <tr>
                <th className="p-4">Código</th>
                <th className="p-4">Nombre</th>
                <th className="p-4">Teléfono</th>
                <th className="p-4">Dirección</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                 <tr><td colSpan={5} className="p-8 text-center text-slate-500">Cargando...</td></tr>
              ) : filtered.map(p => (
                <tr key={p.codProveedor} className="hover:bg-slate-50">
                  <td className="p-4 font-mono text-slate-500 text-xs">{p.codProveedor}</td>
                  <td className="p-4 font-bold text-slate-800">{p.nombre}</td>
                  <td className="p-4 text-sm font-mono text-slate-600">{p.telefono}</td>
                  <td className="p-4 text-sm text-slate-500">{p.direccion}</td>
                  <td className="p-4 text-center flex justify-center gap-2">
                    <button onClick={() => openEditModal(p)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 size={16}/></button>
                    <button onClick={() => handleDelete(p.codProveedor)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 animate-fade-in">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h3 className="text-xl font-bold text-slate-800">
                {isEditing ? 'Editar Proveedor' : 'Registro Proveedor'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500"><X size={24}/></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                 <label className="text-xs font-bold text-slate-500 uppercase">Nombre</label>
                 <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={form.nombre || ''} onChange={e => setForm({...form, nombre: e.target.value})} />
              </div>
              <div>
                 <label className="text-xs font-bold text-slate-500 uppercase">Teléfono</label>
                 <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={form.telefono || ''} onChange={e => setForm({...form, telefono: e.target.value})} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Dirección</label>
                <input required className="w-full p-2.5 bg-slate-50 border rounded-lg mt-1" value={form.direccion || ''} onChange={e => setForm({...form, direccion: e.target.value})} />
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

export default Providers;
