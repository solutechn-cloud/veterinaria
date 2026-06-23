import React, { useEffect, useState } from 'react';
import { CitasService } from '../services/api';
import { Cita } from '../types';
import { Activity, RefreshCw } from 'lucide-react';

const columns: Cita['estado'][] = ['Confirmada', 'En espera', 'En consulta', 'Completada'];

export default function Flowboard() {
  const [rows, setRows] = useState<Cita[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await CitasService.getFlowboard()); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2"><Activity className="text-teal-600" /> Flowboard Clinico</h2>
          <p className="text-sm text-slate-500">Pacientes del dia desde recepcion hasta cierre de consulta.</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border border-slate-200 text-slate-500"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {columns.map(col => (
          <section key={col} className="bg-white rounded-2xl border border-slate-200 min-h-[420px] overflow-hidden">
            <header className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between">
              <h3 className="font-black text-slate-800">{col}</h3>
              <span className="text-xs font-black text-teal-700">{rows.filter(r => r.estado === col).length}</span>
            </header>
            <div className="p-3 space-y-3">
              {rows.filter(r => r.estado === col).map(c => (
                <div key={c.id_cita} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="font-black text-slate-900">{c.pacienteNombre || 'Paciente'}</p>
                  <p className="text-xs text-slate-500">{c.tipoCitaNombre || 'Cita'} · {new Date(c.fecha_inicio).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}</p>
                  <p className="mt-2 text-xs text-slate-600">{c.tutorNombre || 'Sin tutor'}</p>
                  {c.motivo && <p className="mt-2 text-xs rounded-xl bg-white border border-slate-100 p-2 text-slate-500">{c.motivo}</p>}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
