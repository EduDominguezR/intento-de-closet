export interface CropRect {
  x: number; // 0..1
  y: number; // 0..1
  width: number; // 0..1
  height: number; // 0..1
}

export interface GarmentWebpVariants {
  full: Blob;
  thumb: Blob;
  cutout: Blob;
}

export async function loadImageFromSource(source: Blob | string): Promise<HTMLImageElement> {
  const isBlob = source instanceof Blob;
  const objectUrl = isBlob ? URL.createObjectURL(source) : source;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (isBlob) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      if (isBlob) URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo cargar la imagen seleccionada.'));
    };
    img.src = objectUrl;
  });
}

export async function blobToCanvas(blob: Blob, maxDimension = 1600): Promise<HTMLCanvasElement> {
  const img = await loadImageFromSource(blob);
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo inicializar el contexto 2D.');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

export async function cropBlobToCanvas(
  sourceBlob: Blob,
  crop: CropRect,
  maxSide = 1200,
): Promise<HTMLCanvasElement> {
  const img = await loadImageFromSource(sourceBlob);
  const sx = Math.max(0, Math.round(crop.x * img.naturalWidth));
  const sy = Math.max(0, Math.round(crop.y * img.naturalHeight));
  const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.round(crop.width * img.naturalWidth)));
  const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.round(crop.height * img.naturalHeight)));

  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo inicializar el contexto 2D para recortar.');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: 'image/webp' | 'image/png' = 'image/webp',
  quality = 0.86,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No se pudo codificar la imagen WebP.'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

export function resizeCanvas(
  source: HTMLCanvasElement,
  maxDimension: number,
): HTMLCanvasElement {
  const maxCurrent = Math.max(source.width, source.height);
  if (maxCurrent <= maxDimension) {
    const copy = document.createElement('canvas');
    copy.width = source.width;
    copy.height = source.height;
    const ctx = copy.getContext('2d');
    if (ctx) ctx.drawImage(source, 0, 0);
    return copy;
  }

  const scale = maxDimension / maxCurrent;
  const target = document.createElement('canvas');
  target.width = Math.max(1, Math.round(source.width * scale));
  target.height = Math.max(1, Math.round(source.height * scale));
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('No se pudo redimensionar la imagen.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, target.width, target.height);
  return target;
}

/**
 * Genera los 3 artefactos WebP requeridos en cliente:
 * - full: 1200px (foto recortada)
 * - thumb: 400px (miniatura con alpha del cutout)
 * - cutout: 1200px (WebP CON CANAL ALPHA)
 */
export async function generateGarmentWebpVariants(
  croppedCanvas: HTMLCanvasElement,
  cutoutCanvas: HTMLCanvasElement,
): Promise<GarmentWebpVariants> {
  const fullCanvas = resizeCanvas(croppedCanvas, 1200);
  const thumbCanvas = resizeCanvas(cutoutCanvas, 400);
  const cutoutResized = resizeCanvas(cutoutCanvas, 1200);

  const [full, thumb, cutout] = await Promise.all([
    canvasToBlob(fullCanvas, 'image/webp', 0.86),
    canvasToBlob(thumbCanvas, 'image/webp', 0.82),
    canvasToBlob(cutoutResized, 'image/webp', 0.88),
  ]);

  return { full, thumb, cutout };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('No se pudo convertir la imagen a base64.'));
        return;
      }
      const commaIdx = reader.result.indexOf(',');
      resolve(commaIdx >= 0 ? reader.result.slice(commaIdx + 1) : reader.result);
    };
    reader.onerror = () => reject(new Error('Error leyendo la imagen.'));
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}
