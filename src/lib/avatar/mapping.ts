import {
  DEFAULT_AVATAR_CONFIG,
  isAvatarRenderer,
  type AvatarBodyType,
  type AvatarConfig,
  type AvatarHairStyle,
  type AvatarHeightType,
  type AvatarRenderer,
} from '@/src/lib/avatar/types';

export interface Avatar3DProportions {
  shoulderScaleX: number;
  chestScaleX: number;
  waistScaleX: number;
  hipScaleX: number;
  limbScaleX: number;
  depthScaleZ: number;
  heightScaleY: number;
  torsoLengthFactor: number;
  legLengthFactor: number;
  totalHeightMeters: number;
}

export interface Avatar3DParams {
  skinColor: string;
  hairStyle: AvatarHairStyle;
  hairColor: string;
  body: AvatarBodyType;
  height: AvatarHeightType;
  morphWeights: {
    slim: number;
    curvy: number;
    short: number;
    tall: number;
  };
  proportions: Avatar3DProportions;
}

const LEGACY_HAIR_MAP: Record<string, { style: AvatarHairStyle; color: string }> = {
  'wavy-espresso': { style: 'wavy', color: '#4E3830' },
  'short-bob': { style: 'bob', color: '#7D543D' },
  'sleek-bun': { style: 'bun', color: '#2F2A36' },
  'curly-amber': { style: 'wavy', color: '#B57B45' },
  'crop-ash': { style: 'crop', color: '#6E6678' },
  'long-rose': { style: 'long', color: '#A97C98' },
};

const VALID_STYLES = new Set<AvatarHairStyle>(['wavy', 'bob', 'bun', 'crop', 'long']);

function sanitizeHex(hex: unknown, fallback: string): string {
  return typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : fallback;
}

export function normalizeHairStyle(style: unknown): AvatarHairStyle {
  if (typeof style === 'string' && VALID_STYLES.has(style as AvatarHairStyle)) {
    return style as AvatarHairStyle;
  }
  return 'wavy';
}

/**
 * Normaliza configuraciones antiguas (hair como string) y actuales ({ style, color })
 * para garantizar que 2D y 3D lean exactamente el mismo modelo de datos.
 */
export function normalizeAvatarConfig(raw: unknown): AvatarConfig {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_AVATAR_CONFIG;
  }
  const obj = raw as Record<string, unknown>;

  const body: AvatarBodyType =
    obj.body === 'slim' || obj.body === 'regular' || obj.body === 'curvy' ? obj.body : 'regular';
  const height: AvatarHeightType =
    obj.height === 'short' || obj.height === 'average' || obj.height === 'tall'
      ? obj.height
      : 'average';
  const renderer: AvatarRenderer = isAvatarRenderer(obj.renderer) ? obj.renderer : '2d';
  const skin = sanitizeHex(obj.skin, DEFAULT_AVATAR_CONFIG.skin);

  let hair = { ...DEFAULT_AVATAR_CONFIG.hair };
  if (typeof obj.hair === 'string') {
    const legacy = LEGACY_HAIR_MAP[obj.hair];
    if (legacy) {
      hair = { style: legacy.style, color: legacy.color };
    } else if (VALID_STYLES.has(obj.hair as AvatarHairStyle)) {
      hair = { style: obj.hair as AvatarHairStyle, color: DEFAULT_AVATAR_CONFIG.hair.color };
    }
  } else if (obj.hair && typeof obj.hair === 'object') {
    const h = obj.hair as Record<string, unknown>;
    hair = {
      style: normalizeHairStyle(h.style),
      color: sanitizeHex(h.color, DEFAULT_AVATAR_CONFIG.hair.color),
    };
  }

  return { skin, hair, body, height, renderer };
}

const BODY_PROPORTIONS: Record<
  AvatarBodyType,
  Pick<
    Avatar3DProportions,
    'shoulderScaleX' | 'chestScaleX' | 'waistScaleX' | 'hipScaleX' | 'limbScaleX' | 'depthScaleZ'
  >
> = {
  slim: {
    shoulderScaleX: 0.91,
    chestScaleX: 0.9,
    waistScaleX: 0.86,
    hipScaleX: 0.89,
    limbScaleX: 0.88,
    depthScaleZ: 0.92,
  },
  regular: {
    shoulderScaleX: 1,
    chestScaleX: 1,
    waistScaleX: 1,
    hipScaleX: 1,
    limbScaleX: 1,
    depthScaleZ: 1,
  },
  curvy: {
    shoulderScaleX: 1.03,
    chestScaleX: 1.09,
    waistScaleX: 1.04,
    hipScaleX: 1.18,
    limbScaleX: 1.09,
    depthScaleZ: 1.1,
  },
};

const HEIGHT_PROPORTIONS: Record<
  AvatarHeightType,
  Pick<
    Avatar3DProportions,
    'heightScaleY' | 'torsoLengthFactor' | 'legLengthFactor' | 'totalHeightMeters'
  >
> = {
  short: {
    heightScaleY: 0.92,
    torsoLengthFactor: 0.94,
    legLengthFactor: 0.89,
    totalHeightMeters: 1.56,
  },
  average: {
    heightScaleY: 1,
    torsoLengthFactor: 1,
    legLengthFactor: 1,
    totalHeightMeters: 1.68,
  },
  tall: {
    heightScaleY: 1.06,
    torsoLengthFactor: 1.03,
    legLengthFactor: 1.09,
    totalHeightMeters: 1.78,
  },
};

/**
 * Misma fuente de verdad para Avatar2D y Avatar3D:
 * convierte AvatarConfig a pesos de morph targets + proporciones procedurales coherentes.
 */
export function mapAvatarConfigTo3D(rawConfig: AvatarConfig): Avatar3DParams {
  const config = normalizeAvatarConfig(rawConfig);
  const bodyProps = BODY_PROPORTIONS[config.body];
  const heightProps = HEIGHT_PROPORTIONS[config.height];

  return {
    skinColor: config.skin,
    hairStyle: normalizeHairStyle(config.hair.style),
    hairColor: config.hair.color,
    body: config.body,
    height: config.height,
    morphWeights: {
      slim: config.body === 'slim' ? 1 : 0,
      curvy: config.body === 'curvy' ? 1 : 0,
      short: config.height === 'short' ? 1 : 0,
      tall: config.height === 'tall' ? 1 : 0,
    },
    proportions: {
      ...bodyProps,
      ...heightProps,
    },
  };
}

export interface TorsoKnot {
  y: number;
  rx: number;
  rz: number;
  zOffset: number;
}

export interface LegKnot {
  t: number;
  rx: number;
  rz: number;
}

export interface AvatarAnatomy {
  totalHeight: number;
  headHeight: number;
  headRx: number;
  headRy: number;
  headRz: number;
  headCenterY: number;
  chinY: number;
  neckTopY: number;
  neckBaseY: number;
  shoulderY: number;
  chestY: number;
  waistY: number;
  hipY: number;
  crotchY: number;
  hipJointY: number;
  kneeY: number;
  ankleY: number;
  hipSpacingX: number;
  ankleSpacingX: number;
  shoulderJointX: number;
  shoulderJointY: number;
  armTopR: number;
  elbowR: number;
  wristR: number;
  upperArmLen: number;
  forearmLen: number;
  armAbductionRad: number;
  torsoKnots: TorsoKnot[];
  legKnots: LegKnot[];
}

function smoothstepInterp(a: number, b: number, t: number): number {
  const u = Math.max(0, Math.min(1, t));
  const s = u * u * (3 - 2 * u);
  return a + (b - a) * s;
}

/**
 * Calcula las medidas anatómicas continuas del avatar con proporción realista
 * (cabeza = 1 / 7.5 de la estatura total) compartida entre el cuerpo y las prendas.
 */
export function computeAvatarAnatomy(params: Avatar3DParams): AvatarAnatomy {
  const {
    shoulderScaleX,
    chestScaleX,
    waistScaleX,
    hipScaleX,
    limbScaleX,
    depthScaleZ,
    torsoLengthFactor,
    totalHeightMeters,
  } = params.proportions;

  const totalHeight = totalHeightMeters;
  const headHeight = totalHeight / 7.5;
  const headRy = headHeight * 0.5;
  const headRx = headRy * 0.77;
  const headRz = headRy * 0.85;

  const headCenterY = totalHeight - headRy;
  const chinY = totalHeight - headHeight;
  const neckTopY = chinY + headRy * 0.24;
  const neckBaseY = chinY - headHeight * 0.34;
  const shoulderY = neckBaseY - headHeight * 0.09;

  const ankleY = 0.062;
  const legSpanRatio =
    params.height === 'tall' ? 0.602 : params.height === 'short' ? 0.568 : 0.585;
  const bodySpan = shoulderY - ankleY;

  const hipY = ankleY + bodySpan * legSpanRatio;
  const crotchY = hipY - 0.072 * torsoLengthFactor;
  const hipJointY = crotchY + 0.032 * torsoLengthFactor;
  const kneeY = ankleY + (crotchY - ankleY) * 0.515;

  const waistY = hipY + (shoulderY - hipY) * 0.38;
  const chestY = hipY + (shoulderY - hipY) * 0.72;

  const hipSpacingX = 0.084 * hipScaleX;
  const ankleSpacingX = 0.066 * hipScaleX;

  const shoulderRx = 0.16 * shoulderScaleX;
  const armTopR = 0.041 * limbScaleX;
  const elbowR = 0.033 * limbScaleX;
  const wristR = 0.025 * limbScaleX;
  const shoulderJointY = shoulderY - 0.034;
  const shoulderJointX = shoulderRx - armTopR * 0.48;

  const upperArmLen = (shoulderY - waistY) * 0.76;
  const forearmLen = (shoulderY - waistY) * 0.68;
  const armAbductionRad = params.body === 'curvy' ? 0.19 : 0.165;

  const neckScale = Math.sqrt(limbScaleX);
  const torsoKnots: TorsoKnot[] = [
    {
      y: crotchY - 0.015,
      rx: 0.092 * hipScaleX,
      rz: 0.072 * depthScaleZ,
      zOffset: 0,
    },
    {
      y: crotchY + 0.03 * torsoLengthFactor,
      rx: 0.142 * hipScaleX,
      rz: 0.098 * depthScaleZ,
      zOffset: -0.004,
    },
    {
      y: hipY,
      rx: 0.156 * hipScaleX,
      rz: 0.106 * depthScaleZ,
      zOffset: -0.005,
    },
    {
      y: waistY,
      rx: 0.114 * waistScaleX,
      rz: 0.081 * depthScaleZ,
      zOffset: 0.002,
    },
    {
      y: chestY,
      rx: 0.144 * chestScaleX,
      rz: 0.102 * depthScaleZ,
      zOffset: 0.006,
    },
    {
      y: shoulderY - 0.024,
      rx: shoulderRx,
      rz: 0.089 * depthScaleZ,
      zOffset: 0,
    },
    {
      y: shoulderY + 0.01,
      rx: 0.122 * shoulderScaleX,
      rz: 0.076 * depthScaleZ,
      zOffset: 0,
    },
    {
      y: neckBaseY,
      rx: 0.047 * neckScale,
      rz: 0.045 * neckScale,
      zOffset: -0.002,
    },
    {
      y: (neckBaseY + neckTopY) * 0.5,
      rx: 0.042 * neckScale,
      rz: 0.041 * neckScale,
      zOffset: 0,
    },
    {
      y: neckTopY,
      rx: 0.044 * neckScale,
      rz: 0.043 * neckScale,
      zOffset: 0.002,
    },
  ];

  const legKnots: LegKnot[] = [
    { t: 0.0, rx: 0.035 * limbScaleX, rz: 0.036 * limbScaleX },
    { t: 0.18, rx: 0.040 * limbScaleX, rz: 0.041 * limbScaleX },
    { t: 0.36, rx: 0.052 * limbScaleX, rz: 0.053 * limbScaleX },
    { t: 0.52, rx: 0.046 * limbScaleX, rz: 0.046 * limbScaleX },
    { t: 0.72, rx: 0.060 * hipScaleX, rz: 0.060 * depthScaleZ },
    { t: 0.90, rx: 0.069 * hipScaleX, rz: 0.068 * depthScaleZ },
    { t: 1.0, rx: 0.065 * hipScaleX, rz: 0.064 * depthScaleZ },
  ];

  return {
    totalHeight,
    headHeight,
    headRx,
    headRy,
    headRz,
    headCenterY,
    chinY,
    neckTopY,
    neckBaseY,
    shoulderY,
    chestY,
    waistY,
    hipY,
    crotchY,
    hipJointY,
    kneeY,
    ankleY,
    hipSpacingX,
    ankleSpacingX,
    shoulderJointX,
    shoulderJointY,
    armTopR,
    elbowR,
    wristR,
    upperArmLen,
    forearmLen,
    armAbductionRad,
    torsoKnots,
    legKnots,
  };
}

/**
 * Muestrea el radio horizontal (rx, rz) y desplazamiento Z del torso continuo
 * en cualquier altura Y entre la base pélvica y el cuello.
 */
export function sampleTorsoSection(
  anatomy: AvatarAnatomy,
  y: number,
): { rx: number; rz: number; zOffset: number } {
  const knots = anatomy.torsoKnots;
  if (y <= knots[0].y) {
    return { rx: knots[0].rx, rz: knots[0].rz, zOffset: knots[0].zOffset };
  }
  const last = knots[knots.length - 1];
  if (y >= last.y) {
    return { rx: last.rx, rz: last.rz, zOffset: last.zOffset };
  }

  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[i];
    const b = knots[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / Math.max(1e-5, b.y - a.y);
      return {
        rx: smoothstepInterp(a.rx, b.rx, t),
        rz: smoothstepInterp(a.rz, b.rz, t),
        zOffset: smoothstepInterp(a.zOffset, b.zOffset, t),
      };
    }
  }
  return { rx: last.rx, rz: last.rz, zOffset: last.zOffset };
}

/**
 * Muestrea la posición X del eje de la pierna y su radio en cualquier altura Y
 * entre ankleY y hipJointY.
 */
export function sampleLegSection(
  anatomy: AvatarAnatomy,
  y: number,
): { centerX: number; rx: number; rz: number } {
  const span = Math.max(0.1, anatomy.hipJointY - anatomy.ankleY);
  const t = Math.max(0, Math.min(1, (y - anatomy.ankleY) / span));
  const centerX =
    anatomy.ankleSpacingX + (anatomy.hipSpacingX - anatomy.ankleSpacingX) * t;

  const knots = anatomy.legKnots;
  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[i];
    const b = knots[i + 1];
    if (t >= a.t && t <= b.t) {
      const localT = (t - a.t) / Math.max(1e-5, b.t - a.t);
      return {
        centerX,
        rx: smoothstepInterp(a.rx, b.rx, localT),
        rz: smoothstepInterp(a.rz, b.rz, localT),
      };
    }
  }
  const last = knots[knots.length - 1];
  return { centerX, rx: last.rx, rz: last.rz };
}

