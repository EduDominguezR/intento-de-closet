import { mapAvatarConfigTo3D, normalizeAvatarConfig, type Avatar3DParams } from '@/src/lib/avatar/mapping';
import type { AvatarConfig } from '@/src/lib/avatar/types';

export type AvatarProviderType = 'parametric' | 'photo';

export interface ParametricAvatarResult {
  provider: 'parametric';
  config: AvatarConfig;
  params3D: Avatar3DParams;
}

export interface AvatarProvider {
  readonly id: AvatarProviderType;
  resolveParametric(config: AvatarConfig): ParametricAvatarResult;
}

export const parametricAvatarProvider: AvatarProvider = {
  id: 'parametric',
  resolveParametric(rawConfig: AvatarConfig): ParametricAvatarResult {
    const config = normalizeAvatarConfig(rawConfig);
    return {
      provider: 'parametric',
      config,
      params3D: mapAvatarConfigTo3D(config),
    };
  },
};

// EXTENSION PHASE 3: Proveedor foto→avatar alojado bajo consentimiento explícito del usuario.
// En el MVP NO se implementa ni se suben fotos de cuerpo a ningún servidor.
export interface PhotoAvatarInput {
  bodyPhotoBlob: Blob;
  consentAccepted: boolean;
}

export const photoAvatarProvider = {
  id: 'photo' as const,
  async generateFromPhoto(_input: PhotoAvatarInput): Promise<AvatarConfig> {
    throw new Error('El proveedor foto→avatar está reservado para la Fase 3.');
  },
};
