import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export type GarmentTemplate3DId =
  | 'tshirt'
  | 'longsleeve'
  | 'jacket'
  | 'pants'
  | 'shorts'
  | 'skirt'
  | 'dress'
  | 'shoes';

export interface ManifestTemplateEntry {
  glb: string | null;
  slot: 'top' | 'outerwear' | 'bottom' | 'dress' | 'shoes';
}

export interface ModelsManifest {
  version: number;
  avatar: {
    glb: string | null;
    morphTargets: {
      slim: string;
      curvy: string;
      short: string;
      tall: string;
    };
  };
  templates: Record<GarmentTemplate3DId, ManifestTemplateEntry>;
}

export const DEFAULT_MODELS_MANIFEST: ModelsManifest = {
  version: 1,
  avatar: {
    glb: null,
    morphTargets: {
      slim: 'body_slim',
      curvy: 'body_curvy',
      short: 'height_short',
      tall: 'height_tall',
    },
  },
  templates: {
    tshirt: { glb: null, slot: 'top' },
    longsleeve: { glb: null, slot: 'top' },
    jacket: { glb: null, slot: 'outerwear' },
    pants: { glb: null, slot: 'bottom' },
    shorts: { glb: null, slot: 'bottom' },
    skirt: { glb: null, slot: 'bottom' },
    dress: { glb: null, slot: 'dress' },
    shoes: { glb: null, slot: 'shoes' },
  },
};

let manifestPromise: Promise<ModelsManifest> | null = null;
let sharedGltfLoader: GLTFLoader | null = null;

export function loadModelsManifest(): Promise<ModelsManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch('/models/manifest.json')
      .then(async (res) => {
        if (!res.ok) return DEFAULT_MODELS_MANIFEST;
        const parsed = (await res.json()) as Partial<ModelsManifest>;
        return {
          version: typeof parsed.version === 'number' ? parsed.version : 1,
          avatar: {
            glb: parsed.avatar?.glb ?? null,
            morphTargets: {
              ...DEFAULT_MODELS_MANIFEST.avatar.morphTargets,
              ...(parsed.avatar?.morphTargets ?? {}),
            },
          },
          templates: {
            ...DEFAULT_MODELS_MANIFEST.templates,
            ...(parsed.templates ?? {}),
          },
        };
      })
      .catch(() => DEFAULT_MODELS_MANIFEST);
  }
  return manifestPromise;
}

function getGltfLoader(): GLTFLoader {
  if (!sharedGltfLoader) {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(dracoLoader);
    loader.setMeshoptDecoder(MeshoptDecoder);
    sharedGltfLoader = loader;
  }
  return sharedGltfLoader;
}

/**
 * Carga un archivo .glb únicamente si el manifest define una ruta no nula.
 * Si falla o es null, retorna null para activar el modelo procedural sin errores 404.
 */
export async function loadGLBModel(glbPath: string | null | undefined): Promise<GLTF | null> {
  if (!glbPath) return null;
  const loader = getGltfLoader();
  return new Promise((resolve) => {
    loader.load(
      glbPath,
      (gltf) => resolve(gltf),
      undefined,
      () => resolve(null),
    );
  });
}

export function applyMorphTargets(
  root: THREE.Object3D,
  morphMap: Record<string, string>,
  weights: Record<string, number>,
): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
    for (const [key, targetName] of Object.entries(morphMap)) {
      const idx = mesh.morphTargetDictionary[targetName];
      if (typeof idx === 'number' && idx >= 0 && idx < mesh.morphTargetInfluences.length) {
        mesh.morphTargetInfluences[idx] = weights[key] ?? 0;
      }
    }
  });
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        for (const value of Object.values(mat)) {
          if (value instanceof THREE.Texture) {
            value.dispose();
          }
        }
        mat.dispose();
      }
    }
  });
}
