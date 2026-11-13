import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, RefreshCw, RotateCcw, Sparkles, Undo2, Wand2 } from 'lucide-react';
import {
  applyMagicWandFloodFill,
  type NormalizedSeedPoint,
} from '@/src/lib/bg-removal';

interface SolidBgWandEditorProps {
  croppedCanvas: HTMLCanvasElement;
  notice?: string | null;
  onRetryImgly: () => void;
  onApplyToMaskEditor: (cutoutCanvas: HTMLCanvasElement, notice: string) => void;
  onContinueOriginal: () => void;
  onBack: () => void;
}

export function SolidBgWandEditor({
  croppedCanvas,
  notice,
  onRetryImgly,
  onApplyToMaskEditor,
  onContinueOriginal,
  onBack,
}: SolidBgWandEditorProps) {
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [seeds, setSeeds] = useState<NormalizedSeedPoint[]>([]);
  const [tolerance, setTolerance] = useState<number>(28);
  const [featherPx, setFeatherPx] = useState<number>(1.5);

  const processedCanvas = useMemo(() => {
    try {
      return applyMagicWandFloodFill(croppedCanvas, seeds, tolerance, featherPx);
    } catch {
      return croppedCanvas;
    }
  }, [croppedCanvas, featherPx, seeds, tolerance]);

  useEffect(() => {
    const target = displayCanvasRef.current;
    if (!target) return;
    target.width = processedCanvas.width;
    target.height = processedCanvas.height;
    const ctx = target.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(processedCanvas, 0, 0);
  }, [processedCanvas]);

  function handleCanvasTap(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = displayCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    setSeeds((prev) => [...prev, { x: nx, y: ny }]);
  }

  function handleConfirm() {
    onApplyToMaskEditor(
      processedCanvas,
      seeds.length > 0
        ? 'Fondo eliminado con varita mágica gratuita. Afina cualquier detalle con el pincel.'
        : 'Continuaste al pincel sin tocar zonas de fondo. Puedes limpiar bordes manualmente.',
    );
  }

  return (
    <div className="rounded-3xl bg-white p-5 sm:p-8 shadow-soft border border-[#E6E0F8] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold text-[#4A4458] flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-[#5E51AE]" aria-hidden="true" />
            <span>Varita mágica (fondo liso gratuito)</span>
          </h2>
          <p className="text-sm text-[#6B6580]">
            Toca una o más zonas del fondo para quitarlas al instante. Funciona mejor con fondos lisos.
          </p>
        </div>

        <button
          type="button"
          onClick={onRetryImgly}
          className="min-h-[40px] px-3.5 py-2 rounded-2xl bg-[#E6E0F8]/70 hover:bg-[#E6E0F8] text-[#4A4458] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Reintentar recorte IA</span>
        </button>
      </div>

      {notice && (
        <div
          role="status"
          className="rounded-2xl bg-[#FFF2DF] border border-[#F3D8B1] px-4 py-3 text-sm text-[#4A4458]"
        >
          {notice}
        </div>
      )}

      {/* Controles de varita mágica */}
      <div className="flex flex-wrap items-center gap-4 p-3.5 rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8]">
        <label className="flex items-center gap-2.5 text-xs font-semibold text-[#4A4458] min-w-[190px] flex-1">
          <span className="whitespace-nowrap">Tolerancia ({tolerance})</span>
          <input
            type="range"
            min={5}
            max={85}
            step={1}
            value={tolerance}
            onChange={(e) => setTolerance(Number(e.target.value))}
            aria-label="Tolerancia de color de la varita mágica"
            className="w-full accent-[#6E61BE]"
          />
        </label>

        <label className="flex items-center gap-2.5 text-xs font-semibold text-[#4A4458] min-w-[190px] flex-1">
          <span className="whitespace-nowrap">Suavizado ({featherPx.toFixed(1)}px)</span>
          <input
            type="range"
            min={0}
            max={4}
            step={0.5}
            value={featherPx}
            onChange={(e) => setFeatherPx(Number(e.target.value))}
            aria-label="Suavizado de borde"
            className="w-full accent-[#6E61BE]"
          />
        </label>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => setSeeds((prev) => prev.slice(0, -1))}
            disabled={seeds.length === 0}
            className="min-h-[40px] px-3 py-2 rounded-xl bg-[#E6E0F8]/60 hover:bg-[#E6E0F8] text-[#4A4458] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-45"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Deshacer toque</span>
          </button>

          <button
            type="button"
            onClick={() => setSeeds([])}
            disabled={seeds.length === 0}
            className="min-h-[40px] px-3 py-2 rounded-xl bg-white border border-[#E6E0F8] hover:bg-[#E6E0F8]/35 text-[#4A4458] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-45"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reiniciar</span>
          </button>
        </div>
      </div>

      {/* Lienzo interactivo con patrón ajedrez pastel */}
      <div
        className="relative flex justify-center items-center rounded-2xl border border-[#E6E0F8] p-3 overflow-hidden"
        style={{
          backgroundImage:
            'linear-gradient(45deg, #F4EFFA 25%, transparent 25%), linear-gradient(-45deg, #F4EFFA 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #F4EFFA 75%), linear-gradient(-45deg, transparent 75%, #F4EFFA 75%)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
          backgroundColor: '#FFFBFD',
        }}
      >
        <div className="relative inline-block max-w-full max-h-[54vh]">
          <canvas
            ref={displayCanvasRef}
            onPointerDown={handleCanvasTap}
            aria-label="Toca el fondo que deseas eliminar con la varita mágica"
            className="block max-h-[54vh] w-auto max-w-full cursor-crosshair touch-manipulation rounded-xl"
          />
          {seeds.map((pt, idx) => (
            <span
              key={`${pt.x}-${pt.y}-${idx}`}
              aria-hidden="true"
              className="pointer-events-none absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-white bg-[#6E61BE]/80 shadow"
              style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-[#6B6580] flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-[#5E51AE] shrink-0" aria-hidden="true" />
        <span>
          {seeds.length === 0
            ? 'Toca cualquier punto del fondo (por ejemplo, una esquina) para iniciar el recorte.'
            : `${seeds.length} ${seeds.length === 1 ? 'zona seleccionada' : 'zonas seleccionadas'}. Ajusta la tolerancia si hace falta y continúa al pincel.`}
        </span>
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#E6E0F8]/70 hover:bg-[#E6E0F8] text-[#4A4458] text-sm font-semibold transition-colors"
          >
            Volver al encuadre
          </button>

          <button
            type="button"
            onClick={onContinueOriginal}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-white border border-[#E6E0F8] hover:bg-[#E6E0F8]/30 text-[#4A4458] text-sm font-semibold transition-colors"
          >
            Continuar con foto original
          </button>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          className="min-h-[48px] px-6 py-3 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
          <span>Ir al pincel</span>
        </button>
      </div>
    </div>
  );
}
