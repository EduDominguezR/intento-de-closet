import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Download,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { probeWebGLCapabilities } from '@/src/components/three/Avatar3D';
import { Outfit3DScene, type Outfit3DSceneHandle } from '@/src/components/three/Outfit3DScene';
import type { AvatarConfig } from '@/src/lib/avatar/types';
import { loadModelsManifest, type ModelsManifest } from '@/src/lib/three/models';
import type { Garment, OutfitItem } from '@/src/types/models';

export interface Outfit3DViewerProps {
  avatarConfig: AvatarConfig;
  items: OutfitItem[];
  garmentsById: Map<string, Garment>;
  capturedPreviewBlob: Blob | null;
  onCapturePreview: (blob: Blob) => void;
  onFallbackTo2D: (reason: string) => void;
}

const LAYER_ORDER: Record<string, number> = {
  shoes: 1,
  bottom: 2,
  top: 3,
  dress: 4,
  outerwear: 5,
};

export function Outfit3DViewer({
  avatarConfig,
  items,
  garmentsById,
  capturedPreviewBlob,
  onCapturePreview,
  onFallbackTo2D,
}: Outfit3DViewerProps) {
  const { supported, isSoftwareGl } = useMemo(() => probeWebGLCapabilities(), []);
  const sceneHandleRef = useRef<Outfit3DSceneHandle | null>(null);

  const [manifest, setManifest] = useState<ModelsManifest | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);

  useEffect(() => {
    void loadModelsManifest().then(setManifest);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!supported) {
      onFallbackTo2D(
        'Tu navegador o dispositivo no tiene WebGL activo. Regresamos automáticamente a la vista 2D.',
      );
    }
  }, [onFallbackTo2D, supported]);

  useEffect(() => {
    if (!capturedPreviewBlob) {
      setCapturedUrl(null);
      return;
    }
    const url = URL.createObjectURL(capturedPreviewBlob);
    setCapturedUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [capturedPreviewBlob]);

  // Clasificar prendas activas en: renderizables en 3D, accesorios (solo 2D) y sin plantilla 3D
  const { renderableGarments, accessoryGarments, missingTemplateGarments } = useMemo(() => {
    const hasDress = items.some((i) => i.slotKey === 'dress');
    const renderable: Garment[] = [];
    const accessories: Garment[] = [];
    const missingTemplate: Garment[] = [];

    const ordered = [...items].sort(
      (a, b) => (LAYER_ORDER[a.slotKey] ?? 9) - (LAYER_ORDER[b.slotKey] ?? 9),
    );

    for (const item of ordered) {
      if (hasDress && (item.slotKey === 'top' || item.slotKey === 'bottom')) {
        continue;
      }
      const g = garmentsById.get(item.garmentId);
      if (!g) continue;

      if (g.category === 'accessory' || item.slotKey.startsWith('acc_')) {
        accessories.push(g);
      } else if (!g.template3d) {
        missingTemplate.push(g);
      } else {
        renderable.push(g);
      }
    }

    return {
      renderableGarments: renderable,
      accessoryGarments: accessories,
      missingTemplateGarments: missingTemplate,
    };
  }, [garmentsById, items]);

  const handleCapture = useCallback(async () => {
    if (!sceneHandleRef.current || capturing) return;
    setCapturing(true);
    setCaptureError(null);
    try {
      const blob = await sceneHandleRef.current.captureWebP();
      onCapturePreview(blob);
    } catch (error) {
      setCaptureError(
        error instanceof Error ? error.message : 'No se pudo capturar la imagen 3D.',
      );
    } finally {
      setCapturing(false);
    }
  }, [capturing, onCapturePreview]);

  const handleLowFps = useCallback(() => {
    onFallbackTo2D(
      'Detectamos rendimiento bajo en 3D (< 15 fps). Cambiamos a vista 2D para mayor fluidez.',
    );
  }, [onFallbackTo2D]);

  if (!supported) {
    return (
      <div className="rounded-3xl bg-white p-6 border border-[#E6E0F8] shadow-soft text-center space-y-3">
        <p className="font-display text-base font-bold text-[#4A4458]">Vista 3D no disponible</p>
        <p className="text-sm text-[#6B6580]">
          Tu navegador no tiene soporte WebGL activo. Puedes seguir armando tu outfit en vista 2D.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-white p-3 sm:p-4 border border-[#E6E0F8] shadow-soft space-y-3">
        {/* Lienzo WebGL sin backdrop-blur encima */}
        <div
          className="relative w-full aspect-[3/4] max-h-[540px] rounded-2xl overflow-hidden bg-[#FFFBFD] border border-[#E6E0F8]/75"
          role="region"
          aria-label="Visor 3D aproximado del outfit. Arrastra para rotar 360 grados o usa los botones inferiores."
        >
          <Canvas
            shadows={!isSoftwareGl}
            dpr={isSoftwareGl ? 1 : [1, 2]}
            camera={{ position: [0, 0.9, 3.45], fov: 36 }}
            gl={{
              antialias: !isSoftwareGl,
              powerPreference: 'high-performance',
            }}
          >
            <Outfit3DScene
              ref={sceneHandleRef}
              avatarConfig={avatarConfig}
              garments={renderableGarments}
              manifest={manifest}
              isSoftwareGl={isSoftwareGl}
              reducedMotion={reducedMotion}
              onLowPerformanceFallback={handleLowFps}
            />
          </Canvas>

          {/* Insignia discreta superior sin backdrop-blur */}
          <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center px-3 py-1 rounded-xl bg-white/95 border border-[#E6E0F8] text-xs font-semibold text-[#4A4458] shadow-sm">
              Vista 3D aproximada
            </span>
          </div>

          {items.length === 0 && (
            <div className="pointer-events-none absolute bottom-16 left-4 right-4 text-center">
              <span className="inline-block px-3.5 py-2 rounded-2xl bg-white/95 border border-[#E6E0F8] text-xs font-medium text-[#6B6580]">
                Selecciona prendas del closet para vestir tu avatar 3D.
              </span>
            </div>
          )}

          {/* Barra inferior compacta con controles accesibles */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-md flex flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-white/95 border border-[#E6E0F8] p-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => sceneHandleRef.current?.rotateBy(-Math.PI / 6)}
              aria-label="Rotar avatar 3D hacia la izquierda"
              title="Rotar a la izquierda"
              className="min-h-[38px] min-w-[38px] px-2.5 rounded-xl bg-[#FFFBFD] hover:bg-[#E6E0F8]/70 text-[#4A4458] inline-flex items-center justify-center transition-colors"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => sceneHandleRef.current?.rotateBy(Math.PI / 6)}
              aria-label="Rotar avatar 3D hacia la derecha"
              title="Rotar a la derecha"
              className="min-h-[38px] min-w-[38px] px-2.5 rounded-xl bg-[#FFFBFD] hover:bg-[#E6E0F8]/70 text-[#4A4458] inline-flex items-center justify-center transition-colors"
            >
              <RotateCw className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => sceneHandleRef.current?.zoomBy(0.86)}
              aria-label="Acercar cámara en vista 3D"
              title="Acercar"
              className="min-h-[38px] min-w-[38px] px-2.5 rounded-xl bg-[#FFFBFD] hover:bg-[#E6E0F8]/70 text-[#4A4458] inline-flex items-center justify-center transition-colors"
            >
              <ZoomIn className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => sceneHandleRef.current?.zoomBy(1.15)}
              aria-label="Alejar cámara en vista 3D"
              title="Alejar"
              className="min-h-[38px] min-w-[38px] px-2.5 rounded-xl bg-[#FFFBFD] hover:bg-[#E6E0F8]/70 text-[#4A4458] inline-flex items-center justify-center transition-colors"
            >
              <ZoomOut className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => sceneHandleRef.current?.resetView()}
              aria-label="Restablecer ángulo y zoom de la vista 3D"
              className="min-h-[38px] px-3 rounded-xl bg-[#FFFBFD] hover:bg-[#E6E0F8]/70 text-xs font-semibold text-[#4A4458] transition-colors"
            >
              Centrar
            </button>

            <button
              type="button"
              onClick={() => void handleCapture()}
              disabled={capturing}
              aria-label="Capturar imagen WebP de la vista 3D actual"
              className="min-h-[38px] px-3 rounded-xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
            >
              <Camera className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{capturing ? 'Capturando...' : 'Capturar imagen'}</span>
            </button>
          </div>
        </div>

        {/* Confirmación de captura 3D */}
        {capturedUrl && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#D5F5E3]/55 border border-[#D5F5E3] px-3.5 py-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={capturedUrl}
                alt="Vista previa capturada del outfit 3D"
                className="w-10 h-12 rounded-lg object-cover border border-white bg-[#FFFBFD] shrink-0"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#4A4458] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#3B875E] shrink-0" aria-hidden="true" />
                  <span>Captura 3D lista</span>
                </p>
                <p className="text-[11px] text-[#6B6580] truncate">
                  Se usará como portada al guardar este outfit.
                </p>
              </div>
            </div>

            <a
              href={capturedUrl}
              download={`closetly-outfit-3d-${Date.now()}.webp`}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white hover:bg-[#FFFBFD] border border-[#E6E0F8] text-xs font-semibold text-[#4A4458] inline-flex items-center gap-1.5 shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Descargar</span>
            </a>
          </div>
        )}

        {captureError && (
          <div role="alert" className="rounded-2xl bg-[#FADADD]/70 px-3.5 py-2 text-xs text-[#4A4458]">
            {captureError}
          </div>
        )}

        {/* Avisos de compatibilidad en vista 3D */}
        {accessoryGarments.length > 0 && (
          <div className="rounded-2xl bg-[#E6E0F8]/45 border border-[#E6E0F8] px-3.5 py-2.5 text-xs text-[#4A4458] flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-[#6E61BE] shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <strong>Accesorios solo en vista 2D:</strong>{' '}
              {accessoryGarments.map((g) => g.name).join(', ')} se omiten en la escena 3D.
            </span>
          </div>
        )}

        {missingTemplateGarments.length > 0 && (
          <div className="rounded-2xl bg-[#FFF2DF] border border-[#F3D8B1] px-3.5 py-2.5 text-xs text-[#4A4458] space-y-1.5">
            <p className="font-semibold">
              Prendas sin plantilla 3D asignada (se muestran solo en 2D):
            </p>
            <div className="flex flex-wrap gap-2">
              {missingTemplateGarments.map((g) => (
                <Link
                  key={g.id}
                  to={`/garments/${g.id}`}
                  className="inline-flex items-center px-2.5 py-1 rounded-xl bg-white border border-[#E6E0F8] font-semibold text-[#5E51AE] hover:underline"
                >
                  {g.name} · Asignar plantilla
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Outfit3DViewer;
