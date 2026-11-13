import { lazy, Suspense, useEffect, useState } from 'react';
import { RotateCw, X } from 'lucide-react';
import type { Garment } from '@/src/types/models';

const LazyGarmentViewer = lazy(() => import('@/src/components/three/GarmentViewer'));

interface GarmentViewerModalProps {
  garment: Garment | null;
  onClose: () => void;
}

export function GarmentViewerModal({ garment, onClose }: GarmentViewerModalProps) {
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    if (!garment) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [garment, onClose]);

  if (!garment) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4A4458]/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="viewer-3d-title"
    >
      <div className="w-full max-w-xl rounded-3xl bg-white border border-[#E6E0F8] shadow-sheet overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-[#E6E0F8] flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 id="viewer-3d-title" className="font-display text-base font-bold text-[#4A4458] truncate">
              {garment.name}
            </h2>
            <p className="text-xs text-[#6B6580]">
              Vista pseudo-3D · Arrastra para rotar o pellizca para acercar
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista 3D"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[#6B6580] hover:bg-[#E6E0F8]/50 shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Contenedor WebGL sin backdrop-blur encima */}
        <div className="relative h-[52vh] min-h-[320px] bg-[#FFFBFD]">
          <Suspense
            fallback={
              <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                <div className="h-8 w-8 rounded-full border-2 border-[#E6E0F8] border-t-[#6E61BE] animate-spin" />
                <span className="text-xs font-medium text-[#6B6580]">
                  Cargando visor pseudo-3D...
                </span>
              </div>
            }
          >
            <LazyGarmentViewer garment={garment} source="pseudo3d" autoRotate={autoRotate} />
          </Suspense>
        </div>

        <div className="px-5 py-3.5 border-t border-[#E6E0F8] bg-white flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            aria-pressed={autoRotate}
            className={`min-h-[40px] px-4 py-2 rounded-2xl text-xs font-semibold inline-flex items-center gap-2 border transition-colors ${
              autoRotate
                ? 'bg-[#E6E0F8] border-[#8B7FD4] text-[#4A4458]'
                : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#6B6580]'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{autoRotate ? 'Rotación suave activa' : 'Rotación pausada'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-5 py-2 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-xs font-semibold"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
