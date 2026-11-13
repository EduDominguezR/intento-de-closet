import { Sparkles } from 'lucide-react';
import {
  GARMENT_TEMPLATE_OPTIONS,
  suggestTemplate3dForCategory,
  TEMPLATE_3D_LABELS,
} from '@/src/lib/closet/constants';
import type { GarmentCategory, GarmentTemplate3DId } from '@/src/types/models';

interface Template3DSelectorProps {
  category: GarmentCategory | '';
  subcategory?: string;
  value: GarmentTemplate3DId | '';
  dominantColor: string;
  cutoutPreviewUrl?: string;
  onChange: (next: GarmentTemplate3DId | '') => void;
}

function TemplateSilhouetteSvg({
  templateId,
  color,
}: {
  templateId: GarmentTemplate3DId;
  color: string;
}) {
  return (
    <svg viewBox="0 0 80 88" className="w-12 h-14 shrink-0" aria-hidden="true">
      {templateId === 'tshirt' && (
        <path
          d="M20 18 L30 14 Q40 20 50 14 L60 18 L70 30 L61 38 L55 33 L55 74 L25 74 L25 33 L19 38 L10 30 Z"
          fill={color}
          stroke="#4A4458"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      )}
      {templateId === 'longsleeve' && (
        <path
          d="M22 18 L31 14 Q40 20 49 14 L58 18 L73 56 L64 60 L56 34 L56 74 L24 74 L24 34 L16 60 L7 56 Z"
          fill={color}
          stroke="#4A4458"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      )}
      {templateId === 'jacket' && (
        <path
          d="M20 16 L33 13 L40 26 L47 13 L60 16 L73 58 L64 61 L56 35 L56 76 L24 76 L24 35 L16 61 L7 58 Z M40 26 L40 76"
          fill={color}
          stroke="#4A4458"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      )}
      {templateId === 'pants' && (
        <path
          d="M22 14 L58 14 L62 78 L46 78 L40 42 L34 78 L18 78 Z"
          fill={color}
          stroke="#4A4458"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      )}
      {templateId === 'shorts' && (
        <path
          d="M22 18 L58 18 L63 54 L45 54 L40 40 L35 54 L17 54 Z"
          fill={color}
          stroke="#4A4458"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      )}
      {templateId === 'skirt' && (
        <path
          d="M26 18 L54 18 L66 72 Q40 78 14 72 Z"
          fill={color}
          stroke="#4A4458"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      )}
      {templateId === 'dress' && (
        <path
          d="M28 14 Q40 22 52 14 L56 36 L68 78 Q40 84 12 78 L24 36 Z"
          fill={color}
          stroke="#4A4458"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      )}
      {templateId === 'shoes' && (
        <g fill={color} stroke="#4A4458" strokeWidth="2.4" strokeLinejoin="round">
          <path d="M12 52 C14 40 28 42 35 50 L37 64 L10 64 Z" />
          <path d="M45 52 C47 40 61 42 68 50 L70 64 L43 64 Z" />
        </g>
      )}
    </svg>
  );
}

export function Template3DSelector({
  category,
  subcategory = '',
  value,
  dominantColor,
  cutoutPreviewUrl,
  onChange,
}: Template3DSelectorProps) {
  if (category === 'accessory') {
    return (
      <div className="rounded-2xl bg-[#FFF9DB]/70 border border-[#E6E0F8] px-4 py-3 text-xs text-[#4A4458]">
        Los accesorios se muestran <strong>solo en vista 2D</strong> (no requieren plantilla 3D).
      </div>
    );
  }

  const suggested = suggestTemplate3dForCategory(category, subcategory);
  const matchingFirst = [...GARMENT_TEMPLATE_OPTIONS].sort((a, b) => {
    const aMatch = category && a.categories.includes(category) ? 0 : 1;
    const bMatch = category && b.categories.includes(category) ? 0 : 1;
    return aMatch - bMatch;
  });

  return (
    <div className="rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-sm font-semibold text-[#4A4458]">Plantilla 3D aproximada</span>
          <p className="text-xs text-[#6B6580]">
            Proyecta tu recorte al frente y adapta la prenda en el modo 3D.
          </p>
        </div>
        {suggested && value !== suggested && (
          <button
            type="button"
            onClick={() => onChange(suggested)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#E6E0F8] hover:bg-[#D6CCF4] text-xs font-semibold text-[#4A4458]"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#5E51AE]" aria-hidden="true" />
            <span>Sugerida: {TEMPLATE_3D_LABELS[suggested]}</span>
          </button>
        )}
      </div>

      {/* Vista previa rápida de la plantilla seleccionada */}
      {value && (
        <div className="rounded-2xl bg-white border border-[#E6E0F8] p-3 flex items-center gap-4">
          <div className="relative flex items-center justify-center w-16 h-16 rounded-xl bg-[#E6E0F8]/25">
            <TemplateSilhouetteSvg templateId={value} color={dominantColor} />
            {cutoutPreviewUrl && (
              <img
                src={cutoutPreviewUrl}
                alt=""
                aria-hidden="true"
                className="absolute inset-2 w-12 h-12 object-contain opacity-85 pointer-events-none"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-[#4A4458]">
              Vista previa: {TEMPLATE_3D_LABELS[value]}
            </p>
            <p className="text-[11px] text-[#6B6580] mt-0.5">
              {GARMENT_TEMPLATE_OPTIONS.find((opt) => opt.id === value)?.description} · Color base{' '}
              {dominantColor}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs font-semibold text-[#6B6580] hover:text-[#4A4458] px-2 py-1"
          >
            Omitir
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {matchingFirst.map((opt) => {
          const active = value === opt.id;
          const isSuggested = suggested === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={active}
              className={`min-h-[48px] px-3 py-2 rounded-2xl border text-left transition-colors ${
                active
                  ? 'bg-[#D5F5E3]/70 border-[#8B7FD4] text-[#4A4458]'
                  : 'bg-white border-[#E6E0F8] text-[#6B6580] hover:text-[#4A4458]'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold truncate">{opt.label}</span>
                {isSuggested && (
                  <span className="text-[10px] font-bold text-[#5E51AE] shrink-0">Auto</span>
                )}
              </div>
              <span className="block text-[10px] text-[#6B6580] truncate mt-0.5">
                {opt.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
