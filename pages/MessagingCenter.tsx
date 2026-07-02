import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  Inbox,
  LayoutTemplate,
  Mail,
  Megaphone,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  UsersRound,
  Workflow,
  X,
} from 'lucide-react';
import { MessagingEvent, MessagingMessage, MessagingService } from '../services/api';
import NotificationDirectory from '../components/messaging/NotificationDirectory';
import CampaignManager from '../components/messaging/CampaignManager';
import TemplateManager from '../components/messaging/TemplateManager';
import MessagingAnalytics from '../components/messaging/MessagingAnalytics';
import AutomationManager from '../components/messaging/AutomationManager';

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

const STATUS_STYLE: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-600',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-indigo-100 text-indigo-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  opened: 'bg-teal-100 text-teal-700',
  clicked: 'bg-cyan-100 text-cyan-700',
  bounced: 'bg-orange-100 text-orange-700',
  complained: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const EVENT_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'appointment_created', label: 'Confirmacion de cita' },
  { value: 'appointment_agenda', label: 'Agenda de citas' },
  { value: 'recordatorio_veterinario', label: 'Recordatorios' },
  { value: 'daily_report', label: 'Reporte diario' },
  { value: 'weekly_report', label: 'Reporte semanal' },
  { value: 'monthly_management_report', label: 'Reporte mensual' },
  { value: 'manual_email', label: 'Manual' },
];

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-HN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusIcon(status: string) {
  if (['sent', 'delivered', 'opened', 'clicked'].includes(status)) return <CheckCircle2 size={16} />;
  if (['failed', 'bounced', 'complained'].includes(status)) return <AlertTriangle size={16} />;
  return <Clock size={16} />;
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${tone}`}>{value.toLocaleString('es-HN')}</p>
    </div>
  );
}

const MessagingCenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'analytics' | 'log' | 'directory' | 'campaigns' | 'templates' | 'automations'>('analytics');
  const [messages, setMessages] = useState<MessagingMessage[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [eventKey, setEventKey] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<MessagingMessage | null>(null);
  const [events, setEvents] = useState<MessagingEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [compose, setCompose] = useState({ to: '', subject: '', body: '' });
  const [error, setError] = useState('');

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const delivered = (summary.delivered || 0) + (summary.opened || 0) + (summary.clicked || 0);
  const failed = (summary.failed || 0) + (summary.bounced || 0) + (summary.complained || 0);
  const inProcess = (summary.queued || 0) + (summary.sending || 0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await MessagingService.getMessages({ q, status, eventKey, desde, hasta, page, pageSize });
      setMessages(result.data);
      setTotal(result.total);
      setSummary(result.summary || {});
    } catch (err: any) {
      setError(err.message || 'No se pudo cargar la mensajeria.');
    } finally {
      setLoading(false);
    }
  }, [q, status, eventKey, desde, hasta, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  const openEvents = async (message: MessagingMessage) => {
    setSelected(message);
    setEventsLoading(true);
    try {
      setEvents(await MessagingService.getEvents(message.id));
    } finally {
      setEventsLoading(false);
    }
  };

  const resend = async (message: MessagingMessage) => {
    if (!window.confirm(`Reenviar correo a ${message.recipientEmail}?`)) return;
    setSending(true);
    try {
      await MessagingService.resend(message.id);
      await load();
      if (selected?.id === message.id) await openEvents(message);
    } catch (err: any) {
      alert(err.message || 'No se pudo reenviar el correo.');
    } finally {
      setSending(false);
    }
  };

  const sendManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await MessagingService.sendManual(compose);
      setCompose({ to: '', subject: '', body: '' });
      setShowCompose(false);
      setPage(1);
      await load();
    } catch (err: any) {
      alert(err.message || 'No se pudo enviar el correo.');
    } finally {
      setSending(false);
    }
  };

  const statusOptions = useMemo(() => [
    { value: '', label: 'Todos los estados' },
    ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
  ], []);

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Mail className="text-indigo-600" size={26} /> Mensajeria por correo
          </h2>
          <p className="text-slate-500 text-sm mt-1">Bitacora, auditoria y reenvio de correos enviados por la clinica.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${activeTab === 'analytics' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <BarChart3 size={16} /> Analitica
            </button>
            <button
              onClick={() => setActiveTab('log')}
              className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${activeTab === 'log' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Mail size={16} /> Bitacora
            </button>
            <button
              onClick={() => setActiveTab('directory')}
              className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${activeTab === 'directory' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <UsersRound size={16} /> Directorio
            </button>
            <button
              onClick={() => setActiveTab('campaigns')}
              className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${activeTab === 'campaigns' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Megaphone size={16} /> Campanas
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${activeTab === 'templates' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <LayoutTemplate size={16} /> Plantillas
            </button>
            <button
              onClick={() => setActiveTab('automations')}
              className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${activeTab === 'automations' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Workflow size={16} /> Automatizaciones
            </button>
          </div>
          {activeTab === 'log' && (
            <button onClick={load} className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center gap-2" disabled={loading}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refrescar
            </button>
          )}
          <button onClick={() => setShowCompose(true)} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 flex items-center gap-2">
            <Send size={16} /> Enviar correo
          </button>
        </div>
      </div>

      {activeTab === 'directory' ? (
        <NotificationDirectory />
      ) : activeTab === 'analytics' ? (
        <MessagingAnalytics />
      ) : activeTab === 'campaigns' ? (
        <CampaignManager />
      ) : activeTab === 'templates' ? (
        <TemplateManager />
      ) : activeTab === 'automations' ? (
        <AutomationManager />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard label="Total filtrado" value={total} tone="text-slate-900" />
            <StatCard label="Enviados" value={summary.sent || 0} tone="text-indigo-600" />
            <StatCard label="Entregados/abiertos" value={delivered} tone="text-emerald-600" />
            <StatCard label="Fallidos/rebotados" value={failed} tone="text-red-600" />
            <StatCard label="En proceso" value={inProcess} tone="text-blue-600" />
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <div className="xl:col-span-2 relative">
            <Search size={18} className="absolute left-3 top-3 text-slate-400" />
            <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="Buscar por correo, asunto o tipo" />
          </div>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2.5 rounded-xl border border-slate-200 outline-none">
            {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={eventKey} onChange={e => { setEventKey(e.target.value); setPage(1); }} className="px-3 py-2.5 rounded-xl border border-slate-200 outline-none">
            {EVENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1); }} className="px-3 py-2.5 rounded-xl border border-slate-200 outline-none" />
          <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1); }} className="px-3 py-2.5 rounded-xl border border-slate-200 outline-none" />
        </div>

        {error && (
          <div className="m-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Correo</th>
                <th className="text-left px-5 py-3 font-medium">Asunto</th>
                <th className="text-left px-5 py-3 font-medium">Tipo</th>
                <th className="text-left px-5 py-3 font-medium">Estado</th>
                <th className="text-left px-5 py-3 font-medium">Fecha</th>
                <th className="text-right px-5 py-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">Cargando mensajes...</td></tr>
              ) : messages.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400"><Inbox className="mx-auto mb-2" /> No hay correos para los filtros seleccionados.</td></tr>
              ) : messages.map(message => (
                <tr key={message.id} className="hover:bg-slate-50/80">
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-800">{message.recipientEmail}</p>
                    <p className="text-xs text-slate-400">{message.fromEmail || 'Remitente del sistema'}</p>
                  </td>
                  <td className="px-5 py-4 max-w-[360px]">
                    <p className="text-slate-800 truncate">{message.subject}</p>
                    {message.lastError && <p className="text-xs text-red-500 truncate">{message.lastError}</p>}
                  </td>
                  <td className="px-5 py-4 text-slate-500">{message.eventKey || message.source || '-'}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${STATUS_STYLE[message.status] || STATUS_STYLE.queued}`}>
                      {statusIcon(message.status)} {STATUS_LABEL[message.status] || message.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-500">{formatDate(message.createdAt)}</td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEvents(message)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="Ver eventos">
                        <Eye size={16} />
                      </button>
                      <button onClick={() => resend(message)} disabled={sending} className="p-2 rounded-lg text-indigo-600 hover:bg-indigo-50" title="Reenviar">
                        <RotateCcw size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Filter size={15} /> Mostrando {messages.length} de {total}
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="ml-2 border border-slate-200 rounded-lg px-2 py-1">
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-2 rounded-lg border border-slate-200 disabled:opacity-40">Anterior</button>
            <span className="text-sm text-slate-500">Pagina {page} de {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages} className="px-3 py-2 rounded-lg border border-slate-200 disabled:opacity-40">Siguiente</button>
          </div>
        </div>
      </div>
        </>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Eventos del correo</h3>
                <p className="text-sm text-slate-500 truncate max-w-lg">{selected.subject}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-3">
              {eventsLoading ? <p className="text-slate-400">Cargando eventos...</p> : events.length === 0 ? (
                <p className="text-slate-400">Sin eventos registrados todavia.</p>
              ) : events.map(event => (
                <div key={event.id} className="border border-slate-100 rounded-xl p-3">
                  <div className="flex justify-between gap-3">
                    <p className="font-medium text-slate-800">{event.eventType}</p>
                    <p className="text-xs text-slate-400">{formatDate(event.occurredAt)}</p>
                  </div>
                  {event.providerEventId && <p className="text-xs text-slate-400 mt-1">Evento proveedor: {event.providerEventId}</p>}
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end">
              <button onClick={() => resend(selected)} disabled={sending} className="px-4 py-2 rounded-xl bg-indigo-600 text-white flex items-center gap-2">
                <RotateCcw size={16} /> Reenviar correo
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompose && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={sendManual} className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-2"><Send className="text-indigo-600" /> Enviar correo manual</h3>
              <button type="button" onClick={() => setShowCompose(false)} className="p-2 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="p-6 grid grid-cols-1 gap-4">
              <label className="text-sm text-slate-600">
                Destinatario
                <input type="email" required value={compose.to} onChange={e => setCompose({ ...compose, to: e.target.value })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="tutor@correo.com" />
              </label>
              <label className="text-sm text-slate-600">
                Asunto
                <input required value={compose.subject} onChange={e => setCompose({ ...compose, subject: e.target.value })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Recordatorio o seguimiento" />
              </label>
              <label className="text-sm text-slate-600">
                Mensaje
                <textarea required rows={7} value={compose.body} onChange={e => setCompose({ ...compose, body: e.target.value })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Escribe el mensaje para el tutor..." />
              </label>
            </div>
            <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
              <button type="button" onClick={() => setShowCompose(false)} className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600">Cancelar</button>
              <button disabled={sending} className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20">
                {sending ? 'Enviando...' : 'Enviar y registrar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default MessagingCenter;
