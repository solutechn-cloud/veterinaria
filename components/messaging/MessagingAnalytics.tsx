import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock,
  MailCheck,
  MailWarning,
  RefreshCw,
  Send,
  TrendingUp,
} from 'lucide-react';
import { MessagingAnalytics as MessagingAnalyticsData, MessagingMetricCount, MessagingService } from '../../services/api';

const STATUS_LABEL: Record<string, string> = {
  queued: 'En cola',
  sending: 'Enviando',
  sent: 'Enviado',
  delivered: 'Entregado',
  opened: 'Abierto',
  clicked: 'Clic',
  bounced: 'Rebotado',
  complained: 'Queja',
  failed: 'Fallido',
  cancelled: 'Cancelado',
};

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultRange() {
  const hasta = new Date();
  const desde = new Date(hasta);
  desde.setDate(desde.getDate() - 29);
  return { desde: dateOnly(desde), hasta: dateOnly(hasta) };
}

function formatNumber(value?: number) {
  return Number(value || 0).toLocaleString('es-HN');
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-HN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDay(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('es-HN', { day: '2-digit', month: 'short' });
}

function percent(value?: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function KpiCard({
  label,
  value,
  helper,
  icon,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
        </div>
        <div className={`rounded-2xl p-3 ${tone}`}>{icon}</div>
      </div>
      <p className="mt-3 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function ProgressRow({ item, max }: { item: MessagingMetricCount; max: number }) {
  const width = max > 0 ? Math.max(5, Math.round((item.total / max) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-slate-600">{STATUS_LABEL[item.label] || item.label}</span>
        <span className="text-slate-900">{formatNumber(item.total)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <span className="text-indigo-600">{icon}</span>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

const MessagingAnalytics: React.FC = () => {
  const initialRange = useMemo(defaultRange, []);
  const [desde, setDesde] = useState(initialRange.desde);
  const [hasta, setHasta] = useState(initialRange.hasta);
  const [data, setData] = useState<MessagingAnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await MessagingService.getAnalytics({ desde, hasta }));
    } catch (err: any) {
      setError(err.message || 'No se pudo cargar la analitica de mensajeria.');
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => { load(); }, [load]);

  const maxStatus = useMemo(() => Math.max(1, ...(data?.byStatus || []).map(item => item.total)), [data]);
  const maxEvent = useMemo(() => Math.max(1, ...(data?.byEvent || []).map(item => item.total)), [data]);
  const maxDay = useMemo(() => Math.max(1, ...(data?.dailyTrend || []).map(item => item.total)), [data]);
  const totals = data?.totals;
  const campaigns = data?.campaigns.summary;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <BarChart3 className="text-indigo-600" size={22} /> Analitica de correos
            </h3>
            <p className="text-sm text-slate-500">Rendimiento, entregabilidad y salud del canal por rango de fechas.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-200" />
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-200" />
            <button onClick={load} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-white shadow-lg shadow-indigo-600/20 disabled:opacity-60">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center text-slate-400 shadow-sm">Cargando analitica...</div>
      ) : data && totals ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard label="Correos registrados" value={formatNumber(totals.total)} helper={`${formatNumber(totals.inProcess)} en proceso`} icon={<Send size={22} />} tone="bg-indigo-50 text-indigo-600" />
            <KpiCard label="Tasa de entrega" value={percent(totals.deliveryRate)} helper={`${formatNumber(totals.delivered)} entregados`} icon={<MailCheck size={22} />} tone="bg-emerald-50 text-emerald-600" />
            <KpiCard label="Apertura / clics" value={`${percent(totals.openRate)} / ${percent(totals.clickRate)}`} helper={`${formatNumber(totals.opened)} aperturas, ${formatNumber(totals.clicked)} clics`} icon={<TrendingUp size={22} />} tone="bg-cyan-50 text-cyan-600" />
            <KpiCard label="Fallos y rebotes" value={percent(totals.failureRate)} helper={`${formatNumber(totals.failed)} correos con problema`} icon={<MailWarning size={22} />} tone="bg-red-50 text-red-600" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <Panel title="Embudo de entregabilidad" icon={<MailCheck size={18} />}>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Enviados', totals.sent, 'text-indigo-600'],
                  ['Entregados', totals.delivered, 'text-emerald-600'],
                  ['Abiertos', totals.opened, 'text-teal-600'],
                  ['Clics', totals.clicked, 'text-cyan-600'],
                ].map(([label, value, tone]) => (
                  <div key={label as string} className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
                    <p className={`mt-1 text-2xl font-semibold ${tone}`}>{formatNumber(value as number)}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Estados del periodo" icon={<CheckCircle2 size={18} />}>
              <div className="space-y-4">
                {data.byStatus.length === 0 ? <p className="text-sm text-slate-400">Sin estados en este rango.</p> : data.byStatus.map(item => (
                  <ProgressRow key={item.key} item={item} max={maxStatus} />
                ))}
              </div>
            </Panel>

            <Panel title="Tipos de notificacion" icon={<BarChart3 size={18} />}>
              <div className="space-y-4">
                {data.byEvent.length === 0 ? <p className="text-sm text-slate-400">Sin tipos registrados.</p> : data.byEvent.map(item => (
                  <ProgressRow key={item.key} item={item} max={maxEvent} />
                ))}
              </div>
            </Panel>
          </div>

          <Panel title="Tendencia diaria" icon={<TrendingUp size={18} />}>
            {data.dailyTrend.length === 0 ? (
              <p className="text-sm text-slate-400">No hay movimiento diario en el rango seleccionado.</p>
            ) : (
              <div className="flex items-end gap-2 overflow-x-auto pb-2">
                {data.dailyTrend.map(day => {
                  const height = Math.max(14, Math.round((day.total / maxDay) * 120));
                  return (
                    <div key={day.day} className="min-w-[56px] text-center">
                      <div className="mx-auto flex h-32 w-8 items-end justify-center rounded-full bg-slate-100 overflow-hidden">
                        <div className="w-full rounded-full bg-indigo-500" style={{ height }} title={`${day.total} correos`} />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{formatDay(day.day)}</p>
                      <p className="text-xs text-slate-900">{formatNumber(day.total)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Panel title="Campanas" icon={<Send size={18} />}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">Total</p><p className="text-xl font-semibold">{formatNumber(campaigns?.total)}</p></div>
                <div className="rounded-xl bg-indigo-50 p-3"><p className="text-xs text-indigo-500">Programadas</p><p className="text-xl font-semibold text-indigo-700">{formatNumber(campaigns?.scheduled)}</p></div>
                <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-500">Enviados</p><p className="text-xl font-semibold text-emerald-700">{formatNumber(campaigns?.sentCount)}</p></div>
                <div className="rounded-xl bg-red-50 p-3"><p className="text-xs text-red-500">Fallos</p><p className="text-xl font-semibold text-red-700">{formatNumber(campaigns?.failedCount)}</p></div>
              </div>
              <div className="mt-5 space-y-3">
                {data.campaigns.top.length === 0 ? <p className="text-sm text-slate-400">Sin campanas en este periodo.</p> : data.campaigns.top.map(item => (
                  <div key={item.id} className="rounded-xl border border-slate-100 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-slate-800 truncate">{item.name}</p>
                      <span className="text-xs text-slate-400">{formatDate(item.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{formatNumber(item.sentCount)} enviados, {formatNumber(item.failedCount)} fallos, {formatNumber(item.skippedCount)} omitidos</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Proximos envios programados" icon={<CalendarClock size={18} />}>
              <div className="space-y-3">
                {data.campaigns.upcoming.length === 0 ? (
                  <p className="text-sm text-slate-400">No hay campanas programadas proximas.</p>
                ) : data.campaigns.upcoming.map(item => (
                  <div key={item.id} className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
                    <p className="font-medium text-slate-800">{item.name}</p>
                    <p className="mt-1 flex items-center gap-2 text-sm text-indigo-700"><Clock size={15} /> {formatDate(item.scheduledAt)}</p>
                    <p className="text-xs text-slate-500">{formatNumber(item.totalRecipients)} destinatarios previstos</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <Panel title="Fallos recientes" icon={<AlertTriangle size={18} />}>
            {data.recentFailures.length === 0 ? (
              <p className="text-sm text-slate-400">Sin fallos recientes en este rango.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.recentFailures.map(item => (
                  <div key={item.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-800">{item.recipientEmail}</p>
                        <p className="text-sm text-slate-500">{item.subject}</p>
                      </div>
                      <span className="text-xs text-slate-400">{formatDate(item.updatedAt)}</span>
                    </div>
                    {item.lastError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{item.lastError}</p>}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
};

export default MessagingAnalytics;
