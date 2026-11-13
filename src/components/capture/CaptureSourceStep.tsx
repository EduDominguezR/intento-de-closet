import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, ImagePlus, RefreshCw, SunMedium } from 'lucide-react';

interface CaptureSourceStepProps {
  onImageSelected: (blob: Blob) => void;
}

const CAPTURE_TIPS = [
  'Prenda plana sobre superficie lisa o colgada de frente.',
  'Usa un fondo contrastante y uniforme.',
  'Procura buena iluminación sin sombras duras ni arrugas marcadas.',
];

export function CaptureSourceStep({ onImageSelected }: CaptureSourceStepProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraFallbackNotice, setCameraFallbackNotice] = useState<string | null>(null);

  function stopCameraStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  async function startCamera() {
    setCameraFallbackNotice(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraFallbackNotice(
        'La cámara en vivo no está disponible en este entorno. Usa el selector de foto o cámara del dispositivo.',
      );
      cameraInputRef.current?.click();
      return;
    }

    setCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      stopCameraStream();
      setCameraFallbackNotice(
        'No se pudo abrir la cámara en vivo (permiso o vista embebida). Abriendo el selector de cámara nativo.',
      );
      cameraInputRef.current?.click();
    } finally {
      setCameraStarting(false);
    }
  }

  function captureFrameFromVideo() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          stopCameraStream();
          onImageSelected(blob);
        }
      },
      'image/jpeg',
      0.92,
    );
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    stopCameraStream();
    onImageSelected(file);
  }

  return (
    <div className="space-y-6">
      {/* Guía visible antes de la cámara */}
      <section
        aria-label="Guía para fotografiar prendas"
        className="rounded-3xl bg-[#FFF9DB]/70 border border-[#E6E0F8] p-5 sm:p-6 space-y-3"
      >
        <div className="flex items-center gap-2.5">
          <SunMedium className="w-5 h-5 text-[#5E51AE] shrink-0" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-[#4A4458]">
            Consejos para un recorte limpio
          </h2>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-[#4A4458]">
          {CAPTURE_TIPS.map((tip, index) => (
            <li
              key={tip}
              className="rounded-2xl bg-[#FFFBFD]/90 p-3.5 border border-[#E6E0F8]/70 leading-snug"
            >
              <span className="font-semibold text-[#5E51AE]">0{index + 1}. </span>
              {tip}
            </li>
          ))}
        </ul>
      </section>

      {/* Visor de cámara en vivo o botones de origen */}
      {cameraActive ? (
        <div className="rounded-3xl bg-white p-4 sm:p-6 shadow-soft border border-[#E6E0F8] space-y-4">
          <div className="relative overflow-hidden rounded-2xl bg-[#4A4458]/10 aspect-[3/4] max-h-[60vh] mx-auto">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              aria-label="Vista previa de cámara"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={captureFrameFromVideo}
              className="min-h-[48px] px-6 py-3 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Camera className="w-4 h-4" aria-hidden="true" />
              <span>Tomar foto</span>
            </button>
            <button
              type="button"
              onClick={stopCameraStream}
              className="min-h-[48px] px-5 py-3 rounded-2xl bg-[#E6E0F8]/70 hover:bg-[#E6E0F8] text-[#4A4458] text-sm font-semibold transition-colors"
            >
              Cancelar cámara
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-soft border border-[#E6E0F8] space-y-5">
          {cameraFallbackNotice && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl bg-[#D6EAF8]/60 border border-[#D6EAF8] px-4 py-3 text-sm text-[#4A4458]"
            >
              {cameraFallbackNotice}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={startCamera}
              disabled={cameraStarting}
              className="min-h-[120px] rounded-3xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white p-6 flex flex-col items-center justify-center gap-3 text-center transition-colors disabled:opacity-60"
            >
              {cameraStarting ? (
                <RefreshCw className="w-7 h-7 animate-spin" aria-hidden="true" />
              ) : (
                <Camera className="w-7 h-7" aria-hidden="true" />
              )}
              <div>
                <p className="font-display text-base font-semibold">
                  {cameraStarting ? 'Abriendo cámara...' : 'Usar cámara'}
                </p>
                <p className="text-xs text-white/90 mt-1">Toma la foto al instante</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="min-h-[120px] rounded-3xl bg-[#E6E0F8]/60 hover:bg-[#E6E0F8] text-[#4A4458] border border-[#E6E0F8] p-6 flex flex-col items-center justify-center gap-3 text-center transition-colors"
            >
              <ImagePlus className="w-7 h-7 text-[#5E51AE]" aria-hidden="true" />
              <div>
                <p className="font-display text-base font-semibold">Subir desde galería</p>
                <p className="text-xs text-[#6B6580] mt-1">JPG, PNG o WebP</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Fallback nativo de cámara para entornos sin getUserMedia o iframe */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="sr-only"
        aria-label="Capturar foto desde cámara del dispositivo"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="sr-only"
        aria-label="Seleccionar foto desde galería"
      />
    </div>
  );
}
