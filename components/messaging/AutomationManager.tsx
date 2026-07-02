import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Play,
  Plus,
  RefreshCw,
  Save,
  Workflow,
} from 'lucide-react';
import {
  MessagingAudienceDefinition,
  MessagingAudienceType,
  MessagingAutomationFrequency,
  MessagingAutomationRule,
  MessagingAutomationRun,
  MessagingAutomationSendMode,
  MessagingAutomationStatus,
  MessagingService,
  MessagingTemplate,
} from '../../services/api';

type AutomationForm = {
  id: number | null;
  name: string;
  audienceType: MessagingAudienceType;
  templateId: number | '';
  frequency: MessagingAutomationFrequency;
  runTime: string;
  dayOfWeek: number | '';
  dayOfMonth: number | '';
  sendMode: MessagingAutomationSendMode;
  status: MessagingAutomationStatus;
};

const EMPTY_FORM: AutomationForm = {
  id: null,
  name: '',
  audienceType: 'all_tutors',
  templateId: '',
  frequency: 'weekly',
  runTime: '08:00',
  dayOfWeek: 1,
  dayOfMonth: 1,
  sendMode: 'schedule',
  status: 'active',
};

const FALLBACK_AUDIENCES: MessagingAudienceDefinition[] = [
  { value: 'all_tutors', label: 'Todos los tutores', hint: 'Tutores con correo valido.', group: 'General' },
];

const DAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miercoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sabado' },
];

const STATUS_LABEL: Record<string, string> = {
  active: 'Activa',
  paused: 'Pausada',
  archived: 'Archivada',
  running: 'Ejecutando',
  completed: 'Completada',
  failed: 'Fallida',
  skipped: 'Omitida',
};

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  archived: 'bg-slate-100 text-slate-500',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  skipped: 'bg-slate-100 text-slate-500',
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-HN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toForm(rule: MessagingAutomationRule): AutomationForm {
  return {
    id: rule.id,
    name: rule.name,
    audienceType: rule.audienceType,
    templateId: rule.templateId,
    frequency: rule.frequency,
    runTime: rule.runTime,
    dayOfWeek: rule.dayOfWeek ?? '',
    dayOfMonth: rule.dayOfMonth ?? '',
    sendMode: rule.sendMode,
    status: rule.status,
  };
}

function runStatusIcon(status: string) {
  if (status === 'completed') return <CheckCircle2 size={15} />;
  if (status === 'failed') return <AlertTriangle size={15} />;
  return <Clock3 size={15} />;
}

const AutomationManager: React.FC = () => {
  const [rules, setRules] = useState<MessagingAutomationRule[]>([]);
  const [templates, setTemplates] = useState<MessagingTemplate[]>([]);
  const [audiences, setAudiences] = useState<MessagingAudienceDefinition[]>(FALLBACK_AUDIENCES);
  const [runs, setRuns] = useState<MessagingAutomationRun[]>([]);
  const [form, setForm] = useState<AutomationForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const selected = useMemo(() => rules.find(rule => rule.id === form.id) || null, [form.id, rules]);
  const activeCount = useMemo(() => rules.filter(rule => rule.status === 'active').length, [rules]);

  const loadRuns = useCallback(async (id: number | null) => {
    if (!id) {
      setRuns([]);
      return;
    }
    try {
      setRuns(await MessagingService.getAutomationRuns(id));
    } catch {
      setRuns([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rulesResult, templateResult, audienceResult] = await Promise.all([
        MessagingService.getAutomations(),
        MessagingService.getTemplates({ active: true, pageSize: 100 }),
        MessagingService.getAudienceOptions(),
      ]);
      setRules(rulesResult);
      setTemplates(templateResult.data);
      setAudiences(audienceResult.length ? audienceResult : FALLBACK_AUDIENCES);
    } catch (err: any) {
      setError(err.message || 'No se pudieron cargar las automatizaciones.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectRule = async (rule: MessagingAutomationRule) => {
    setForm(toForm(rule));
    await loadRuns(rule.id);
  };

  const startNew = () => {
    setForm(EMPTY_FORM);
    setRuns([]);
    setError('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.templateId) {
      setError('Selecciona una plantilla para la automatizacion.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        audienceType: form.audienceType,
        templateId: Number(form.templateId),
        frequency: form.frequency,
        runTime: form.runTime,
        dayOfWeek: form.frequency === 'weekly' ? Number(form.dayOfWeek || 1) : null,
        dayOfMonth: form.frequency === 'monthly' ? Number(form.dayOfMonth || 1) : null,
        sendMode: form.sendMode,
        status: form.status,
      };
      const saved = form.id
        ? await MessagingService.updateAutomation(form.id, payload)
        : await MessagingService.createAutomation(payload);
      await load();
      setForm(toForm(saved));
      await loadRuns(saved.id);
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar la automatizacion.');
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    if (!form.id) return;
    setRunning(true);
    setError('');
    try {
      await MessagingService.runAutomation(form.id);
      await Promise.all([load(), loadRuns(form.id)]);
    } catch (err: any) {
      setError(err.message || 'No se pudo ejecutar la automatizacion.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[430px_minmax(0,1fr)] gap-5">
      <aside className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Workflow size={20} className="text-indigo-600" /> Automatizaciones
            </h3>
            <p className="text-sm text-slate-500 mt-1">Reglas recurrentes que crean campanas desde plantillas y audiencias.</p>
          </div>
          <button onClick={startNew} className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700" title="Nueva regla">
            <Plus size={18} />
          </button>
        </div>

        <div className="p-4 grid grid-cols-2 gap-3 border-b border-slate-100">
          <div className="rounded-xl bg-indigo-50 p-3">
            <p className="text-xs uppercase tracking-wide text-indigo-500">Activas</p>
            <p className="text-2xl font-semibold text-indigo-700">{activeCount}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Reglas</p>
            <p className="text-2xl font-semibold text-slate-800">{rules.length}</p>
          </div>
        </div>

        {error && (
          <div className="m-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <div className="max-h-[660px] overflow-y-auto divide-y divide-slate-100">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Cargando automatizaciones...</div>
          ) : rules.length === 0 ? (
            <div className="p-8 text-center text-slate-400">Aun no hay reglas automaticas.</div>
          ) : rules.map(rule => (
            <button
              key={rule.id}
              onClick={() => selectRule(rule)}
              className={`w-full text-left p-4 hover:bg-slate-50 transition ${form.id === rule.id ? 'bg-indigo-50/70' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{rule.name}</p>
                  <p className="text-sm text-slate-500 truncate">{rule.templateName || 'Plantilla'} · {rule.audienceType}</p>
                  <p className="text-xs text-slate-400 mt-1">Proxima: {formatDate(rule.nextRunAt)}</p>
                </div>
                <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs ${STATUS_STYLE[rule.status] || STATUS_STYLE.paused}`}>
                  {STATUS_LABEL[rule.status] || rule.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="space-y-5">
        <form onSubmit={save} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{form.id ? 'Editar automatizacion' : 'Nueva automatizacion'}</h3>
              <p className="text-sm text-slate-500">Configura cuando y a quien se enviara una comunicacion recurrente.</p>
            </div>
            <div className="flex gap-2">
              {form.id && (
                <button type="button" onClick={runNow} disabled={running} className="px-4 py-2 rounded-xl border border-indigo-200 text-indigo-700 hover:bg-indigo-50 flex items-center gap-2">
                  <Play size={16} /> Ejecutar
                </button>
              )}
              <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2">
                <Save size={16} /> Guardar
              </button>
            </div>
          </div>

          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm text-slate-600">
              Nombre
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Ej. Recordatorio semanal de vacunas" />
            </label>
            <label className="text-sm text-slate-600">
              Plantilla
              <select value={form.templateId} onChange={e => setForm({ ...form, templateId: e.target.value ? Number(e.target.value) : '' })} required className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none">
                <option value="">Selecciona una plantilla</option>
                {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Audiencia
              <select value={form.audienceType} onChange={e => setForm({ ...form, audienceType: e.target.value as MessagingAudienceType })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none">
                {audiences.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Frecuencia
              <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value as MessagingAutomationFrequency })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none">
                <option value="daily">Diaria</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Hora Honduras
              <input type="time" value={form.runTime} onChange={e => setForm({ ...form, runTime: e.target.value })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none" />
            </label>
            {form.frequency === 'weekly' && (
              <label className="text-sm text-slate-600">
                Dia de semana
                <select value={form.dayOfWeek} onChange={e => setForm({ ...form, dayOfWeek: Number(e.target.value) })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none">
                  {DAYS.map(day => <option key={day.value} value={day.value}>{day.label}</option>)}
                </select>
              </label>
            )}
            {form.frequency === 'monthly' && (
              <label className="text-sm text-slate-600">
                Dia del mes
                <input type="number" min={1} max={31} value={form.dayOfMonth} onChange={e => setForm({ ...form, dayOfMonth: Number(e.target.value) })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none" />
              </label>
            )}
            <label className="text-sm text-slate-600">
              Modo
              <select value={form.sendMode} onChange={e => setForm({ ...form, sendMode: e.target.value as MessagingAutomationSendMode })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none">
                <option value="schedule">Crear campana programada</option>
                <option value="send_now">Enviar inmediatamente</option>
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Estado
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as MessagingAutomationStatus })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none">
                <option value="active">Activa</option>
                <option value="paused">Pausada</option>
                <option value="archived">Archivada</option>
              </select>
            </label>
          </div>
        </form>

        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><CalendarClock size={20} className="text-indigo-600" /> Historial de ejecuciones</h3>
              <p className="text-sm text-slate-500">{selected ? selected.name : 'Selecciona una automatizacion para ver sus ejecuciones.'}</p>
            </div>
            {form.id && (
              <button onClick={() => loadRuns(form.id)} className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
                <RefreshCw size={16} />
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {runs.length === 0 ? (
              <div className="p-8 text-center text-slate-400">Sin ejecuciones registradas.</div>
            ) : runs.map(run => (
              <div key={run.id} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-800">{run.campaignName || `Ejecucion #${run.id}`}</p>
                  <p className="text-sm text-slate-500">{formatDate(run.startedAt)} · {run.recipientsCount} destinatarios</p>
                  {run.error && <p className="text-xs text-red-500 mt-1">{run.error}</p>}
                </div>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${STATUS_STYLE[run.status] || STATUS_STYLE.paused}`}>
                  {runStatusIcon(run.status)} {STATUS_LABEL[run.status] || run.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AutomationManager;
