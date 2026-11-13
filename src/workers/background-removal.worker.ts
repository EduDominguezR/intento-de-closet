import { preload, removeBackground, type Config } from '@imgly/background-removal';

interface WorkerRequest {
  id: number;
  type: 'preload' | 'remove';
  blob?: Blob;
}

const MODEL_CONFIG: Config = {
  model: 'isnet_quint8',
  proxyToWorker: false,
  output: {
    format: 'image/png',
    quality: 1,
  },
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, blob } = event.data;

  try {
    if (type === 'preload') {
      await preload({
        ...MODEL_CONFIG,
        progress: (key, current, total) => {
          self.postMessage({ id, type: 'progress', key, current, total });
        },
      });
      self.postMessage({ id, type: 'preloaded' });
      return;
    }

    if (type === 'remove') {
      if (!blob) {
        throw new Error('No se recibió imagen para recortar.');
      }
      const resultBlob = await removeBackground(blob, {
        ...MODEL_CONFIG,
        progress: (key, current, total) => {
          self.postMessage({ id, type: 'progress', key, current, total });
        },
      });
      self.postMessage({ id, type: 'result', blob: resultBlob });
    }
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      message: error instanceof Error ? error.message : 'Error en recorte de fondo local.',
    });
  }
};
