import React from 'react';
import { Lock, ArrowUpCircle } from 'lucide-react';

interface Props {
  featureKey?: string;
  minimumPlan?: string;
  onClose?: () => void;
}

const PLAN_INFO: Record<string, { label: string; price: string; color: string }> = {
  profesional: { label: 'Profesional', price: '$79/mes', color: 'from-indigo-600 to-violet-600' },
  enterprise:  { label: 'Enterprise',  price: '$199/mes', color: 'from-emerald-600 to-teal-600' },
};

const FEATURE_LABELS: Record<string, string> = {
  modulo_lealtad:       'Programa de Lealtad',
  modulo_recetas:       'Recetas Médicas',
  modulo_ordenes_compra:'Órdenes de Compra',
  modulo_vencimientos:  'Control de Vencimientos',
  modulo_proveedores:   'Gestión de Proveedores',
  modulo_contabilidad:  'Contabilidad',
  modulo_etiquetas:     'Diseñador de Etiquetas',
  reportes_exportar:    'Exportación de Reportes',
  ia_avanzada:          'IA Avanzada',
  modulo_sucursales:    'Múltiples Sucursales',
  modulo_transferencias:'Transferencias entre Sucursales',
  modulo_entregas:      'Seguimiento de Entregas',
  modulo_panel_cajas:   'Panel de Cajas',
  modulo_pacientes:     'Pacientes Veterinarios',
  modulo_citas:         'Agenda Veterinaria',
  modulo_expediente:    'Expediente Clínico',
  modulo_recordatorios: 'Recordatorios por Correo',
  modulo_vacunas:       'Vacunas y Preventiva',
  modulo_hospitalizacion:'Flowboard Clínico',
};

const PlanUpgradeModal: React.FC<Props> = ({ featureKey, minimumPlan = 'profesional', onClose }) => {
  const plan = PLAN_INFO[minimumPlan] ?? PLAN_INFO.profesional;
  const featureName = featureKey ? FEATURE_LABELS[featureKey] ?? featureKey : 'este módulo';

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className={`bg-gradient-to-br ${plan.color} p-6 text-center`}>
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Lock className="text-white" size={28} />
          </div>
          <h2 className="text-xl font-bold text-white">Módulo no disponible</h2>
          <p className="text-white/80 text-sm mt-1">{featureName}</p>
        </div>
        <div className="p-6 text-center">
          <p className="text-slate-600 text-sm mb-2">
            Este módulo está disponible a partir del plan
          </p>
          <p className="text-lg font-bold text-slate-800 mb-1">
            Plan {plan.label} — <span className="text-indigo-600">{plan.price}</span>
          </p>
          <p className="text-xs text-slate-400 mb-5">
            Contacta al administrador de tu cuenta para actualizar el plan.
          </p>
          <div className="flex items-center justify-center gap-2 text-indigo-600 font-semibold text-sm">
            <ArrowUpCircle size={18} />
            <span>Actualiza tu plan para acceder</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="mt-4 w-full py-2 text-slate-400 hover:text-slate-600 text-sm transition-colors"
            >
              Volver
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlanUpgradeModal;
