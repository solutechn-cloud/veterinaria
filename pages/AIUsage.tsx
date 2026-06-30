
import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, Zap, BarChart2, Clock, CheckCircle2, AlertTriangle,
  RefreshCw, Send, ChevronRight, TrendingUp, Activity, Calendar,
  MessageSquare, Package, X, CheckCircle,
} from 'lucide-react';
import { AIService, AIQuotaStatus } from '../services/api';

const PAQUETES = [
  { id: '+100K tokens',      label: '+100,000 tokens',    desc: 'Ideal para picos puntuales',       price: 'Consultar precio' },
  { id: '+500K tokens',      label: '+500,000 tokens',    desc: 'Ampliación mensual moderada',      price: 'Consultar precio' },
  { id: '+1M tokens',        label: '+1,000,000 tokens',  desc: 'Ampliación grande',                price: 'Consultar precio' },
  { id: 'Plan Profesional',  label: 'Subir a Profesional', desc: '500K tokens · 1000 req/mes',     price: '$79/mes' },
  { id: 'Plan Enterprise',   label: 'Subir a Enterprise',  desc: '5M tokens · ilimitado',          price: '$199/mes' },
  { id: 'Personalizado',     label: 'Personalizado',       desc: 'Cuota a medida para tu veterinaria', price: 'Contactar' },
];

const ESTADO_BADGE: Record<string, string> = {
  pendiente:    'bg-amber-100 text-amber-700',
  en_revision:  'bg-blue-100 text-blue-700',
  completada:   'bg-emerald-100 text-emerald-700',
  rechazada:    'bg-red-100 text-red-700',
};

const PROCESO_LABEL: Record<string, string> = {
  medication_intake:         'Análisis de Imágenes',
  symptom_recommendation:    'Recomendación por Síntomas',
  drug_interactions:         'Verificar Interacciones',
  client_analysis:           'Análisis de Clientes',
  cash_anomaly:              'Anomalías de Caja',
  restock_prediction:        'Predicción de Reabasto',
};

function TokenGauge({ pct, estado }: { pct: number; estado: string }) {
  const clamped = Math.min(pct, 100);
  const color = estado === 'agotado' ? '#ef4444'
    : estado === 'alerta' ? '#f59e0b'
    : '#6366f1';
  const remaining = Math.max(0, 100 - clamped);

  return (
    <div className="relative flex flex-col items-center">
      {/* Circular gauge using SVG */}
      <svg width="160" height="160" viewBox="0 0 160 160" className="rotate-[-90deg]">
        <circle cx="80" cy="80" r="64" fill="none" stroke="#e2e8f0" strokeWidth="14" />
        <circle
          cx="80" cy="80" r="64" fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 64}`}
          strokeDashoffset={`${2 * Math.PI * 64 * (1 - clamped / 100)}`}
          style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black" style={{ color }}>{clamped.toFixed(0)}%</span>
        <span className="text-xs text-slate-400 font-medium mt-0.5">usado</span>
      </div>
      <div className="mt-3 text-center">
        <p className="text-sm font-bold text-slate-700">{remaining.toFixed(0)}% disponible</p>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, accent = 'indigo' }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: string;
}) {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
  };
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors[accent] || colors.indigo}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-black text-slate-800 mt-0.5 leading-none">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

const AIUsage: React.FC = () => {
  const [quota, setQuota]             = useState<AIQuotaStatus | null>(null);
  const [requests, setRequests]       = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  // Upgrade form
  const [paquete, setPaquete]         = useState('');
  const [motivo, setMotivo]           = useState('');
  const [sending, setSending]         = useState(false);
  const [sent, setSent]               = useState(false);
  const [sendError, setSendError]     = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [q, r] = await Promise.allSettled([
        AIService.getQuotaStatus(),
        AIService.getUpgradeRequests(),
      ]);
      if (q.status === 'fulfilled') setQuota(q.value);
      if (r.status === 'fulfilled') setRequests(r.value);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpgradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paquete) return;
    setSending(true); setSendError('');
    try {
      await AIService.requestTokenUpgrade({ paquete_solicitado: paquete, motivo: motivo.trim() || undefined });
      setSent(true);
      setPaquete(''); setMotivo('');
      load(true);
    } catch (err: any) {
      setSendError(err.message || 'Error enviando solicitud');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const pct = quota?.pct_tokens_usado ?? 0;
  const estado = quota?.estado ?? 'ok';
  const tokensRestantes = quota ? Math.max(0, quota.tokens_limite - quota.tokens_consumidos) : 0;
  const resetDate = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Tegucigalpa' });
  })();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-600/20">
            <Sparkles className="text-white" size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">Inteligencia Artificial</h2>
            <p className="text-slate-400 text-sm">Monitoreo de uso y gestión de cuota · {quota?.periodo}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {quota && (
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
              estado === 'ok'           ? 'bg-emerald-100 text-emerald-700' :
              estado === 'alerta'       ? 'bg-amber-100 text-amber-700' :
              estado === 'agotado'      ? 'bg-red-100 text-red-700' :
              'bg-slate-100 text-slate-600'
            }`}>
              {estado === 'ok' ? 'Cuota disponible' : estado === 'alerta' ? `Cuota al ${pct}%` : estado === 'agotado' ? 'Cuota agotada' : 'IA deshabilitada'}
            </span>
          )}
          <button onClick={() => load(true)} disabled={refreshing}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {!quota ? (
        <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-100 shadow-sm">
          <Sparkles size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Información de cuota no disponible.</p>
          <p className="text-sm mt-1">Es posible que el sistema de cuotas aún no esté activo en tu cuenta.</p>
        </div>
      ) : (
        <>
          {/* ── Gauge + Stats ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Gauge card */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-2 md:col-span-1">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tokens este período</p>
              <TokenGauge pct={pct} estado={estado} />
              <p className="text-xs text-slate-500 text-center mt-1">
                <span className="font-bold text-slate-700">{Number(quota.tokens_consumidos).toLocaleString()}</span>
                {' de '}
                <span className="font-bold text-slate-700">{Number(quota.tokens_limite).toLocaleString()}</span>
                {' tokens'}
              </p>
              <p className="text-[11px] text-indigo-600 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full mt-1">
                Plan {quota.plan}
              </p>
            </div>

            {/* Stats */}
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatCard
                icon={<Zap size={20} />}
                label="Tokens disponibles"
                value={tokensRestantes.toLocaleString()}
                sub={`${(100 - pct).toFixed(1)}% del límite mensual`}
                accent={estado === 'agotado' ? 'amber' : 'indigo'}
              />
              <StatCard
                icon={<Activity size={20} />}
                label="Solicitudes este mes"
                value={Number(quota.requests_totales).toLocaleString()}
                sub={`Límite: ${Number(quota.requests_limite).toLocaleString()}`}
                accent="emerald"
              />
              <StatCard
                icon={<BarChart2 size={20} />}
                label="Solicitudes hoy"
                value={quota.requests_hoy}
                sub={`Límite diario: ${Number(quota.req_diario_limite).toLocaleString()}`}
                accent="blue"
              />
              <StatCard
                icon={<Calendar size={20} />}
                label="Reinicio de cuota"
                value={resetDate}
                sub="Los contadores se reinician el día 1"
                accent="amber"
              />
            </div>
          </div>

          {/* ── Token bar detail ── */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <TrendingUp size={16} className="text-indigo-500" /> Progreso de tokens — {quota.periodo}
              </p>
              <span className="text-xs text-slate-400">
                {Number(quota.tokens_consumidos).toLocaleString()} / {Number(quota.tokens_limite).toLocaleString()} tokens
              </span>
            </div>
            <div className="w-full h-4 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  pct >= 100 ? 'bg-gradient-to-r from-red-500 to-red-400' :
                  pct >= 80  ? 'bg-gradient-to-r from-amber-500 to-amber-400' :
                  pct >= 50  ? 'bg-gradient-to-r from-indigo-500 to-violet-500' :
                  'bg-gradient-to-r from-indigo-400 to-indigo-500'
                }`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-400 mt-1.5">
              <span>0%</span>
              <span className="text-amber-500 font-semibold">80% alerta</span>
              <span className="text-red-500 font-semibold">100% agotado</span>
            </div>

            {(estado === 'agotado' || estado === 'alerta') && (
              <div className={`mt-4 flex items-start gap-2 p-3 rounded-xl text-sm border ${
                estado === 'agotado' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}>
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                {estado === 'agotado'
                  ? 'La cuota de IA está agotada. Las funciones de IA están suspendidas hasta el próximo período o hasta que amplíes tu plan. Usa el formulario de abajo para solicitar más tokens.'
                  : `Has consumido el ${pct}% de tu cuota. Considera solicitar una ampliación para no interrumpir el servicio.`}
              </div>
            )}
          </div>

          {/* ── Procesos habilitados ── */}
          {Array.isArray(quota.procesos_habilitados) && quota.procesos_habilitados.length > 0 && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <p className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-4">
                <CheckCircle2 size={16} className="text-emerald-500" /> Funciones de IA incluidas en tu plan
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {quota.procesos_habilitados.map(p => (
                  <div key={p} className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    <span className="text-xs font-semibold text-slate-700">{PROCESO_LABEL[p] || p.replace(/_/g, ' ')}</span>
                  </div>
                ))}
                {(['medication_intake','symptom_recommendation','drug_interactions','client_analysis','cash_anomaly','restock_prediction'] as string[])
                  .filter(p => !quota.procesos_habilitados.includes(p))
                  .map(p => (
                    <div key={p} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 opacity-60">
                      <X size={14} className="text-slate-400 shrink-0" />
                      <span className="text-xs text-slate-400 line-through">{PROCESO_LABEL[p] || p.replace(/_/g, ' ')}</span>
                    </div>
                  ))
                }
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Solicitar más tokens ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Package size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Solicitar Ampliación de Tokens</h3>
              <p className="text-xs text-slate-500 mt-0.5">Nuestro equipo revisará tu solicitud y te contactará en menos de 24 horas</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle size={28} className="text-emerald-600" />
              </div>
              <h4 className="text-base font-bold text-slate-800">Solicitud enviada</h4>
              <p className="text-sm text-slate-500 max-w-sm">Tu solicitud fue recibida. Nuestro equipo la revisará y te responderá en breve.</p>
              <button onClick={() => setSent(false)} className="mt-2 text-sm text-indigo-600 font-semibold hover:underline">
                Enviar otra solicitud
              </button>
            </div>
          ) : (
            <form onSubmit={handleUpgradeSubmit} className="space-y-5">
              {/* Package selector */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-3">
                  Selecciona lo que necesitas *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {PAQUETES.map(pkg => (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setPaquete(pkg.id)}
                      className={`text-left p-4 rounded-xl border-2 transition-all ${
                        paquete === pkg.id
                          ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <p className={`text-sm font-bold mb-0.5 ${paquete === pkg.id ? 'text-indigo-700' : 'text-slate-800'}`}>
                        {pkg.label}
                      </p>
                      <p className="text-xs text-slate-500">{pkg.desc}</p>
                      <p className={`text-xs font-bold mt-1.5 ${paquete === pkg.id ? 'text-indigo-600' : 'text-slate-400'}`}>
                        {pkg.price}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Motivo o contexto adicional <span className="text-slate-300 font-normal normal-case">(opcional)</span>
                </label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="Ej: Tenemos un pico de actividad este mes, necesitamos analizar más imágenes..."
                  className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none"
                />
                <p className="text-xs text-slate-300 text-right mt-0.5">{motivo.length}/1000</p>
              </div>

              {sendError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                  <AlertTriangle size={16} className="shrink-0" />
                  {sendError}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                  <MessageSquare size={13} />
                  Responderemos a tu correo de administrador en menos de 24h
                </p>
                <button
                  type="submit"
                  disabled={!paquete || sending}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
                >
                  {sending ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send size={15} />
                  )}
                  {sending ? 'Enviando...' : 'Enviar solicitud'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ── Historial de solicitudes ── */}
      {requests.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-4">
            <Clock size={16} className="text-slate-400" /> Historial de solicitudes
          </h3>
          <div className="space-y-2">
            {requests.map(r => (
              <div key={r.id} className="flex items-start justify-between gap-3 p-3 bg-slate-50 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-700">{r.paquete_solicitado}</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ESTADO_BADGE[r.estado] || 'bg-slate-100 text-slate-600'}`}>
                      {r.estado.replace('_', ' ')}
                    </span>
                  </div>
                  {r.motivo && <p className="text-xs text-slate-400 mt-0.5 truncate">{r.motivo}</p>}
                  {r.respuesta_admin && (
                    <p className="text-xs text-indigo-600 mt-1 font-medium">Respuesta: {r.respuesta_admin}</p>
                  )}
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {new Date(r.created_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIUsage;
