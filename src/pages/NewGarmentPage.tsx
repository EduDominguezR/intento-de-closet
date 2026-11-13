import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { CaptureSourceStep } from '@/src/components/capture/CaptureSourceStep';
import { CropStep } from '@/src/components/capture/CropStep';
import { CutoutStep } from '@/src/components/capture/CutoutStep';
import { GarmentTagsForm } from '@/src/components/capture/GarmentTagsForm';
import { MaskEditor } from '@/src/components/capture/MaskEditor';
import { preloadBackgroundRemovalModel } from '@/src/lib/bg-removal';

type CaptureStep = 'source' | 'crop' | 'cutout' | 'mask' | 'tags';

const STEP_LABELS: { key: CaptureStep; label: string }[] = [
  { key: 'source', label: '01. Foto' },
  { key: 'crop', label: '02. Encuadre' },
  { key: 'cutout', label: '03. Fondo' },
  { key: 'mask', label: '04. Pincel' },
  { key: 'tags', label: '05. Etiquetas' },
];

export function NewGarmentPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<CaptureStep>('source');
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [croppedCanvas, setCroppedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [cutoutCanvas, setCutoutCanvas] = useState<HTMLCanvasElement | null>(null);
  const [editedCutoutCanvas, setEditedCutoutCanvas] = useState<HTMLCanvasElement | null>(null);
  const [cutoutNotice, setCutoutNotice] = useState<string | null>(null);

  // Precargar modelo de recorte en segundo plano al entrar a captura
  useEffect(() => {
    void preloadBackgroundRemovalModel();
  }, []);

  const currentIndex = STEP_LABELS.findIndex((s) => s.key === step);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            to="/closet"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5E51AE] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Volver a Mi Closet</span>
          </Link>
          <h1 className="font-display text-2xl font-bold text-[#4A4458]">Agregar prenda</h1>
        </div>

        <nav aria-label="Progreso de captura" className="flex flex-wrap items-center gap-2 text-xs">
          {STEP_LABELS.map((item, idx) => (
            <span key={item.key} className="inline-flex items-center gap-2">
              {idx > 0 && (
                <span aria-hidden="true" className="text-[#6B6580]/50">
                  ·
                </span>
              )}
              <span
                className={
                  idx === currentIndex
                    ? 'font-bold text-[#5E51AE]'
                    : idx < currentIndex
                      ? 'font-semibold text-[#4A4458]'
                      : 'text-[#6B6580]'
                }
              >
                {item.label}
              </span>
            </span>
          ))}
        </nav>
      </div>

      {step === 'source' && (
        <CaptureSourceStep
          onImageSelected={(blob) => {
            setSourceBlob(blob);
            setStep('crop');
          }}
        />
      )}

      {step === 'crop' && sourceBlob && (
        <CropStep
          sourceBlob={sourceBlob}
          onBack={() => setStep('source')}
          onConfirmCrop={(canvas, blob) => {
            setCroppedCanvas(canvas);
            setCroppedBlob(blob);
            setCutoutNotice(null);
            setStep('cutout');
          }}
        />
      )}

      {step === 'cutout' && croppedBlob && croppedCanvas && (
        <CutoutStep
          croppedBlob={croppedBlob}
          croppedCanvas={croppedCanvas}
          onBack={() => setStep('crop')}
          onCutoutReady={(canvas, notice) => {
            setCutoutCanvas(canvas);
            setEditedCutoutCanvas(canvas);
            setCutoutNotice(notice ?? null);
            setStep('mask');
          }}
        />
      )}

      {step === 'mask' && croppedCanvas && cutoutCanvas && (
        <MaskEditor
          originalCanvas={croppedCanvas}
          initialCutoutCanvas={cutoutCanvas}
          notice={cutoutNotice}
          onBack={() => setStep('crop')}
          onConfirmMask={(finalCanvas) => {
            setEditedCutoutCanvas(finalCanvas);
            setStep('tags');
          }}
        />
      )}

      {step === 'tags' && croppedCanvas && editedCutoutCanvas && (
        <GarmentTagsForm
          croppedCanvas={croppedCanvas}
          cutoutCanvas={editedCutoutCanvas}
          onBack={() => setStep('mask')}
          onSaved={({ queuedOffline }) => {
            navigate(queuedOffline ? '/closet?queued=1' : '/closet?added=1', { replace: true });
          }}
        />
      )}
    </div>
  );
}
