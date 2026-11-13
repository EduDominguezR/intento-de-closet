export const AVATAR_RENDERERS = ['2d', '3d', 'photo'] as const;
export type AvatarRenderer = (typeof AVATAR_RENDERERS)[number];

export function isAvatarRenderer(v: unknown): v is AvatarRenderer {
  return typeof v === 'string' && (AVATAR_RENDERERS as readonly string[]).includes(v);
}

export type AvatarBodyType = 'slim' | 'regular' | 'curvy';
export type AvatarHeightType = 'short' | 'average' | 'tall';
export type AvatarHairStyle = 'wavy' | 'bob' | 'bun' | 'crop' | 'long';

export interface AvatarHairConfig {
  style: string;
  color: string;
}

export interface AvatarConfig {
  skin: string;
  hair: AvatarHairConfig;
  body: AvatarBodyType;
  height: AvatarHeightType;
  renderer: AvatarRenderer;
}

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  skin: '#E8B89A',
  hair: {
    style: 'wavy',
    color: '#4E3830',
  },
  body: 'regular',
  height: 'average',
  renderer: '2d',
};
