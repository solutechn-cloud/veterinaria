
import React, { useState, useEffect } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
const { useParams } = ReactRouterDOM as any;
import { Wrench, Clock, CheckCircle, Package, AlertCircle, Truck } from 'lucide-react';

const COMPANY_NAME = (import.meta as any).env?.VITE_COMPANY_NAME || 'SmartCloud';
const COMPANY_PHONE = (import.meta as any).env?.VITE_COMPANY_PHONE || '';

interface RepairData {
  id: number;
  equipo: string;
  estado: string;
  fechaIngreso: string;
  fechaEstimada?: string;
  clienteNombre: string;
  descripcion: string;
  estadoColor: string;
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; bgColor: string; label: string; step: number }> = {
  'Pendiente':          { icon: <Clock size={28} />,        color: 'text-yellow-600', bgColor: 'bg-yellow-50 border-yellow-200', label: 'Recibido',             step: 1 },
  'En Proceso':         { icon: <Wrench size={28} />,       color: 'text-blue-600',   bgColor: 'bg-blue-50 border-blue-200',     label: 'En reparacion',        step: 2 },
  'Esperando Repuesto': { icon: <Package size={28} />,      color: 'text-orange-600', bgColor: 'bg-orange-50 border-orange-200', label: 'Esperando repuesto',   step: 2 },
  'Lista para Retirar': { icon: <CheckCircle size={28} />,  color: 'text-green-600',  bgColor: 'bg-green-50 border-green-200',   label: 'Listo para retirar',   step: 3 },
  'Listo':              { icon: <CheckCircle size={28} />,  color: 'text-green-600',  bgColor: 'bg-green-50 border-green-200',   label: 'Listo para retirar',   step: 3 },
  'Entregado':          { icon: <Truck size={28} />,        color: 'text-gray-500',   bgColor: 'bg-gray-50 border-gray-200',     label: 'Entregado',            step: 4 },
  'Cancelado':          { icon: <AlertCircle size={28} />,  color: 'text-red-600',    bgColor: 'bg-red-50 border-red-200',       label: 'Cancelado',            step: 0 },
};

const STEPS = [
  { label: 'Recibido',      step: 1 },
  { label: 'En Reparacion', step: 2 },
  { label: 'Listo',         step: 3 },
  { label: 'Entregado',     step: 4 },
];

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'No definida';
  try {
    return new Date(dateStr).toLocaleDateString('es-HN', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

const RepairTracker: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<RepairData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) { setError(true); setLoading(false); return; }
    fetch(`/api/public/repair/${id}`)
      .then(r => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [id]);

  const statusCfg = data ? (STATUS_CONFIG[data.estado] || STATUS_CONFIG['Pendiente']) : null;
  const isReady = data && (data.estado === 'Lista para Retirar' || data.estado === 'Listo');
  const isCancelled = data?.estado === 'Cancelado';

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex flex-col items-center justify-start px-4 py-8">
      {/* Header */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mb-3 shadow-lg shadow-indigo-600/30">
          <Wrench size={28} className="text-white" />
        </div>
        <h1 className="text-2xl font-black text-slate-800">{COMPANY_NAME}</h1>
        <p className="text-slate-500 text-sm font-medium">Rastreador de Reparaciones</p>
      </div>

      <div className="w-full max-w-md">
        {loading && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-10 flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 font-semibold text-sm">Buscando tu orden...</p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-3xl shadow-sm border border-red-100 p-10 flex flex-col items-center gap-3 text-center">
            <AlertCircle size={40} className="text-red-400" />
            <h2 className="text-lg font-black text-slate-700">Orden no encontrada</h2>
            <p className="text-slate-500 text-sm">Verifica el codigo de tu orden e intentalo de nuevo.</p>
          </div>
        )}

        {!loading && !error && data && statusCfg && (
          <div className="space-y-4">
            {/* Greeting */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
              <p className="text-slate-500 text-sm">Hola <span className="font-black text-slate-700">{data.clienteNombre}</span>, aqui esta el estado de tu reparacion</p>
              <p className="text-xs text-slate-400 mt-1 font-mono">Orden #{String(data.id).padStart(5, '0')}</p>
            </div>

            {/* Status badge */}
            <div className={`bg-white rounded-3xl shadow-sm border p-6 ${statusCfg.bgColor}`}>
              <div className="flex items-center gap-4">
                <div className={statusCfg.color}>{statusCfg.icon}</div>
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Estado actual</p>
                  <p className={`text-xl font-black ${statusCfg.color}`}>{statusCfg.label}</p>
                </div>
              </div>
            </div>

            {/* Ready banner */}
            {isReady && (
              <div className="bg-green-500 text-white rounded-2xl p-4 flex items-center gap-3 animate-pulse">
                <CheckCircle size={22} className="shrink-0" />
                <p className="text-sm font-black">Tu equipo esta listo. Visitanos para retirarlo.</p>
              </div>
            )}

            {/* Progress steps (only for non-cancelled) */}
            {!isCancelled && (
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-4">Progreso</p>
                <div className="flex items-center justify-between">
                  {STEPS.map((s, i) => {
                    const done = statusCfg.step >= s.step;
                    const active = statusCfg.step === s.step;
                    return (
                      <React.Fragment key={s.step}>
                        <div className="flex flex-col items-center gap-1.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs border-2 transition-all ${done ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-300'} ${active ? 'ring-4 ring-indigo-100' : ''}`}>
                            {done ? <CheckCircle size={14} /> : s.step}
                          </div>
                          <p className={`text-[10px] font-bold text-center max-w-[52px] leading-tight ${done ? 'text-indigo-600' : 'text-slate-300'}`}>{s.label}</p>
                        </div>
                        {i < STEPS.length - 1 && (
                          <div className={`flex-1 h-0.5 mx-1 rounded ${statusCfg.step > s.step ? 'bg-indigo-600' : 'bg-slate-100'}`} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Details card */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 space-y-3">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Detalles</p>
              <div className="flex justify-between items-start text-sm">
                <span className="text-slate-400 font-semibold">Equipo</span>
                <span className="font-black text-slate-700 text-right max-w-[60%]">{data.equipo}</span>
              </div>
              <div className="flex justify-between items-start text-sm border-t border-slate-50 pt-3">
                <span className="text-slate-400 font-semibold">Ingresado</span>
                <span className="font-bold text-slate-600">{formatDate(data.fechaIngreso)}</span>
              </div>
              <div className="flex justify-between items-start text-sm border-t border-slate-50 pt-3">
                <span className="text-slate-400 font-semibold">Fecha estimada</span>
                <span className="font-bold text-slate-600">{formatDate(data.fechaEstimada)}</span>
              </div>
              {data.descripcion && (
                <div className="border-t border-slate-50 pt-3">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Descripcion del problema</p>
                  <p className="text-sm text-slate-600">{data.descripcion}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-xs text-slate-400">
          {COMPANY_PHONE
            ? <>Consultas: <span className="font-bold text-slate-500">{COMPANY_PHONE}</span></>
            : 'Contacta con nosotros si tienes preguntas sobre tu reparacion.'}
        </p>
        <p className="text-[10px] text-slate-300 mt-1">{COMPANY_NAME} &mdash; Sistema de Gestion ERP</p>
      </div>
    </div>
  );
};

export default RepairTracker;
