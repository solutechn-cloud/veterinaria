import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Edit3,
  LayoutTemplate,
  MailCheck,
  Megaphone,
  RefreshCw,
  Save,
  Search,
  Send,
  UsersRound,
  XCircle,
} from 'lucide-react';
import {
  MessagingAudienceDefinition,
  MessagingAudiencePreview,
  MessagingAudienceType,
  MessagingCampaign,
  MessagingCampaignRecipient,
  MessagingService,
  MessagingTemplate,
} from '../../services/api';

const FALLBACK_AUDIENCE_OPTIONS: MessagingAudienceDefinition[] = [
  ['all_tutors', 'Todos los tutores', 'Tutores con correo valido y activo.', 'General'],
  ['active_patients', 'Tutores con pacientes activos', 'Pacientes con expediente activo.', 'General'],
  ['recent_tutors', 'Tutores recientes', 'Clientes creados en los ultimos 90 dias.', 'General'],
  ['appointment_upcoming', 'Citas proximas', 'Tutores con citas futuras no cerradas.', 'Agenda'],
  ['appointment_tomorrow', 'Citas de manana', 'Recordatorio para las citas de manana.', 'Agenda'],
  ['vaccines_due', 'Vacunas vencidas', 'Pacientes con proxima dosis vencida o para hoy.', 'Preventiva'],
  ['vaccines_next_30', 'Vacunas proximos 30 dias', 'Vacunas o refuerzos por vencer.', 'Preventiva'],
  ['inactive_tutors', 'Tutores inactivos', 'Sin actividad clinica reciente.', 'Retencion'],
  ['species_canine', 'Pacientes caninos', 'Campanas enfocadas en perros.', 'Especies'],
  ['species_feline', 'Pacientes felinos', 'Campanas enfocadas en gatos.', 'Especies'],
].map(([value, label, hint, group]) => ({ value, label, hint, group } as MessagingAudienceDefinition));
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  scheduled: 'Programada',
  sending: 'Enviando',
  sent: 'Enviada',
  failed: 'Con fallos',
  cancelled: 'Cancelada',
  pending: 'Pendiente',
  skipped: 'Omitido',
};

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  scheduled: 'bg-violet-100 text-violet-700',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
  pending: 'bg-amber-100 text-amber-700',
  skipped: 'bg-slate-100 text-slate-500',
};

type CampaignForm = {
  id?: number;
  name: string;
  subject: string;
  body: string;
  audienceType: MessagingAudienceType;
  templateId: number | null;
  scheduledAt: string;
};

const EMPTY_FORM: CampaignForm = {
  name: '',
  subject: '',
  body: '',
  audienceType: 'all_tutors',
  templateId: null,
  scheduledAt: '',
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-HN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function toLocalDateTimeInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoDateTime(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function campaignStatusIcon(status: string) {
  if (status === 'sent') return <CheckCircle2 size={15} />;
  if (status === 'failed') return <AlertTriangle size={15} />;
  if (status === 'scheduled') return <CalendarClock size={15} />;
  return <Clock size={15} />;
}

const CampaignManager: React.FC = () => {
  const [campaigns, setCampaigns] = useState<MessagingCampaign[]>([]);
  const [templates, setTemplates] = useState<MessagingTemplate[]>([]);
  const [audienceOptions, setAudienceOptions] = useState<MessagingAudienceDefinition[]>(FALLBACK_AUDIENCE_OPTIONS);
  const [recipients, setRecipients] = useState<MessagingCampaignRecipient[]>([]);
  const [selected, setSelected] = useState<MessagingCampaign | null>(null);
  const [preview, setPreview] = useState<MessagingAudiencePreview | null>(null);
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState('');

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const selectedStats = useMemo(() => {
    const base = { pending: 0, sent: 0, failed: 0, skipped: 0 };
    recipients.forEach(item => { base[item.status] = (base[item.status] || 0) + 1; });
    return base;
  }, [recipients]);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await MessagingService.getCampaigns({ q, status, page, pageSize });
      setCampaigns(result.data);
      setTotal(result.total);
    } catch (err: any) {
      setError(err.message || 'No se pudieron cargar las campanas.');
    } finally {
      setLoading(false);
    }
  }, [q, status, page, pageSize]);

  const loadPreview = useCallback(async (audienceType: MessagingAudienceType) => {
    try {
      setPreview(await MessagingService.previewAudience(audienceType));
    } catch {
      setPreview(null);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const result = await MessagingService.getTemplates({ active: true, pageSize: 100 });
      setTemplates(result.data);
    } catch {
      setTemplates([]);
    }
  }, []);
  const loadAudienceOptions = useCallback(async () => {
    try {
      const result = await MessagingService.getAudienceOptions();
      setAudienceOptions(result.length ? result : FALLBACK_AUDIENCE_OPTIONS);
    } catch {
      setAudienceOptions(FALLBACK_AUDIENCE_OPTIONS);
    }
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);
  useEffect(() => { loadTemplates(); }, [loadTemplates]);
  useEffect(() => { loadAudienceOptions(); }, [loadAudienceOptions]);
  useEffect(() => { loadPreview(form.audienceType); }, [form.audienceType, loadPreview]);

  const selectCampaign = async (campaign: MessagingCampaign) => {
    setSelected(campaign);
    setForm({
      id: campaign.id,
      name: campaign.name,
      subject: campaign.subject,
      body: campaign.body,
      audienceType: campaign.audienceType,
      templateId: campaign.templateId,
      scheduledAt: toLocalDateTimeInput(campaign.scheduledAt),
    });
    try {
      setRecipients(await MessagingService.getCampaignRecipients(campaign.id));
    } catch {
      setRecipients([]);
    }
  };

  const resetForm = () => {
    setSelected(null);
    setRecipients([]);
    setForm(EMPTY_FORM);
  };

  const applyTemplate = (templateId: number | null) => {
    const template = templates.find(item => item.id === templateId);
    setForm(current => ({
      ...current,
      templateId,
      subject: template?.subject || current.subject,
      body: template?.body || current.body,
      name: current.name || template?.name || '',
    }));
  };

  const saveCampaign = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        scheduledAt: toIsoDateTime(form.scheduledAt),
      };
      const saved = form.id
        ? await MessagingService.updateCampaign(form.id, payload)
        : await MessagingService.createCampaign(payload);
      await loadCampaigns();
      await selectCampaign(saved);
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar la campana.');
    } finally {
      setSaving(false);
    }
  };

  const scheduleCampaign = async () => {
    if (!form.id || !form.scheduledAt) return;
    setScheduling(true);
    setError('');
    try {
      const updated = await MessagingService.scheduleCampaign(form.id, toIsoDateTime(form.scheduledAt) || '');
      await loadCampaigns();
      await selectCampaign(updated);
    } catch (err: any) {
      setError(err.message || 'No se pudo programar la campana.');
    } finally {
      setScheduling(false);
    }
  };

  const cancelCampaign = async () => {
    if (!form.id) return;
    if (!window.confirm('Cancelar esta campana?')) return;
    setScheduling(true);
    setError('');
    try {
      const updated = await MessagingService.cancelCampaign(form.id);
      await loadCampaigns();
      await selectCampaign(updated);
    } catch (err: any) {
      setError(err.message || 'No se pudo cancelar la campana.');
    } finally {
      setScheduling(false);
    }
  };

  const sendCampaign = async () => {
    if (!form.id) return;
    if (!window.confirm('Enviar esta campana a la audiencia seleccionada?')) return;
    setSending(true);
    setError('');
    try {
      const updated = await MessagingService.sendCampaign(form.id);
      await loadCampaigns();
      await selectCampaign(updated);
    } catch (err: any) {
      setError(err.message || 'No se pudo iniciar el envio de la campana.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-5">
      <div className="space-y-4">
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Megaphone className="text-indigo-600" size={20} /> Campanas de correo
              </h3>
              <p className="text-sm text-slate-500">Crea audiencias, envia correos masivos y revisa el estado por destinatario.</p>
            </div>
            <button onClick={resetForm} className="px-4 py-2 rounded-xl bg-indigo-600 text-white flex items-center gap-2">
              <Megaphone size={16} /> Nueva campana
            </button>
          </div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-[1fr_180px_44px] gap-3 border-b border-slate-100">
            <div className="relative">
              <Search size={17} className="absolute left-3 top-3 text-slate-400" />
              <input
                value={q}
                onChange={e => { setQ(e.target.value); setPage(1); }}
                placeholder="Buscar por nombre o asunto"
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2.5 rounded-xl border border-slate-200 outline-none">
              <option value="">Todos los estados</option>
              <option value="draft">Borradores</option>
              <option value="scheduled">Programadas</option>
              <option value="sending">Enviando</option>
              <option value="sent">Enviadas</option>
              <option value="failed">Con fallos</option>
            </select>
            <button onClick={loadCampaigns} className="rounded-xl border border-slate-200 text-slate-500 grid place-items-center" disabled={loading}>
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {error && (
            <div className="m-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm flex items-center gap-2">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="p-10 text-center text-slate-400">Cargando campanas...</div>
            ) : campaigns.length === 0 ? (
              <div className="p-10 text-center text-slate-400">No hay campanas para los filtros seleccionados.</div>
            ) : campaigns.map(campaign => (
              <button
                key={campaign.id}
                onClick={() => selectCampaign(campaign)}
                className={`w-full text-left p-4 hover:bg-slate-50 transition ${selected?.id === campaign.id ? 'bg-indigo-50/70' : ''}`}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{campaign.name}</p>
                    <p className="text-sm text-slate-500 truncate max-w-xl">{campaign.subject}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs ${STATUS_STYLE[campaign.status] || STATUS_STYLE.draft}`}>
                      {campaignStatusIcon(campaign.status)} {STATUS_LABEL[campaign.status] || campaign.status}
                    </span>
                    <span className="text-xs text-slate-400">{formatDate(campaign.createdAt)}</span>
                  </div>
                </div>
                {campaign.scheduledAt && (
                  <p className="mt-2 text-xs text-violet-600 flex items-center gap-1">
                    <CalendarClock size={13} /> Programada: {formatDate(campaign.scheduledAt)}
                  </p>
                )}
                <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                  <span className="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">Audiencia: {campaign.totalRecipients}</span>
                  <span className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">Enviados: {campaign.sentCount}</span>
                  <span className="rounded-lg bg-red-50 px-3 py-2 text-red-700">Fallos: {campaign.failedCount}</span>
                  <span className="rounded-lg bg-slate-50 px-3 py-2 text-slate-500">Omitidos: {campaign.skippedCount}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="p-4 border-t border-slate-100 flex justify-between items-center text-sm text-slate-500">
            <span>{total} campanas</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-2 rounded-lg border border-slate-200 disabled:opacity-40">Anterior</button>
              <span>Pagina {page} de {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages} className="px-3 py-2 rounded-lg border border-slate-200 disabled:opacity-40">Siguiente</button>
            </div>
          </div>
        </div>

        {selected && (
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><MailCheck className="text-emerald-600" size={20} /> Destinatarios</h3>
              <div className="flex flex-wrap gap-2 text-xs">
                {Object.entries(selectedStats).map(([key, value]) => (
                  <span key={key} className={`px-2.5 py-1 rounded-full ${STATUS_STYLE[key] || STATUS_STYLE.pending}`}>{STATUS_LABEL[key] || key}: {value}</span>
                ))}
              </div>
            </div>
            <div className="max-h-80 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Tutor</th>
                    <th className="px-4 py-3 text-left font-medium">Correo</th>
                    <th className="px-4 py-3 text-left font-medium">Estado</th>
                    <th className="px-4 py-3 text-left font-medium">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recipients.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">La campana aun no tiene audiencia congelada.</td></tr>
                  ) : recipients.map(item => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 text-slate-700">{item.recipientName || '-'}</td>
                      <td className="px-4 py-3 text-slate-500">{item.recipientEmail}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs ${STATUS_STYLE[item.status] || STATUS_STYLE.pending}`}>{STATUS_LABEL[item.status] || item.status}</span>
                      </td>
                      <td className="px-4 py-3 text-red-500 max-w-xs truncate">{item.error || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={saveCampaign} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden h-fit sticky top-4">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Edit3 className="text-indigo-600" size={20} /> {form.id ? 'Editar campana' : 'Nueva campana'}
            </h3>
            <p className="text-sm text-slate-500">Variables: {'{{nombre}}'}, {'{{empresa}}'}, {'{{correo}}'}.</p>
          </div>
          {form.id && (
            <div className="flex flex-wrap gap-2">
              {selected?.status !== 'cancelled' && (
                <button type="button" onClick={cancelCampaign} disabled={scheduling || ['sending', 'sent'].includes(selected?.status || '')} className="px-4 py-2 rounded-xl border border-red-100 text-red-600 disabled:opacity-50 flex items-center gap-2">
                  <XCircle size={16} /> Cancelar
                </button>
              )}
              <button type="button" onClick={scheduleCampaign} disabled={scheduling || !form.scheduledAt || ['sending', 'sent', 'cancelled'].includes(selected?.status || '')} className="px-4 py-2 rounded-xl bg-violet-600 text-white disabled:opacity-50 flex items-center gap-2">
                <CalendarClock size={16} /> {scheduling ? 'Programando...' : 'Programar'}
              </button>
              <button type="button" onClick={sendCampaign} disabled={sending || selected?.status === 'sending' || selected?.status === 'sent' || selected?.status === 'cancelled'} className="px-4 py-2 rounded-xl bg-emerald-600 text-white disabled:opacity-50 flex items-center gap-2">
                <Send size={16} /> {sending ? 'Enviando...' : 'Enviar ahora'}
              </button>
            </div>
          )}
        </div>

        <div className="p-5 space-y-4">
          <label className="block text-sm text-slate-600">
            Plantilla
            <div className="mt-1 relative">
              <LayoutTemplate size={17} className="absolute left-3 top-3.5 text-slate-400" />
              <select value={form.templateId || ''} onChange={e => applyTemplate(e.target.value ? Number(e.target.value) : null)} className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200">
                <option value="">Sin plantilla</option>
                {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </div>
          </label>
          <label className="block text-sm text-slate-600">
            Nombre interno
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Campana vacunacion julio" />
          </label>
          <label className="block text-sm text-slate-600">
            Asunto
            <input required value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Hola {{nombre}}, tenemos novedades para ti" />
          </label>
          <label className="block text-sm text-slate-600">
            Audiencia
            <select value={form.audienceType} onChange={e => setForm({ ...form, audienceType: e.target.value as MessagingAudienceType })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200">
              {audienceOptions.map(option => <option key={option.value} value={option.value}>{option.group} - {option.label}</option>)}
            </select>
          </label>

          <label className="block text-sm text-slate-600">
            Programar envio
            <input type="datetime-local" value={form.scheduledAt} onChange={e => setForm({ ...form, scheduledAt: e.target.value })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" />
            <span className="text-xs text-slate-400 mt-1 block">Guarda el borrador y luego presiona Programar para dejarlo en cola.</span>
          </label>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
            <div className="flex items-center gap-2 text-indigo-700 font-medium"><UsersRound size={17} /> Audiencia estimada</div>
            <p className="text-3xl font-semibold text-slate-900 mt-2">{preview?.total ?? '-'}</p>
            <p className="text-sm text-slate-500">{preview?.definition?.hint || audienceOptions.find(o => o.value === form.audienceType)?.hint}</p>
            {!!preview?.sample.length && (
              <div className="mt-3 space-y-1">
                {preview.sample.slice(0, 4).map(item => (
                  <p key={item.recipientEmail} className="text-xs text-slate-500 truncate">{item.recipientName} - {item.recipientEmail}</p>
                ))}
              </div>
            )}
          </div>

          <label className="block text-sm text-slate-600">
            Mensaje
            <textarea required rows={9} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Escribe el contenido del correo..." />
          </label>
        </div>

        <div className="p-5 border-t border-slate-100 grid grid-cols-2 gap-3">
          <button type="button" onClick={resetForm} className="px-5 py-3 rounded-xl bg-slate-100 text-slate-600">Limpiar</button>
          <button disabled={saving} className="px-5 py-3 rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2">
            <Save size={16} /> {saving ? 'Guardando...' : 'Guardar borrador'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CampaignManager;
