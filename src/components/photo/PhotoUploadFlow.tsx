import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, ImagePlus, ShieldCheck, X } from 'lucide-react';
import {
  PHOTO_GUIDE_TIPS,
  processBodyPhotoFile,
} from '@/src/lib/photo/image';
import {
  PHOTO_CONSENT_DETAILS,
  PHOTO_CONSENT_HEADLINE,
  grantPhotoModeConsent,
  hasPhotoModeConsent,
  saveLocalUserPhoto,
  type LocalUserPhoto,
} from '@/src/lib/photo/storage';

interface PhotoUploadFlowProps {
  uid: string;
  hasExistingPhoto: boolean;
  onPhotoSaved: (photo: LocalUserPhoto) => void;
  onCancel?: () => void;
}

export function PhotoUploadFlow({
  uid,
  hasExistingPhoto,
  onPhotoSaved,
  onCancel,
}: PhotoUploadFlowProps) {
  const [consentAccepted, setConsentAccepted] = useState(() => hasPhotoModeConsent(uid));
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraFallbackInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!cameraActive || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {
      // Silencioso si el navegador requiere gesto adicional
    });
  }, [cameraActive]);

  async function processAndSaveBlob(blob: Blob) {
    if (!consentAccepted) {
      setErrorMsg('Acepta el aviso de privacidad local antes de continuar.');
      return;
    }
    setProcessing(true);
    setErrorMsg(null);
    try {
      const processed = await processBodyPhotoFile(blob);
      grantPhotoModeConsent(uid);
      const record: LocalUserPhoto = {
        uid,
        blob: processed.blob,
        width: processed.width,
        height: processed.height,
        updatedAt: Date.now(),
      };
      await saveLocalUserPhoto(record);
      stopCamera();
      onPhotoSaved(record);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo procesar la foto en este dispositivo.',
      );
    } finally {
      setProcessing(false);
    }
  }

  async function handleOpenCamera() {
    if (!consentAccepted) {
      setErrorMsg('Marca primero la casilla de consentimiento local.');
      return;
    }
    setErrorMsg(null);
    setCameraNotice(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setCameraNotice('Tu navegador no permite cámara en vivo aquí; elige una foto de cámara o archivo.');
      cameraFallbackInputRef.current?.click();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
    } catch {
      setCameraNotice(
        'La cámara en vivo no está disponible en este contenedor. Usa el selector nativo para tomar o elegir tu foto.',
      );
      cameraFallbackInputRef.current?.click();
    }
  }

  async function handleCaptureFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.92),
    );
    if (blob) {
      await processAndSaveBlob(blob);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await processAndSaveBlob(file);
  }

  return (
    <div className="rounded-3xl bg-white p-5 sm:p-6 border border-[#E6E0F8] shadow-soft space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#4A4458]">
            {hasExistingPhoto ? 'Cambiar foto del probador' : 'Sube tu foto de cuerpo completo'}
          </h2>
          <p className="text-xs text-[#6B6580] mt-1">
            Vista previa 2D por superposición manual de prendas. No promete ajuste exacto.
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onCancel();
            }}
            aria-label="Cancelar cambio de foto"
            className="min-h-[40px] min-w-[40px] rounded-xl bg-[#FFFBFD] border border-[#E6E0F8] text-[#4A4458] inline-flex items-center justify-center hover:bg-[#E6E0F8]/50 shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Guía visible antes de subir */}
      <div className="rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] p-4 space-y-2.5">
        <p className="text-xs font-semibold text-[#4A4458]">
          Guía rápida para que las prendas encajen mejor
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[#6B6580]">
          {PHOTO_GUIDE_TIPS.map((tip) => (
            <li key={tip} className="flex items-start gap-1.5">
              <span className="text-[#6E61BE] font-bold" aria-hidden="true">
                ·
              </span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Consentimiento obligatorio de privacidad local */}
      <label className="flex items-start gap-3 rounded-2xl bg-[#D5F5E3]/40 border border-[#D5F5E3] p-3.5 cursor-pointer">
        <input
          type="checkbox"
          checked={consentAccepted}
          onChange={(e) => setConsentAccepted(e.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-[#8B7FD4] text-[#6E61BE] accent-[#6E61BE] shrink-0"
        />
        <span className="space-y-1 text-xs text-[#4A4458]">
          <span className="font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#3B875E] shrink-0" aria-hidden="true" />
            <span>{PHOTO_CONSENT_HEADLINE}</span>
          </span>
          <span className="block text-[#6B6580] leading-relaxed">{PHOTO_CONSENT_DETAILS}</span>
        </span>
      </label>

      {cameraActive && (
        <div className="space-y-3 rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] p-3">
          <div className="relative aspect-[3/4] max-h-[360px] mx-auto rounded-xl overflow-hidden bg-[#4A4458]/10">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={stopCamera}
              disabled={processing}
              className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#E6E0F8]/70 text-xs font-semibold text-[#4A4458]"
            >
              Cerrar cámara
            </button>
            <button
              type="button"
              onClick={() => void handleCaptureFrame()}
              disabled={processing}
              className="min-h-[44px] px-5 py-2 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Camera className="w-4 h-4" aria-hidden="true" />
              <span>{processing ? 'Procesando...' : 'Tomar foto'}</span>
            </button>
          </div>
        </div>
      )}

      {cameraNotice && (
        <p role="status" className="rounded-2xl bg-[#FFF2DF] border border-[#F3D8B1] px-3.5 py-2.5 text-xs text-[#4A4458]">
          {cameraNotice}
        </p>
      )}

      {errorMsg && (
        <p role="alert" className="rounded-2xl bg-[#FADADD]/75 px-3.5 py-2.5 text-xs text-[#4A4458]">
          {errorMsg}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => void handleOpenCamera()}
          disabled={processing || !consentAccepted}
          className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          <span>{processing ? 'Procesando...' : 'Usar cámara'}</span>
        </button>

        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          disabled={processing || !consentAccepted}
          className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-[#E6E0F8]/75 hover:bg-[#E6E0F8] text-[#4A4458] text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          <ImagePlus className="w-4 h-4" aria-hidden="true" />
          <span>Elegir de galería</span>
        </button>
      </div>

      {/* Inputs ocultos para fallback de cámara y galería */}
      <input
        ref={cameraFallbackInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={(e) => void handleFileChange(e)}
        className="hidden"
        aria-hidden="true"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => void handleFileChange(e)}
        className="hidden"
        aria-hidden="true"
      />
    </div>
  );
}
