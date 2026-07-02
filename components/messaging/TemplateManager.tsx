import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Edit3,
  FileText,
  LayoutTemplate,
  Plus,
  RefreshCw,
  Save,
  Search,
} from 'lucide-react';
import {
  MessagingService,
  MessagingTemplate,
  MessagingTemplateCategory,
} from '../../services/api';

const CATEGORIES: Array<{ value: MessagingTemplateCategory | ''; label: string }> = [
  { value: '', label: 'Todas las categorias' },
  { value: 'clinical', label: 'Clinica' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'operations', label: 'Operaciones' },
  { value: 'reports', label: 'Reportes' },
  { value: 'custom', label: 'Personalizada' },
];

const CATEGORY_LABEL: Record<string, string> = {
  clinical: 'Clinica',
  marketing: 'Marketing',
  operations: 'Operaciones',
  reports: 'Reportes',
  custom: 'Personalizada',
};

type TemplateForm = {
  id: number | null;
  name: string;
  category: MessagingTemplateCategory;
  subject: string;
  body: string;
  active: boolean;
};

const EMPTY_FORM: TemplateForm = {
  id: null,
  name: '',
  category: 'custom',
  subject: '',
  body: '',
  active: true,
};

function toForm(template: MessagingTemplate): TemplateForm {
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    subject: template.subject,
    body: template.body,
    active: template.active,
  };
}

const TemplateManager: React.FC = () => {
  const [templates, setTemplates] = useState<MessagingTemplate[]>([]);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [active, setActive] = useState('true');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const activeCount = useMemo(() => templates.filter(item => item.active).length, [templates]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await MessagingService.getTemplates({
        q,
        category,
        active: active === '' ? undefined : active === 'true',
        page,
        pageSize,
      });
      setTemplates(result.data);
      setTotal(result.total);
    } catch (err: any) {
      setError(err.message || 'No se pudieron cargar las plantillas.');
    } finally {
      setLoading(false);
    }
  }, [active, category, page, pageSize, q]);

  useEffect(() => { load(); }, [load]);

  const startNew = () => {
    setError('');
    setForm(EMPTY_FORM);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        category: form.category,
        subject: form.subject,
        body: form.body,
        active: form.active,
      };
      const saved = form.id
        ? await MessagingService.updateTemplate(form.id, payload)
        : await MessagingService.createTemplate(payload);
      await load();
      setForm(toForm(saved));
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar la plantilla.');
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!form.id) return;
    if (!window.confirm('Archivar esta plantilla? No se eliminara el historial de campanas.')) return;
    setSaving(true);
    setError('');
    try {
      const archived = await MessagingService.archiveTemplate(form.id);
      await load();
      setForm(toForm(archived));
    } catch (err: any) {
      setError(err.message || 'No se pudo archivar la plantilla.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-5">
      <aside className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <LayoutTemplate size={20} className="text-indigo-600" /> Plantillas
            </h3>
            <p className="text-sm text-slate-500 mt-1">Textos reutilizables para campanas, recordatorios y comunicaciones clinicas.</p>
          </div>
          <button onClick={startNew} className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700" title="Nueva plantilla">
            <Plus size={18} />
          </button>
        </div>

        <div className="p-4 grid grid-cols-2 gap-3 border-b border-slate-100">
          <div className="rounded-xl bg-indigo-50 p-3">
            <p className="text-xs uppercase tracking-wide text-indigo-500">Activas</p>
            <p className="text-2xl font-semibold text-indigo-700">{activeCount}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Total filtro</p>
            <p className="text-2xl font-semibold text-slate-800">{total}</p>
          </div>
        </div>

        <div className="p-4 space-y-3 border-b border-slate-100">
          <div className="relative">
            <Search size={17} className="absolute left-3 top-3 text-slate-400" />
            <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Buscar nombre o asunto" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} className="px-3 py-2.5 rounded-xl border border-slate-200 outline-none">
              {CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select value={active} onChange={e => { setActive(e.target.value); setPage(1); }} className="px-3 py-2.5 rounded-xl border border-slate-200 outline-none">
              <option value="true">Activas</option>
              <option value="false">Archivadas</option>
              <option value="">Todas</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="m-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm flex items-center gap-2">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <div className="max-h-[620px] overflow-y-auto divide-y divide-slate-100">
          {loading ? (
            <div className="p-8 text-center text-slate-400">Cargando plantillas...</div>
          ) : templates.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No hay plantillas con estos filtros.</div>
          ) : templates.map(template => (
            <button
              key={template.id}
              onClick={() => setForm(toForm(template))}
              className={`w-full text-left p-4 hover:bg-slate-50 transition ${form.id === template.id ? 'bg-indigo-50/70' : ''}`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-1 h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 grid place-items-center">
                  <FileText size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-slate-900 block truncate">{template.name}</span>
                  <span className="text-sm text-slate-500 block truncate">{template.subject}</span>
                  <span className="mt-2 inline-flex px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs">
                    {CATEGORY_LABEL[template.category] || template.category}
                  </span>
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
          <button onClick={load} className="flex items-center gap-2 hover:text-indigo-600">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-2 py-1 rounded-lg border border-slate-200 disabled:opacity-40">Anterior</button>
            <span>{page}/{pages}</span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages} className="px-2 py-1 rounded-lg border border-slate-200 disabled:opacity-40">Siguiente</button>
          </div>
        </div>
      </aside>

      <form onSubmit={save} className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden h-fit">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Edit3 size={20} className="text-indigo-600" /> {form.id ? 'Editar plantilla' : 'Nueva plantilla'}
            </h3>
            <p className="text-sm text-slate-500 mt-1">Variables disponibles: {'{{nombre}}'}, {'{{empresa}}'}, {'{{correo}}'}.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.id && (
              <button type="button" onClick={archive} disabled={saving || !form.active} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 disabled:opacity-50 flex items-center gap-2">
                <Archive size={16} /> Archivar
              </button>
            )}
            <button disabled={saving} className="px-5 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2 shadow-lg shadow-indigo-600/20">
              <Save size={16} /> {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
            <label className="text-sm text-slate-600">
              Nombre
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Recordatorio de vacuna" />
            </label>
            <label className="text-sm text-slate-600">
              Categoria
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as MessagingTemplateCategory })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none">
                {CATEGORIES.filter(item => item.value).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <label className="text-sm text-slate-600">
            Asunto
            <input required value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Hola {{nombre}}, tenemos novedades para ti" />
          </label>
          <label className="text-sm text-slate-600">
            Cuerpo del correo
            <textarea required rows={10} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="Escribe la plantilla..." />
          </label>
          <label className="inline-flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="h-5 w-5 rounded border-slate-300 accent-indigo-600" />
            Plantilla activa para nuevas campanas
          </label>
        </div>
      </form>
    </div>
  );
};

export default TemplateManager;
