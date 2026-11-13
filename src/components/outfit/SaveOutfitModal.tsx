import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BookmarkCheck, CloudUpload, HardDrive, ShieldAlert, X } from 'lucide-react';
import { createOutfit, generateFirestoreDocId } from '@/src/firebase/firestore';
import { uploadOutfitPreview } from '@/src/firebase/storage';
import type { AvatarConfig } from '@/src/lib/avatar/types';
import { renderOutfitPreviewBlob } from '@/src/lib/outfit/preview-renderer';
import {
  saveLocalPhotoLook,
  type LocalUserPhoto,
  type PhotoItemTransform,
} from '@/src/lib/photo/storage';
import { outfitKeys } from '@/src/queries/outfits';
import { useAuthStore } from '@/src/stores/useAuthStore';
import type { Garment, OutfitCollection, OutfitItem, SlotKey } from '@/src/types/models';

export interface PhotoModeSaveContext {
  localPhoto: LocalUserPhoto | null;
  photoTransforms: Partial<Record<SlotKey, PhotoItemTransform>>;
  occlusionEnabled: boolean;
}

interface SaveOutfitModalProps {
  open: boolean;
  avatarConfig: AvatarConfig;
  items: OutfitItem[];
  garmentsById: Map<string, Garment>;
  capturedPreviewBlob?: Blob | null;
  photoModeContext?: PhotoModeSaveContext;
  onClose: () => void;
  onSaved: (result?: { savedLocallyOnly?: boolean }) => void;
}

const COLLECTION_OPTIONS: { value: OutfitCollection; label: string }[] = [
  { value: 'casual', label: 'Casual' },
  { value: 'work', label: 'Trabajo' },
  { value: 'party', label: 'Fiesta' },
  { value: 'travel', label: 'Viaje' },
  { value: 'custom', label: 'Custom' },
];

export function SaveOutfitModal({
  open,
  avatarConfig,
  items,
  garmentsById,
  capturedPreviewBlob,
  photoModeContext,
  onClose,
  onSaved,
}: SaveOutfitModalProps) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const hasPhotoContext = Boolean(photoModeContext?.localPhoto);

  const [name, setName] = useState('');
  const [occasion, setOccasion] = useState('');
  const [collection, setCollection] = useState<OutfitCollection>('casual');
  const [saveMode, setSaveMode] = useState<'local-only' | 'local-and-cloud'>('local-only');
  const [cloudPreviewSource, setCloudPreviewSource] = useState<'mannequin' | 'body-photo'>('mannequin');
  const [cloudBodyConsentChecked, setCloudBodyConsentChecked] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Restablecer siempre a guardado LOCAL por defecto al abrir en modo Foto
    setSaveMode('local-only');
    setCloudPreviewSource('mannequin');
    setCloudBodyConsentChecked(false);
    setErrorMsg(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open, saving]);

  if (!open) return null;

  const needsBodyCloudConsent =
    hasPhotoContext &&
    saveMode === 'local-and-cloud' &&
    cloudPreviewSource === 'body-photo';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      setErrorMsg('Escribe un nombre para guardar este outfit.');
      return;
    }
    if (needsBodyCloudConsent && !cloudBodyConsentChecked) {
      setErrorMsg(
        'Confirma explícitamente que deseas subir la imagen con tu cuerpo a tu cuenta en la nube.',
      );
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const cleanName = name.trim().slice(0, 80);

      // En Modo Foto siempre generamos y guardamos el look localmente en IndexedDB
      let renderedPhotoLook: { blob: Blob; width: number; height: number } | null = null;
      if (hasPhotoContext && photoModeContext?.localPhoto) {
        const { renderPhotoCompositeBlob } = await import('@/src/lib/photo/composite');
        renderedPhotoLook = await renderPhotoCompositeBlob({
          photo: photoModeContext.localPhoto,
          items,
          garmentsById,
          photoTransforms: photoModeContext.photoTransforms,
          occlusionEnabled: photoModeContext.occlusionEnabled,
        });

        await saveLocalPhotoLook({
          id: `look_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          uid: user.uid,
          name: cleanName,
          blob: renderedPhotoLook.blob,
          width: renderedPhotoLook.width,
          height: renderedPhotoLook.height,
          items,
          photoTransforms: photoModeContext.photoTransforms,
          createdAt: Date.now(),
        });

        // Por defecto en Modo Foto, el look se queda SOLO en el dispositivo
        if (saveMode === 'local-only') {
          setName('');
          setOccasion('');
          onSaved({ savedLocallyOnly: true });
          return;
        }
      }

      const outfitId = generateFirestoreDocId('outfits');
      let previewPath: string | undefined;

      try {
        const previewBlob =
          needsBodyCloudConsent && cloudBodyConsentChecked && renderedPhotoLook
            ? renderedPhotoLook.blob
            : capturedPreviewBlob ??
              (await renderOutfitPreviewBlob(avatarConfig, items, garmentsById));
        previewPath = await uploadOutfitPreview(user.uid, outfitId, previewBlob);
      } catch (previewError) {
        console.warn('No se pudo subir la vista previa del outfit:', previewError);
      }

      const itemsToPersist: OutfitItem[] =
        hasPhotoContext && photoModeContext
          ? items.map((item) => {
              const pt = photoModeContext.photoTransforms[item.slotKey];
              if (!pt) return item;
              return {
                ...item,
                photoTransform: {
                  cx: pt.cx,
                  cy: pt.cy,
                  scale: pt.scale,
                  rotation: pt.rotation,
                  flipX: pt.flipX,
                },
              };
            })
          : items;

      await createOutfit(outfitId, user.uid, {
        name: cleanName,
        occasion: occasion.trim().slice(0, 50) || undefined,
        collection,
        items: itemsToPersist,
        previewPath,
      });

      await queryClient.invalidateQueries({ queryKey: outfitKeys.list(user.uid) });
      setName('');
      setOccasion('');
      onSaved({ savedLocallyOnly: false });
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : 'No se pudo guardar el outfit. Intenta de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4A4458]/40 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-outfit-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-7 shadow-sheet border border-[#E6E0F8] space-y-5 my-auto"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="save-outfit-title" className="font-display text-lg font-bold text-[#4A4458]">
            {hasPhotoContext ? 'Guardar look' : 'Guardar outfit'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar diálogo"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[#6B6580] hover:bg-[#E6E0F8]/50"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div>
          <label htmlFor="outfit-name" className="block text-sm font-semibold text-[#4A4458] mb-1">
            Nombre del outfit *
          </label>
          <input
            id="outfit-name"
            type="text"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Look fresco viernes"
            className="w-full min-h-[44px] px-4 py-2 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458]"
          />
        </div>

        {(!hasPhotoContext || saveMode === 'local-and-cloud') && (
          <>
            <div>
              <label htmlFor="outfit-occasion" className="block text-sm font-semibold text-[#4A4458] mb-1">
                Ocasión (opcional)
              </label>
              <input
                id="outfit-occasion"
                type="text"
                maxLength={50}
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
                placeholder="Ej. Junta con clientes, Brunch"
                className="w-full min-h-[44px] px-4 py-2 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458]"
              />
            </div>

            <div>
              <span className="block text-sm font-semibold text-[#4A4458] mb-2">Colección *</span>
              <div className="flex flex-wrap gap-2">
                {COLLECTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCollection(opt.value)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-2xl text-xs font-semibold border transition-colors ${
                      collection === opt.value
                        ? 'bg-[#E6E0F8] border-[#8B7FD4] text-[#4A4458]'
                        : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#6B6580]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {hasPhotoContext && (
          <div className="space-y-3 rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] p-3.5">
            <span className="block text-xs font-bold text-[#4A4458]">
              ¿Dónde guardar este look con tu foto?
            </span>

            <div className="space-y-2">
              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-2xl border cursor-pointer transition-colors ${
                  saveMode === 'local-only'
                    ? 'bg-[#D5F5E3]/45 border-[#7AC7A2]'
                    : 'bg-white border-[#E6E0F8]'
                }`}
              >
                <input
                  type="radio"
                  name="photo-save-mode"
                  checked={saveMode === 'local-only'}
                  onChange={() => {
                    setSaveMode('local-only');
                    setCloudBodyConsentChecked(false);
                  }}
                  className="mt-0.5 accent-[#6E61BE]"
                />
                <span className="text-xs text-[#4A4458] space-y-0.5">
                  <span className="font-semibold flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-[#3B875E]" aria-hidden="true" />
                    <span>Solo en este dispositivo (por defecto)</span>
                  </span>
                  <span className="block text-[11px] text-[#6B6580]">
                    Guarda la imagen con tu cuerpo únicamente en este navegador. No sube nada a la nube.
                  </span>
                </span>
              </label>

              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-2xl border cursor-pointer transition-colors ${
                  saveMode === 'local-and-cloud'
                    ? 'bg-[#E6E0F8]/55 border-[#8B7FD4]'
                    : 'bg-white border-[#E6E0F8]'
                }`}
              >
                <input
                  type="radio"
                  name="photo-save-mode"
                  checked={saveMode === 'local-and-cloud'}
                  onChange={() => setSaveMode('local-and-cloud')}
                  className="mt-0.5 accent-[#6E61BE]"
                />
                <span className="text-xs text-[#4A4458] space-y-0.5">
                  <span className="font-semibold flex items-center gap-1.5">
                    <CloudUpload className="w-3.5 h-3.5 text-[#6E61BE]" aria-hidden="true" />
                    <span>Guardar también en mis Outfits (nube)</span>
                  </span>
                  <span className="block text-[11px] text-[#6B6580]">
                    Guarda el look en este dispositivo y sincroniza el outfit en tu cuenta.
                  </span>
                </span>
              </label>
            </div>

            {saveMode === 'local-and-cloud' && (
              <div className="pt-2 border-t border-[#E6E0F8] space-y-2.5">
                <span className="block text-[11px] font-semibold text-[#4A4458]">
                  Portada para la nube (`previewPath`):
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCloudPreviewSource('mannequin');
                      setCloudBodyConsentChecked(false);
                    }}
                    className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-colors ${
                      cloudPreviewSource === 'mannequin'
                        ? 'bg-[#6E61BE] border-[#6E61BE] text-white'
                        : 'bg-white border-[#E6E0F8] text-[#4A4458]'
                    }`}
                  >
                    Maniquí 2D (sin mi foto)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCloudPreviewSource('body-photo')}
                    className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-colors ${
                      cloudPreviewSource === 'body-photo'
                        ? 'bg-[#6E61BE] border-[#6E61BE] text-white'
                        : 'bg-white border-[#E6E0F8] text-[#4A4458]'
                    }`}
                  >
                    Imagen con mi foto
                  </button>
                </div>

                {cloudPreviewSource === 'body-photo' && (
                  <label className="flex items-start gap-2.5 rounded-2xl bg-[#FFF2DF] border border-[#F3D8B1] p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cloudBodyConsentChecked}
                      onChange={(e) => setCloudBodyConsentChecked(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#6E61BE] shrink-0"
                    />
                    <span className="text-[11px] text-[#4A4458] space-y-1 leading-snug">
                      <span className="font-bold flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-[#B45309] shrink-0" aria-hidden="true" />
                        <span>Esta imagen contiene tu cuerpo</span>
                      </span>
                      <span className="block text-[#6B6580]">
                        Confirmo explícitamente que quiero subir esta vista previa con mi cuerpo a Firebase Storage privado en mi cuenta.
                      </span>
                    </span>
                  </label>
                )}
              </div>
            )}
          </div>
        )}

        {capturedPreviewBlob && !hasPhotoContext && (
          <p className="rounded-2xl bg-[#D5F5E3]/55 border border-[#D5F5E3] px-3.5 py-2 text-xs font-medium text-[#4A4458]">
            Se guardará usando la captura 3D que tomaste en el visor.
          </p>
        )}

        {errorMsg && (
          <div role="alert" className="rounded-2xl bg-[#FADADD]/70 px-4 py-2.5 text-sm">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#E6E0F8]/70 text-sm font-semibold text-[#4A4458]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || (needsBodyCloudConsent && !cloudBodyConsentChecked)}
            className="min-h-[44px] px-5 py-2 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          >
            <BookmarkCheck className="w-4 h-4" aria-hidden="true" />
            <span>
              {saving
                ? 'Guardando...'
                : hasPhotoContext && saveMode === 'local-only'
                  ? 'Guardar en dispositivo'
                  : 'Guardar outfit'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
