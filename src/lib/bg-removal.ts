import { blobToCanvas, canvasToBlob } from '@/src/lib/image';

const MODEL_WARM_KEY = 'closetly_bg_model_ready';
const FIRST_RUN_TIMEOUT_MS = 60_000;
const SUBSEQUENT_RUN_TIMEOUT_MS = 15_000;

export type BgRemovalFailureReason = 'timeout' | 'worker-error';

export class BgRemovalError extends Error {
  readonly reason: BgRemovalFailureReason;

  constructor(reason: BgRemovalFailureReason, message: string) {
    super(message);
    this.name = 'BgRemovalError';
    this.reason = reason;
  }
}

export interface BgRemovalProgress {
  label: string;
  percent: number;
  isDownloadingModel: boolean;
}

export type BgRemovalEngineId = 'imgly' | 'solid-bg' | 'manual-brush';

export interface NormalizedSeedPoint {
  x: number; // 0..1
  y: number; // 0..1
}

export interface BgRemovalRunOptions {
  seeds?: NormalizedSeedPoint[];
  tolerance?: number; // 5..85 para 'solid-bg'
  featherPx?: number; // 0..4 px de suavizado de borde
  onProgress?: (progress: BgRemovalProgress) => void;
}

export interface BgRemovalEngine {
  readonly id: BgRemovalEngineId;
  readonly label: string;
  readonly description: string;
  readonly isFree: true;
  removeBackground: (input: Blob | HTMLCanvasElement, options?: BgRemovalRunOptions) => Promise<Blob>;
}

interface WorkerResponse {
  id: number;
  type: 'progress' | 'preloaded' | 'result' | 'error';
  key?: string;
  current?: number;
  total?: number;
  blob?: Blob;
  message?: string;
}

let sharedWorker: Worker | null = null;
let requestSeq = 1;
let preloadPromise: Promise<void> | null = null;

export function isBgModelWarm(): boolean {
  try {
    return localStorage.getItem(MODEL_WARM_KEY) === '1';
  } catch {
    return false;
  }
}

function markBgModelWarm(): void {
  try {
    localStorage.setItem(MODEL_WARM_KEY, '1');
  } catch {
    // Ignorar en entornos sin localStorage disponible
  }
}

function getWorkerInstance(): Worker {
  if (sharedWorker) return sharedWorker;
  if (typeof Worker === 'undefined') {
    throw new BgRemovalError('worker-error', 'Web Workers no disponibles en este navegador.');
  }
  sharedWorker = new Worker(
    new URL('../workers/background-removal.worker.ts', import.meta.url),
    { type: 'module' },
  );
  return sharedWorker;
}

function resetWorker(): void {
  if (sharedWorker) {
    sharedWorker.terminate();
    sharedWorker = null;
  }
}

export function preloadBackgroundRemovalModel(): Promise<void> {
  if (preloadPromise) return preloadPromise;

  preloadPromise = new Promise<void>((resolve) => {
    try {
      const worker = getWorkerInstance();
      const id = requestSeq++;

      const handleMessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.id !== id) return;
        if (event.data.type === 'preloaded') {
          worker.removeEventListener('message', handleMessage);
          markBgModelWarm();
          resolve();
        } else if (event.data.type === 'error') {
          worker.removeEventListener('message', handleMessage);
          preloadPromise = null;
          resolve();
        }
      };

      worker.addEventListener('message', handleMessage);
      worker.postMessage({ id, type: 'preload' });
    } catch {
      preloadPromise = null;
      resolve();
    }
  });

  return preloadPromise;
}

export function removeBackgroundWithTimeout(
  imageBlob: Blob,
  onProgress?: (progress: BgRemovalProgress) => void,
): Promise<Blob> {
  const warm = isBgModelWarm();
  const timeoutMs = warm ? SUBSEQUENT_RUN_TIMEOUT_MS : FIRST_RUN_TIMEOUT_MS;

  return new Promise<Blob>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = getWorkerInstance();
    } catch (error) {
      reject(error);
      return;
    }

    const id = requestSeq++;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resetWorker();
      preloadPromise = null;
      reject(
        new BgRemovalError(
          'timeout',
          warm
            ? 'El recorte local tardó más de 15 segundos.'
            : 'La descarga del modelo de recorte superó los 60 segundos.',
        ),
      );
    }, timeoutMs);

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (data.id !== id) return;

      if (data.type === 'progress') {
        const total = data.total && data.total > 0 ? data.total : 1;
        const current = data.current ?? 0;
        const percent = Math.min(99, Math.max(0, Math.round((current / total) * 100)));
        const isFetch = Boolean(data.key && data.key.startsWith('fetch'));
        onProgress?.({
          isDownloadingModel: isFetch && !warm,
          percent,
          label:
            isFetch && !warm
              ? 'Preparando el recorte, solo la primera vez'
              : 'Recortando fondo de tu prenda...',
        });
        return;
      }

      if (data.type === 'result' && data.blob) {
        if (settled) return;
        settled = true;
        cleanup();
        markBgModelWarm();
        onProgress?.({ isDownloadingModel: false, percent: 100, label: 'Recorte listo' });
        resolve(data.blob);
        return;
      }

      if (data.type === 'error') {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new BgRemovalError('worker-error', data.message || 'Error al recortar el fondo.'));
      }
    };

    const onError = (err: ErrorEvent) => {
      if (settled) return;
      settled = true;
      cleanup();
      resetWorker();
      reject(
        new BgRemovalError(
          'worker-error',
          err.message || 'El proceso de recorte en segundo plano falló.',
        ),
      );
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ id, type: 'remove', blob: imageBlob });
  });
}

/* -------------------------------------------------------------------------- */
/* Implementación 'solid-bg' (Varita mágica gratuita por flood fill)          */
/* -------------------------------------------------------------------------- */

function perceptualColorDistSq(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
}

function computeSobelEdges(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const lum = new Float32Array(width * height);
  for (let i = 0, p = 0; i < lum.length; i += 1, p += 4) {
    lum[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }

  const edges = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    const row = y * width;
    for (let x = 1; x < width - 1; x += 1) {
      const i = row + x;
      const gx =
        -lum[i - width - 1] +
        lum[i - width + 1] -
        2 * lum[i - 1] +
        2 * lum[i + 1] -
        lum[i + width - 1] +
        lum[i + width + 1];
      const gy =
        -lum[i - width - 1] -
        2 * lum[i - width] -
        lum[i - width + 1] +
        lum[i + width - 1] +
        2 * lum[i + width] +
        lum[i + width + 1];
      edges[i] = Math.hypot(gx, gy) * 0.25;
    }
  }
  return edges;
}

/**
 * Varita mágica ('solid-bg'): elimina el fondo por flood fill desde los puntos tocados
 * por el usuario con tolerancia ajustable y suavizado de borde.
 */
export function applyMagicWandFloodFill(
  sourceCanvas: HTMLCanvasElement,
  seeds: NormalizedSeedPoint[],
  tolerance = 28,
  featherPx = 1.5,
): HTMLCanvasElement {
  const cleanCopy = () => {
    const copy = document.createElement('canvas');
    copy.width = sourceCanvas.width;
    copy.height = sourceCanvas.height;
    const ctx = copy.getContext('2d');
    if (ctx) ctx.drawImage(sourceCanvas, 0, 0);
    return copy;
  };

  if (seeds.length === 0) {
    return cleanCopy();
  }

  const maxWorkSide = 440;
  const scale = Math.min(1, maxWorkSide / Math.max(sourceCanvas.width, sourceCanvas.height));
  const w = Math.max(16, Math.round(sourceCanvas.width * scale));
  const h = Math.max(16, Math.round(sourceCanvas.height * scale));

  const workCanvas = document.createElement('canvas');
  workCanvas.width = w;
  workCanvas.height = h;
  const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!workCtx) {
    return cleanCopy();
  }
  workCtx.drawImage(sourceCanvas, 0, 0, w, h);

  const imgData = workCtx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const edges = computeSobelEdges(data, w, h);

  const bgMask = new Uint8Array(w * h); // 1 = eliminado, 0 = conservado
  const queue = new Int32Array(w * h);

  const clampedTol = Math.min(90, Math.max(4, tolerance));
  const globalDistSq = clampedTol * clampedTol * 1.45;
  const localStepSq = Math.max(12 * 12, clampedTol * clampedTol * 0.65);
  const edgeBarrier = 22 + clampedTol * 0.45;

  // Cada punto tocado lanza un flood fill desde el color promedio de una vecindad 3x3
  for (const seed of seeds) {
    const sx = Math.max(0, Math.min(w - 1, Math.round(seed.x * (w - 1))));
    const sy = Math.max(0, Math.min(h - 1, Math.round(seed.y * (h - 1))));

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      const ny = sy + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = sx + dx;
        if (nx < 0 || nx >= w) continue;
        const p = (ny * w + nx) * 4;
        if (data[p + 3] < 15) continue;
        rSum += data[p];
        gSum += data[p + 1];
        bSum += data[p + 2];
        count += 1;
      }
    }

    const seedIdx = sy * w + sx;
    const sp = seedIdx * 4;
    const sr = count > 0 ? rSum / count : data[sp];
    const sg = count > 0 ? gSum / count : data[sp + 1];
    const sb = count > 0 ? bSum / count : data[sp + 2];

    let head = 0;
    let tail = 0;
    if (bgMask[seedIdx] === 0) {
      bgMask[seedIdx] = 1;
      queue[tail++] = seedIdx;
    }

    while (head < tail) {
      const curr = queue[head++];
      const cx = curr % w;
      const cy = (curr - cx) / w;
      const c4 = curr * 4;
      const cr = data[c4];
      const cg = data[c4 + 1];
      const cb = data[c4 + 2];

      const neighbors = [
        cx > 0 ? curr - 1 : -1,
        cx < w - 1 ? curr + 1 : -1,
        cy > 0 ? curr - w : -1,
        cy < h - 1 ? curr + w : -1,
      ];

      for (const next of neighbors) {
        if (next < 0 || bgMask[next] === 1) continue;
        const n4 = next * 4;

        if (data[n4 + 3] < 15) {
          bgMask[next] = 1;
          queue[tail++] = next;
          continue;
        }

        const nr = data[n4];
        const ng = data[n4 + 1];
        const nb = data[n4 + 2];

        const distFromSeed = perceptualColorDistSq(nr, ng, nb, sr, sg, sb);
        if (distFromSeed > globalDistSq) continue;

        const distFromNeighbor = perceptualColorDistSq(nr, ng, nb, cr, cg, cb);
        if (distFromNeighbor > localStepSq) continue;

        if (edges[next] > edgeBarrier && distFromSeed > globalDistSq * 0.45) {
          continue;
        }

        bgMask[next] = 1;
        queue[tail++] = next;
      }
    }
  }

  // Limpieza morfológica ligera para eliminar píxeles aislados en el borde
  const alphaMask = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      let fgNeighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          if (bgMask[ny * w + nx] === 0) fgNeighbors += 1;
        }
      }
      const keepForeground = bgMask[i] === 0 ? fgNeighbors >= 3 : fgNeighbors >= 6;
      const p = i * 4;
      alphaMask[p] = 255;
      alphaMask[p + 1] = 255;
      alphaMask[p + 2] = 255;
      alphaMask[p + 3] = keepForeground ? 255 : 0;
    }
  }

  workCtx.putImageData(new ImageData(alphaMask, w, h), 0, 0);

  const output = document.createElement('canvas');
  output.width = sourceCanvas.width;
  output.height = sourceCanvas.height;
  const outCtx = output.getContext('2d');
  if (!outCtx) return cleanCopy();

  outCtx.drawImage(sourceCanvas, 0, 0);
  outCtx.save();
  outCtx.globalCompositeOperation = 'destination-in';
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  const clampedFeather = Math.min(4, Math.max(0, featherPx));
  if (clampedFeather > 0) {
    outCtx.filter = `blur(${clampedFeather.toFixed(1)}px)`;
  }
  outCtx.drawImage(workCanvas, 0, 0, output.width, output.height);
  outCtx.restore();

  return output;
}

/* -------------------------------------------------------------------------- */
/* Cadena de motores gratuitos (BgRemovalEngine)                              */
/* -------------------------------------------------------------------------- */

export const imglyBgRemovalEngine: BgRemovalEngine = {
  id: 'imgly',
  label: 'Recorte automático local (IA)',
  description: 'Segmentación gratuita en Web Worker con @imgly/background-removal (AGPL-3.0).',
  isFree: true,
  async removeBackground(input, options) {
    const blob = input instanceof Blob ? input : await canvasToBlob(input, 'image/png', 1);
    return removeBackgroundWithTimeout(blob, options?.onProgress);
  },
};

export const solidBgMagicWandEngine: BgRemovalEngine = {
  id: 'solid-bg',
  label: 'Varita mágica (fondo liso)',
  description: 'Flood fill gratuito desde el punto tocado con tolerancia y suavizado de borde.',
  isFree: true,
  async removeBackground(input, options) {
    const canvas = input instanceof Blob ? await blobToCanvas(input, 1200) : input;
    const seeds =
      options?.seeds && options.seeds.length > 0 ? options.seeds : [{ x: 0.03, y: 0.03 }];
    const resultCanvas = applyMagicWandFloodFill(
      canvas,
      seeds,
      options?.tolerance ?? 28,
      options?.featherPx ?? 1.5,
    );
    return canvasToBlob(resultCanvas, 'image/png', 1);
  },
};

export const BG_REMOVAL_ENGINES: readonly BgRemovalEngine[] = [
  imglyBgRemovalEngine,
  solidBgMagicWandEngine,
];

// EXTENSION PHASE 3: Si se evalúa un modelo alternativo (por ejemplo U²-Net con onnxruntime-web),
// implementarlo aquí como otra instancia cargada de forma lazy que implemente BgRemovalEngine,
// verificando y documentando previamente su licencia comercial en README.md.
