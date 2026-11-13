import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BookmarkCheck, Box, Camera, Layers, RotateCcw, X } from 'lucide-react';
import { ClosetDrawer } from '@/src/components/outfit/ClosetDrawer';
import { OutfitCanvasStage } from '@/src/components/outfit/OutfitCanvasStage';
import type { PhotoRoomStateSnapshot } from '@/src/components/photo/PhotoFittingRoom';
import { SaveOutfitModal } from '@/src/components/outfit/SaveOutfitModal';
import { GarmentViewerModal } from '@/src/components/three/GarmentViewerModal';
import { updateUserAvatarConfig } from '@/src/firebase/firestore';
import { normalizeAvatarConfig } from '@/src/lib/avatar/mapping';
import {
  AVATAR_RENDERERS,
  DEFAULT_AVATAR_CONFIG,
  type AvatarRenderer,
} from '@/src/lib/avatar/types';
import { ALL_SLOTS, SLOT_LABELS } from '@/src/lib/outfit/slots';
import { useGarmentsQuery } from '@/src/queries/garments';
import { useAuthStore } from '@/src/stores/useAuthStore';
import { useOutfitDraftStore } from '@/src/stores/useOutfitDraftStore';
import type { Garment } from '@/src/types/models';

const LazyOutfit3DViewer = lazy(() => import('@/src/components/three/Outfit3DViewer'));
const LazyPhotoFittingRoom = lazy(() => import('@/src/components/photo/PhotoFittingRoom'));

function getRendererSubtitle(mode: AvatarRenderer): string {
  switch (mode) {
    case 'photo':
      return 'Vista previa con superposición 2D sobre tu foto local. Nunca sale de este dispositivo.';
    case '3d':
      return 'Vista 3D aproximada sobre tu avatar paramétrico. Cambia a 2D para ajustar capas y accesorios.';
    case '2d':
      return 'Toca una prenda para colocarla por capas sobre tu maniquí 2D.';
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

const RENDERER_LABELS: Record<AvatarRenderer, string> = {
  photo: 'Foto',
  '2d': '2D',
  '3d': '3D',
};

const TOGGLE_ORDER: AvatarRenderer[] = ['photo', '2d', '3d'];

export function NewOutfitPage() {
  const { user, profile, setAvatarConfig } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const avatarConfig = useMemo(
    () => (profile?.avatarConfig ? normalizeAvatarConfig(profile.avatarConfig) : DEFAULT_AVATAR_CONFIG),
    [profile?.avatarConfig],
  );

  const [rendererMode, setRendererMode] = useState<AvatarRenderer>(avatarConfig.renderer);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [localSavedNotice, setLocalSavedNotice] = useState<string | null>(null);
  const [captured3DBlob, setCaptured3DBlob] = useState<Blob | null>(null);
  const [photoRoomState, setPhotoRoomState] = useState<PhotoRoomStateSnapshot>({
    localPhoto: null,
    occlusionEnabled: true,
  });
  const [localLookVersion, setLocalLookVersion] = useState(0);

  useEffect(() => {
    setRendererMode(avatarConfig.renderer);
  }, [avatarConfig.renderer]);

  const { data: garments = [], isLoading } = useGarmentsQuery(user?.uid);
  const {
    items,
    photoTransforms,
    applyGarment,
    selectSlot,
    selectedSlotKey,
    clearDraft,
  } = useOutfitDraftStore();

  const [saveOpen, setSaveOpen] = useState(false);
  const [viewerGarment, setViewerGarment] = useState<Garment | null>(null);

  const garmentsById = useMemo(() => {
    const map = new Map<string, Garment>();
    for (const g of garments) {
      map.set(g.id, g);
    }
    return map;
  }, [garments]);

  // Invalidar captura 3D previa si cambian las prendas del borrador
  useEffect(() => {
    setCaptured3DBlob(null);
  }, [items]);

  // Si llega ?garmentId= desde el detalle de prenda, aplicarla automáticamente una vez
  useEffect(() => {
    const initialId = searchParams.get('garmentId');
    if (!initialId || garments.length === 0) return;
    const found = garmentsById.get(initialId);
    if (found) {
      applyGarment(found, avatarConfig);
      setSearchParams({}, { replace: true });
    }
  }, [applyGarment, avatarConfig, garments.length, garmentsById, searchParams, setSearchParams]);

  const handleSelectRenderer = useCallback(
    (nextRenderer: AvatarRenderer) => {
      if (nextRenderer === rendererMode) return;
      setRendererMode(nextRenderer);
      if (nextRenderer !== '2d') {
        setFallbackNotice(null);
      }

      const updatedConfig = { ...avatarConfig, renderer: nextRenderer };
      if (profile) {
        setAvatarConfig(updatedConfig);
      }
      if (user) {
        void updateUserAvatarConfig(user.uid, updatedConfig).catch(() => {
          // Mantener modo local si el usuario está offline; se sincronizará al guardar avatar
        });
      }
    },
    [avatarConfig, profile, rendererMode, setAvatarConfig, user],
  );

  const handleFallbackTo2D = useCallback(
    (reason: string) => {
      setFallbackNotice(reason);
      setRendererMode('2d');
      const updatedConfig = { ...avatarConfig, renderer: '2d' as const };
      if (profile) {
        setAvatarConfig(updatedConfig);
      }
      if (user) {
        void updateUserAvatarConfig(user.uid, updatedConfig).catch(() => {
          // Silencioso en fallback automático
        });
      }
    },
    [avatarConfig, profile, setAvatarConfig, user],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#4A4458]">Armador de outfits</h1>
          <p className="text-sm text-[#6B6580]">{getRendererSubtitle(rendererMode)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Toggle Foto | 2D | 3D con persistencia en avatarConfig.renderer */}
          <div
            className="inline-flex items-center rounded-2xl bg-[#E6E0F8]/60 p-1 border border-[#E6E0F8]"
            role="group"
            aria-label="Modo de visualización del armador"
          >
            {TOGGLE_ORDER.filter((mode) => AVATAR_RENDERERS.includes(mode)).map((mode) => {
              const active = rendererMode === mode;
              const renderIcon = () => {
                switch (mode) {
                  case 'photo':
                    return <Camera className="w-3.5 h-3.5" aria-hidden="true" />;
                  case '2d':
                    return <Layers className="w-3.5 h-3.5" aria-hidden="true" />;
                  case '3d':
                    return <Box className="w-3.5 h-3.5" aria-hidden="true" />;
                  default: {
                    const _exhaustive: never = mode;
                    return _exhaustive;
                  }
                }
              };
              const activeClass =
                mode === '2d'
                  ? 'bg-white text-[#4A4458] shadow-sm'
                  : 'bg-[#6E61BE] text-white shadow-sm';

              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleSelectRenderer(mode)}
                  aria-pressed={active}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    active ? activeClass : 'text-[#6B6580] hover:text-[#4A4458]'
                  }`}
                >
                  {renderIcon()}
                  <span>{RENDERER_LABELS[mode]}</span>
                </button>
              );
            })}
          </div>

          {items.length > 0 && (
            <button
              type="button"
              onClick={clearDraft}
              className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#E6E0F8]/65 hover:bg-[#E6E0F8] text-[#4A4458] text-sm font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>Limpiar</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            disabled={items.length === 0}
            className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-45"
          >
            <BookmarkCheck className="w-4 h-4" aria-hidden="true" />
            <span>Guardar outfit</span>
          </button>
        </div>
      </div>

      {fallbackNotice && (
        <div
          role="status"
          className="rounded-2xl bg-[#FFF2DF] border border-[#F3D8B1] px-4 py-3 text-sm text-[#4A4458] flex items-center justify-between gap-3"
        >
          <span>{fallbackNotice}</span>
          <button
            type="button"
            onClick={() => setFallbackNotice(null)}
            aria-label="Cerrar aviso"
            className="w-8 h-8 rounded-xl inline-flex items-center justify-center hover:bg-white/60 shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {localSavedNotice && (
        <div
          role="status"
          className="rounded-2xl bg-[#D5F5E3]/70 border border-[#7AC7A2]/60 px-4 py-3 text-sm text-[#4A4458] flex items-center justify-between gap-3"
        >
          <span>{localSavedNotice}</span>
          <button
            type="button"
            onClick={() => setLocalSavedNotice(null)}
            aria-label="Cerrar confirmación"
            className="w-8 h-8 rounded-xl inline-flex items-center justify-center hover:bg-white/60 shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {(() => {
        switch (rendererMode) {
          case 'photo':
            return user ? (
              <Suspense
                fallback={
                  <div className="rounded-3xl bg-white p-6 border border-[#E6E0F8] shadow-soft h-[460px] flex flex-col items-center justify-center gap-3">
                    <div className="h-9 w-9 rounded-full border-2 border-[#E6E0F8] border-t-[#6E61BE] animate-spin" />
                    <span className="text-xs font-medium text-[#6B6580]">
                      Cargando probador en foto...
                    </span>
                  </div>
                }
              >
                <LazyPhotoFittingRoom
                  uid={user.uid}
                  avatarConfig={avatarConfig}
                  garments={garments}
                  garmentsById={garmentsById}
                  isLoadingGarments={isLoading}
                  localLookVersion={localLookVersion}
                  onPhotoStateChange={setPhotoRoomState}
                />
              </Suspense>
            ) : null;
          case '2d':
          case '3d':
            return (
              <>
                {/* Indicador rápido de slots activos */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1" aria-label="Capas del outfit">
                  {ALL_SLOTS.map((slotKey) => {
                    const worn = items.find((i) => i.slotKey === slotKey);
                    const isSelected = selectedSlotKey === slotKey;
                    return (
                      <button
                        key={slotKey}
                        type="button"
                        disabled={!worn}
                        onClick={() => worn && selectSlot(slotKey)}
                        className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors ${
                          isSelected
                            ? 'bg-[#6E61BE] border-[#6E61BE] text-white'
                            : worn
                              ? 'bg-[#D5F5E3]/70 border-[#D5F5E3] text-[#4A4458]'
                              : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#6B6580]/65'
                        }`}
                      >
                        {SLOT_LABELS[slotKey]}
                      </button>
                    );
                  })}
                </div>

                {/* Lienzo 2D o 3D + Drawer único compartido */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <div className="lg:col-span-7">
                    {rendererMode === '3d' ? (
                      <Suspense
                        fallback={
                          <div className="rounded-3xl bg-white p-6 border border-[#E6E0F8] shadow-soft aspect-[3/4] max-h-[540px] flex flex-col items-center justify-center gap-3">
                            <div className="h-9 w-9 rounded-full border-2 border-[#E6E0F8] border-t-[#6E61BE] animate-spin" />
                            <span className="text-xs font-medium text-[#6B6580]">
                              Cargando armador 3D...
                            </span>
                          </div>
                        }
                      >
                        <LazyOutfit3DViewer
                          avatarConfig={avatarConfig}
                          items={items}
                          garmentsById={garmentsById}
                          capturedPreviewBlob={captured3DBlob}
                          onCapturePreview={setCaptured3DBlob}
                          onFallbackTo2D={handleFallbackTo2D}
                        />
                      </Suspense>
                    ) : (
                      <OutfitCanvasStage
                        avatarConfig={avatarConfig}
                        garmentsById={garmentsById}
                        onOpen3D={(g) => setViewerGarment(g)}
                      />
                    )}
                  </div>

                  <div className="lg:col-span-5">
                    <ClosetDrawer
                      garments={garments}
                      avatarConfig={avatarConfig}
                      isLoading={isLoading}
                    />
                  </div>
                </div>
              </>
            );
          default: {
            const _exhaustive: never = rendererMode;
            return _exhaustive;
          }
        }
      })()}

      <SaveOutfitModal
        open={saveOpen}
        avatarConfig={avatarConfig}
        items={items}
        garmentsById={garmentsById}
        capturedPreviewBlob={rendererMode === '3d' ? captured3DBlob : null}
        photoModeContext={
          rendererMode === 'photo' && photoRoomState.localPhoto
            ? {
                localPhoto: photoRoomState.localPhoto,
                photoTransforms,
                occlusionEnabled: photoRoomState.occlusionEnabled,
              }
            : undefined
        }
        onClose={() => setSaveOpen(false)}
        onSaved={(result) => {
          setSaveOpen(false);
          if (result?.savedLocallyOnly) {
            setLocalLookVersion((v) => v + 1);
            setLocalSavedNotice(
              'Look guardado únicamente en este dispositivo. Encuéntralo en “En este dispositivo” dentro de Tu look.',
            );
            return;
          }
          setCaptured3DBlob(null);
          clearDraft();
          navigate('/outfits?saved=1');
        }}
      />

      <GarmentViewerModal garment={viewerGarment} onClose={() => setViewerGarment(null)} />
    </div>
  );
}
