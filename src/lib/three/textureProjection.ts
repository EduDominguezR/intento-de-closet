import * as THREE from 'three';
import { getStorageBlob } from '@/src/firebase/storage';
import {
  GARMENT_LAYER_RENDER_ORDER,
  GARMENT_POLYGON_OFFSET,
  type GarmentLayerKey,
} from '@/src/lib/three/templates';

function loadHtmlImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo decodificar la imagen del recorte.'));
    };
    img.src = objectUrl;
  });
}

function findOpaqueBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 18) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { sx: 0, sy: 0, sw: width, sh: height };
  }

  return {
    sx: minX,
    sy: minY,
    sw: Math.max(1, maxX - minX + 1),
    sh: Math.max(1, maxY - minY + 1),
  };
}

/**
 * Proyecta el cutout WebP (con alpha) sobre un lienzo cuya relación de aspecto
 * coincide exactamente con el panel frontal de la plantilla 3D (`targetAspect`),
 * evitando estiramientos y rellenando los márgenes con `dominantColor`.
 */
export async function buildProjectedCutoutTexture(
  cutoutPath: string | undefined,
  dominantColor: string,
  targetAspect = 0.85,
): Promise<THREE.CanvasTexture | null> {
  if (!cutoutPath) return null;

  try {
    const blob = await getStorageBlob(cutoutPath);
    const img = await loadHtmlImageFromBlob(blob);

    const probeCanvas = document.createElement('canvas');
    const pw = Math.min(512, Math.max(64, img.naturalWidth));
    const ph = Math.min(512, Math.max(64, img.naturalHeight));
    probeCanvas.width = pw;
    probeCanvas.height = ph;
    const probeCtx = probeCanvas.getContext('2d');
    if (!probeCtx) return null;

    probeCtx.drawImage(img, 0, 0, pw, ph);
    const bounds = findOpaqueBounds(probeCtx, pw, ph);

    // Ajustar dimensiones del lienzo a la proporción real del panel 3D (sin estiramiento)
    const safeAspect = THREE.MathUtils.clamp(targetAspect || 0.85, 0.38, 1.8);
    const baseSize = 512;
    const outW = THREE.MathUtils.clamp(Math.round(baseSize * Math.sqrt(safeAspect)), 256, 768);
    const outH = THREE.MathUtils.clamp(Math.round(baseSize / Math.sqrt(safeAspect)), 256, 768);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return null;

    // Relleno completo con color dominante para áreas no cubiertas por el cutout
    outCtx.fillStyle = /^#[0-9a-fA-F]{6}$/.test(dominantColor) ? dominantColor : '#8B7FD4';
    outCtx.fillRect(0, 0, outW, outH);

    // Respetar margen interno del panel sin recortar ni estirar el recorte
    const padX = outW * 0.055;
    const padY = outH * 0.055;
    const availW = outW - padX * 2;
    const availH = outH - padY * 2;
    const scale = Math.min(availW / bounds.sw, availH / bounds.sh);
    const drawW = bounds.sw * scale;
    const drawH = bounds.sh * scale;
    const dx = (outW - drawW) / 2;
    const dy = (outH - drawH) / 2;

    outCtx.drawImage(
      probeCanvas,
      bounds.sx,
      bounds.sy,
      bounds.sw,
      bounds.sh,
      dx,
      dy,
      drawW,
      drawH,
    );

    const texture = new THREE.CanvasTexture(outCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  } catch {
    return null;
  }
}

/**
 * Aplica la textura proyectada al grupo frontal de la cáscara (`hasFrontGroup`)
 * o a paneles frontales de GLB (`isFrontPanel`), con polygonOffset y renderOrder por capa.
 */
export function applyTextureProjectionToGroup(
  group: THREE.Object3D,
  frontTexture: THREE.Texture | null,
  dominantColor: string,
  layer: GarmentLayerKey = 'top',
): void {
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(dominantColor) ? dominantColor : '#8B7FD4';
  const renderOrder = GARMENT_LAYER_RENDER_ORDER[layer] ?? 30;
  const polyOffset = GARMENT_POLYGON_OFFSET[layer] ?? -3;

  const makeSolidMat = (color: string) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.82,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: polyOffset,
      polygonOffsetUnits: polyOffset,
    });

  const makeFrontMat = () =>
    new THREE.MeshStandardMaterial({
      color: frontTexture ? '#FFFFFF' : safeColor,
      map: frontTexture ?? null,
      roughness: 0.78,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: polyOffset,
      polygonOffsetUnits: polyOffset,
    });

  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    // Preservar suelas claras en calzado procedural
    if (mesh.name.startsWith('sole_')) {
      mesh.renderOrder = renderOrder;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return;
    }

    const prevMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of prevMaterials) {
      if (m && typeof m.dispose === 'function') m.dispose();
    }

    if (mesh.userData?.hasFrontGroup === true) {
      mesh.material = [makeFrontMat(), makeSolidMat(safeColor)];
    } else {
      const isFront =
        mesh.userData?.isFrontPanel === true || /front|panel/i.test(mesh.name || '');
      mesh.material = isFront && frontTexture ? makeFrontMat() : makeSolidMat(safeColor);
    }

    mesh.renderOrder = renderOrder;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}
