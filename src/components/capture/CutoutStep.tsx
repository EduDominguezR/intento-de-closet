import { useCallback, useEffect, useRef, useState } from 'react';
import { Scissors, Wand2 } from 'lucide-react';
import { SolidBgWandEditor } from '@/src/components/capture/SolidBgWandEditor';
import {
  BgRemovalError,
  imglyBgRemovalEngine,
  isBgModelWarm,
  type BgRemovalProgress,
} from '@/src/lib/bg-removal';
import { blobToCanvas } from '@/src/lib/image';

interface CutoutStepProps {
  croppedBlob: Blob;
  croppedCanvas: HTMLCanvasElement;
  onCutoutReady: (cutoutCanvas: HTMLCanvasElement, usedFallbackNotice?: string) => void;
  onBack: () => void;
}

export function CutoutStep({
  croppedBlob,
  croppedCanvas,
  onCutoutReady,
  onBack,
}: CutoutStepProps) {
  const [stage, setStage] = useState<'imgly-running' | 'solid-bg'>('imgly-running');
  const [progress, setProgress] = useState<BgRemovalProgress>({
    label: isBgModelWarm()
      ? 'Recortando fondo de tu prenda...'
      : 'Preparando el recorte, solo la primera vez',
    percent: 8,
    isDownloadingModel: !isBgModelWarm(),
  });
  const [wandNotice, setWandNotice] = useState<string | null>(null);
  const runIdRef = useRef(0);

  const runImglyRemoval = useCallback(async () => {
    const currentRun = ++runIdRef.current;
    setStage('imgly-running');
    setWandNotice(null);
    setProgress({
      label: isBgModelWarm()
        ? 'Recortando fondo de tu prenda...'
        : 'Preparando el recorte, solo la primera vez',
      percent: 10,
      isDownloadingModel: !isBgModelWarm(),
    });

    try {
      const cutoutBlob = await imglyBgRemovalEngine.removeBackground(croppedBlob, {
        onProgress: (p) => {
          if (runIdRef.current === currentRun) {
            setProgress(p);
          }
        },
      });
      if (runIdRef.current !== currentRun) return;
      const cutoutCanvas = await blobToCanvas(cutoutBlob, 1200);
      if (runIdRef.current !== currentRun) return;
      onCutoutReady(cutoutCanvas);
    } catch (error) {
      if (runIdRef.current !== currentRun) return;
      const detail =
        error instanceof BgRemovalError && error.reason === 'timeout'
          ? 'El modelo automático tardó demasiado. Usa la varita mágica gratuita (toca el fondo liso) o pasa directo al pincel.'
          : 'No se pudo completar el recorte automático local. Usa la varita mágica gratuita (toca el fondo liso) o continúa con la foto original.';
      setWandNotice(detail);
      setStage('solid-bg');
    }
  }, [croppedBlob, onCutoutReady]);

  useEffect(() => {
    void runImglyRemoval();
    return () => {
      runIdRef.current += 1;
    };
  }, [runImglyRemoval]);

  function handleSwitchToWand() {
    runIdRef.current += 1;
    setWandNotice(
      'Modo varita mágica activo: toca el fondo liso para eliminarlo gratis sin descargar modelos.',
    );
    setStage('solid-bg');
  }

  function handleContinueOriginal() {
    runIdRef.current += 1;
    const copy = document.createElement('canvas');
    copy.width = croppedCanvas.width;
    copy.height = croppedCanvas.height;
    const ctx = copy.getContext('2d');
    if (ctx) ctx.drawImage(croppedCanvas, 0, 0);
    onCutoutReady(
      copy,
      'Continuaste con la foto original. Puedes limpiar bordes manualmente con el pincel.',
    );
  }

  if (stage === 'solid-bg') {
    return (
      <SolidBgWandEditor
        croppedCanvas={croppedCanvas}
        notice={wandNotice}
        onRetryImgly={() => void runImglyRemoval()}
        onApplyToMaskEditor={(canvas, notice) => onCutoutReady(canvas, notice)}
        onContinueOriginal={handleContinueOriginal}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-soft border border-[#E6E0F8] space-y-6">
      <div className="space-y-4 text-center py-6" aria-live="polite">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-[#E6E0F8] flex items-center justify-center text-[#5E51AE]">
          <Scissors className="w-6 h-6 animate-pulse" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold text-[#4A4458]">{progress.label}</h2>
          <p className="text-sm text-[#6B6580]">
            {progress.isDownloadingModel
              ? 'Descargando modelo gratuito en tu navegador (solo la primera vez).'
              : 'Separando tu prenda del fondo directamente en tu dispositivo.'}
          </p>
        </div>

        <div className="max-w-md mx-auto space-y-2">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            className="h-3 w-full rounded-full bg-[#E6E0F8]/60 overflow-hidden"
          >
            <div
              className="h-full bg-[#6E61BE] transition-[width] duration-200 rounded-full"
              style={{ width: `${Math.max(8, progress.percent)}%` }}
            />
          </div>
          <p className="text-xs font-semibold text-[#6B6580] tabular-nums">{progress.percent}%</p>
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={handleSwitchToWand}
            className="min-h-[42px] px-4 py-2 rounded-2xl bg-[#D6EAF8] hover:bg-[#D6EAF8]/80 text-[#4A4458] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <Wand2 className="w-3.5 h-3.5 text-[#5E51AE]" aria-hidden="true" />
            <span>Usar varita mágica (fondo liso)</span>
          </button>

          <button
            type="button"
            onClick={handleContinueOriginal}
            className="min-h-[42px] px-4 py-2 rounded-2xl bg-white border border-[#E6E0F8] hover:bg-[#E6E0F8]/35 text-[#4A4458] text-xs font-semibold transition-colors"
          >
            Continuar con foto original
          </button>
        </div>
      </div>
    </div>
  );
}
