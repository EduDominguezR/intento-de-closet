import { normalizeAvatarConfig } from '@/src/lib/avatar/mapping';
import type { AvatarBodyType, AvatarConfig, AvatarHairStyle, AvatarHeightType } from '@/src/lib/avatar/types';

interface Avatar2DProps {
  config: AvatarConfig;
  className?: string;
}

export interface HairStyleOption {
  id: AvatarHairStyle;
  label: string;
}

export interface HairColorOption {
  hex: string;
  label: string;
}

export const AVATAR_SKIN_OPTIONS: { hex: string; label: string }[] = [
  { hex: '#F7D9C4', label: 'Claro cálido' },
  { hex: '#E8B89A', label: 'Trigueño suave' },
  { hex: '#C98E6B', label: 'Canela' },
  { hex: '#9D6644', label: 'Avellana' },
  { hex: '#69402B', label: 'Ébano' },
];

export const AVATAR_HAIR_STYLES: HairStyleOption[] = [
  { id: 'wavy', label: 'Ondulado' },
  { id: 'bob', label: 'Corte bob' },
  { id: 'bun', label: 'Chongo alto' },
  { id: 'crop', label: 'Corte corto' },
  { id: 'long', label: 'Largo liso' },
];

export const AVATAR_HAIR_COLORS: HairColorOption[] = [
  { hex: '#2F2A36', label: 'Negro suave' },
  { hex: '#4E3830', label: 'Espresso' },
  { hex: '#7D543D', label: 'Castaño' },
  { hex: '#B57B45', label: 'Miel dorada' },
  { hex: '#6E6678', label: 'Cenizo' },
  { hex: '#A97C98', label: 'Malva pastel' },
];

const BODY_PATHS: Record<
  AvatarBodyType,
  { torso: string; topBase: string; bottomBase: string; armLeft: string; armRight: string }
> = {
  slim: {
    torso:
      'M126 164 C126 154 140 151 160 151 C180 151 194 154 194 164 L189 278 L194 348 C194 374 188 446 180 554 C179 568 166 568 165 554 L161 388 L159 388 L155 554 C154 568 141 568 140 554 C132 446 126 374 126 348 L131 278 Z',
    topBase: 'M132 176 L188 176 L185 244 L135 244 Z',
    bottomBase: 'M129 306 L191 306 L193 356 L164 356 L160 342 L156 356 L127 356 Z',
    armLeft: 'M126 164 L109 258 C108 267 119 270 123 260 L132 198 Z',
    armRight: 'M194 164 L211 258 C212 267 201 270 197 260 L188 198 Z',
  },
  regular: {
    torso:
      'M120 165 C120 154 138 151 160 151 C182 151 200 154 200 165 L192 278 L201 348 C201 376 192 446 183 554 C182 568 167 568 166 554 L161 390 L159 390 L154 554 C153 568 138 568 137 554 C128 446 119 376 119 348 L128 278 Z',
    topBase: 'M128 176 L192 176 L188 244 L132 244 Z',
    bottomBase: 'M124 306 L196 306 L199 358 L164 358 L160 343 L156 358 L121 358 Z',
    armLeft: 'M120 165 L103 258 C102 268 114 271 118 260 L128 198 Z',
    armRight: 'M200 165 L217 258 C218 268 206 271 202 260 L192 198 Z',
  },
  curvy: {
    torso:
      'M116 166 C116 154 136 151 160 151 C184 151 204 154 204 166 L194 272 C205 304 214 330 212 356 C210 388 197 450 186 554 C185 568 168 568 167 554 L161 394 L159 394 L153 554 C152 568 135 568 134 554 C123 450 110 388 108 356 C106 330 115 304 126 272 Z',
    topBase: 'M125 176 L195 176 L190 245 L130 245 Z',
    bottomBase: 'M116 306 L204 306 L210 362 L166 362 L160 345 L154 362 L110 362 Z',
    armLeft: 'M116 166 L98 258 C97 268 110 272 114 260 L124 200 Z',
    armRight: 'M204 166 L222 258 C223 268 210 272 206 260 L196 200 Z',
  },
};

const HEIGHT_TRANSFORMS: Record<AvatarHeightType, { scaleY: number; translateY: number }> = {
  short: { scaleY: 0.92, translateY: 36 },
  average: { scaleY: 1, translateY: 0 },
  tall: { scaleY: 1.05, translateY: -18 },
};

export function Avatar2D({ config: rawConfig, className = 'w-full h-full' }: Avatar2DProps) {
  const config = normalizeAvatarConfig(rawConfig);
  const hairStyle = config.hair.style as AvatarHairStyle;
  const hairColor = config.hair.color;
  const bodyShape = BODY_PATHS[config.body] ?? BODY_PATHS.regular;
  const heightTx = HEIGHT_TRANSFORMS[config.height] ?? HEIGHT_TRANSFORMS.average;

  return (
    <svg
      viewBox="0 0 320 620"
      className={className}
      role="img"
      aria-label={`Maniquí 2D complexión ${config.body}, estatura ${config.height}`}
    >
      {/* Sombra de suelo */}
      <ellipse cx="160" cy="592" rx="64" ry="12" fill="#E6E0F8" opacity="0.65" />

      <g transform={`translate(0, ${heightTx.translateY}) scale(1, ${heightTx.scaleY})`}>
        {/* Cabello trasero según estilo */}
        {hairStyle === 'wavy' && (
          <path
            d="M122 72 C104 92 106 140 116 164 C132 172 188 172 204 164 C214 140 216 92 198 72 Z"
            fill={hairColor}
          />
        )}
        {hairStyle === 'bob' && (
          <path
            d="M122 70 C108 88 110 124 122 138 C136 144 184 144 198 138 C210 124 212 88 198 70 Z"
            fill={hairColor}
          />
        )}
        {hairStyle === 'long' && (
          <path
            d="M120 70 C102 98 102 182 114 218 C132 224 188 224 206 218 C218 182 218 98 200 70 Z"
            fill={hairColor}
          />
        )}
        {hairStyle === 'bun' && <circle cx="160" cy="48" r="19" fill={hairColor} />}

        {/* Cuello, brazos y cuerpo paramétricos */}
        <rect x="148" y="128" width="24" height="32" rx="10" fill={config.skin} />
        <path d={bodyShape.armLeft} fill={config.skin} />
        <path d={bodyShape.armRight} fill={config.skin} />
        <path d={bodyShape.torso} fill={config.skin} />

        {/* Ropa interior neutra del maniquí */}
        <path d={bodyShape.topBase} fill="#FFFBFD" opacity="0.72" />
        <path d={bodyShape.bottomBase} fill="#FFFBFD" opacity="0.72" />

        {/* Cabeza y rasgos minimalistas */}
        <ellipse cx="160" cy="96" rx="29" ry="36" fill={config.skin} />
        <circle cx="149" cy="95" r="2.5" fill="#4A4458" />
        <circle cx="171" cy="95" r="2.5" fill="#4A4458" />
        <path
          d="M153 111 Q160 116 167 111"
          stroke="#4A4458"
          strokeWidth="2.1"
          strokeLinecap="round"
          fill="none"
        />

        {/* Cabello frontal */}
        {hairStyle === 'crop' ? (
          <path
            d="M129 88 C131 54 189 54 191 88 C182 72 138 72 129 88 Z"
            fill={hairColor}
          />
        ) : (
          <path
            d="M128 86 C132 52 188 52 192 86 C181 71 139 71 128 86 Z"
            fill={hairColor}
          />
        )}
      </g>
    </svg>
  );
}
