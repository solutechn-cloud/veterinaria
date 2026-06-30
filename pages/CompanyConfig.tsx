
import React, { useState, useEffect, useRef } from 'react';
import { ConfigService, AIService, AIQuotaStatus, AutomationService, AutomationEvent, AutomationRecipient, BackupJob } from '../services/api';
import { EmpresaConfig } from '../types';
import { Settings, Save, Building2, FileText, AlertCircle, ImageIcon, X, Camera, CheckCircle2, ShieldAlert, Bell, Cloud, Palette, Sparkles, RefreshCw, Mail, Users, Clock, DatabaseBackup, Plus, Trash2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useCameraPermission } from '../hooks/useCameraPermission';
import Swal from 'sweetalert2';

const CompanyConfig: React.FC = () => {
  const { theme, updateTheme, presets } = useTheme();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const { state: camState, requestPermission } = useCameraPermission();
  const [camRequesting, setCamRequesting] = useState(false);

  const handleGrantCamera = async () => {
    setCamRequesting(true);
    const ok = await requestPermission();
    setCamRequesting(false);
    if (ok) Swal.fire({ title: 'Cámara autorizada', text: 'El escáner ya no volverá a pedir permiso.', icon: 'success', timer: 2000, showConfirmButton: false });
    else    Swal.fire({ title: 'Permiso denegado', text: 'Ve a configuración del navegador y permite el acceso a la cámara para este sitio.', icon: 'warning' });
  };
  const [config, setConfig] = useState<EmpresaConfig>({
    nombreEmpresa: '',
    rtn: '',
    direccion: '',
    telefono: '',
    correo: '',
    cai: '',
    rangoInicial: '',
    rangoFinal: '',
    fechaLimite: '',
    isv: 15,
    mensajeFinal: 'LA FACTURA ES BENEFICIO DE TODOS, EXIJALA',
    adminEmail: '',
    emailFrom: '',
    automationSenderName: 'VetCare ERP',
    backupR2Prefix: 'backups',
    backupRetentionDays: 30,
    backupEnabled: true,
    backupTime: '02:30',
  });
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState<AIQuotaStatus | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [automationEvents, setAutomationEvents] = useState<AutomationEvent[]>([]);
  const [recipients, setRecipients] = useState<AutomationRecipient[]>([]);
  const [backupJobs, setBackupJobs] = useState<BackupJob[]>([]);
  const [newRecipient, setNewRecipient] = useState({ nombre: '', email: '', tipo: 'persona' as 'persona' | 'grupo' });
  const [automationLoading, setAutomationLoading] = useState(false);

  useEffect(() => {
    loadConfig();
    loadQuota();
    loadAutomation();
  }, []);

  const loadAutomation = async () => {
    setAutomationLoading(true);
    try {
      const [events, people, backups] = await Promise.all([
        AutomationService.getEvents(),
        AutomationService.getRecipients(),
        AutomationService.getBackups(),
      ]);
      setAutomationEvents(events);
      setRecipients(people);
      setBackupJobs(backups);
    } catch (error) {
      console.error(error);
    } finally {
      setAutomationLoading(false);
    }
  };

  const addRecipient = async () => {
    if (!newRecipient.nombre.trim() || !newRecipient.email.trim()) {
      Swal.fire('Datos incompletos', 'Agrega nombre y correo del destinatario.', 'warning');
      return;
    }
    try {
      await AutomationService.createRecipient({
        ...newRecipient,
        activo: true,
        events: automationEvents.map(e => ({ eventKey: e.key, enabled: ['backup_error', 'daily_report'].includes(e.key), scheduledTime: e.recommendedTime })),
      } as any);
      setNewRecipient({ nombre: '', email: '', tipo: 'persona' });
      await loadAutomation();
    } catch (error: any) {
      Swal.fire('Error', error.message, 'error');
    }
  };

  const toggleRecipientEvent = async (recipient: AutomationRecipient, eventKey: string, enabled: boolean) => {
    const events = automationEvents.map(event => {
      const current = recipient.events.find(e => e.eventKey === event.key);
      return {
        eventKey: event.key,
        enabled: event.key === eventKey ? enabled : current?.enabled ?? false,
        scheduledTime: current?.scheduledTime || event.recommendedTime,
      };
    });
    await AutomationService.updateRecipientEvents(recipient.id, events);
    await loadAutomation();
  };

  const deleteRecipient = async (id: number) => {
    const ok = await Swal.fire({ title: 'Eliminar destinatario', text: 'Dejara de recibir notificaciones automaticas.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar' });
    if (!ok.isConfirmed) return;
    await AutomationService.deleteRecipient(id);
    await loadAutomation();
  };

  const runBackupNow = async () => {
    try {
      setAutomationLoading(true);
      await AutomationService.runBackupNow();
      await loadAutomation();
      Swal.fire('Backup completado', 'El respaldo fue enviado a Cloudflare R2.', 'success');
    } catch (error: any) {
      Swal.fire('Error en backup', error.message, 'error');
    } finally {
      setAutomationLoading(false);
    }
  };

  const loadQuota = async () => {
    setQuotaLoading(true);
    try {
      const data = await AIService.getQuotaStatus();
      setQuota(data);
    } catch {
      // Quota not available (plan sin IA, o tabla aún no migrada)
    } finally {
      setQuotaLoading(false);
    }
  };

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await ConfigService.get();
      if(data) setConfig(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      Swal.fire('Archivo muy grande', 'El logo debe pesar menos de 500 KB.', 'warning');
      return;
    }
    // Verificar magic bytes para confirmar que es imagen real (no SVG con scripts)
    const headerReader = new FileReader();
    headerReader.onloadend = () => {
      const bytes = new Uint8Array(headerReader.result as ArrayBuffer);
      const isPNG  = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
      const isJPEG = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
      const isWEBP = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
                  && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
      if (!isPNG && !isJPEG && !isWEBP) {
        Swal.fire('Formato no permitido', 'Solo se aceptan imágenes PNG, JPEG o WebP.', 'warning');
        e.target.value = '';
        return;
      }
      const dataReader = new FileReader();
      dataReader.onloadend = () => setConfig(c => ({ ...c, logoBase64: dataReader.result as string }));
      dataReader.readAsDataURL(file);
    };
    headerReader.readAsArrayBuffer(file.slice(0, 12));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await ConfigService.update(config);
      Swal.fire({
        icon: 'success',
        title: 'Configuración Guardada',
        text: 'Los datos de la empresa han sido actualizados.',
        timer: 1500,
        showConfirmButton: false
      });
    } catch (error: any) {
      Swal.fire('Error', error.message, 'error');
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando configuración...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-600/20">
            <Settings className="text-white" size={24}/>
        </div>
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Configuración de Empresa</h2>
            <p className="text-slate-500 text-sm">Gestiona la información legal y parámetros del SAR.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6">
        {/* SECCION 1: DATOS GENERALES */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                <Building2 className="text-indigo-600"/> Datos Generales
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Nombre de la Empresa</label>
                    <input required className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        value={config.nombreEmpresa} onChange={e => setConfig({...config, nombreEmpresa: e.target.value})} />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">R.T.N.</label>
                    <input required className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        value={config.rtn} onChange={e => setConfig({...config, rtn: e.target.value})} placeholder="00000000000000" />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Teléfono</label>
                    <input className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        value={config.telefono} onChange={e => setConfig({...config, telefono: e.target.value})} />
                </div>
                <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Dirección</label>
                    <textarea required rows={2} className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        value={config.direccion} onChange={e => setConfig({...config, direccion: e.target.value})} />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Correo Electrónico</label>
                    <input type="email" className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        value={config.correo} onChange={e => setConfig({...config, correo: e.target.value})} />
                </div>
            </div>
        </div>

        {/* SECCION LOGO */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                <ImageIcon className="text-indigo-600"/> Logo de la Empresa
            </h3>
            <p className="text-xs text-slate-500 mb-4">El logo se usará automáticamente en las facturas y documentos del diseñador. Tamaño máximo: 500 KB. Formatos: PNG, JPG, WebP.</p>
            <div className="flex items-start gap-6">
                {/* Preview */}
                <div className="w-40 h-24 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center bg-slate-50 shrink-0 overflow-hidden">
                    {config.logoBase64 ? (
                        <img src={config.logoBase64} alt="Logo" className="w-full h-full object-contain p-2"/>
                    ) : (
                        <div className="flex flex-col items-center gap-1 text-slate-300">
                            <ImageIcon size={28}/>
                            <span className="text-xs">Sin logo</span>
                        </div>
                    )}
                </div>
                <div className="flex flex-col gap-3">
                    <button type="button" onClick={() => logoInputRef.current?.click()}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all">
                        <ImageIcon size={16}/> Subir Logo
                    </button>
                    {config.logoBase64 && (
                        <button type="button" onClick={() => setConfig(c => ({ ...c, logoBase64: '' }))}
                            className="text-red-500 hover:text-red-700 text-sm flex items-center gap-1 font-medium">
                            <X size={14}/> Eliminar Logo
                        </button>
                    )}
                    <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoUpload}/>
                </div>
            </div>
        </div>

        {/* SECCION 2: DATOS SAR */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                <FileText className="text-indigo-600"/> Normativa de Facturación (SAR)
            </h3>
            
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-blue-800 text-sm mb-4 flex gap-2">
                <AlertCircle size={18} className="shrink-0"/>
                Estos datos aparecerán impresos en la factura. Asegúrate que coincidan con tu resolución vigente.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">CAI (Clave de Autorización)</label>
                    <input className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono" 
                        value={config.cai} onChange={e => setConfig({...config, cai: e.target.value})} placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX" />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Rango Inicial</label>
                    <input className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono" 
                        value={config.rangoInicial} onChange={e => setConfig({...config, rangoInicial: e.target.value})} placeholder="000-001-01-00000001" />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Rango Final</label>
                    <input className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono" 
                        value={config.rangoFinal} onChange={e => setConfig({...config, rangoFinal: e.target.value})} placeholder="000-001-01-00002000" />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Fecha Límite de Emisión</label>
                    <input type="date" required className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        value={config.fechaLimite} onChange={e => setConfig({...config, fechaLimite: e.target.value})} />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Porcentaje ISV (%)</label>
                    <input type="number" required className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        value={config.isv} onChange={e => setConfig({...config, isv: Number(e.target.value)})} />
                </div>
                <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Mensaje / Leyenda Final</label>
                    <input className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" 
                        value={config.mensajeFinal} onChange={e => setConfig({...config, mensajeFinal: e.target.value})} />
                </div>
            </div>
        </div>

        {/* PERMISOS DE CÁMARA */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                <Camera className="text-indigo-600"/> Escáner de Cámara
            </h3>
            <div className="flex items-center gap-4">
                {camState === 'granted' ? (
                    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex-1">
                        <CheckCircle2 size={24} className="text-emerald-600 shrink-0"/>
                        <div>
                            <p className="font-bold text-emerald-700 text-sm">Cámara autorizada</p>
                            <p className="text-xs text-emerald-600 mt-0.5">El escáner funciona sin pedir permiso cada vez.</p>
                        </div>
                    </div>
                ) : camState === 'denied' ? (
                    <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex-1">
                        <ShieldAlert size={24} className="text-red-500 shrink-0"/>
                        <div>
                            <p className="font-bold text-red-700 text-sm">Acceso bloqueado</p>
                            <p className="text-xs text-red-600 mt-0.5">Ve a Configuración del navegador → Permisos del sitio → Cámara y permite este sitio manualmente.</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-4 flex-1 flex-wrap">
                        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex-1 min-w-0">
                            <Camera size={20} className="text-amber-600 shrink-0"/>
                            <div className="min-w-0">
                                <p className="font-bold text-amber-700 text-sm">Permiso no configurado</p>
                                <p className="text-xs text-amber-600 mt-0.5">Actívalo una vez y el escáner funcionará siempre.</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleGrantCamera}
                            disabled={camRequesting}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all disabled:opacity-60 shrink-0"
                        >
                            <Camera size={16}/> {camRequesting ? 'Solicitando...' : 'Activar Cámara'}
                        </button>
                    </div>
                )}
            </div>
            {window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && (
                <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex gap-2 items-start">
                    <AlertCircle size={15} className="text-slate-400 shrink-0 mt-0.5"/>
                    <p className="text-[11px] text-slate-500">
                        <strong>Nota:</strong> La app está en <strong>HTTP</strong>. Para que el permiso sea permanente, accede por <strong>HTTPS</strong> o instala la app (PWA). En HTTP, algunos navegadores piden permiso en cada sesión.
                    </p>
                </div>
            )}
        </div>

        {/* SECCION AUTOMATIZACIONES */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 mb-4">
                <div>
                    <h3 className="font-bold text-lg text-slate-800 mb-1 flex items-center gap-2">
                        <Bell className="text-purple-600"/> Centro de Automatizaciones
                    </h3>
                    <p className="text-xs text-slate-500">Correos profesionales por Resend, destinatarios por evento y backups multitenant en Cloudflare R2.</p>
                </div>
                <button type="button" onClick={loadAutomation} disabled={automationLoading} className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-purple-600">
                    <RefreshCw size={16} className={automationLoading ? 'animate-spin' : ''}/>
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Correo principal</label>
                            <input type="email" className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                                placeholder="admin@clinica.com"
                                value={config.adminEmail ?? ''}
                                onChange={e => setConfig({...config, adminEmail: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Nombre del remitente</label>
                            <input className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                                placeholder="VetCare Tegucigalpa"
                                value={config.automationSenderName ?? ''}
                                onChange={e => setConfig({...config, automationSenderName: e.target.value})} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">From verificado en Resend</label>
                            <input type="text" className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                                placeholder='VetCare ERP <noreply@tudominio.com>'
                                value={config.emailFrom ?? ''}
                                onChange={e => setConfig({...config, emailFrom: e.target.value})} />
                            <p className="text-xs text-slate-400 mt-1">Los correos muestran el nombre del tenant, pero salen desde el dominio verificado del sistema.</p>
                        </div>
                    </div>

                    <div className="border border-teal-100 bg-teal-50/50 rounded-2xl p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <h4 className="font-bold text-sm text-slate-700 flex items-center gap-2"><DatabaseBackup size={16} className="text-teal-600"/> Backups Cloudflare R2</h4>
                            <button type="button" onClick={runBackupNow} disabled={automationLoading} className="px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold disabled:opacity-50">
                                Ejecutar ahora
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <label className="flex items-center gap-2 bg-white border border-teal-100 rounded-xl px-3 py-3 text-sm font-semibold text-slate-700">
                                <input type="checkbox" checked={config.backupEnabled !== false} onChange={e => setConfig({...config, backupEnabled: e.target.checked})}/>
                                Activo
                            </label>
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase">Hora</label>
                                <input type="time" className="w-full p-3 border border-teal-100 rounded-xl outline-none" value={config.backupTime ?? '02:30'} onChange={e => setConfig({...config, backupTime: e.target.value})}/>
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase">Retencion dias</label>
                                <input type="number" min={1} className="w-full p-3 border border-teal-100 rounded-xl outline-none" value={config.backupRetentionDays ?? 30} onChange={e => setConfig({...config, backupRetentionDays: Number(e.target.value)})}/>
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-500 uppercase">Prefijo R2</label>
                                <input className="w-full p-3 border border-teal-100 rounded-xl outline-none font-mono text-sm" value={config.backupR2Prefix ?? 'backups'} onChange={e => setConfig({...config, backupR2Prefix: e.target.value})}/>
                            </div>
                        </div>
                        <p className="text-xs text-teal-700 mt-3">Credenciales R2: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET_NAME se configuran solo en Render.</p>
                    </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2 mb-3"><Clock size={15}/> Ultimos backups</h4>
                    <div className="space-y-2 max-h-56 overflow-auto pr-1">
                        {backupJobs.length === 0 ? <p className="text-xs text-slate-400">Sin respaldos registrados.</p> : backupJobs.slice(0, 5).map(job => (
                            <div key={job.id} className="bg-white border border-slate-100 rounded-xl p-3">
                                <div className="flex justify-between gap-2 text-xs">
                                    <span className={`font-bold ${job.estado === 'Completado' ? 'text-emerald-600' : job.estado === 'Error' ? 'text-red-600' : 'text-amber-600'}`}>{job.estado}</span>
                                    <span className="text-slate-400">{job.created_at?.slice(0, 10)}</span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1 truncate">{job.object_key || job.error || 'Procesando...'}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-2xl p-4">
                    <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2 mb-3"><Users size={16}/> Directorio de notificaciones</h4>
                    <div className="grid grid-cols-1 md:grid-cols-7 gap-2 mb-3">
                        <input className="md:col-span-2 p-3 border border-slate-200 rounded-xl text-sm outline-none" placeholder="Nombre o grupo" value={newRecipient.nombre} onChange={e => setNewRecipient({...newRecipient, nombre: e.target.value})}/>
                        <input className="md:col-span-3 p-3 border border-slate-200 rounded-xl text-sm outline-none" placeholder="correo@clinica.com" value={newRecipient.email} onChange={e => setNewRecipient({...newRecipient, email: e.target.value})}/>
                        <select className="p-3 border border-slate-200 rounded-xl text-sm outline-none" value={newRecipient.tipo} onChange={e => setNewRecipient({...newRecipient, tipo: e.target.value as any})}>
                            <option value="persona">Persona</option>
                            <option value="grupo">Grupo</option>
                        </select>
                        <button type="button" onClick={addRecipient} className="bg-purple-600 text-white rounded-xl flex items-center justify-center gap-1 text-sm font-bold"><Plus size={15}/> Agregar</button>
                    </div>
                    <div className="space-y-2 max-h-80 overflow-auto pr-1">
                        {recipients.map(recipient => (
                            <div key={recipient.id} className="border border-slate-100 rounded-xl p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm text-slate-800 truncate">{recipient.nombre}</p>
                                        <p className="text-xs text-slate-500 truncate">{recipient.email}</p>
                                    </div>
                                    <button type="button" onClick={() => deleteRecipient(recipient.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={15}/></button>
                                </div>
                                <div className="flex flex-wrap gap-1.5 mt-3">
                                    {automationEvents.map(event => {
                                        const active = recipient.events.some(e => e.eventKey === event.key && e.enabled);
                                        return (
                                            <button key={event.key} type="button" onClick={() => toggleRecipientEvent(recipient, event.key, !active)}
                                                className={`px-2 py-1 rounded-full text-[11px] font-bold border ${active ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-500 border-slate-200'}`}>
                                                {event.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="border border-slate-200 rounded-2xl p-4">
                    <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2 mb-3"><Mail size={16}/> Catalogo profesional de alertas</h4>
                    <div className="grid grid-cols-1 gap-2 max-h-96 overflow-auto pr-1">
                        {automationEvents.map(event => (
                            <div key={event.key} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                                <div className="flex justify-between gap-3">
                                    <div>
                                        <p className="font-bold text-sm text-slate-800">{event.label}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">{event.description}</p>
                                    </div>
                                    <span className="text-[11px] font-bold text-purple-700 bg-purple-100 rounded-full px-2 py-1 h-fit">{event.category}</span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-2">Hora sugerida: {event.recommendedTime}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-4 bg-purple-50 border border-purple-100 rounded-xl p-3 text-xs text-purple-700 flex gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5"/>
                <span>Las claves de API (Resend, Anthropic y Cloudflare R2) se mantienen en Render. Aqui solo se gestionan destinatarios, horarios y reglas operativas.</span>
            </div>
        </div>

        {/* SECCION CUOTA IA */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-4">
            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
              <Sparkles className="text-indigo-600"/> Uso de Inteligencia Artificial
            </h3>
            <button type="button" onClick={loadQuota} disabled={quotaLoading}
              className="text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-40">
              <RefreshCw size={16} className={quotaLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          {quota ? (
            <div className="space-y-4">
              {/* Estado y plan */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-bold uppercase px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
                  Plan {quota.plan}
                </span>
                {quota.estado === 'deshabilitado' && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">IA deshabilitada</span>
                )}
                {quota.estado === 'agotado' && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">Cuota agotada</span>
                )}
                {quota.estado === 'alerta' && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">Cuota al {quota.pct_tokens_usado}%</span>
                )}
                {quota.estado === 'ok' && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">Cuota disponible</span>
                )}
                <span className="text-xs text-slate-400">{quota.periodo}</span>
              </div>

              {/* Barra de tokens */}
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Tokens usados este mes</span>
                  <span className="font-medium text-slate-700">
                    {Number(quota.tokens_consumidos).toLocaleString()} / {Number(quota.tokens_limite).toLocaleString()}
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      quota.pct_tokens_usado >= 100 ? 'bg-red-500' :
                      quota.pct_tokens_usado >= 80  ? 'bg-amber-500' :
                      'bg-indigo-500'
                    }`}
                    style={{ width: `${Math.min(quota.pct_tokens_usado, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-0.5 text-right">{quota.pct_tokens_usado}% utilizado</p>
              </div>

              {/* Requests */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-0.5">Solicitudes este mes</p>
                  <p className="text-base font-bold text-slate-800">
                    {Number(quota.requests_totales).toLocaleString()}
                    <span className="text-xs font-normal text-slate-400"> / {Number(quota.requests_limite).toLocaleString()}</span>
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-0.5">Solicitudes hoy</p>
                  <p className="text-base font-bold text-slate-800">
                    {Number(quota.requests_hoy)}
                    <span className="text-xs font-normal text-slate-400"> / {Number(quota.req_diario_limite)} diario</span>
                  </p>
                </div>
              </div>

              {/* Procesos habilitados */}
              {Array.isArray(quota.procesos_habilitados) && quota.procesos_habilitados.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Funciones de IA incluidas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {quota.procesos_habilitados.map(p => (
                      <span key={p} className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium">
                        {p.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(quota.estado === 'agotado' || quota.estado === 'alerta') && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                  <AlertCircle size={15} className="shrink-0 mt-0.5"/>
                  <span>
                    {quota.estado === 'agotado'
                      ? 'Has agotado tu cuota de IA para este mes. Las funciones de IA no estarán disponibles hasta el próximo período. Contacta a soporte para ampliar tu plan.'
                      : 'Estás cerca del límite mensual de IA. Considera optimizar el uso o contactar a soporte para ampliar tu plan.'}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              {quotaLoading ? 'Cargando estado de cuota...' : 'Información de cuota no disponible.'}
            </p>
          )}
        </div>

        <div className="flex justify-end pt-4">
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2">
                <Save size={20}/> Guardar Cambios
            </button>
        </div>
      </form>

      {/* SECCION APARIENCIA */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <h3 className="font-bold text-lg text-slate-800 mb-1 flex items-center gap-2 border-b border-slate-100 pb-2">
          <Palette className="text-indigo-600"/> Apariencia de la Plataforma
        </h3>
        <p className="text-xs text-slate-500 mb-5">Personaliza el nombre y los colores del ERP. Los cambios son inmediatos y se guardan en este navegador.</p>

        <div className="space-y-6">
          {/* Nombre de la app */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Nombre que aparece en el menú lateral</label>
            <input
              className="w-full max-w-xs p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              value={theme.appName}
              onChange={e => updateTheme({ appName: e.target.value })}
              placeholder="ERP Veterinaria"
            />
          </div>

          {/* Presets */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-3 block">Tema de Color</label>
            <div className="flex flex-wrap gap-3">
              {presets.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => updateTheme({ primaryHex: p.primaryHex, sidebarHex: p.sidebarHex, presetId: p.id })}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-medium ${
                    theme.presetId === p.id
                      ? 'border-indigo-500 bg-slate-50 shadow-md text-slate-800'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full border border-black/10 shrink-0" style={{ backgroundColor: p.primaryHex }} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Colores personalizados */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Color Principal (botones y activos)</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  className="w-11 h-11 rounded-lg border border-slate-200 cursor-pointer p-1 shrink-0"
                  value={theme.primaryHex}
                  onChange={e => updateTheme({ primaryHex: e.target.value, presetId: 'custom' })}
                />
                <input
                  type="text"
                  className="flex-1 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                  value={theme.primaryHex}
                  onChange={e => {
                    if (/^#[0-9a-fA-F]{6}$/.test(e.target.value))
                      updateTheme({ primaryHex: e.target.value, presetId: 'custom' });
                  }}
                  maxLength={7}
                  placeholder="#4f46e5"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Color Sidebar (fondo del menú)</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  className="w-11 h-11 rounded-lg border border-slate-200 cursor-pointer p-1 shrink-0"
                  value={theme.sidebarHex}
                  onChange={e => updateTheme({ sidebarHex: e.target.value, presetId: 'custom' })}
                />
                <input
                  type="text"
                  className="flex-1 p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm"
                  value={theme.sidebarHex}
                  onChange={e => {
                    if (/^#[0-9a-fA-F]{6}$/.test(e.target.value))
                      updateTheme({ sidebarHex: e.target.value, presetId: 'custom' });
                  }}
                  maxLength={7}
                  placeholder="#0f172a"
                />
              </div>
            </div>
          </div>

          {/* Vista previa inline */}
          <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 shadow-sm flex h-14">
            <div className="w-40 flex items-center gap-2 px-3 shrink-0" style={{ backgroundColor: theme.sidebarHex }}>
              <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: theme.primaryHex }}>
                <span className="text-white text-xs font-bold">+</span>
              </span>
              <span className="text-white text-xs font-semibold truncate">{theme.appName}</span>
            </div>
            <div className="flex-1 bg-white flex items-center px-4 gap-3">
              <span className="px-3 py-1 rounded-lg text-white text-xs font-bold" style={{ backgroundColor: theme.primaryHex }}>Guardar</span>
              <span className="text-xs font-semibold" style={{ color: theme.primaryHex }}>Enlace activo</span>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => updateTheme({ primaryHex: '#4f46e5', sidebarHex: '#0f172a', appName: 'ERP Veterinaria', presetId: 'indigo' })}
              className="text-slate-500 hover:text-slate-700 text-sm font-medium flex items-center gap-1 border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Restaurar predeterminado
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyConfig;
