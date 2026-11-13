import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Check, Eraser, Eye, Paintbrush, RotateCcw, Undo2 } from 'lucide-react';

interface MaskEditorProps {
  originalCanvas: HTMLCanvasElement;
  initialCutoutCanvas: HTMLCanvasElement;
  notice?: string | null;
  onConfirmMask: (editedCanvas: HTMLCanvasElement) => void;
  onBack: () => void;
}

type BrushMode = 'erase' | 'restore';
const MAX_UNDO_STEPS = 15;

export function MaskEditor({
  originalCanvas,
  initialCutoutCanvas,
  notice,
  onConfirmMask,
  onBack,
}: MaskEditorProps) {
  const editCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const alignedOriginalRef = useRef<HTMLCanvasElement | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [mode, setMode] = useState<BrushMode>('erase');
  const [brushSize, setBrushSize] = useState<number>(26);
  const [showOriginalGhost, setShowOriginalGhost] = useState<boolean>(true);
  const [undoCount, setUndoCount] = useState<number>(0);

  const initCanvases = useCallback(() => {
    const canvas = editCanvasRef.current;
    if (!canvas) return;
    canvas.width = initialCutoutCanvas.width;
    canvas.height = initialCutoutCanvas.height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(initialCutoutCanvas, 0, 0, canvas.width, canvas.height);

    // Prepara original alineado exactamente a la resolución del cutout para restaurar píxeles
    const orig = document.createElement('canvas');
    orig.width = canvas.width;
    orig.height = canvas.height;
    const origCtx = orig.getContext('2d', { willReadFrequently: true });
    if (origCtx) {
      origCtx.drawImage(originalCanvas, 0, 0, orig.width, orig.height);
    }
    alignedOriginalRef.current = orig;

    undoStackRef.current = [];
    setUndoCount(0);
  }, [initialCutoutCanvas, originalCanvas]);

  useEffect(() => {
    initCanvases();
  }, [initCanvases]);

  function pushUndoSnapshot() {
    const canvas = editCanvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const next = [...undoStackRef.current, snap].slice(-MAX_UNDO_STEPS);
    undoStackRef.current = next;
    setUndoCount(next.length);
  }

  function handleUndo() {
    const canvas = editCanvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    const stack = undoStackRef.current;
    if (!canvas || !ctx || stack.length === 0) return;

    const prev = stack[stack.length - 1];
    undoStackRef.current = stack.slice(0, -1);
    setUndoCount(undoStackRef.current.length);
    ctx.putImageData(prev, 0, 0);
  }

  function getCanvasCoords(event: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = editCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function paintBrushDab(x: number, y: number) {
    const canvas = editCanvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleFactor = canvas.width / Math.max(1, rect.width);
    const radius = Math.max(4, (brushSize / 2) * scaleFactor);

    if (mode === 'erase') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    const orig = alignedOriginalRef.current;
    if (!orig) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(orig, 0, 0);
    ctx.restore();
  }

  function paintStrokeSegment(from: { x: number; y: number }, to: { x: number; y: number }) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 3));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      paintBrushDab(from.x + dx * t, from.y + dy * t);
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pushUndoSnapshot();
    isDrawingRef.current = true;
    const point = getCanvasCoords(event);
    lastPointRef.current = point;
    paintBrushDab(point.x, point.y);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current || !lastPointRef.current) return;
    const nextPoint = getCanvasCoords(event);
    paintStrokeSegment(lastPointRef.current, nextPoint);
    lastPointRef.current = nextPoint;
  }

  function handlePointerUp() {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }

  function handleConfirm() {
    const canvas = editCanvasRef.current;
    if (!canvas) return;
    const output = document.createElement('canvas');
    output.width = canvas.width;
    output.height = canvas.height;
    const ctx = output.getContext('2d');
    if (ctx) ctx.drawImage(canvas, 0, 0);
    onConfirmMask(output);
  }

  return (
    <div className="rounded-3xl bg-white p-5 sm:p-8 shadow-soft border border-[#E6E0F8] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-[#4A4458]">
            Afina el recorte con el pincel
          </h2>
          <p className="text-sm text-[#6B6580]">
            Borra restos de fondo o restaura partes de la prenda que falten.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowOriginalGhost((v) => !v)}
          aria-pressed={showOriginalGhost}
          className={`min-h-[40px] px-3.5 py-2 rounded-2xl text-xs font-semibold inline-flex items-center gap-1.5 border transition-colors ${
            showOriginalGhost
              ? 'bg-[#E6E0F8] border-[#8B7FD4] text-[#4A4458]'
              : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#6B6580]'
          }`}
        >
          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Guía de foto</span>
        </button>
      </div>

      {notice && (
        <div
          role="status"
          className="rounded-2xl bg-[#FFF9DB] border border-[#E6E0F8] px-4 py-3 text-sm text-[#4A4458]"
        >
          {notice}
        </div>
      )}

      {/* Barra de herramientas del pincel */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8]">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#E6E0F8]/50">
          <button
            type="button"
            onClick={() => setMode('erase')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              mode === 'erase' ? 'bg-white text-[#4A4458] shadow-sm' : 'text-[#6B6580]'
            }`}
          >
            <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Borrar</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('restore')}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              mode === 'restore' ? 'bg-white text-[#4A4458] shadow-sm' : 'text-[#6B6580]'
            }`}
          >
            <Paintbrush className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Restaurar</span>
          </button>
        </div>

        <label className="flex items-center gap-2.5 text-xs font-semibold text-[#4A4458] min-w-[160px] flex-1 max-w-xs">
          <span className="whitespace-nowrap">Pincel ({brushSize}px)</span>
          <input
            type="range"
            min={8}
            max={56}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            aria-label="Tamaño del pincel"
            className="w-full accent-[#6E61BE]"
          />
        </label>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={handleUndo}
            disabled={undoCount === 0}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#E6E0F8]/60 hover:bg-[#E6E0F8] text-[#4A4458] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-45 transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Deshacer</span>
          </button>
          <button
            type="button"
            onClick={initCanvases}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#FFFBFD] border border-[#E6E0F8] hover:bg-[#E6E0F8]/40 text-[#4A4458] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Restablecer</span>
          </button>
        </div>
      </div>

      {/* Área de edición con patrón ajedrez pastel y guía opcional */}
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
        <div className="relative inline-block max-w-full max-h-[56vh]">
          {showOriginalGhost && (
            <img
              src={originalCanvas.toDataURL('image/webp', 0.6)}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-contain opacity-25 pointer-events-none select-none"
            />
          )}
          <canvas
            ref={editCanvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            aria-label="Lienzo de edición de máscara de la prenda"
            className="relative block max-h-[56vh] w-auto max-w-full cursor-crosshair touch-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#E6E0F8]/70 hover:bg-[#E6E0F8] text-[#4A4458] text-sm font-semibold transition-colors"
        >
          Volver al encuadre
        </button>

        <button
          type="button"
          onClick={handleConfirm}
          className="min-h-[48px] px-6 py-3 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
        >
          <Check className="w-4 h-4" aria-hidden="true" />
          <span>Continuar a etiquetas</span>
        </button>
      </div>
    </div>
  );
}
