import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { cropBlobToCanvas, type CropRect } from '@/src/lib/image';

interface CropStepProps {
  sourceBlob: Blob;
  onConfirmCrop: (croppedCanvas: HTMLCanvasElement, croppedBlob: Blob) => void;
  onBack: () => void;
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | null;

const INITIAL_CROP: CropRect = { x: 0.08, y: 0.08, width: 0.84, height: 0.84 };
const MIN_CROP_SIZE = 0.18;

export function CropStep({ sourceBlob, onConfirmCrop, onBack }: CropStepProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [crop, setCrop] = useState<CropRect>(INITIAL_CROP);
  const [processing, setProcessing] = useState(false);

  const dragStateRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startCrop: CropRect;
  } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(sourceBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceBlob]);

  function startDrag(mode: DragMode, event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragStateRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startCrop: crop,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragStateRef.current;
    const container = containerRef.current;
    if (!drag || !drag.mode || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dx = (event.clientX - drag.startX) / rect.width;
    const dy = (event.clientY - drag.startY) / rect.height;
    const sc = drag.startCrop;

    if (drag.mode === 'move') {
      const nx = Math.max(0, Math.min(1 - sc.width, sc.x + dx));
      const ny = Math.max(0, Math.min(1 - sc.height, sc.y + dy));
      setCrop({ ...sc, x: nx, y: ny });
      return;
    }

    let left = sc.x;
    let top = sc.y;
    let right = sc.x + sc.width;
    let bottom = sc.y + sc.height;

    if (drag.mode === 'nw' || drag.mode === 'sw') {
      left = Math.max(0, Math.min(right - MIN_CROP_SIZE, sc.x + dx));
    }
    if (drag.mode === 'ne' || drag.mode === 'se') {
      right = Math.min(1, Math.max(left + MIN_CROP_SIZE, sc.x + sc.width + dx));
    }
    if (drag.mode === 'nw' || drag.mode === 'ne') {
      top = Math.max(0, Math.min(bottom - MIN_CROP_SIZE, sc.y + dy));
    }
    if (drag.mode === 'sw' || drag.mode === 'se') {
      bottom = Math.min(1, Math.max(top + MIN_CROP_SIZE, sc.y + sc.height + dy));
    }

    setCrop({
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    });
  }

  function endDrag() {
    dragStateRef.current = null;
  }

  async function handleConfirm() {
    setProcessing(true);
    try {
      const canvas = await cropBlobToCanvas(sourceBlob, crop, 1200);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (res) => (res ? resolve(res) : reject(new Error('No se pudo recortar el encuadre.'))),
          'image/png',
        );
      });
      onConfirmCrop(canvas, blob);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="rounded-3xl bg-white p-5 sm:p-8 shadow-soft border border-[#E6E0F8] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-[#4A4458]">
            Ajusta el encuadre de tu prenda
          </h2>
          <p className="text-sm text-[#6B6580]">
            Arrastra las esquinas para dejar fuera el exceso de fondo.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCrop({ x: 0, y: 0, width: 1, height: 1 })}
          className="min-h-[40px] px-3.5 py-2 rounded-2xl bg-[#E6E0F8]/60 hover:bg-[#E6E0F8] text-xs font-semibold text-[#4A4458] inline-flex items-center gap-1.5 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Imagen completa</span>
        </button>
      </div>

      <div className="flex justify-center bg-[#FFFBFD] rounded-2xl p-3 border border-[#E6E0F8]/70">
        <div
          ref={containerRef}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative inline-block max-w-full max-h-[58vh] select-none touch-none overflow-hidden rounded-xl"
        >
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Vista previa para encuadre"
              className="block max-h-[58vh] w-auto max-w-full object-contain pointer-events-none"
            />
          )}

          {/* Área de selección rectangular */}
          <div
            role="region"
            aria-label="Marco de recorte"
            onPointerDown={(e) => startDrag('move', e)}
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.width * 100}%`,
              height: `${crop.height * 100}%`,
              boxShadow: '0 0 0 9999px rgba(74, 68, 88, 0.45)',
            }}
            className="absolute border-2 border-white cursor-move touch-none"
          >
            {/* Handles de las 4 esquinas (>=44px hitbox accesible) */}
            {(
              [
                { mode: 'nw', pos: '-top-5 -left-5 cursor-nwse-resize', dot: 'top-3.5 left-3.5' },
                { mode: 'ne', pos: '-top-5 -right-5 cursor-nesw-resize', dot: 'top-3.5 right-3.5' },
                { mode: 'sw', pos: '-bottom-5 -left-5 cursor-nesw-resize', dot: 'bottom-3.5 left-3.5' },
                { mode: 'se', pos: '-bottom-5 -right-5 cursor-nwse-resize', dot: 'bottom-3.5 right-3.5' },
              ] as const
            ).map((handle) => (
              <button
                key={handle.mode}
                type="button"
                aria-label={`Ajustar esquina ${handle.mode}`}
                onPointerDown={(e) => startDrag(handle.mode, e)}
                className={`absolute w-11 h-11 flex items-center justify-center touch-none ${handle.pos}`}
              >
                <span
                  className={`absolute w-4 h-4 rounded-full bg-[#6E61BE] border-2 border-white shadow ${handle.dot}`}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#E6E0F8]/70 hover:bg-[#E6E0F8] text-[#4A4458] text-sm font-semibold transition-colors"
        >
          Cambiar foto
        </button>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={processing}
          className="min-h-[48px] px-6 py-3 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-60"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
          <span>{processing ? 'Preparando...' : 'Recortar fondo'}</span>
        </button>
      </div>
    </div>
  );
}
