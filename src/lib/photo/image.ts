export const PHOTO_GUIDE_TIPS = [
  'De frente a la cámara',
  'Cuerpo completo visible (cabeza a pies)',
  'Fondo liso y despejado',
  'Buena iluminación frontal',
  'Ropa ajustada o neutra',
  'Brazos ligeramente separados del cuerpo',
  'Cámara a la altura del pecho',
] as const;

const MAX_BODY_PHOTO_SIDE_PX = 1600;

function loadImageElementFromFile(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen seleccionada.'));
    };
    img.src = url;
  });
}

function canvasToWebPBlob(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('No se pudo codificar la foto en WebP.'));
      },
      'image/webp',
      quality,
    );
  });
}

/**
 * Procesa la foto del usuario en el navegador: corrige orientación EXIF,
 * limita el lado largo a 1600 px y convierte a WebP sin enviarla a ningún servidor.
 */
export async function processBodyPhotoFile(
  file: Blob,
): Promise<{ blob: Blob; width: number; height: number }> {
  let source: CanvasImageSource;
  let srcWidth = 0;
  let srcHeight = 0;
  let bitmapToClose: ImageBitmap | null = null;

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      source = bitmap;
      srcWidth = bitmap.width;
      srcHeight = bitmap.height;
      bitmapToClose = bitmap;
    } catch {
      const img = await loadImageElementFromFile(file);
      source = img;
      srcWidth = img.naturalWidth;
      srcHeight = img.naturalHeight;
    }
  } else {
    const img = await loadImageElementFromFile(file);
    source = img;
    srcWidth = img.naturalWidth;
    srcHeight = img.naturalHeight;
  }

  try {
    const maxSide = Math.max(srcWidth, srcHeight, 1);
    const scale = maxSide > MAX_BODY_PHOTO_SIDE_PX ? MAX_BODY_PHOTO_SIDE_PX / maxSide : 1;
    const width = Math.max(1, Math.round(srcWidth * scale));
    const height = Math.max(1, Math.round(srcHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('No se pudo inicializar el lienzo 2D para procesar la foto.');
    }

    ctx.drawImage(source, 0, 0, width, height);
    const blob = await canvasToWebPBlob(canvas, 0.9);
    return { blob, width, height };
  } finally {
    bitmapToClose?.close();
  }
}

export interface CroppedCutoutAsset {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/**
 * Recorta el cutout WebP de una prenda al bounding box de sus píxeles opacos
 * para que las transformaciones y ajustes manuales coincidan con su silueta real.
 */
export async function cropCutoutToOpaqueBounds(blob: Blob): Promise<CroppedCutoutAsset> {
  const img = await loadImageElementFromFile(blob);
  const pw = Math.max(1, img.naturalWidth);
  const ph = Math.max(1, img.naturalHeight);

  const probe = document.createElement('canvas');
  probe.width = pw;
  probe.height = ph;
  const pCtx = probe.getContext('2d');
  if (!pCtx) {
    throw new Error('No se pudo preparar el recorte de prenda.');
  }
  pCtx.drawImage(img, 0, 0, pw, ph);

  const { data } = pCtx.getImageData(0, 0, pw, ph);
  let minX = pw;
  let minY = ph;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      if (data[(y * pw + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { canvas: probe, width: pw, height: ph };
  }

  const cropW = Math.max(1, maxX - minX + 1);
  const cropH = Math.max(1, maxY - minY + 1);
  const out = document.createElement('canvas');
  out.width = cropW;
  out.height = cropH;
  const oCtx = out.getContext('2d');
  if (!oCtx) {
    return { canvas: probe, width: pw, height: ph };
  }
  oCtx.drawImage(probe, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  return { canvas: out, width: cropW, height: cropH };
}
