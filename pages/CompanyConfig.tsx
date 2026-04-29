
import React, { useState, useEffect, useRef } from 'react';
import { ConfigService } from '../services/api';
import { EmpresaConfig } from '../types';
import { Settings, Save, Building2, FileText, AlertCircle, ImageIcon, X, Camera, CheckCircle2, ShieldAlert, Bell, Cloud } from 'lucide-react';
import { useCameraPermission } from '../hooks/useCameraPermission';
import Swal from 'sweetalert2';

const CompanyConfig: React.FC = () => {
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
  const [config, setConfig] = useState<EmpresaConfig & {
    adminEmail?: string;
    emailFrom?: string;
    saldoTigoUmbral?: number;
    saldoClaroUmbral?: number;
    driveFolderId?: string;
  }>({
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
    saldoTigoUmbral: 500,
    saldoClaroUmbral: 500,
    driveFolderId: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

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
            <h3 className="font-bold text-lg text-slate-800 mb-1 flex items-center gap-2 border-b border-slate-100 pb-2">
                <Bell className="text-purple-600"/> Automatizaciones y Notificaciones
            </h3>
            <p className="text-xs text-slate-500 mb-4">Configura las alertas automáticas, reportes por correo y backup a Google Drive sin necesidad de ir al servidor.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Correo de Administrador <span className="text-purple-500">(recibe reportes y alertas)</span></label>
                    <input type="email" className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                        placeholder="admin@tuempresa.com"
                        value={config.adminEmail ?? ''}
                        onChange={e => setConfig({...config, adminEmail: e.target.value})} />
                </div>
                <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Remitente de correos <span className="text-slate-400">(from)</span></label>
                    <input type="text" className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none"
                        placeholder='SmartCloud <noreply@erpsmartcloud.com>'
                        value={config.emailFrom ?? ''}
                        onChange={e => setConfig({...config, emailFrom: e.target.value})} />
                    <p className="text-xs text-slate-400 mt-1">Formato: <code>Nombre Empresa &lt;correo@dominio.com&gt;</code></p>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Umbral saldo TIGO (L.)</label>
                    <input type="number" min={0} className="w-full p-3 border border-amber-200 bg-amber-50 rounded-xl focus:ring-2 focus:ring-amber-400 outline-none"
                        placeholder="500"
                        value={config.saldoTigoUmbral ?? 500}
                        onChange={e => setConfig({...config, saldoTigoUmbral: Number(e.target.value)})} />
                    <p className="text-xs text-slate-400 mt-1">Alerta cuando el saldo cae por debajo de este valor</p>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Umbral saldo CLARO (L.)</label>
                    <input type="number" min={0} className="w-full p-3 border border-amber-200 bg-amber-50 rounded-xl focus:ring-2 focus:ring-amber-400 outline-none"
                        placeholder="500"
                        value={config.saldoClaroUmbral ?? 500}
                        onChange={e => setConfig({...config, saldoClaroUmbral: Number(e.target.value)})} />
                    <p className="text-xs text-slate-400 mt-1">Alerta cuando el saldo cae por debajo de este valor</p>
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100">
                <h4 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2">
                    <Cloud size={16} className="text-teal-600"/> Google Drive Backup
                </h4>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">ID de carpeta en Google Drive</label>
                    <input type="text" className="w-full p-3 border border-teal-200 bg-teal-50 rounded-xl focus:ring-2 focus:ring-teal-400 outline-none font-mono text-sm"
                        placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs"
                        value={config.driveFolderId ?? ''}
                        onChange={e => setConfig({...config, driveFolderId: e.target.value})} />
                    <p className="text-xs text-slate-400 mt-1">Copia el ID de la URL de tu carpeta en Google Drive: drive.google.com/drive/folders/<strong>ID_AQUI</strong></p>
                </div>
            </div>

            <div className="mt-4 bg-purple-50 border border-purple-100 rounded-xl p-3 text-xs text-purple-700 flex gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5"/>
                <span>Las claves de API (Resend, Anthropic, Google Service Account) deben configurarse en el servidor por seguridad. Solo los ajustes operativos se gestionan aquí.</span>
            </div>
        </div>

        <div className="flex justify-end pt-4">
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2">
                <Save size={20}/> Guardar Cambios
            </button>
        </div>
      </form>
    </div>
  );
};

export default CompanyConfig;
