export interface LookbookWebPImages {
  full: Blob;
  thumb: Blob;
}

const SPANISH_MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function canvasToWebP(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('No se pudo convertir la foto del lookbook a WebP.'));
      },
      'image/webp',
      quality,
    );
  });
}

async function decodeWithExifOrientation(
  file: Blob,
): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        release: () => bitmap.close(),
      };
    } catch {
      // Fallback a Image() si el navegador no soporta imageOrientation en Blob concreto
    }
  }

  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
    el.src = url;
  });

  return {
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
    release: () => URL.revokeObjectURL(url),
  };
}

function resizeToCanvas(
  sourceWidth: number,
  sourceHeight: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  maxSide: number,
): HTMLCanvasElement {
  const longest = Math.max(sourceWidth, sourceHeight, 1);
  const scale = longest > maxSide ? maxSide / longest : 1;
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Tu navegador no permite procesar imágenes en Canvas.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  draw(ctx, targetWidth, targetHeight);
  return canvas;
}

/**
 * Redimensiona y convierte una foto real del lookbook a WebP respetando orientación EXIF.
 * NO aplica recorte de fondo, NO recorta, NO estima pose ni procesa el cuerpo.
 */
export async function processLookbookPhotoToWebP(file: Blob): Promise<LookbookWebPImages> {
  const decoded = await decodeWithExifOrientation(file);
  try {
    const fullCanvas = resizeToCanvas(decoded.width, decoded.height, decoded.draw, 1600);
    const thumbCanvas = resizeToCanvas(decoded.width, decoded.height, decoded.draw, 400);

    const [full, thumb] = await Promise.all([
      canvasToWebP(fullCanvas, 0.86),
      canvasToWebP(thumbCanvas, 0.82),
    ]);

    return { full, thumb };
  } finally {
    decoded.release();
  }
}

export function getTodayLocalIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatWornOnDisplay(yyyyMmDd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd);
  if (!match) return yyyyMmDd;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  const monthName = SPANISH_MONTHS[monthIdx];
  if (!monthName) return yyyyMmDd;
  return `${day} de ${monthName}, ${year}`;
}

export function formatMonthYearDisplay(yyyyMm: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yyyyMm);
  if (!match) return yyyyMm;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const monthName = SPANISH_MONTHS[monthIdx];
  if (!monthName) return yyyyMm;
  const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  return `${capitalized} ${year}`;
}
