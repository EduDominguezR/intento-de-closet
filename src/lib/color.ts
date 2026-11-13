import { loadImageFromSource } from '@/src/lib/image';

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
      break;
  }
  return [h * 60, s, l];
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

interface ColorBucket {
  count: number;
  rSum: number;
  gSum: number;
  bSum: number;
}

/**
 * Extrae el color dominante de una prenda recortada usando histograma HSL cuantizado,
 * descartando píxeles transparentes y grises extremos cuando hay color cromático.
 */
export function extractDominantColorFromCanvas(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '#8B7FD4';

  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const totalPixels = width * height;
  const stride = Math.max(1, Math.floor(totalPixels / 15000));

  const chromaticBuckets = new Map<string, ColorBucket>();
  const neutralBuckets = new Map<string, ColorBucket>();

  for (let p = 0; p < totalPixels; p += stride) {
    const idx = p * 4;
    const alpha = data[idx + 3];
    if (alpha < 128) continue; // ignorar transparencia

    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const [h, s, l] = rgbToHsl(r, g, b);

    // Descartar extremos extremos (blanco puro quemado o negro puro sombra) para cromáticos
    const isExtremeNeutral = s < 0.14 || l < 0.08 || l > 0.93;
    if (!isExtremeNeutral) {
      const hBin = Math.floor(h / 15) % 24;
      const sBin = Math.min(3, Math.floor(s * 4));
      const lBin = Math.min(3, Math.floor(l * 4));
      const key = `${hBin}-${sBin}-${lBin}`;
      const bucket = chromaticBuckets.get(key) ?? { count: 0, rSum: 0, gSum: 0, bSum: 0 };
      bucket.count += 1;
      bucket.rSum += r;
      bucket.gSum += g;
      bucket.bSum += b;
      chromaticBuckets.set(key, bucket);
    } else {
      const lBin = Math.min(5, Math.floor(l * 6));
      const key = `n-${lBin}`;
      const bucket = neutralBuckets.get(key) ?? { count: 0, rSum: 0, gSum: 0, bSum: 0 };
      bucket.count += 1;
      bucket.rSum += r;
      bucket.gSum += g;
      bucket.bSum += b;
      neutralBuckets.set(key, bucket);
    }
  }

  let winningBucket: ColorBucket | null = null;
  for (const bucket of chromaticBuckets.values()) {
    if (!winningBucket || bucket.count > winningBucket.count) {
      winningBucket = bucket;
    }
  }

  if (!winningBucket) {
    for (const bucket of neutralBuckets.values()) {
      if (!winningBucket || bucket.count > winningBucket.count) {
        winningBucket = bucket;
      }
    }
  }

  if (!winningBucket || winningBucket.count === 0) {
    return '#8B7FD4';
  }

  return rgbToHex(
    winningBucket.rSum / winningBucket.count,
    winningBucket.gSum / winningBucket.count,
    winningBucket.bSum / winningBucket.count,
  );
}

export async function extractDominantColorFromBlob(blob: Blob): Promise<string> {
  const img = await loadImageFromSource(blob);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 200 / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return '#8B7FD4';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return extractDominantColorFromCanvas(canvas);
}

export const PRESET_GARMENT_COLORS: { hex: string; label: string }[] = [
  { hex: '#F5F0F6', label: 'Blanco hueso' },
  { hex: '#2D2A35', label: 'Negro carbón' },
  { hex: '#9E97AD', label: 'Gris suave' },
  { hex: '#D8C3A5', label: 'Beige arena' },
  { hex: '#FADADD', label: 'Rosa pastel' },
  { hex: '#E6E0F8', label: 'Lavanda' },
  { hex: '#6E61BE', label: 'Morado' },
  { hex: '#6C9BD2', label: 'Azul mezclilla' },
  { hex: '#7AC7A2', label: 'Verde menta' },
  { hex: '#F2A68D', label: 'Durazno coral' },
  { hex: '#E57A84', label: 'Rojo suave' },
  { hex: '#E9C46A', label: 'Mostaza crema' },
];
