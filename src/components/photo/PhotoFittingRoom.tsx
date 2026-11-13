import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bookmark,
  Camera,
  ImageOff,
  Plus,
  RefreshCw,
  Search,
  Shirt,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { PhotoStageCanvas } from '@/src/components/photo/PhotoStageCanvas';
import { PhotoUploadFlow } from '@/src/components/photo/PhotoUploadFlow';
import { StorageImage } from '@/src/components/ui/StorageImage';
import type { AvatarConfig } from '@/src/lib/avatar/types';
import { LAYER_Z_INDEX, resolveGarmentSlot, SLOT_LABELS } from '@/src/lib/outfit/slots';
import { detectPoseAndMaskInPhotoBlob } from '@/src/lib/photo/pose';
import {
  clearPhotoModeConsent,
  deleteLocalPhotoLook,
  deleteLocalUserPhotoAndLooks,
  getLocalUserPhoto,
  listLocalPhotoLooks,
  saveLocalUserPhoto,
  type LocalPhotoLook,
  type LocalUserPhoto,
} from '@/src/lib/photo/storage';
import { useOutfitDraftStore } from '@/src/stores/useOutfitDraftStore';
import type { Garment, GarmentCategory } from '@/src/types/models';

export interface PhotoRoomStateSnapshot {
  localPhoto: LocalUserPhoto | null;
  occlusionEnabled: boolean;
}

interface PhotoFittingRoomProps {
  uid: string;
  avatarConfig: AvatarConfig;
  garments: Garment[];
  garmentsById: Map<string, Garment>;
  isLoadingGarments: boolean;
  localLookVersion?: number;
  onPhotoStateChange?: (state: PhotoRoomStateSnapshot) => void;
}

function LocalBlobImage({ blob, alt, className }: { blob: Blob; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objUrl = URL.createObjectURL(blob);
    setUrl(objUrl);
    return () => {
      URL.revokeObjectURL(objUrl);
    };
  }, [blob]);

  if (!url) return null;
  return <img src={url} alt={alt} className={className} />;
}

const FITTING_CATEGORIES: { value: 'all' | GarmentCategory; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'top', label: 'Tops' },
  { value: 'bottom', label: 'Pantalones' },
  { value: 'dress', label: 'Vestidos' },
  { value: 'outerwear', label: 'Abrigos' },
  { value: 'shoes', label: 'Calzado' },
  { value: 'accessory', label: 'Accesorios' },
];

export function PhotoFittingRoom({
  uid,
  avatarConfig,
  garments,
  garmentsById,
  isLoadingGarments,
  localLookVersion = 0,
  onPhotoStateChange,
}: PhotoFittingRoomProps) {
  const {
    items,
    selectedSlotKey,
    photoTransforms,
    applyGarment,
    removeSlot,
    selectSlot,
    setActivePose,
    recalculateAllPhotoTransforms,
    loadPhotoLook,
  } = useOutfitDraftStore();

  const [localPhoto, setLocalPhoto] = useState<LocalUserPhoto | null>(null);
  const [localLooks, setLocalLooks] = useState<LocalPhotoLook[]>([]);
  const [loadingPhoto, setLoadingPhoto] = useState(true);
  const [detectingPose, setDetectingPose] = useState(false);
  const [occlusionEnabled, setOcclusionEnabled] = useState(true);
  const [poseNotice, setPoseNotice] = useState<string | null>(null);
  const [changingPhoto, setChangingPhoto] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);

  const [category, setCategory] = useState<'all' | GarmentCategory>('all');
  const [search, setSearch] = useState('');
  const [mobileClosetOpen, setMobileClosetOpen] = useState(false);
  const [mobileLookOpen, setMobileLookOpen] = useState(false);
  const [syncedMetadataForPhotoTs, setSyncedMetadataForPhotoTs] = useState<number | null>(null);

  useEffect(() => {
    onPhotoStateChange?.({ localPhoto, occlusionEnabled });
  }, [localPhoto, occlusionEnabled, onPhotoStateChange]);

  const refreshLocalLooks = useCallback(async () => {
    try {
      const list = await listLocalPhotoLooks(uid);
      setLocalLooks(list);
    } catch {
      setLocalLooks([]);
    }
  }, [uid]);

  useEffect(() => {
    void refreshLocalLooks();
  }, [localLookVersion, refreshLocalLooks]);

  const runPoseDetectionForPhoto = useCallback(
    async (record: LocalUserPhoto, autoAlignCurrentItems: boolean) => {
      setDetectingPose(true);
      setPoseNotice(null);
      try {
        const { pose, personMaskBlob } = await detectPoseAndMaskInPhotoBlob(record.blob);
        const updatedRecord: LocalUserPhoto = {
          ...record,
          pose,
          personMaskBlob: personMaskBlob ?? record.personMaskBlob ?? null,
        };
        await saveLocalUserPhoto(updatedRecord);
        setLocalPhoto(updatedRecord);
        setActivePose(pose);

        if (pose.status === 'not-found') {
          setPoseNotice(
            'No se detectó cuerpo completo en la foto. Puedes colocar y ajustar las prendas manualmente.',
          );
        } else if (pose.status === 'partial') {
          setPoseNotice(
            'Pose parcial detectada (no se ven los pies). Puedes ajustar el calce manualmente.',
          );
        } else {
          setPoseNotice(null);
        }

        if (autoAlignCurrentItems && pose.status !== 'not-found') {
          recalculateAllPhotoTransforms(garmentsById, pose);
          setSyncedMetadataForPhotoTs(updatedRecord.updatedAt);
        }
      } catch {
        setActivePose(null);
        setPoseNotice(
          'No se pudo ejecutar la detección de pose local. El ajuste manual sigue activo.',
        );
      } finally {
        setDetectingPose(false);
      }
    },
    [garmentsById, recalculateAllPhotoTransforms, setActivePose],
  );

  useEffect(() => {
    let active = true;
    setLoadingPhoto(true);
    void getLocalUserPhoto(uid)
      .then((record) => {
        if (!active) return;
        setLocalPhoto(record);
        if (!record) {
          setActivePose(null);
          return;
        }
        if (record.pose && record.personMaskBlob) {
          setActivePose(record.pose);
          if (record.pose.status !== 'not-found') {
            recalculateAllPhotoTransforms(garmentsById, record.pose);
            if (garmentsById.size > 0) {
              setSyncedMetadataForPhotoTs(record.updatedAt);
            }
          }
          if (record.pose.status === 'not-found') {
            setPoseNotice(
              'No se detectó cuerpo completo en la foto. Puedes colocar y ajustar las prendas manualmente.',
            );
          } else if (record.pose.status === 'partial') {
            setPoseNotice(
              'Pose parcial detectada (no se ven los pies). Puedes ajustar el calce manualmente.',
            );
          }
        } else {
          // Si viene de Etapa 9/10 sin máscara de segmentación o sin pose, ejecutar detección completa
          void runPoseDetectionForPhoto(record, true);
        }
      })
      .finally(() => {
        if (active) setLoadingPhoto(false);
      });
    return () => {
      active = false;
    };
    // Solo recargar cuando cambia el uid de la sesión
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Si los garments de Firestore terminan de cargar después de leer la foto local,
  // re-alinear una vez con la metadata completa (shorts vs pants vs longsleeve)
  useEffect(() => {
    if (
      !localPhoto?.pose ||
      localPhoto.pose.status === 'not-found' ||
      garmentsById.size === 0 ||
      items.length === 0 ||
      syncedMetadataForPhotoTs === localPhoto.updatedAt
    ) {
      return;
    }
    recalculateAllPhotoTransforms(garmentsById, localPhoto.pose);
    setSyncedMetadataForPhotoTs(localPhoto.updatedAt);
  }, [garmentsById, items.length, localPhoto, recalculateAllPhotoTransforms, syncedMetadataForPhotoTs]);

  useEffect(() => {
    if (!mobileClosetOpen && !mobileLookOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileClosetOpen(false);
        setMobileLookOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileClosetOpen, mobileLookOpen]);

  const activeGarmentIds = useMemo(
    () => new Set(items.map((item) => item.garmentId)),
    [items],
  );

  const orderedLookItems = useMemo(() => {
    return [...items].sort(
      (a, b) => LAYER_Z_INDEX[b.layer] - LAYER_Z_INDEX[a.layer],
    );
  }, [items]);

  const filteredGarments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return garments.filter((g) => {
      if (category !== 'all' && g.category !== category) return false;
      if (
        q &&
        !`${g.name} ${g.brand ?? ''} ${g.tags.join(' ')}`.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [category, garments, search]);

  async function handleConfirmDeletePhoto() {
    setDeletingPhoto(true);
    try {
      await deleteLocalUserPhotoAndLooks(uid);
      clearPhotoModeConsent(uid);
      setLocalPhoto(null);
      setLocalLooks([]);
      setActivePose(null);
      setPoseNotice(null);
      setChangingPhoto(false);
      setConfirmDeleteOpen(false);
      setMobileLookOpen(false);
    } finally {
      setDeletingPhoto(false);
    }
  }

  async function handleDeleteSingleLocalLook(id: string) {
    await deleteLocalPhotoLook(id);
    await refreshLocalLooks();
  }

  const currentPose = localPhoto?.pose ?? null;
  const hasDetectedPose = Boolean(currentPose && currentPose.status !== 'not-found');

  const lookPanelContent = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold text-[#4A4458]">
          Tu look ({items.length})
        </h3>
        <span className="text-[11px] font-medium text-[#6B6580] tabular-nums">
          {items.length} {items.length === 1 ? 'pieza' : 'piezas'}
        </span>
      </div>

      {orderedLookItems.length === 0 ? (
        <p className="rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] px-3 py-4 text-xs text-[#6B6580] text-center">
          Todavía no agregas prendas. Elige una del closet para probarla sobre tu foto.
        </p>
      ) : (
        <ul className="space-y-2">
          {orderedLookItems.map((item) => {
            const g = garmentsById.get(item.garmentId);
            const isSelected = selectedSlotKey === item.slotKey;
            return (
              <li
                key={item.slotKey}
                className={`flex items-center gap-2.5 p-2 rounded-2xl border transition-colors ${
                  isSelected
                    ? 'bg-[#E6E0F8]/70 border-[#6E61BE]'
                    : 'bg-[#FFFBFD] border-[#E6E0F8]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    selectSlot(item.slotKey);
                    setMobileLookOpen(false);
                  }}
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left min-h-[40px]"
                >
                  <div className="w-10 h-10 rounded-xl bg-white p-1 border border-[#E6E0F8]/70 shrink-0 flex items-center justify-center overflow-hidden">
                    {g && (
                      <StorageImage
                        path={g.imageThumbPath || g.cutoutPath}
                        alt={g.name}
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#4A4458] truncate">
                      {g?.name ?? 'Prenda'}
                    </p>
                    <p className="text-[11px] text-[#6B6580] truncate">
                      {SLOT_LABELS[item.slotKey]}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => removeSlot(item.slotKey)}
                  aria-label={`Quitar ${g?.name ?? SLOT_LABELS[item.slotKey]}`}
                  className="min-h-[36px] min-w-[36px] rounded-xl text-[#6B6580] hover:bg-[#FADADD]/60 hover:text-[#4A4458] inline-flex items-center justify-center shrink-0"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Auto-ajuste por pose y gestión de la foto local */}
      <div className="pt-2 border-t border-[#E6E0F8] space-y-2">
        {localPhoto && hasDetectedPose && items.length > 0 && (
          <button
            type="button"
            onClick={() => {
              recalculateAllPhotoTransforms(garmentsById, currentPose);
              setMobileLookOpen(false);
            }}
            disabled={detectingPose}
            className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#D5F5E3]/70 hover:bg-[#D5F5E3] text-[#4A4458] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Wand2 className="w-4 h-4" aria-hidden="true" />
            <span>Auto-ajustar por pose</span>
          </button>
        )}

        {localPhoto && (
          <button
            type="button"
            onClick={() => void runPoseDetectionForPhoto(localPhoto, true)}
            disabled={detectingPose}
            className="w-full min-h-[40px] px-3.5 py-2 rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] hover:bg-[#E6E0F8]/50 text-[#4A4458] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${detectingPose ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{detectingPose ? 'Detectando pose...' : 'Re-detectar pose'}</span>
          </button>
        )}

        {localPhoto && (
          <button
            type="button"
            onClick={() => {
              setChangingPhoto(true);
              setConfirmDeleteOpen(false);
              setMobileLookOpen(false);
            }}
            className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#E6E0F8]/65 hover:bg-[#E6E0F8] text-[#4A4458] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Camera className="w-4 h-4" aria-hidden="true" />
            <span>Cambiar foto</span>
          </button>
        )}

        {localPhoto && !confirmDeleteOpen && (
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#FADADD]/60 hover:bg-[#FADADD] text-[#4A4458] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            <span>Borrar mi foto</span>
          </button>
        )}

        {localPhoto && confirmDeleteOpen && (
          <div className="rounded-2xl bg-[#FADADD]/45 border border-[#FADADD] p-3 space-y-2.5">
            <p className="text-xs text-[#4A4458] leading-snug">
              Se eliminará tu foto y los looks guardados localmente en este dispositivo.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={deletingPhoto}
                className="flex-1 min-h-[38px] px-3 rounded-xl bg-white border border-[#E6E0F8] text-xs font-semibold text-[#4A4458]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDeletePhoto()}
                disabled={deletingPhoto}
                className="flex-1 min-h-[38px] px-3 rounded-xl bg-[#D96B78] text-white text-xs font-semibold"
              >
                {deletingPhoto ? 'Borrando...' : 'Sí, borrar'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Looks guardados localmente en este dispositivo */}
      {localLooks.length > 0 && (
        <div className="pt-3 border-t border-[#E6E0F8] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-display text-xs font-bold text-[#4A4458] flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5 text-[#6E61BE]" aria-hidden="true" />
              <span>En este dispositivo ({localLooks.length})</span>
            </h4>
          </div>
          <ul className="space-y-2 max-h-[210px] overflow-y-auto pr-0.5">
            {localLooks.map((look) => (
              <li
                key={look.id}
                className="flex items-center gap-2 p-1.5 rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8]"
              >
                <button
                  type="button"
                  onClick={() => {
                    loadPhotoLook(look.items, look.photoTransforms);
                    setMobileLookOpen(false);
                  }}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left min-h-[40px]"
                >
                  <div className="w-10 h-12 rounded-xl bg-white border border-[#E6E0F8]/70 overflow-hidden shrink-0">
                    <LocalBlobImage
                      blob={look.blob}
                      alt={look.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#4A4458] truncate">{look.name}</p>
                    <p className="text-[10px] text-[#6B6580] tabular-nums">
                      {look.items.length} {look.items.length === 1 ? 'prenda' : 'prendas'}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteSingleLocalLook(look.id)}
                  aria-label={`Borrar look local ${look.name}`}
                  className="min-h-[34px] min-w-[34px] rounded-xl text-[#6B6580] hover:bg-[#FADADD]/60 hover:text-[#4A4458] inline-flex items-center justify-center shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  const closetGridContent = (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="w-4 h-4 text-[#6B6580] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en mi closet..."
          aria-label="Buscar prendas para probar en tu foto"
          className="w-full min-h-[42px] pl-9 pr-3 py-1.5 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-xs sm:text-sm text-[#4A4458]"
        />
      </div>

      {isLoadingGarments ? (
        <div className="grid grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="aspect-square rounded-2xl bg-[#E6E0F8]/35 animate-pulse" />
          ))}
        </div>
      ) : garments.length === 0 ? (
        <div className="rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] p-5 text-center space-y-3">
          <p className="text-sm text-[#6B6580]">Aún no tienes prendas en tu closet.</p>
          <Link
            to="/garments/new"
            className="inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-2xl bg-[#6E61BE] text-white text-xs font-semibold"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Agregar prenda</span>
          </Link>
        </div>
      ) : filteredGarments.length === 0 ? (
        <div className="rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] p-5 text-center space-y-1.5">
          <ImageOff className="w-5 h-5 text-[#6B6580] mx-auto" aria-hidden="true" />
          <p className="text-xs text-[#6B6580]">No hay prendas en esta categoría o búsqueda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-[480px] overflow-y-auto pr-1">
          {filteredGarments.map((garment) => {
            const isWorn = activeGarmentIds.has(garment.id);
            const { slotKey } = resolveGarmentSlot(garment);
            return (
              <button
                key={garment.id}
                type="button"
                onClick={() => {
                  applyGarment(garment, avatarConfig);
                  setMobileClosetOpen(false);
                }}
                aria-pressed={isWorn}
                aria-label={`Probar ${garment.name} en ${SLOT_LABELS[slotKey]}`}
                className={`rounded-2xl p-2 border text-left transition-all flex flex-col gap-1.5 ${
                  isWorn
                    ? 'bg-[#E6E0F8]/70 border-[#6E61BE] shadow-sm'
                    : 'bg-[#FFFBFD] border-[#E6E0F8] hover:bg-[#E6E0F8]/30'
                }`}
              >
                <div className="aspect-square w-full rounded-xl bg-white p-1.5 overflow-hidden flex items-center justify-center">
                  <StorageImage
                    path={garment.imageThumbPath || garment.cutoutPath}
                    alt={`${garment.name} (${garment.category})`}
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="text-[11px] font-semibold text-[#4A4458] truncate w-full">
                  {garment.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const centerStage = loadingPhoto ? (
    <div className="rounded-3xl bg-white p-6 border border-[#E6E0F8] shadow-soft h-[62dvh] min-h-[380px] max-h-[600px] lg:h-[520px] flex flex-col items-center justify-center gap-3">
      <div className="h-9 w-9 rounded-full border-2 border-[#E6E0F8] border-t-[#6E61BE] animate-spin" />
      <span className="text-xs font-medium text-[#6B6580]">
        Cargando foto del dispositivo...
      </span>
    </div>
  ) : !localPhoto || changingPhoto ? (
    <PhotoUploadFlow
      uid={uid}
      hasExistingPhoto={Boolean(localPhoto)}
      onPhotoSaved={(saved) => {
        setLocalPhoto(saved);
        setChangingPhoto(false);
        void runPoseDetectionForPhoto(saved, true);
      }}
      onCancel={localPhoto ? () => setChangingPhoto(false) : undefined}
    />
  ) : (
    <div className="space-y-2">
      <PhotoStageCanvas
        photo={localPhoto}
        items={items}
        garmentsById={garmentsById}
        selectedSlotKey={selectedSlotKey}
        photoTransforms={photoTransforms}
        pose={currentPose}
        detectingPose={detectingPose}
        occlusionEnabled={occlusionEnabled}
        onToggleOcclusion={() => setOcclusionEnabled((v) => !v)}
      />

      {poseNotice && (
        <p
          role="status"
          className="rounded-2xl bg-[#FFF2DF] border border-[#F3D8B1] px-3.5 py-2 text-xs text-[#4A4458] text-center"
        >
          {poseNotice}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Móvil: chips horizontales de categorías arriba */}
      <div
        className="lg:hidden flex items-center gap-1.5 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Categorías del probador"
      >
        {FITTING_CATEGORIES.map((cat) => {
          const active = category === cat.value;
          return (
            <button
              key={cat.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setCategory(cat.value)}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-2xl text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors ${
                active
                  ? 'bg-[#6E61BE] border-[#6E61BE] text-white'
                  : 'bg-white border-[#E6E0F8] text-[#4A4458]'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Desktop 3 columnas (categorías + Tu look | foto central | cuadrícula del closet) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <aside
          aria-label="Categorías y piezas del look"
          className="hidden lg:block lg:col-span-3 rounded-3xl bg-white p-4 border border-[#E6E0F8] shadow-soft space-y-5"
        >
          <div className="space-y-2">
            <h2 className="font-display text-sm font-bold text-[#4A4458]">Categorías</h2>
            <div className="space-y-1">
              {FITTING_CATEGORIES.map((cat) => {
                const active = category === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    aria-pressed={active}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold text-left transition-colors ${
                      active
                        ? 'bg-[#6E61BE] text-white'
                        : 'bg-[#FFFBFD] text-[#4A4458] hover:bg-[#E6E0F8]/50'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-[#E6E0F8]">{lookPanelContent}</div>
        </aside>

        {/* Columna central: escenario de foto */}
        <section aria-label="Escenario del probador en foto" className="lg:col-span-5 space-y-2">
          {centerStage}
          <p className="text-[11px] text-[#6B6580] text-center">
            Vista previa 2D aproximada en tu dispositivo. No genera imágenes con IA ni promete ajuste exacto.
          </p>
        </section>

        {/* Columna derecha desktop: cuadrícula del closet filtrada + búsqueda */}
        <aside
          aria-label="Prendas filtradas del closet"
          className="hidden lg:block lg:col-span-4 rounded-3xl bg-white p-4 border border-[#E6E0F8] shadow-soft space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold text-[#4A4458]">Tu closet</h2>
            <span className="text-xs text-[#6B6580] tabular-nums">
              {filteredGarments.length} {filteredGarments.length === 1 ? 'prenda' : 'prendas'}
            </span>
          </div>
          {closetGridContent}
        </aside>
      </div>

      {/* Móvil: botones inferiores para abrir Sheet de Closet y Sheet de Tu look */}
      <div className="lg:hidden grid grid-cols-2 gap-2.5 pt-1">
        <button
          type="button"
          onClick={() => {
            setMobileLookOpen(false);
            setMobileClosetOpen(true);
          }}
          className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-[#6E61BE] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-soft whitespace-nowrap shrink-0"
        >
          <Shirt className="w-4 h-4" aria-hidden="true" />
          <span>Elegir ropa</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMobileClosetOpen(false);
            setMobileLookOpen(true);
          }}
          className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-white border border-[#E6E0F8] text-[#4A4458] text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-soft whitespace-nowrap shrink-0"
        >
          <Sparkles className="w-4 h-4 text-[#6E61BE]" aria-hidden="true" />
          <span className="tabular-nums">Tu look ({items.length})</span>
        </button>
      </div>

      {/* Móvil Sheet 1: Closet */}
      {mobileClosetOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end bg-[#4A4458]/35 backdrop-blur-[2px]"
          onClick={() => setMobileClosetOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Closet del probador"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-h-[82dvh] overflow-y-auto rounded-t-3xl bg-white p-5 border-t border-[#E6E0F8] shadow-sheet space-y-4"
          >
            <div className="w-10 h-1 rounded-full bg-[#E6E0F8] mx-auto" aria-hidden="true" />
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-[#4A4458]">
                Elegir prendas ({filteredGarments.length})
              </h2>
              <button
                type="button"
                onClick={() => setMobileClosetOpen(false)}
                aria-label="Cerrar selector de ropa"
                className="min-h-[40px] min-w-[40px] rounded-xl bg-[#FFFBFD] border border-[#E6E0F8] text-[#4A4458] inline-flex items-center justify-center"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            {closetGridContent}
          </div>
        </div>
      )}

      {/* Móvil Sheet 2: Tu look + acciones de foto */}
      {mobileLookOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end bg-[#4A4458]/35 backdrop-blur-[2px]"
          onClick={() => setMobileLookOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Tu look actual"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-h-[80dvh] overflow-y-auto rounded-t-3xl bg-white p-5 border-t border-[#E6E0F8] shadow-sheet space-y-4"
          >
            <div className="w-10 h-1 rounded-full bg-[#E6E0F8] mx-auto" aria-hidden="true" />
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-[#4A4458]">
                Piezas del outfit
              </h2>
              <button
                type="button"
                onClick={() => setMobileLookOpen(false)}
                aria-label="Cerrar panel Tu look"
                className="min-h-[40px] min-w-[40px] rounded-xl bg-[#FFFBFD] border border-[#E6E0F8] text-[#4A4458] inline-flex items-center justify-center"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            {lookPanelContent}
          </div>
        </div>
      )}
    </div>
  );
}

export default PhotoFittingRoom;
