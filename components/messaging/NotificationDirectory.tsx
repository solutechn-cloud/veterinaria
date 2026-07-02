import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  Mail,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react';
import {
  AutomationEvent,
  AutomationRecipient,
  AutomationRecipientEvent,
  AutomationService,
} from '../../services/api';

type DirectoryForm = {
  id: number | null;
  nombre: string;
  email: string;
  tipo: 'persona' | 'grupo';
  activo: boolean;
  cargo: string;
  telefono: string;
  descripcion: string;
  notas: string;
  events: AutomationRecipientEvent[];
};

type RecipientFilter = 'todos' | 'activos' | 'inactivos' | 'grupos';

const emptyForm = (events: AutomationEvent[]): DirectoryForm => ({
  id: null,
  nombre: '',
  email: '',
  tipo: 'persona',
  activo: true,
  cargo: '',
  telefono: '',
  descripcion: '',
  notas: '',
  events: events.map(event => ({
    eventKey: event.key,
    enabled: false,
    scheduledTime: event.recommendedTime || '',
  })),
});

function mergeRecipientEvents(recipient: AutomationRecipient | null, catalog: AutomationEvent[]) {
  const current = new Map((recipient?.events || []).map(event => [event.eventKey, event]));
  return catalog.map(event => {
    const selected = current.get(event.key);
    return {
      eventKey: event.key,
      enabled: selected?.enabled || false,
      scheduledTime: selected?.scheduledTime || event.recommendedTime || '',
    };
  });
}

function toForm(recipient: AutomationRecipient, events: AutomationEvent[]): DirectoryForm {
  return {
    id: recipient.id,
    nombre: recipient.nombre || '',
    email: recipient.email || '',
    tipo: recipient.tipo || 'persona',
    activo: recipient.activo !== false,
    cargo: recipient.cargo || '',
    telefono: recipient.telefono || '',
    descripcion: recipient.descripcion || '',
    notas: recipient.notas || '',
    events: mergeRecipientEvents(recipient, events),
  };
}

function eventValue(form: DirectoryForm, key: string) {
  return form.events.find(event => event.eventKey === key);
}

const NotificationDirectory: React.FC = () => {
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [recipients, setRecipients] = useState<AutomationRecipient[]>([]);
  const [form, setForm] = useState<DirectoryForm>(() => emptyForm([]));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RecipientFilter>('todos');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [catalog, directory] = await Promise.all([
        AutomationService.getEvents(),
        AutomationService.getRecipients(),
      ]);
      setEvents(catalog);
      setRecipients(directory);
      const current = form.id ? directory.find(recipient => recipient.id === form.id) : null;
      setForm(current ? toForm(current, catalog) : emptyForm(catalog));
    } catch (err: any) {
      setError(err.message || 'No se pudo cargar el directorio de notificaciones.');
    } finally {
      setLoading(false);
    }
  }, [form.id]);

  useEffect(() => { load(); }, [load]);

  const groupedEvents = useMemo(() => {
    return events.reduce<Record<string, AutomationEvent[]>>((acc, event) => {
      const key = event.category || 'General';
      acc[key] = acc[key] || [];
      acc[key].push(event);
      return acc;
    }, {});
  }, [events]);

  const filteredRecipients = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return recipients.filter(recipient => {
      if (filter === 'activos' && recipient.activo === false) return false;
      if (filter === 'inactivos' && recipient.activo !== false) return false;
      if (filter === 'grupos' && recipient.tipo !== 'grupo') return false;
      if (!needle) return true;
      return [recipient.nombre, recipient.email, recipient.cargo, recipient.telefono]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle));
    });
  }, [filter, query, recipients]);

  const activeCount = recipients.filter(recipient => recipient.activo !== false).length;
  const assignedEvents = recipients.reduce(
    (total, recipient) => total + (recipient.events || []).filter(event => event.enabled).length,
    0
  );

  const selectRecipient = (recipient: AutomationRecipient) => {
    setError('');
    setForm(toForm(recipient, events));
  };

  const startNew = () => {
    setError('');
    setForm(emptyForm(events));
  };

  const updateEvent = (eventKey: string, patch: Partial<AutomationRecipientEvent>) => {
    setForm(current => {
      const exists = current.events.some(event => event.eventKey === eventKey);
      const nextEvents = exists
        ? current.events.map(event => event.eventKey === eventKey ? { ...event, ...patch } : event)
        : [...current.events, { eventKey, enabled: false, scheduledTime: '', ...patch }];
      return { ...current, events: nextEvents };
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        nombre: form.nombre,
        email: form.email,
        tipo: form.tipo,
        activo: form.activo,
        cargo: form.cargo,
        telefono: form.telefono,
        descripcion: form.descripcion,
        notas: form.notas,
        events: form.events,
      };
      const saved = form.id
        ? await AutomationService.updateRecipient(form.id, payload)
        : await AutomationService.createRecipient(payload);
      const directory = await AutomationService.getRecipients();
      setRecipients(directory);
      setForm(toForm(saved, events));
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar el destinatario.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!form.id) return;
    if (!window.confirm('Eliminar este destinatario del directorio de notificaciones?')) return;
    setSaving(true);
    try {
      await AutomationService.deleteRecipient(form.id);
      const directory = await AutomationService.getRecipients();
      setRecipients(directory);
      setForm(emptyForm(events));
    } catch (err: any) {
      setError(err.message || 'No se pudo eliminar el destinatario.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[380px_minmax(0,1fr)] gap-5">
      <aside className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <BellRing size={20} className="text-indigo-600" /> Directorio
            </h3>
            <p className="text-sm text-slate-500 mt-1">Correos y grupos que reciben alertas, reportes y seguimientos.</p>
          </div>
          <button onClick={startNew} className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700" title="Nuevo destinatario">
            <Plus size={18} />
          </button>
        </div>

        <div className="p-4 border-b border-slate-100 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-indigo-50 p-3">
            <p className="text-xs text-indigo-500 uppercase tracking-wide">Activos</p>
            <p className="text-2xl font-semibold text-indigo-700">{activeCount}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3">
            <p className="text-xs text-emerald-500 uppercase tracking-wide">Eventos</p>
            <p className="text-2xl font-semibold text-emerald-700">{assignedEvents}</p>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="relative">
            <Search size={17} className="absolute left-3 top-3 text-slate-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="Buscar nombre, correo o cargo"
            />
          </div>
          <select
            value={filter}
            onChange={event => setFilter(event.target.value as RecipientFilter)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 outline-none"
          >
            <option value="todos">Todos los destinatarios</option>
            <option value="activos">Solo activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="grupos">Grupos de correo</option>
          </select>
        </div>

        <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-100">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Cargando directorio...</div>
          ) : filteredRecipients.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No hay destinatarios con estos filtros.</div>
          ) : filteredRecipients.map(recipient => (
            <button
              key={recipient.id}
              onClick={() => selectRecipient(recipient)}
              className={`w-full text-left p-4 hover:bg-slate-50 transition ${form.id === recipient.id ? 'bg-indigo-50/70' : ''}`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 h-10 w-10 rounded-xl flex items-center justify-center ${recipient.tipo === 'grupo' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                  {recipient.tipo === 'grupo' ? <UsersRound size={18} /> : <UserRound size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-slate-900 block truncate">{recipient.nombre}</span>
                  <span className="text-sm text-slate-500 block truncate">{recipient.email}</span>
                  <span className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    {recipient.activo !== false ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    {recipient.activo !== false ? 'Activo' : 'Inactivo'} - {(recipient.events || []).filter(event => event.enabled).length} eventos
                  </span>
                </span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <form onSubmit={save} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {form.id ? 'Editar destinatario' : 'Nuevo destinatario'}
            </h3>
            <p className="text-sm text-slate-500 mt-1">Define quien recibe cada notificacion y a que hora debe llegar.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={load} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-2">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
            </button>
            {form.id && (
              <button type="button" onClick={remove} className="px-4 py-2 rounded-xl border border-red-100 text-red-600 hover:bg-red-50 flex items-center gap-2">
                <Trash2 size={16} /> Eliminar
              </button>
            )}
            <button disabled={saving} className="px-5 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2 shadow-lg shadow-indigo-600/20">
              <Save size={16} /> {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        {error && (
          <div className="m-5 p-3 rounded-xl bg-red-50 text-red-700 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <div className="p-5 space-y-6">
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <label className="text-sm text-slate-600">
              Nombre o grupo
              <input required value={form.nombre} onChange={event => setForm({ ...form, nombre: event.target.value })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Gerencia, Recepcion, Dra. Martinez" />
            </label>
            <label className="text-sm text-slate-600">
              Correo
              <div className="mt-1 relative">
                <Mail size={17} className="absolute left-3 top-3.5 text-slate-400" />
                <input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="equipo@clinica.com" />
              </div>
            </label>
            <label className="text-sm text-slate-600">
              Tipo
              <select value={form.tipo} onChange={event => setForm({ ...form, tipo: event.target.value as DirectoryForm['tipo'] })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none">
                <option value="persona">Persona</option>
                <option value="grupo">Grupo de correo</option>
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Cargo o area
              <input value={form.cargo} onChange={event => setForm({ ...form, cargo: event.target.value })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Administracion, Recepcion, Direccion medica" />
            </label>
            <label className="text-sm text-slate-600">
              Telefono
              <input value={form.telefono} onChange={event => setForm({ ...form, telefono: event.target.value })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="+504 9999-9999" />
            </label>
            <label className="text-sm text-slate-600 flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 mt-6">
              <input type="checkbox" checked={form.activo} onChange={event => setForm({ ...form, activo: event.target.checked })} className="h-5 w-5 rounded border-slate-300 accent-indigo-600" />
              Destinatario activo para envios automaticos
            </label>
            <label className="lg:col-span-2 text-sm text-slate-600">
              Descripcion
              <textarea value={form.descripcion} onChange={event => setForm({ ...form, descripcion: event.target.value })} rows={2} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Ej. Grupo que recibe reportes gerenciales y alertas criticas." />
            </label>
          </section>

          <section>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="font-semibold text-slate-900">Eventos asignados</h4>
                <p className="text-sm text-slate-500">Activa cada notificacion y ajusta su hora preferida por destinatario.</p>
              </div>
            </div>

            <div className="space-y-4">
              {Object.entries(groupedEvents).map(([category, items]) => (
                <div key={category} className="rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 text-sm font-medium text-slate-700">{category}</div>
                  <div className="divide-y divide-slate-100">
                    {items.map(item => {
                      const current = eventValue(form, item.key);
                      const enabled = current?.enabled || false;
                      return (
                        <div key={item.key} className="p-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_150px_120px] gap-3 xl:items-center">
                          <div>
                            <p className="font-medium text-slate-900">{item.label}</p>
                            <p className="text-sm text-slate-500 mt-1">{item.description}</p>
                          </div>
                          <label className="text-sm text-slate-600">
                            Hora
                            <div className="mt-1 relative">
                              <Clock3 size={15} className="absolute left-3 top-3 text-slate-400" />
                              <input
                                type="time"
                                value={current?.scheduledTime || ''}
                                disabled={!enabled}
                                onChange={event => updateEvent(item.key, { scheduledTime: event.target.value })}
                                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                              />
                            </div>
                          </label>
                          <label className="flex items-center justify-between xl:justify-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                            <span>{enabled ? 'Activo' : 'Inactivo'}</span>
                            <input type="checkbox" checked={enabled} onChange={event => updateEvent(item.key, { enabled: event.target.checked })} className="h-5 w-5 rounded border-slate-300 accent-indigo-600" />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <label className="text-sm text-slate-600">
            Notas internas
            <textarea value={form.notas} onChange={event => setForm({ ...form, notas: event.target.value })} rows={3} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Notas visibles solo para administracion." />
          </label>
        </div>
      </form>
    </div>
  );
};

export default NotificationDirectory;
