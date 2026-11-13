import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Calendar, Camera, ImagePlus, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StorageImage } from '@/src/components/ui/StorageImage';
import { createLookbookEntry, generateFirestoreDocId } from '@/src/firebase/firestore';
import { uploadLookbookAssets } from '@/src/firebase/storage';
import { CONSENT_VERSION, getConsentText, hasConsent, setConsent } from '@/src/lib/lookbook/consent';
import { getTodayLocalIsoDate, processLookbookPhotoToWebP } from '@/src/lib/lookbook/image';
import { lookbookKeys } from '@/src/queries/lookbook';
import { outfitKeys, useOutfitsQuery } from '@/src/queries/outfits';
import { useAuthStore } from '@/src/stores/useAuthStore';

interface RegisterLookModalProps {
  open: boolean;
  initialOutfitId?: string;
  onClose: () => void;
  onSaved: (entryId: string) => void;
}

export function RegisterLookModal({
  open,
  initialOutfitId,
  onClose,
  onSaved,
}: RegisterLookModalProps) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { data: outfits = [], isLoading: loadingOutfits } = useOutfitsQuery(user?.uid);

  const modalRef = useRef<HTMLFormElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedOutfitId, setSelectedOutfitId] = useState(initialOutfitId ?? '');
  const [wornOn, setWornOn] = useState(getTodayLocalIsoDate);
  const [note, setNote] = useState('');
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  const [needsConsent, setNeedsConsent] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  // Sincronizar estado inicial cada vez que se abre el modal
  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    const alreadyConsented = hasConsent();
    setNeedsConsent(!alreadyConsented);
    setConsentChecked(alreadyConsented);
    setSelectedOutfitId(initialOutfitId ?? outfits[0]?.id ?? '');
    setWornOn(getTodayLocalIsoDate());
    setNote('');
    setPhotoBlob(null);
    setCameraNotice(null);
    setErrorMsg(null);
    setUploadPercent(0);
  }, [initialOutfitId, open, outfits]);

  // Previsualización de la foto original sin recortar ni procesar
  useEffect(() => {
    if (!photoBlob) {
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoBlob);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoBlob]);

  // Limpiar cámara al desmontar
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Focus trap + Escape para accesibilidad
  useEffect(() => {
    if (!open) return;

    const modalEl = modalRef.current;
    const focusTimer = window.setTimeout(() => {
      if (!modalEl) return;
      const firstFocusable = modalEl.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
    }, 10);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        event.preventDefault();
        stopCamera();
        onClose();
        return;
      }

      if (event.key === 'Tab' && modalEl) {
        const focusables = Array.from(
          modalEl.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null);

        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open, saving]);

  const selectedOutfit = useMemo(
    () => outfits.find((o) => o.id === selectedOutfitId) ?? null,
    [outfits, selectedOutfitId],
  );

  if (!open) return null;

  async function startCamera() {
    setCameraNotice(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraNotice(
        'La cámara en vivo no está disponible aquí. Abriendo selector nativo de cámara.',
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
      stopCamera();
      setCameraNotice(
        'No se pudo abrir la cámara en vivo (permiso o iframe). Abriendo selector de archivo.',
      );
      cameraInputRef.current?.click();
    } finally {
      setCameraStarting(false);
    }
  }

  function captureFromVideo() {
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
          stopCamera();
          setPhotoBlob(blob);
          setErrorMsg(null);
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
    stopCamera();
    setPhotoBlob(file);
    setErrorMsg(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;

    if (!selectedOutfit) {
      setErrorMsg('Selecciona un outfit para vincular tu foto.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(wornOn)) {
      setErrorMsg('Elige una fecha válida.');
      return;
    }
    if (!photoBlob) {
      setErrorMsg('Agrega una foto real usando cámara o galería.');
      return;
    }
    if (needsConsent && !consentChecked) {
      setErrorMsg('Debes aceptar el aviso de privacidad antes de subir tu foto.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setUploadPercent(0);

    try {
      setConsent();
      const blobs = await processLookbookPhotoToWebP(photoBlob);
      const entryId = generateFirestoreDocId('lookbook');

      const { photoPath, photoThumbPath } = await uploadLookbookAssets(
        user.uid,
        entryId,
        blobs,
        setUploadPercent,
      );

      await createLookbookEntry(entryId, user.uid, {
        outfitId: selectedOutfit.id,
        outfitSnapshot: {
          name: selectedOutfit.name,
          previewPath: selectedOutfit.previewPath,
          items: selectedOutfit.items.map((item) => ({
            garmentId: item.garmentId,
            layer: item.layer,
            slotKey: item.slotKey,
          })),
        },
        photoPath,
        photoThumbPath,
        wornOn,
        note: note.trim().slice(0, 200) || undefined,
        consentVersion: CONSENT_VERSION,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: lookbookKeys.list(user.uid) }),
        queryClient.invalidateQueries({ queryKey: outfitKeys.all }),
      ]);

      stopCamera();
      onSaved(entryId);
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar la entrada en tu lookbook. Intenta de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4A4458]/45 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="register-look-title"
    >
      <form
        ref={modalRef}
        onSubmit={handleSubmit}
        className="w-full max-w-lg my-auto rounded-3xl bg-white p-5 sm:p-7 shadow-sheet border border-[#E6E0F8] space-y-5 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="register-look-title" className="font-display text-lg font-bold text-[#4A4458]">
              Registrar look real
            </h2>
            <p className="text-xs text-[#6B6580]">
              Diario privado de uso. La foto se guarda tal cual, sin recortes ni IA.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            disabled={saving}
            aria-label="Cerrar registro de look"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-[#6B6580] hover:bg-[#E6E0F8]/50 shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Selector de outfit */}
        {loadingOutfits ? (
          <div className="h-14 rounded-2xl bg-[#E6E0F8]/35 animate-pulse" />
        ) : outfits.length === 0 ? (
          <div className="rounded-2xl bg-[#FFF9DB]/75 border border-[#E6E0F8] p-4 space-y-2 text-sm text-[#4A4458]">
            <p className="font-semibold">Aún no tienes outfits guardados.</p>
            <p className="text-xs text-[#6B6580]">
              Arma primero una combinación en el armador para vincular tu foto del lookbook.
            </p>
            <Link
              to="/outfits/new"
              onClick={onClose}
              className="inline-flex items-center min-h-[40px] px-4 py-1.5 rounded-2xl bg-[#6E61BE] text-white text-xs font-semibold"
            >
              Ir al armador
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor="lookbook-outfit" className="block text-sm font-semibold text-[#4A4458]">
              Outfit usado *
            </label>
            <div className="flex items-center gap-3">
              {selectedOutfit?.previewPath && (
                <div className="w-12 h-14 rounded-xl bg-[#FFFBFD] border border-[#E6E0F8] overflow-hidden shrink-0 p-0.5">
                  <StorageImage
                    path={selectedOutfit.previewPath}
                    alt={selectedOutfit.name}
                    className="w-full h-full object-contain"
                  />
                </div>
              )}
              <select
                id="lookbook-outfit"
                value={selectedOutfitId}
                onChange={(e) => setSelectedOutfitId(e.target.value)}
                disabled={Boolean(initialOutfitId) || saving}
                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458] disabled:opacity-75"
              >
                {outfits.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Fecha de uso */}
        <div>
          <label htmlFor="lookbook-date" className="block text-sm font-semibold text-[#4A4458] mb-1">
            Fecha de uso *
          </label>
          <div className="relative">
            <Calendar
              className="w-4 h-4 text-[#6B6580] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="lookbook-date"
              type="date"
              required
              value={wornOn}
              max={getTodayLocalIsoDate()}
              onChange={(e) => setWornOn(e.target.value)}
              disabled={saving}
              className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458]"
            />
          </div>
        </div>

        {/* Foto real (sin recorte automático ni manipulación de fondo) */}
        <div className="space-y-2.5">
          <span className="block text-sm font-semibold text-[#4A4458]">Foto del look *</span>

          {cameraActive ? (
            <div className="rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] p-3 space-y-3">
              <div className="aspect-[3/4] max-h-72 mx-auto rounded-xl overflow-hidden bg-[#4A4458]/10">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  aria-label="Vista previa de cámara para lookbook"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={captureFromVideo}
                  className="min-h-[44px] px-5 py-2 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold inline-flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" aria-hidden="true" />
                  <span>Tomar foto</span>
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#E6E0F8]/70 text-[#4A4458] text-sm font-semibold"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : photoPreviewUrl ? (
            <div className="rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] p-3 space-y-3">
              <div className="aspect-[3/4] max-h-72 mx-auto rounded-xl overflow-hidden bg-[#E6E0F8]/20">
                <img
                  src={photoPreviewUrl}
                  alt="Vista previa de tu foto tal como se subirá"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPhotoBlob(null)}
                  disabled={saving}
                  className="min-h-[40px] px-4 py-1.5 rounded-2xl bg-[#E6E0F8]/70 hover:bg-[#E6E0F8] text-xs font-semibold text-[#4A4458]"
                >
                  Elegir otra foto
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {cameraNotice && (
                <p
                  role="status"
                  className="rounded-2xl bg-[#D6EAF8]/60 border border-[#D6EAF8] px-3.5 py-2 text-xs text-[#4A4458]"
                >
                  {cameraNotice}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={startCamera}
                  disabled={cameraStarting || saving}
                  className="min-h-[84px] rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white p-3 flex flex-col items-center justify-center gap-1.5 text-center transition-colors disabled:opacity-60"
                >
                  {cameraStarting ? (
                    <RefreshCw className="w-5 h-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Camera className="w-5 h-5" aria-hidden="true" />
                  )}
                  <span className="text-xs font-semibold">Usar cámara</span>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={saving}
                  className="min-h-[84px] rounded-2xl bg-[#E6E0F8]/60 hover:bg-[#E6E0F8] text-[#4A4458] border border-[#E6E0F8] p-3 flex flex-col items-center justify-center gap-1.5 text-center transition-colors"
                >
                  <ImagePlus className="w-5 h-5 text-[#5E51AE]" aria-hidden="true" />
                  <span className="text-xs font-semibold">Subir desde galería</span>
                </button>
              </div>
            </div>
          )}

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="sr-only"
            aria-label="Capturar foto de lookbook desde cámara"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="sr-only"
            aria-label="Seleccionar foto de lookbook desde galería"
          />
        </div>

        {/* Nota opcional */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="lookbook-note" className="text-sm font-semibold text-[#4A4458]">
              Nota (opcional)
            </label>
            <span className="text-xs text-[#6B6580] tabular-nums">{note.length}/200</span>
          </div>
          <textarea
            id="lookbook-note"
            rows={2}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving}
            placeholder="Ej. Cena con amigas, muy cómodo para caminar"
            className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458] resize-none"
          />
        </div>

        {/* Consentimiento explícito obligatorio la primera vez */}
        {needsConsent && (
          <div className="rounded-2xl bg-[#E6E0F8]/35 border border-[#E6E0F8] p-3.5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                disabled={saving}
                className="mt-1 h-5 w-5 rounded border-[#8B7FD4] text-[#6E61BE] shrink-0"
              />
              <span className="text-xs text-[#4A4458] leading-relaxed">
                <ShieldCheck
                  className="w-3.5 h-3.5 inline-block mr-1 text-[#5E51AE] align-text-bottom"
                  aria-hidden="true"
                />
                {getConsentText()}
              </span>
            </label>
          </div>
        )}

        {errorMsg && (
          <div role="alert" className="rounded-2xl bg-[#FADADD]/75 px-4 py-2.5 text-sm text-[#4A4458]">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            disabled={saving}
            className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#E6E0F8]/70 text-sm font-semibold text-[#4A4458]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || outfits.length === 0}
            className="min-h-[44px] px-5 py-2 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold disabled:opacity-55 transition-colors"
          >
            {saving
              ? uploadPercent > 0
                ? `Subiendo (${uploadPercent}%)...`
                : 'Procesando WebP...'
              : 'Guardar look'}
          </button>
        </div>
      </form>
    </div>
  );
}
