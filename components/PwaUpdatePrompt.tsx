import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Revisa si hay un deploy nuevo cada 30 min (sesiones SPA largas no navegan,
// asi que el navegador no vuelve a pedir el SW por su cuenta).
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

const PwaUpdatePrompt: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Chequeo periodico de actualizaciones.
      setInterval(() => { registration.update().catch(() => {}); }, UPDATE_CHECK_INTERVAL_MS);
      // Y tambien cuando el usuario vuelve a la pestaña.
      const onVisible = () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      };
      document.addEventListener('visibilitychange', onVisible);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md animate-fade-in">
      <div className="flex items-center gap-3 rounded-2xl bg-slate-900 text-white px-4 py-3 shadow-2xl ring-1 ring-white/10">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/20">
          <RefreshCw size={18} className="text-indigo-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Nueva versión disponible</p>
          <p className="text-xs text-slate-300 leading-tight">Actualiza para obtener las últimas mejoras.</p>
        </div>
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="shrink-0 rounded-xl bg-indigo-500 px-3 py-2 text-xs font-bold hover:bg-indigo-400 transition-colors"
        >
          Actualizar
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          aria-label="Descartar"
          className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default PwaUpdatePrompt;
