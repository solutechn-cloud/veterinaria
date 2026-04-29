import React from 'react';
import { AlertTriangle, CheckCircle, Clock, Package } from 'lucide-react';

interface BoxStatus {
  estadoArqueo: string;
  nombreCaja: string;
  usuario?: string;
  fechaApertura?: string;
  montoFinal?: number;
}

interface AlertsCenterProps {
  boxes: BoxStatus[];
  lowStock?: any[];
}

function getHoursOpen(fechaApertura?: string): number {
  if (!fechaApertura) return 0;
  const opened = new Date(fechaApertura).getTime();
  const now = Date.now();
  return (now - opened) / (1000 * 60 * 60);
}

const AlertsCenter: React.FC<AlertsCenterProps> = ({ boxes, lowStock = [] }) => {
  const activeBoxes = boxes.filter(b => b.estadoArqueo === 'Activo');
  const longOpenBoxes = activeBoxes.filter(b => getHoursOpen(b.fechaApertura) > 12);

  const visibleLowStock = lowStock.slice(0, 5);
  const extraLowStock = lowStock.length - visibleLowStock.length;

  if (activeBoxes.length === 0 && lowStock.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
        <CheckCircle size={18} className="text-emerald-500 shrink-0" />
        <p className="text-sm font-semibold text-emerald-700">Todas las cajas cerradas correctamente</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activeBoxes.length === 0 ? (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
          <CheckCircle size={18} className="text-emerald-500 shrink-0" />
          <p className="text-sm font-semibold text-emerald-700">Todas las cajas cerradas correctamente</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 px-1">
            <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
              {activeBoxes.length} caja{activeBoxes.length > 1 ? 's' : ''} activa{activeBoxes.length > 1 ? 's' : ''}
            </span>
            {longOpenBoxes.length > 0 && (
              <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 text-xs font-bold px-3 py-1 rounded-full">
                <AlertTriangle size={12} />
                {longOpenBoxes.length} abierta{longOpenBoxes.length > 1 ? 's' : ''} +12h
              </span>
            )}
          </div>

          {activeBoxes.map((box, i) => {
            const hours = getHoursOpen(box.fechaApertura);
            const isLong = hours > 12;
            return (
              <div
                key={i}
                className={`flex items-center justify-between p-3 rounded-xl border ${
                  isLong
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-slate-50 border-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isLong ? 'bg-amber-400' : 'bg-emerald-500 animate-pulse'}`} />
                  <div>
                    <p className="text-sm font-bold text-slate-700">{box.nombreCaja}</p>
                    <p className="text-xs text-slate-400">{box.usuario || 'Sin cajero'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock size={12} />
                  <span className={`font-semibold ${isLong ? 'text-amber-600' : 'text-slate-600'}`}>
                    {hours < 1 ? '<1h' : `${Math.floor(hours)}h`}
                  </span>
                </div>
              </div>
            );
          })}
        </>
      )}

      {lowStock.length > 0 && (
        <div className="mt-2 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <Package size={15} className="text-amber-600 shrink-0" />
            <span className="text-xs font-black text-amber-700 uppercase tracking-wide">
              Stock bajo el mínimo ({lowStock.length} producto{lowStock.length > 1 ? 's' : ''})
            </span>
          </div>
          <div className="space-y-2">
            {visibleLowStock.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-amber-800 truncate max-w-[65%]">{item.nombre}</span>
                <span className="text-amber-700 font-black shrink-0">
                  {item.cantidad} uds <span className="font-normal text-amber-500">(mín: {item.stockMinimo})</span>
                </span>
              </div>
            ))}
            {extraLowStock > 0 && (
              <p className="text-[11px] text-amber-600 font-bold mt-1">+ {extraLowStock} más con stock bajo</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertsCenter;
