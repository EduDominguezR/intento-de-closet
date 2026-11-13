import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  FlipHorizontal2,
  Layers2,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Undo2,
} from 'lucide-react';
import { getStorageBlob } from '@/src/firebase/storage';
import { LAYER_Z_INDEX, SLOT_LABELS } from '@/src/lib/outfit/slots';
import {
  getDefaultPhotoTransformForSlot,
} from '@/src/lib/photo/fitConfig';
import { cropCutoutToOpaqueBounds, type CroppedCutoutAsset } from '@/src/lib/photo/image';
import { buildForegroundOcclusionCanvas } from '@/src/lib/photo/occlusion';
import type { BodyPoseLandmarks } from '@/src/lib/photo/pose';
import type { LocalUserPhoto, PhotoItemTransform } from '@/src/lib/photo/storage';
import { useOutfitDraftStore } from '@/src/stores/useOutfitDraftStore';
import type { Garment, OutfitItem, SlotKey } from '@/src/types/models';

const OVER_OCCLUSION_SLOTS = new Set<SlotKey>(['acc_head', 'acc_hand']);

interface PhotoStageCanvasProps {
  photo: LocalUserPhoto;
  items: OutfitItem[];
  garmentsById: Map<string, Garment>;
  selectedSlotKey: SlotKey | null;
  photoTransforms: Partial<Record<SlotKey, PhotoItemTransform>>;
  pose?: BodyPoseLandmarks | null;
  detectingPose?: boolean;
  occlusionEnabled?: boolean;
  onToggleOcclusion?: () => void;
}

interface RenderedBox {
  slotKey: SlotKey;
  cxPx: number;
  cyPx: number;
  wPx: number;
  hPx: number;
  rotationRad: number;
}

export function PhotoStageCanvas({
  photo,
  items,
  garmentsById,
  selectedSlotKey,
  photoTransforms,
  pose,
  detectingPose = false,
  occlusionEnabled = true,
  onToggleOcclusion,
}: PhotoStageCanvasProps) {
  const { selectSlot, updatePhotoTransform, resetPhotoTransform, bumpPhotoLayer } =
    useOutfitDraftStore();

  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 360, height: 480 });
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [occlusionCanvas, setOcclusionCanvas] = useState<HTMLCanvasElement | null>(null);
  const [showPoseGuides, setShowPoseGuides] = useState(false);

  const cutoutCacheRef = useRef<Map<string, CroppedCutoutAsset>>(new Map());
  const [cutoutsTick, setCutoutsTick] = useState(0);
  const renderedBoxesRef = useRef<RenderedBox[]>([]);

  // Pointers activos para arrastrar (1 dedo) y pellizcar/rotar (2 dedos)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{
    slotKey: SlotKey;
    startCx: number;
    startCy: number;
    startScale: number;
    startRot: number;
    startX: number;
    startY: number;
    pinchDist: number;
    pinchAngle: number;
  } | null>(null);

  // Cargar imagen de fondo desde el Blob en IndexedDB
  useEffect(() => {
    let active = true;
    const url = URL.createObjectURL(photo.blob);
    const img = new Image();
    img.onload = () => {
      if (active) setBgImage(img);
    };
    img.src = url;
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [photo.blob, photo.updatedAt]);

  // Construir lienzo de oclusión frontal (antebrazos, manos y cabeza/cabello) cuando exista máscara
  useEffect(() => {
    let active = true;
    if (!photo.personMaskBlob || !pose || pose.status === 'not-found') {
      setOcclusionCanvas(null);
      return;
    }
    void buildForegroundOcclusionCanvas(photo, pose)
      .then((canvas) => {
        if (active) setOcclusionCanvas(canvas);
      })
      .catch(() => {
        if (active) setOcclusionCanvas(null);
      });
    return () => {
      active = false;
    };
  }, [photo, pose]);

  // Observar dimensiones del contenedor para dibujar nitidez 1:1 en Canvas 2D
  useEffect(() => {
    const el = stageContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width < 10 || rect.height < 10) return;
      setStageSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Ordenar prendas por capa base + ajuste fino zOffset
  const orderedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const za = LAYER_Z_INDEX[a.layer] + (photoTransforms[a.slotKey]?.zOffset ?? 0) * 0.1;
      const zb = LAYER_Z_INDEX[b.layer] + (photoTransforms[b.slotKey]?.zOffset ?? 0) * 0.1;
      return za - zb;
    });
  }, [items, photoTransforms]);

  // Cargar y recortar cutouts al bounding box opaco en memoria
  useEffect(() => {
    let active = true;
    const missingPaths: string[] = [];

    for (const item of orderedItems) {
      const g = garmentsById.get(item.garmentId);
      if (g?.cutoutPath && !cutoutCacheRef.current.has(g.cutoutPath)) {
        missingPaths.push(g.cutoutPath);
      }
    }

    if (missingPaths.length === 0) return;

    void Promise.all(
      missingPaths.map(async (path) => {
        try {
          const blob = await getStorageBlob(path);
          const cropped = await cropCutoutToOpaqueBounds(blob);
          if (active) {
            cutoutCacheRef.current.set(path, cropped);
          }
        } catch {
          // Ignorar prenda si falla descarga puntual offline sin caché
        }
      }),
    ).then(() => {
      if (active) setCutoutsTick((t) => t + 1);
    });

    return () => {
      active = false;
    };
  }, [garmentsById, orderedItems]);

  // Calcular rectángulo de encaje 'contain' de la foto dentro del canvas
  const photoRect = useMemo(() => {
    const cw = stageSize.width;
    const ch = stageSize.height;
    const aspect = photo.width / Math.max(1, photo.height);
    let drawW = cw;
    let drawH = cw / aspect;
    if (drawH > ch) {
      drawH = ch;
      drawW = ch * aspect;
    }
    return {
      x: (cw - drawW) / 2,
      y: (ch - drawH) / 2,
      w: drawW,
      h: drawH,
    };
  }, [photo.height, photo.width, stageSize.height, stageSize.width]);

  // Composición 2D: foto + prendas inferiores/torso + oclusión frontal + accesorios superiores/mano
  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = stageSize;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#F7F3FB';
    ctx.fillRect(0, 0, width, height);

    if (bgImage) {
      ctx.drawImage(bgImage, photoRect.x, photoRect.y, photoRect.w, photoRect.h);
    }

    const boxes: RenderedBox[] = [];
    let selectedBox: RenderedBox | null = null;

    const drawItem = (item: OutfitItem) => {
      const garment = garmentsById.get(item.garmentId);
      if (!garment) return;
      const asset = cutoutCacheRef.current.get(garment.cutoutPath);
      if (!asset) return;

      const t = photoTransforms[item.slotKey] ?? getDefaultPhotoTransformForSlot(item.slotKey);
      const cxPx = photoRect.x + t.cx * photoRect.w;
      const cyPx = photoRect.y + t.cy * photoRect.h;
      const targetW = t.scale * photoRect.w;
      const targetH = targetW * (asset.height / Math.max(1, asset.width));
      const rotRad = (t.rotation * Math.PI) / 180;

      const box: RenderedBox = {
        slotKey: item.slotKey,
        cxPx,
        cyPx,
        wPx: targetW,
        hPx: targetH,
        rotationRad: rotRad,
      };
      boxes.push(box);
      if (selectedSlotKey === item.slotKey) {
        selectedBox = box;
      }

      // 1. Sombra suave bajo la prenda (blend multiply, opacidad baja)
      ctx.save();
      ctx.translate(cxPx + 3, cyPx + 6);
      ctx.rotate(rotRad);
      ctx.scale(t.flipX ? -1 : 1, 1);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.16 * t.opacity;
      ctx.filter = 'blur(5px) brightness(0.35)';
      ctx.drawImage(asset.canvas, -targetW / 2, -targetH / 2, targetW, targetH);
      ctx.restore();

      // 2. Prenda con borde suavizado ~1 px para integrar con la foto
      ctx.save();
      ctx.translate(cxPx, cyPx);
      ctx.rotate(rotRad);
      ctx.scale(t.flipX ? -1 : 1, 1);
      ctx.globalAlpha = t.opacity;
      ctx.filter = 'blur(0.45px)';
      ctx.drawImage(asset.canvas, -targetW / 2, -targetH / 2, targetW, targetH);
      ctx.filter = 'none';
      ctx.drawImage(asset.canvas, -targetW / 2, -targetH / 2, targetW, targetH);
      ctx.restore();
    };

    for (const item of orderedItems) {
      if (!OVER_OCCLUSION_SLOTS.has(item.slotKey)) {
        drawItem(item);
      }
    }

    // Capa de oclusión corporal (manos, antebrazos y cabeza/cabello por delante del torso)
    if (occlusionEnabled && occlusionCanvas) {
      ctx.save();
      ctx.globalAlpha = 0.94;
      ctx.drawImage(occlusionCanvas, photoRect.x, photoRect.y, photoRect.w, photoRect.h);
      ctx.restore();
    }

    for (const item of orderedItems) {
      if (OVER_OCCLUSION_SLOTS.has(item.slotKey)) {
        drawItem(item);
      }
    }

    // Marco discreto de la prenda seleccionada siempre visible arriba
    if (selectedBox !== null) {
      const activeBox: RenderedBox = selectedBox;
      ctx.save();
      ctx.translate(activeBox.cxPx, activeBox.cyPx);
      ctx.rotate(activeBox.rotationRad);
      ctx.strokeStyle = '#6E61BE';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(
        -activeBox.wPx / 2 - 4,
        -activeBox.hPx / 2 - 4,
        activeBox.wPx + 8,
        activeBox.hPx + 8,
      );
      ctx.restore();
    }

    // Guías discretas de puntos clave de pose si el usuario activa "Ver puntos"
    if (showPoseGuides && pose && pose.status !== 'not-found') {
      const kp = pose.keypoints;
      const toCanvas = (pt?: { x: number; y: number }) =>
        pt ? { x: photoRect.x + pt.x * photoRect.w, y: photoRect.y + pt.y * photoRect.h } : null;

      const ls = toCanvas(kp.leftShoulder);
      const rs = toCanvas(kp.rightShoulder);
      const lh = toCanvas(kp.leftHip);
      const rh = toCanvas(kp.rightHip);
      const la = toCanvas(kp.leftAnkle);
      const ra = toCanvas(kp.rightAnkle);

      ctx.save();
      ctx.strokeStyle = 'rgba(110, 97, 190, 0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      if (ls && rs) {
        ctx.beginPath();
        ctx.moveTo(ls.x, ls.y);
        ctx.lineTo(rs.x, rs.y);
        ctx.stroke();
      }
      if (lh && rh) {
        ctx.beginPath();
        ctx.moveTo(lh.x, lh.y);
        ctx.lineTo(rh.x, rh.y);
        ctx.stroke();
      }
      const dots = [
        toCanvas(kp.nose),
        ls,
        rs,
        lh,
        rh,
        toCanvas(kp.leftKnee),
        toCanvas(kp.rightKnee),
        la,
        ra,
      ].filter((d): d is { x: number; y: number } => Boolean(d));

      ctx.setLineDash([]);
      for (const dot of dots) {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#6E61BE';
        ctx.stroke();
      }
      ctx.restore();
    }

    renderedBoxesRef.current = boxes;
    ctx.restore();
  }, [
    bgImage,
    garmentsById,
    occlusionCanvas,
    occlusionEnabled,
    orderedItems,
    photoRect,
    photoTransforms,
    pose,
    selectedSlotKey,
    showPoseGuides,
    stageSize,
  ]);

  useEffect(() => {
    drawScene();
  }, [drawScene, cutoutsTick]);

  function hitTestSlot(localX: number, localY: number): SlotKey | null {
    const boxes = renderedBoxesRef.current;
    for (let i = boxes.length - 1; i >= 0; i--) {
      const box = boxes[i];
      const dx = localX - box.cxPx;
      const dy = localY - box.cyPx;
      const cos = Math.cos(-box.rotationRad);
      const sin = Math.sin(-box.rotationRad);
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      if (Math.abs(rx) <= box.wPx / 2 + 12 && Math.abs(ry) <= box.hPx / 2 + 12) {
        return box.slotKey;
      }
    }
    return null;
  }

  function getLocalPoint(e: PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const pt = getLocalPoint(e);
    pointersRef.current.set(e.pointerId, pt);
    e.currentTarget.setPointerCapture(e.pointerId);

    const activeSlot = hitTestSlot(pt.x, pt.y) ?? selectedSlotKey;
    if (!activeSlot) return;

    selectSlot(activeSlot);
    const t = photoTransforms[activeSlot] ?? getDefaultPhotoTransformForSlot(activeSlot);

    if (pointersRef.current.size === 1) {
      gestureRef.current = {
        slotKey: activeSlot,
        startCx: t.cx,
        startCy: t.cy,
        startScale: t.scale,
        startRot: t.rotation,
        startX: pt.x,
        startY: pt.y,
        pinchDist: 0,
        pinchAngle: 0,
      };
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      gestureRef.current = {
        slotKey: activeSlot,
        startCx: t.cx,
        startCy: t.cy,
        startScale: t.scale,
        startRot: t.rotation,
        startX: (pts[0].x + pts[1].x) / 2,
        startY: (pts[0].y + pts[1].y) / 2,
        pinchDist: Math.max(12, Math.hypot(dx, dy)),
        pinchAngle: Math.atan2(dy, dx),
      };
    }
  }

  function handlePointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!pointersRef.current.has(e.pointerId) || !gestureRef.current) return;
    const pt = getLocalPoint(e);
    pointersRef.current.set(e.pointerId, pt);

    const g = gestureRef.current;
    if (pointersRef.current.size === 1) {
      const dxNorm = (pt.x - g.startX) / Math.max(1, photoRect.w);
      const dyNorm = (pt.y - g.startY) / Math.max(1, photoRect.h);
      updatePhotoTransform(g.slotKey, {
        cx: g.startCx + dxNorm,
        cy: g.startCy + dyNorm,
      });
    } else if (pointersRef.current.size >= 2) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const dist = Math.max(12, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;

      const scaleRatio = dist / Math.max(12, g.pinchDist);
      const deltaDeg = ((angle - g.pinchAngle) * 180) / Math.PI;
      updatePhotoTransform(g.slotKey, {
        cx: g.startCx + (midX - g.startX) / Math.max(1, photoRect.w),
        cy: g.startCy + (midY - g.startY) / Math.max(1, photoRect.h),
        scale: g.startScale * scaleRatio,
        rotation: g.startRot + deltaDeg,
      });
    }
  }

  function handlePointerUp(e: PointerEvent<HTMLCanvasElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      gestureRef.current = null;
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLCanvasElement>) {
    if (!selectedSlotKey) return;
    const t = photoTransforms[selectedSlotKey] ?? getDefaultPhotoTransformForSlot(selectedSlotKey);
    const step = e.shiftKey ? 0.005 : 0.02;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      updatePhotoTransform(selectedSlotKey, { cx: t.cx - step });
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      updatePhotoTransform(selectedSlotKey, { cx: t.cx + step });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      updatePhotoTransform(selectedSlotKey, { cy: t.cy - step });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      updatePhotoTransform(selectedSlotKey, { cy: t.cy + step });
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      updatePhotoTransform(selectedSlotKey, { scale: t.scale + 0.03 });
    } else if (e.key === '-') {
      e.preventDefault();
      updatePhotoTransform(selectedSlotKey, { scale: t.scale - 0.03 });
    } else if (e.key === '[') {
      e.preventDefault();
      updatePhotoTransform(selectedSlotKey, { rotation: t.rotation - 5 });
    } else if (e.key === ']') {
      e.preventDefault();
      updatePhotoTransform(selectedSlotKey, { rotation: t.rotation + 5 });
    }
  }

  const selectedItem = items.find((i) => i.slotKey === selectedSlotKey) ?? null;
  const selectedGarment = selectedItem ? garmentsById.get(selectedItem.garmentId) ?? null : null;
  const selectedTransform = selectedSlotKey
    ? photoTransforms[selectedSlotKey] ?? getDefaultPhotoTransformForSlot(selectedSlotKey)
    : null;

  return (
    <div className="space-y-3">
      <div className="rounded-3xl bg-white p-3 sm:p-4 border border-[#E6E0F8] shadow-soft space-y-3">
        {/* Lienzo 2D sobre la foto del dispositivo */}
        <div
          ref={stageContainerRef}
          className="relative w-full h-[62dvh] min-h-[380px] max-h-[600px] lg:h-[520px] rounded-2xl overflow-hidden bg-[#F7F3FB] border border-[#E6E0F8]/75"
        >
          <canvas
            ref={canvasRef}
            tabIndex={0}
            aria-label="Probador en foto 2D. Toca una prenda para arrastrarla, pellizcar o usar los botones de ajuste."
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDown}
            className="w-full h-full block touch-none outline-none focus-visible:ring-2 focus-visible:ring-[#6E61BE]"
          />

          <div className="pointer-events-none absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center px-3 py-1 rounded-xl bg-white/95 border border-[#E6E0F8] text-xs font-semibold text-[#4A4458] shadow-sm">
              Vista previa con superposición 2D
            </span>

            <div className="pointer-events-auto flex items-center gap-1.5">
              {detectingPose && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#E6E0F8]/95 border border-[#8B7FD4]/40 text-[11px] font-semibold text-[#4A4458] shadow-sm">
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-[#6E61BE] border-t-transparent animate-spin" />
                  <span>Analizando pose...</span>
                </span>
              )}

              {!detectingPose && occlusionCanvas && onToggleOcclusion && (
                <button
                  type="button"
                  onClick={onToggleOcclusion}
                  aria-pressed={occlusionEnabled}
                  className={`min-h-[32px] px-2.5 py-1 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1 shadow-sm transition-colors ${
                    occlusionEnabled
                      ? 'bg-[#6E61BE] border-[#6E61BE] text-white'
                      : 'bg-white/95 border-[#E6E0F8] text-[#4A4458] hover:bg-[#E6E0F8]/60'
                  }`}
                >
                  <Layers2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Oclusión</span>
                </button>
              )}

              {!detectingPose && pose && pose.status !== 'not-found' && (
                <button
                  type="button"
                  onClick={() => setShowPoseGuides((v) => !v)}
                  aria-pressed={showPoseGuides}
                  className={`min-h-[32px] px-2.5 py-1 rounded-xl border text-[11px] font-semibold inline-flex items-center gap-1 shadow-sm transition-colors ${
                    showPoseGuides
                      ? 'bg-[#6E61BE] border-[#6E61BE] text-white'
                      : 'bg-white/95 border-[#E6E0F8] text-[#4A4458] hover:bg-[#E6E0F8]/60'
                  }`}
                >
                  {showPoseGuides ? (
                    <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>Puntos</span>
                </button>
              )}
            </div>
          </div>

          {items.length === 0 && (
            <div className="pointer-events-none absolute bottom-4 left-4 right-4 text-center">
              <span className="inline-block px-3.5 py-2 rounded-2xl bg-white/95 border border-[#E6E0F8] text-xs font-medium text-[#6B6580]">
                Elige una prenda del closet para superponerla sobre tu foto.
              </span>
            </div>
          )}
        </div>

        {/* Barra de ajuste manual accesible para la prenda seleccionada */}
        {selectedSlotKey && selectedGarment && selectedTransform ? (
          <div className="rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#4A4458] truncate">
                Ajustando: {selectedGarment.name} ({SLOT_LABELS[selectedSlotKey]})
              </p>
              <button
                type="button"
                onClick={() => resetPhotoTransform(selectedSlotKey, selectedGarment)}
                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-[#E6E0F8]/60 hover:bg-[#E6E0F8] text-[11px] font-semibold text-[#4A4458] inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Restablecer</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  updatePhotoTransform(selectedSlotKey, {
                    scale: selectedTransform.scale - 0.04,
                  })
                }
                aria-label="Reducir tamaño de la prenda"
                className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl bg-white border border-[#E6E0F8] hover:bg-[#E6E0F8]/40 text-xs font-semibold text-[#4A4458] inline-flex items-center justify-center gap-1"
              >
                <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Tamaño</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  updatePhotoTransform(selectedSlotKey, {
                    scale: selectedTransform.scale + 0.04,
                  })
                }
                aria-label="Aumentar tamaño de la prenda"
                className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl bg-white border border-[#E6E0F8] hover:bg-[#E6E0F8]/40 text-xs font-semibold text-[#4A4458] inline-flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Tamaño</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  updatePhotoTransform(selectedSlotKey, {
                    rotation: selectedTransform.rotation - 5,
                  })
                }
                aria-label="Rotar prenda a la izquierda"
                className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl bg-white border border-[#E6E0F8] hover:bg-[#E6E0F8]/40 text-xs font-semibold text-[#4A4458] inline-flex items-center justify-center"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() =>
                  updatePhotoTransform(selectedSlotKey, {
                    rotation: selectedTransform.rotation + 5,
                  })
                }
                aria-label="Rotar prenda a la derecha"
                className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl bg-white border border-[#E6E0F8] hover:bg-[#E6E0F8]/40 text-xs font-semibold text-[#4A4458] inline-flex items-center justify-center"
              >
                <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() =>
                  updatePhotoTransform(selectedSlotKey, {
                    flipX: !selectedTransform.flipX,
                  })
                }
                aria-pressed={selectedTransform.flipX}
                aria-label="Voltear prenda horizontalmente"
                className={`min-h-[40px] px-2.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1 ${
                  selectedTransform.flipX
                    ? 'bg-[#6E61BE] border-[#6E61BE] text-white'
                    : 'bg-white border-[#E6E0F8] text-[#4A4458] hover:bg-[#E6E0F8]/40'
                }`}
              >
                <FlipHorizontal2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Voltear</span>
              </button>

              <button
                type="button"
                onClick={() => bumpPhotoLayer(selectedSlotKey, 1)}
                aria-label="Subir capa de la prenda"
                title="Subir capa"
                className="min-h-[40px] min-w-[40px] px-2 rounded-xl bg-white border border-[#E6E0F8] hover:bg-[#E6E0F8]/40 text-[#4A4458] inline-flex items-center justify-center"
              >
                <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => bumpPhotoLayer(selectedSlotKey, -1)}
                aria-label="Bajar capa de la prenda"
                title="Bajar capa"
                className="min-h-[40px] min-w-[40px] px-2 rounded-xl bg-white border border-[#E6E0F8] hover:bg-[#E6E0F8]/40 text-[#4A4458] inline-flex items-center justify-center"
              >
                <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              <label className="flex items-center gap-2 ml-auto text-xs text-[#6B6580]">
                <span>Opacidad</span>
                <input
                  type="range"
                  min={0.3}
                  max={1}
                  step={0.05}
                  value={selectedTransform.opacity}
                  onChange={(e) =>
                    updatePhotoTransform(selectedSlotKey, { opacity: Number(e.target.value) })
                  }
                  aria-label="Opacidad de la prenda"
                  className="w-20 accent-[#6E61BE]"
                />
                <span className="tabular-nums w-8 text-right">
                  {Math.round(selectedTransform.opacity * 100)}%
                </span>
              </label>
            </div>
          </div>
        ) : (
          items.length > 0 && (
            <p className="text-xs text-[#6B6580] text-center py-1">
              Toca una prenda sobre tu foto o en “Tu look” para moverla, escalarla o rotarla.
            </p>
          )
        )}
      </div>
    </div>
  );
}
