import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MedicamentosService, CatalogoService, InventoryService, AIService } from '../services/api';
import { Medicamento, PresentacionVenta, LoteMedicamento, ImagenMedicamento, CategoriaTerapeutica, FormaFarmaceutica, ViaAdministracion, AIMedicationImagePayload } from '../types';
import { Search, Plus, Pill, AlertTriangle, RefreshCw, Filter, Boxes, ChevronLeft, ChevronRight } from 'lucide-react';
import Swal from 'sweetalert2';

import { MainTab, DetailTab, blankMed, blankPres, blankLote, inpSm, btnPrimary, btnSecondary, LoteFormData } from '../components/Medicamentos/shared';
import MedicamentosTable from '../components/Medicamentos/MedicamentosTable';
import LotesTable       from '../components/Medicamentos/LotesTable';
import AlertasSection   from '../components/Medicamentos/AlertasSection';
import DetailPanel      from '../components/Medicamentos/DetailPanel';
import MedModal         from '../components/Medicamentos/MedModal';
import PresModal        from '../components/Medicamentos/PresModal';
import LoteModal        from '../components/Medicamentos/LoteModal';

const PAGE_SIZE = 25;

export default function Medicamentos() {
  const [mainTab, setMainTab] = useState<MainTab>('MEDICAMENTOS');
  const [loading, setLoading] = useState(false);

  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([]);
  const [categorias, setCategorias]     = useState<CategoriaTerapeutica[]>([]);
  const [formas, setFormas]             = useState<FormaFarmaceutica[]>([]);
  const [vias, setVias]                 = useState<ViaAdministracion[]>([]);
  const [proveedores, setProveedores]   = useState<any[]>([]);
  const [allLotes, setAllLotes]         = useState<any[]>([]);
  const [alertasVenc, setAlertasVenc]   = useState<any[]>([]);
  const [stockCritico, setStockCritico] = useState<any[]>([]);

  const [search, setSearch]                   = useState('');
  const [filterCat, setFilterCat]             = useState('');
  const [filterIsv, setFilterIsv]             = useState('');
  const [filterReceta, setFilterReceta]       = useState('');
  const [filterControlado, setFilterControlado] = useState('');
  const [filterEstadoCatalogo, setFilterEstadoCatalogo] = useState('');
  const [page, setPage] = useState(0);

  const [showMedModal, setShowMedModal] = useState(false);
  const [editingMed, setEditingMed]     = useState<string | null>(null);
  const [medForm, setMedForm]           = useState<Partial<Medicamento>>(blankMed());
  const [pendingAIImages, setPendingAIImages] = useState<Array<AIMedicationImagePayload & { dataUrl: string }>>([]);

  const [selectedMed, setSelectedMed]       = useState<Medicamento | null>(null);
  const [detailTab, setDetailTab]           = useState<DetailTab>('RESUMEN');
  const [imagenes, setImagenes]             = useState<ImagenMedicamento[]>([]);
  const [presentaciones, setPresentaciones] = useState<PresentacionVenta[]>([]);
  const [lotesDetalle, setLotesDetalle]     = useState<LoteMedicamento[]>([]);
  const [detailLoading, setDetailLoading]   = useState(false);
  const [uploadingImg, setUploadingImg]     = useState(false);
  const [analyzingImages, setAnalyzingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showPresModal, setShowPresModal] = useState(false);
  const [presForm, setPresForm]           = useState<Partial<PresentacionVenta>>(blankPres());
  const [editingPres, setEditingPres]     = useState<number | null>(null);

  const [showLoteModal, setShowLoteModal] = useState(false);
  const [loteForm, setLoteForm]           = useState<LoteFormData>(blankLote());
  const [editingLote, setEditingLote]     = useState<any | null>(null);
  const [loteModalMedName, setLoteModalMedName] = useState<string | undefined>(undefined);

  /* ── Data loading ────────────────────────────────────────── */
  const loadCatalogo = useCallback(async () => {
    const [cats, frms, vs, provs] = await Promise.all([
      CatalogoService.getCategorias(), CatalogoService.getFormas(), CatalogoService.getVias(), InventoryService.getProveedores(),
    ]);
    setCategorias(cats); setFormas(frms); setVias(vs); setProveedores(provs);
  }, []);

  const loadMedicamentos = useCallback(async (pageOverride?: number) => {
    const targetPage = pageOverride !== undefined ? pageOverride : page;
    setLoading(true);
    try {
      const params: any = {};
      if (search) params.q = search;
      if (filterCat) params.id_categoria = Number(filterCat);
      if (filterIsv) params.tipo_isv = filterIsv;
      if (filterReceta !== '')    params.requiere_receta = filterReceta === 'true';
      if (filterControlado !== '') params.es_controlado  = filterControlado === 'true';
      if (filterEstadoCatalogo) params.estado_catalogo = filterEstadoCatalogo;
      params.limit = PAGE_SIZE;
      params.offset = targetPage * PAGE_SIZE;
      const data = await MedicamentosService.getAll(params);
      setMedicamentos(data);
      return data;
    } finally { setLoading(false); }
  }, [search, filterCat, filterIsv, filterReceta, filterControlado, filterEstadoCatalogo, page]);

  const loadLotesAll = useCallback(async () => {
    setLoading(true);
    try { setAllLotes(await MedicamentosService.getLotesAll()); }
    finally { setLoading(false); }
  }, []);

  const loadAlertas = useCallback(async () => {
    setLoading(true);
    try {
      const [venc, stock] = await Promise.all([MedicamentosService.getAlertasVencimiento(), MedicamentosService.getStockCritico()]);
      setAlertasVenc(venc); setStockCritico(stock);
    } finally { setLoading(false); }
  }, []);

  const loadDetail = useCallback(async (med: Medicamento, tab: DetailTab) => {
    setDetailLoading(true);
    try {
      if (tab === 'IMAGENES')       setImagenes(await MedicamentosService.getImagenes(med.codigo));
      else if (tab === 'PRESENTACIONES') setPresentaciones(await MedicamentosService.getPresentaciones(med.codigo));
      else if (tab === 'LOTES')     setLotesDetalle(await MedicamentosService.getLotes(med.codigo));
    } finally { setDetailLoading(false); }
  }, []);

  useEffect(() => { loadCatalogo(); }, [loadCatalogo]);
  useEffect(() => { if (mainTab === 'MEDICAMENTOS') loadMedicamentos(); }, [mainTab, loadMedicamentos]);
  useEffect(() => { if (mainTab === 'LOTES') loadLotesAll(); }, [mainTab, loadLotesAll]);
  useEffect(() => { if (mainTab === 'ALERTAS') loadAlertas(); }, [mainTab, loadAlertas]);
  useEffect(() => { if (selectedMed) loadDetail(selectedMed, detailTab); }, [selectedMed, detailTab, loadDetail]);

  /* ── Handlers ────────────────────────────────────────────── */
  const openNewMed  = () => { setMedForm(blankMed()); setPendingAIImages([]); setEditingMed(null); setShowMedModal(true); };
  const openEditMed = (m: Medicamento) => { setMedForm({ ...m }); setPendingAIImages([]); setEditingMed(m.codigo); setShowMedModal(true); };

  const saveMed = async () => {
    if (!medForm.nombre_generico?.trim()) return Swal.fire('Error', 'El nombre del medicamento es requerido', 'error');
    try {
      let targetId = editingMed;
      if (editingMed) await MedicamentosService.update(editingMed, { ...selectedMed, ...medForm });
      else {
        const res = await MedicamentosService.create(medForm);
        targetId = res.codigo;
        for (const [idx, img] of pendingAIImages.entries()) {
          await MedicamentosService.createImagen(res.codigo, {
            imagen_base64: img.dataUrl,
            es_principal: idx === 0,
            descripcion: img.filename || `Foto IA ${idx + 1}`,
          });
        }
      }
      setShowMedModal(false);
      setPendingAIImages([]);
      const data = await loadMedicamentos();
      const target = data?.find(m => m.codigo === targetId);
      if (target) {
        setSelectedMed(target);
        setDetailTab(editingMed ? 'RESUMEN' : 'PRESENTACIONES');
      }
      Swal.fire({ icon: 'success', title: 'Guardado', timer: 1400, showConfirmButton: false });
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const refreshSelectedFromList = async (id = selectedMed?.codigo) => {
    const data = await loadMedicamentos();
    const fresh = data?.find(m => m.codigo === id);
    if (fresh) setSelectedMed(fresh);
    return fresh;
  };

  const updateSelectedMed = async (patch: Partial<Medicamento>) => {
    if (!selectedMed) return;
    await MedicamentosService.update(selectedMed.codigo, { ...selectedMed, ...patch });
    await refreshSelectedFromList(selectedMed.codigo);
    Swal.fire({ icon: 'success', title: 'Ficha actualizada', timer: 1200, showConfirmButton: false });
  };

  const toggleActivo = async (m: Medicamento) => {
    const r = await Swal.fire({ title: m.activo ? 'Desactivar medicamento?' : 'Activar medicamento?', icon: 'question', showCancelButton: true, confirmButtonText: 'Confirmar', cancelButtonText: 'Cancelar' });
    if (!r.isConfirmed) return;
    await MedicamentosService.update(m.codigo, { ...m, activo: !m.activo });
    loadMedicamentos();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedMed) return;
    if (file.size > 2 * 1024 * 1024) { Swal.fire('Archivo muy grande', 'Máximo 2 MB.', 'warning'); e.target.value = ''; return; }
    setUploadingImg(true);
    try {
      const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
      await MedicamentosService.createImagen(selectedMed.codigo, {
        imagen_base64: base64,
        es_principal: imagenes.length === 0,
        descripcion: file.name,
      });
      await Promise.all([
        loadDetail(selectedMed, 'IMAGENES'),
        refreshSelectedFromList(selectedMed.codigo),
      ]);
    } catch { Swal.fire('Error', 'No se pudo subir la imagen.', 'error'); }
    finally { setUploadingImg(false); e.target.value = ''; }
  };

  const deleteImagen = async (id: number) => {
    const r = await Swal.fire({ title: '¿Eliminar imagen?', icon: 'warning', showCancelButton: true });
    if (!r.isConfirmed) return;
    await MedicamentosService.deleteImagen(id);
    if (selectedMed) await Promise.all([
      loadDetail(selectedMed, 'IMAGENES'),
      refreshSelectedFromList(selectedMed.codigo),
    ]);
  };

  const setPrincipalImagen = async (id: number) => {
    if (!selectedMed) return;
    await MedicamentosService.setPrincipalImagen(id);
    await Promise.all([
      loadDetail(selectedMed, 'IMAGENES'),
      refreshSelectedFromList(selectedMed.codigo),
    ]);
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Imagen de portada actualizada', showConfirmButton: false, timer: 1400 });
  };

  const analyzeExistingImages = async () => {
    if (!selectedMed) return;

    // Imágenes legacy (base64 en BD)
    const base64Payload = imagenes
      .filter(img => img.imagen_base64)
      .map((img, idx) => {
        const match = String(img.imagen_base64).match(/^data:([^;]+);base64,(.+)$/);
        return match ? { mime: match[1] as any, base64: match[2], filename: `imagen-${idx + 1}` } : null;
      })
      .filter(Boolean) as AIMedicationImagePayload[];

    // Imágenes en R2 (backend las descarga directamente)
    const r2ImageIds = imagenes
      .filter(img => img.r2_key)
      .map(img => img.id_imagen);

    if (base64Payload.length === 0 && r2ImageIds.length === 0) {
      Swal.fire('Sin imágenes', 'No hay imágenes asociadas para analizar.', 'warning');
      return;
    }
    setAnalyzingImages(true);
    try {
      const safeContext = selectedMed ? {
        nombre_generico: selectedMed.nombre_generico,
        nombre_comercial: selectedMed.nombre_comercial,
        concentracion: selectedMed.concentracion,
        laboratorio: selectedMed.laboratorio,
        registro_sanitario: selectedMed.registro_sanitario,
        codigo_ean13: selectedMed.codigo_ean13,
      } : {};
      const result = await AIService.analyzeMedicationImages({
        images: base64Payload.length > 0 ? base64Payload : undefined,
        imageIds: r2ImageIds.length > 0 ? r2ImageIds : undefined,
        context: safeContext,
      });
      const f = result.fields;
      const patch: Partial<Medicamento> = {};
      const add = (key: keyof typeof f, target: keyof Medicamento) => {
        const item = f[key] as any;
        if (item?.value && Number(item.confidence) >= 0.45) (patch as any)[target] = item.value;
      };
      add('nombre_generico', 'nombre_generico');
      add('nombre_comercial', 'nombre_comercial');
      add('concentracion', 'concentracion');
      add('laboratorio', 'laboratorio');
      add('pais_origen', 'pais_origen');
      add('registro_sanitario', 'registro_sanitario');
      add('codigo_ean13', 'codigo_ean13');
      add('via_administracion', 'via_administracion');
      add('clase_controlado', 'clase_controlado');
      add('indicaciones', 'indicaciones');
      add('advertencias', 'advertencias');
      add('contraindicaciones', 'contraindicaciones');
      add('condicion_almacenamiento', 'condicion_almacenamiento');
      if (f.id_forma_sugerida?.value && Number(f.id_forma_sugerida.confidence) >= 0.45) patch.id_forma = Number(f.id_forma_sugerida.value);
      if (f.id_categoria_sugerida?.value && Number(f.id_categoria_sugerida.confidence) >= 0.45) patch.id_categoria = Number(f.id_categoria_sugerida.value);
      if (Number(f.requiere_receta?.confidence) >= 0.45) patch.requiere_receta = Boolean(f.requiere_receta.value);
      if (Number(f.es_controlado?.confidence) >= 0.45) patch.es_controlado = Boolean(f.es_controlado.value);
      if (Number(f.tipo_isv?.confidence) >= 0.45) patch.tipo_isv = f.tipo_isv.value;

      const LABELS: Record<string, string> = {
        nombre_generico: 'Nombre genérico', nombre_comercial: 'Marca', concentracion: 'Concentración',
        laboratorio: 'Laboratorio', pais_origen: 'País de origen', registro_sanitario: 'Registro sanitario',
        codigo_ean13: 'Código de barras', via_administracion: 'Vía de administración',
        id_forma: 'Forma farmacéutica', id_categoria: 'Categoría terapéutica',
        requiere_receta: 'Requiere receta', es_controlado: 'Es controlado',
        clase_controlado: 'Clase controlado', tipo_isv: 'ISV',
        indicaciones: 'Indicaciones', advertencias: 'Advertencias',
        contraindicaciones: 'Contraindicaciones', condicion_almacenamiento: 'Almacenamiento',
      };
      const html = Object.entries(patch).map(([k, v]) => `<p><b>${LABELS[k] || k}:</b> ${String(v)}</p>`).join('') || '<p>No hubo campos con confianza suficiente.</p>';
      const r = await Swal.fire({
        title: 'Sugerencias de IA',
        html: `${html}<p style="margin-top:8px;color:#92400e">Revise los datos antes de guardar. La IA puede equivocarse.</p>`,
        showCancelButton: true,
        confirmButtonText: 'Aplicar a ficha',
        cancelButtonText: 'Cancelar',
      });
      if (r.isConfirmed && Object.keys(patch).length > 0) await updateSelectedMed(patch);
    } catch (e: any) {
      Swal.fire('Error IA', e.message || 'No se pudo analizar el medicamento.', 'error');
    } finally {
      setAnalyzingImages(false);
    }
  };

  const loadLotesForPricing = async () => {
    if (selectedMed) setLotesDetalle(await MedicamentosService.getLotes(selectedMed.codigo));
  };

  const openNewPres  = async () => { await loadLotesForPricing(); setPresForm(blankPres()); setEditingPres(null); setShowPresModal(true); };
  const openEditPres = async (p: PresentacionVenta) => { await loadLotesForPricing(); setPresForm({ ...p }); setEditingPres(p.id_presentacion); setShowPresModal(true); };

  const costoBaseUnitario = lotesDetalle
    .filter(l => l.precio_compra_unitario != null)
    .sort((a, b) => b.id_lote - a.id_lote)[0]?.precio_compra_unitario;

  const savePres = async () => {
    if (!selectedMed || !presForm.nombre) return;
    try {
      if (editingPres) await MedicamentosService.updatePresentacion(editingPres, presForm);
      else await MedicamentosService.createPresentacion(selectedMed.codigo, presForm);
      setShowPresModal(false); loadDetail(selectedMed, 'PRESENTACIONES');
      await refreshSelectedFromList(selectedMed.codigo);
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const deletePres = async (id: number) => {
    const r = await Swal.fire({ title: '¿Eliminar presentación?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Eliminar' });
    if (!r.isConfirmed) return;
    await MedicamentosService.deletePresentacion(id);
    if (selectedMed) loadDetail(selectedMed, 'PRESENTACIONES');
  };

  const parseLoteExpiry = (lote: any) => {
    const display = String(lote.fecha_vencimiento_display || '');
    const displayMatch = display.match(/^(\d{1,2})\/(\d{4})$/);
    if (displayMatch) {
      return {
        mes_vencimiento: Number(displayMatch[1]),
        anio_vencimiento: Number(displayMatch[2]),
      };
    }

    const raw = String(lote.fecha_vencimiento || '').slice(0, 10);
    const dateMatch = raw.match(/^(\d{4})-(\d{1,2})-/);
    if (dateMatch) {
      return {
        mes_vencimiento: Number(dateMatch[2]),
        anio_vencimiento: Number(dateMatch[1]),
      };
    }

    const fallback = blankLote();
    return {
      mes_vencimiento: fallback.mes_vencimiento,
      anio_vencimiento: fallback.anio_vencimiento,
    };
  };

  const refreshLoteViews = async (medId?: string) => {
    const tasks: Promise<any>[] = [];
    if (selectedMed && (!medId || medId === selectedMed.codigo)) {
      tasks.push(loadDetail(selectedMed, 'LOTES'));
      tasks.push(refreshSelectedFromList(selectedMed.codigo));
    }
    if (mainTab === 'LOTES') tasks.push(loadLotesAll());
    await Promise.all(tasks);
  };

  const openNewLote = () => {
    if (!selectedMed) return;
    setEditingLote(null);
    setLoteModalMedName(selectedMed.nombre_generico);
    setLoteForm(blankLote());
    setShowLoteModal(true);
  };

  const openEditLote = (lote: any) => {
    const expiry = parseLoteExpiry(lote);
    setEditingLote(lote);
    setLoteModalMedName(lote.medNombre || selectedMed?.nombre_generico);
    setLoteForm({
      ...blankLote(),
      numero_lote: lote.numero_lote || '',
      mes_vencimiento: expiry.mes_vencimiento,
      anio_vencimiento: expiry.anio_vencimiento,
      cantidad: Number(lote.cantidad_actual ?? 0),
      id_presentacion: 0,
      precio_compra_presentacion: Number(lote.precio_compra_unitario ?? 0),
      id_proveedor: lote.id_proveedor || '',
      id_sucursal: Number(lote.id_sucursal || 0),
      notas: lote.notas || '',
    });
    setShowLoteModal(true);
  };

  const closeLoteModal = () => {
    setShowLoteModal(false);
    setEditingLote(null);
    setLoteModalMedName(undefined);
    setLoteForm(blankLote());
  };

  const saveLote = async () => {
    if (!loteForm.numero_lote?.trim()) return Swal.fire('Error', 'El numero de lote es requerido', 'error');
    try {
      if (editingLote) {
        await MedicamentosService.updateLote(editingLote.id_lote, {
          numero_lote: loteForm.numero_lote.trim(),
          mes_vencimiento: loteForm.mes_vencimiento,
          anio_vencimiento: loteForm.anio_vencimiento,
          cantidad_actual: loteForm.cantidad,
          precio_compra_unitario: loteForm.precio_compra_presentacion,
          id_proveedor: loteForm.id_proveedor || null,
          id_sucursal: loteForm.id_sucursal || null,
          notas: loteForm.notas || null,
        });
        closeLoteModal();
        await refreshLoteViews(editingLote.id_medicamento);
        Swal.fire({ icon: 'success', title: 'Lote actualizado', timer: 1400, showConfirmButton: false });
        return;
      }

      if (!selectedMed) return;
      await MedicamentosService.createLote(selectedMed.codigo, {
        numero_lote: loteForm.numero_lote.trim(),
        mes_vencimiento: loteForm.mes_vencimiento,
        anio_vencimiento: loteForm.anio_vencimiento,
        cantidad: loteForm.cantidad,
        id_presentacion: loteForm.id_presentacion || undefined,
        precio_compra_presentacion: loteForm.precio_compra_presentacion || undefined,
        id_proveedor: loteForm.id_proveedor || undefined,
        id_sucursal: loteForm.id_sucursal || undefined,
        notas: loteForm.notas || undefined,
      });
      closeLoteModal();
      await refreshLoteViews(selectedMed.codigo);
      Swal.fire({ icon: 'success', title: 'Lote ingresado', timer: 1400, showConfirmButton: false });
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const deleteLote = async (lote: any) => {
    const r = await Swal.fire({
      title: 'Dar de baja lote?',
      text: `El lote ${lote.numero_lote} quedara con stock en cero y dejara de venderse.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Dar de baja',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    });
    if (!r.isConfirmed) return;
    try {
      await MedicamentosService.deleteLote(lote.id_lote, 'Baja manual desde inventario');
      await refreshLoteViews(lote.id_medicamento);
      Swal.fire({ icon: 'success', title: 'Lote dado de baja', timer: 1400, showConfirmButton: false });
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const applySuggestedPrice = async (idPresentacion: number, precio: number) => {
    try {
      await MedicamentosService.updatePresentacion(idPresentacion, { precio_venta: precio });
      if (selectedMed) loadDetail(selectedMed, 'PRESENTACIONES');
      Swal.fire({ icon: 'success', title: 'Precio de venta actualizado', timer: 1200, showConfirmButton: false });
    } catch (e: any) { Swal.fire('Error', e.message, 'error'); }
  };

  const selectMed = (m: Medicamento) => {
    if (selectedMed?.codigo === m.codigo) { setSelectedMed(null); return; }
    setSelectedMed(m); setDetailTab('RESUMEN');
  };

  const clearFilters = () => { setSearch(''); setFilterCat(''); setFilterIsv(''); setFilterReceta(''); setFilterControlado(''); setFilterEstadoCatalogo(''); setPage(0); };
  const hasFilters   = !!(search || filterCat || filterIsv || filterReceta || filterControlado || filterEstadoCatalogo);
  const applyFilters = () => { setPage(0); loadMedicamentos(0); };
  const changePage   = (newPage: number) => { setPage(newPage); loadMedicamentos(newPage); };

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div className="flex h-full bg-slate-50 overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden transition-all duration-300">

        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-slate-800">Inventario Clínico</h1>
              <p className="text-xs text-slate-400 mt-0.5">Página {page + 1} · {medicamentos.length} registros mostrados</p>
            </div>
            {mainTab === 'MEDICAMENTOS' && (
              <div className="flex items-center gap-2">
                <button onClick={() => loadMedicamentos()} className={btnSecondary} title="Recargar">
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button onClick={openNewMed} className={btnPrimary}>
                  <Plus className="w-4 h-4" />Nuevo producto
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-1 mt-4">
            {([
              ['MEDICAMENTOS', <Pill className="w-3.5 h-3.5" />,          'Productos'],
              ['LOTES',        <Boxes className="w-3.5 h-3.5" />,         'Lotes'],
              ['ALERTAS',      <AlertTriangle className="w-3.5 h-3.5" />, 'Alertas'],
            ] as [MainTab, React.ReactNode, string][]).map(([t, icon, label]) => (
              <button key={t} onClick={() => setMainTab(t)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${mainTab === t ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                {icon}{label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        {mainTab === 'MEDICAMENTOS' && (
          <div className="bg-white border-b border-slate-100 px-6 py-3 flex flex-wrap items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input className={`${inpSm} pl-8 w-full`} placeholder="Buscar por nombre, código…" value={search}
                onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyFilters()} />
            </div>
            <select className={inpSm} value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(0); }}>
              <option value="">Categoría</option>
              {categorias.map(c => <option key={c.id_categoria} value={c.id_categoria}>{c.nombre}</option>)}
            </select>
            <select className={inpSm} value={filterIsv} onChange={e => { setFilterIsv(e.target.value); setPage(0); }}>
              <option value="">ISV</option><option value="exento">Exento</option><option value="15">15%</option><option value="18">18%</option>
            </select>
            <select className={inpSm} value={filterReceta} onChange={e => { setFilterReceta(e.target.value); setPage(0); }}>
              <option value="">Receta</option><option value="true">Con receta</option><option value="false">Sin receta</option>
            </select>
            <select className={inpSm} value={filterControlado} onChange={e => { setFilterControlado(e.target.value); setPage(0); }}>
              <option value="">Control</option><option value="true">Controlado</option><option value="false">No controlado</option>
            </select>
            <select className={inpSm} value={filterEstadoCatalogo} onChange={e => { setFilterEstadoCatalogo(e.target.value); setPage(0); }}>
              <option value="">Estado</option>
              <option value="Borrador">Borrador</option>
              <option value="Sin stock">Sin stock</option>
              <option value="Listo para venta">Listo para venta</option>
            </select>
            <button onClick={applyFilters} className={btnPrimary + ' py-1.5'}>
              <Search className="w-3.5 h-3.5" />Filtrar
            </button>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-slate-600 underline">Limpiar</button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-auto p-6">
            {mainTab === 'MEDICAMENTOS' && !selectedMed && (
              <>
                <MedicamentosTable loading={loading} medicamentos={medicamentos} selectedMed={selectedMed}
                  onSelect={selectMed} onEdit={openEditMed} onToggleActivo={toggleActivo} />
                <div className="flex items-center justify-between px-1 py-3 text-sm">
                  <span className="text-slate-500">Página {page + 1} · mostrando {medicamentos.length} productos</span>
                  <div className="flex gap-2">
                    <button disabled={page === 0 || loading} onClick={() => changePage(page - 1)}
                      className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">
                      <ChevronLeft size={16} />
                    </button>
                    <button disabled={medicamentos.length < PAGE_SIZE || loading} onClick={() => changePage(page + 1)}
                      className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}
            {mainTab === 'MEDICAMENTOS' && selectedMed && (
              <DetailPanel
                selectedMed={selectedMed} categorias={categorias} formas={formas}
                detailTab={detailTab} onTabChange={setDetailTab} onClose={() => setSelectedMed(null)}
                onEditBasic={() => openEditMed(selectedMed)} onUpdateMed={updateSelectedMed}
                detailLoading={detailLoading} imagenes={imagenes} presentaciones={presentaciones} lotesDetalle={lotesDetalle}
                onAddLote={openNewLote} onEditLote={openEditLote} onDeleteLote={deleteLote}
                onAddPres={openNewPres} onEditPres={openEditPres} onDeletePres={deletePres}
                onDeleteImagen={deleteImagen} onSetPrincipalImagen={setPrincipalImagen}
                onUploadImage={() => fileInputRef.current?.click()} uploadingImg={uploadingImg}
                fileInputRef={fileInputRef} onFileSelected={handleFileSelected}
                onAnalyzeImages={analyzeExistingImages} analyzingImages={analyzingImages}
              />
            )}
            {mainTab === 'LOTES' && <LotesTable loading={loading} allLotes={allLotes} onEditLote={openEditLote} onDeleteLote={deleteLote} />}
            {mainTab === 'ALERTAS' && <AlertasSection loading={loading} alertasVenc={alertasVenc} stockCritico={stockCritico} />}
          </div>
        </div>
      </div>

      <MedModal show={showMedModal} editingId={editingMed} form={medForm} formas={formas} categorias={categorias} vias={vias}
        onChange={setMedForm} onSave={saveMed} onClose={() => setShowMedModal(false)}
        onAIImagesReady={setPendingAIImages} />

      <PresModal show={showPresModal} editingId={editingPres} form={presForm}
        costoBaseUnitario={costoBaseUnitario} medMargenGanancia={selectedMed?.margen_ganancia}
        onChange={setPresForm} onSave={savePres} onClose={() => setShowPresModal(false)} />

      <LoteModal show={showLoteModal} mode={editingLote ? 'edit' : 'create'} medNombre={loteModalMedName || selectedMed?.nombre_generico} medMargenDefault={selectedMed?.margen_ganancia} form={loteForm}
        presentaciones={presentaciones} proveedores={proveedores}
        onChange={setLoteForm} onSave={saveLote} onClose={closeLoteModal}
        onApplySuggestedPrice={applySuggestedPrice} />
    </div>
  );
}
