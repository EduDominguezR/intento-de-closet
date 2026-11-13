import {
  useRef,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { Box, RotateCcw, Trash2 } from 'lucide-react';
import { Avatar2D } from '@/src/components/avatar/Avatar2D';
import { StorageImage } from '@/src/components/ui/StorageImage';
import type { AvatarConfig } from '@/src/lib/avatar/types';
import { getAdjustedAnchorForSlot } from '@/src/lib/outfit/anchors';
import { LAYER_Z_INDEX, SLOT_LABELS } from '@/src/lib/outfit/slots';
import { useOutfitDraftStore } from '@/src/stores/useOutfitDraftStore';
import type { Garment, OutfitItem, SlotKey } from '@/src/types/models';

interface OutfitCanvasStageProps {
  avatarConfig: AvatarConfig;
  garmentsById: Map<string, Garment>;
  onOpen3D: (garment: Garment) => void;
}

export function OutfitCanvasStage({
  avatarConfig,
  garmentsById,
  onOpen3D,
}: OutfitCanvasStageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const {
    items,
    selectedSlotKey,
    selectSlot,
    removeSlot,
    updateItemPosition,
    updateItemTransform,
  } = useOutfitDraftStore();

  const dragRef = useRef<{
    slotKey: SlotKey;
    startX: number;
    startY: number;
    startAnchor: { x: number; y: number };
  } | null>(null);

  const pinchRef = useRef<{
    slotKey: SlotKey;
    initialDist: number;
    initialAngle: number;
    initialScale: number;
    initialRotation: number;
  } | null>(null);

  const sortedItems = [...items].sort((a, b) => LAYER_Z_INDEX[a.layer] - LAYER_Z_INDEX[b.layer]);
  const selectedItem = items.find((item) => item.slotKey === selectedSlotKey) ?? null;
  const selectedGarment = selectedItem ? garmentsById.get(selectedItem.garmentId) ?? null : null;

  function handlePointerDown(item: OutfitItem, event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    selectSlot(item.slotKey);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      slotKey: item.slotKey,
      startX: event.clientX,
      startY: event.clientY,
      startAnchor: { ...item.anchor },
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || pinchRef.current) return;

    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dx = (event.clientX - drag.startX) / rect.width;
    const dy = (event.clientY - drag.startY) / rect.height;
    updateItemPosition(drag.slotKey, {
      x: drag.startAnchor.x + dx,
      y: drag.startAnchor.y + dy,
    });
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleTouchStart(item: OutfitItem, event: ReactTouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 2) return;
    event.stopPropagation();
    const [t1, t2] = [event.touches[0], event.touches[1]];
    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const angle = (Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180) / Math.PI;
    pinchRef.current = {
      slotKey: item.slotKey,
      initialDist: Math.max(1, dist),
      initialAngle: angle,
      initialScale: item.transform.scale,
      initialRotation: item.transform.rotation,
    };
  }

  function handleTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    const [t1, t2] = [event.touches[0], event.touches[1]];
    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const angle = (Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180) / Math.PI;

    const nextScale = pinch.initialScale * (dist / pinch.initialDist);
    const nextRotation = pinch.initialRotation + (angle - pinch.initialAngle);
    updateItemTransform(pinch.slotKey, { scale: nextScale, rotation: nextRotation });
  }

  function handleTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    if (event.touches.length < 2) {
      pinchRef.current = null;
    }
  }

  return (
    <div className="space-y-4">
      <div
        ref={stageRef}
        onClick={() => selectSlot(null)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative mx-auto w-full max-w-[380px] aspect-[3/4.2] rounded-3xl bg-gradient-to-b from-[#E6E0F8]/35 via-[#FFFBFD] to-[#FADADD]/25 border border-[#E6E0F8] shadow-soft overflow-hidden select-none"
      >
        {/* Maniquí 2D base */}
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
          <Avatar2D config={avatarConfig} className="w-full h-full max-h-full" />
        </div>

        {/* Prendas por capas */}
        {sortedItems.map((item) => {
          const garment = garmentsById.get(item.garmentId);
          if (!garment) return null;
          const isSelected = selectedSlotKey === item.slotKey;
          const preset = getAdjustedAnchorForSlot(item.slotKey, avatarConfig);

          return (
            <div
              key={item.slotKey}
              role="button"
              tabIndex={0}
              aria-label={`Prenda ${garment.name} en ${SLOT_LABELS[item.slotKey]}. Toca para ajustar.`}
              onClick={(e) => {
                e.stopPropagation();
                selectSlot(item.slotKey);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectSlot(item.slotKey);
                }
              }}
              onPointerDown={(e) => handlePointerDown(item, e)}
              onTouchStart={(e) => handleTouchStart(item, e)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{
                zIndex: LAYER_Z_INDEX[item.layer],
                left: `${item.anchor.x * 100}%`,
                top: `${item.anchor.y * 100}%`,
                width: `${preset.maxWidthRatio * 100}%`,
                transform: `translate(-50%, -50%) scale(${item.transform.scale}) rotate(${item.transform.rotation}deg)`,
              }}
              className={`absolute touch-none cursor-grab active:cursor-grabbing transition-shadow rounded-2xl ${
                isSelected ? 'ring-2 ring-[#6E61BE] ring-offset-2 ring-offset-transparent' : ''
              }`}
            >
              <StorageImage
                path={garment.cutoutPath || garment.imageThumbPath}
                alt={`${garment.name} (${garment.category})`}
                priority
                className="w-full h-auto object-contain pointer-events-none drop-shadow-sm"
              />
            </div>
          );
        })}

        <p className="absolute bottom-2.5 left-0 right-0 text-center text-[11px] font-medium text-[#6B6580] px-3 pointer-events-none">
          Estilo collage 2D · Arrastra o pellizca una prenda para ajustarla
        </p>
      </div>

      {/* Controles finos de la prenda seleccionada */}
      {selectedItem && selectedGarment && (
        <div className="rounded-3xl bg-white p-4 border border-[#E6E0F8] shadow-soft space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#6B6580]">
                {SLOT_LABELS[selectedItem.slotKey]}
              </p>
              <p className="font-display text-sm font-bold text-[#4A4458] truncate">
                {selectedGarment.name}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpen3D(selectedGarment)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#E6E0F8]/75 hover:bg-[#E6E0F8] text-[#4A4458] text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Box className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Ver en 3D</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const preset = getAdjustedAnchorForSlot(selectedItem.slotKey, avatarConfig);
                  updateItemPosition(selectedItem.slotKey, preset.anchor);
                  updateItemTransform(selectedItem.slotKey, {
                    scale: preset.scale,
                    rotation: 0,
                  });
                }}
                aria-label="Restablecer posición y escala"
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#FFFBFD] border border-[#E6E0F8] text-[#4A4458] text-xs font-semibold inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Centrar</span>
              </button>
              <button
                type="button"
                onClick={() => removeSlot(selectedItem.slotKey)}
                aria-label={`Quitar ${selectedGarment.name}`}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#FADADD]/75 hover:bg-[#FADADD] text-[#4A4458] text-xs font-semibold inline-flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Quitar</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <label className="text-xs font-semibold text-[#4A4458] flex items-center gap-2.5">
              <span className="w-16 shrink-0">Escala ({selectedItem.transform.scale.toFixed(2)}x)</span>
              <input
                type="range"
                min={0.4}
                max={2}
                step={0.05}
                value={selectedItem.transform.scale}
                onChange={(e) =>
                  updateItemTransform(selectedItem.slotKey, { scale: Number(e.target.value) })
                }
                className="w-full accent-[#6E61BE]"
              />
            </label>

            <label className="text-xs font-semibold text-[#4A4458] flex items-center gap-2.5">
              <span className="w-16 shrink-0">Giro ({selectedItem.transform.rotation}°)</span>
              <input
                type="range"
                min={-45}
                max={45}
                step={1}
                value={selectedItem.transform.rotation}
                onChange={(e) =>
                  updateItemTransform(selectedItem.slotKey, { rotation: Number(e.target.value) })
                }
                className="w-full accent-[#6E61BE]"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
