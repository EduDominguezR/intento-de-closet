import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Save, WifiOff, X } from 'lucide-react';
import { Template3DSelector } from '@/src/components/capture/Template3DSelector';
import { createGarment, generateFirestoreDocId } from '@/src/firebase/firestore';
import { uploadGarmentAssets } from '@/src/firebase/storage';
import { suggestTemplate3dForCategory } from '@/src/lib/closet/constants';
import { extractDominantColorFromCanvas, PRESET_GARMENT_COLORS } from '@/src/lib/color';
import { generateGarmentWebpVariants } from '@/src/lib/image';
import { enqueueOfflineGarment } from '@/src/lib/offline-queue';
import { garmentKeys } from '@/src/queries/garments';
import { useAuthStore } from '@/src/stores/useAuthStore';
import type { AccessorySlot, GarmentCategory, GarmentTemplate3DId } from '@/src/types/models';

interface GarmentTagsFormProps {
  croppedCanvas: HTMLCanvasElement;
  cutoutCanvas: HTMLCanvasElement;
  onBack: () => void;
  onSaved: (result: { queuedOffline: boolean }) => void;
}

const CATEGORY_OPTIONS: { value: GarmentCategory; label: string }[] = [
  { value: 'top', label: 'Top / Blusa' },
  { value: 'bottom', label: 'Pantalón / Falda' },
  { value: 'dress', label: 'Vestido' },
  { value: 'outerwear', label: 'Chamarra / Abrigo' },
  { value: 'shoes', label: 'Calzado' },
  { value: 'accessory', label: 'Accesorio' },
];

const ACCESSORY_SLOT_OPTIONS: { value: AccessorySlot; label: string }[] = [
  { value: 'head', label: 'Cabeza (gorra, sombrero)' },
  { value: 'neck', label: 'Cuello (collar, bufanda)' },
  { value: 'hand', label: 'Mano / Bolso' },
];

const SEASON_CHIPS = ['Primavera', 'Verano', 'Otoño', 'Invierno'];
const OCCASION_CHIPS = ['Casual', 'Trabajo', 'Fiesta', 'Viaje', 'Deporte'];
const SUGGESTED_TAGS = ['básico', 'algodón', 'lino', 'mezclilla', 'formal', 'oversize'];

export function GarmentTagsForm({
  croppedCanvas,
  cutoutCanvas,
  onBack,
  onSaved,
}: GarmentTagsFormProps) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const initialColor = useMemo(() => extractDominantColorFromCanvas(cutoutCanvas), [cutoutCanvas]);
  const [cutoutPreviewUrl, setCutoutPreviewUrl] = useState('');

  const [name, setName] = useState('');
  const [category, setCategory] = useState<GarmentCategory | ''>('');
  const [accessorySlot, setAccessorySlot] = useState<AccessorySlot>('neck');
  const [subcategory, setSubcategory] = useState('');
  const [brand, setBrand] = useState('');
  const [dominantColor, setDominantColor] = useState(initialColor);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [occasions, setOccasions] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [template3d, setTemplate3d] = useState<GarmentTemplate3DId | ''>('');
  const [manualTemplatePicked, setManualTemplatePicked] = useState(false);

  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (category === 'accessory') {
      setTemplate3d('');
      return;
    }
    if (!manualTemplatePicked && category) {
      setTemplate3d(suggestTemplate3dForCategory(category, subcategory) ?? '');
    }
  }, [category, manualTemplatePicked, subcategory]);

  useEffect(() => {
    setCutoutPreviewUrl(cutoutCanvas.toDataURL('image/webp', 0.85));
  }, [cutoutCanvas]);

  function toggleListValue(list: string[], value: string, max: number, setter: (v: string[]) => void) {
    if (list.includes(value)) {
      setter(list.filter((item) => item !== value));
    } else if (list.length < max) {
      setter([...list, value]);
    }
  }

  function addTag(raw: string) {
    const clean = raw.trim().toLowerCase().slice(0, 30);
    if (!clean || tags.includes(clean) || tags.length >= 15) return;
    setTags([...tags, clean]);
    setTagInput('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrorMsg(null);

    if (!user) {
      setErrorMsg('Tu sesión no está activa.');
      return;
    }
    if (!category) {
      setErrorMsg('Selecciona una categoría obligatoria para tu prenda.');
      return;
    }
    if (!name.trim()) {
      setErrorMsg('Escribe un nombre corto para identificar tu prenda.');
      return;
    }

    setSaving(true);
    setUploadProgress(5);

    try {
      const blobs = await generateGarmentWebpVariants(croppedCanvas, cutoutCanvas);
      const garmentId = generateFirestoreDocId('garments');
      const metadata = {
        name: name.trim().slice(0, 80),
        category,
        accessorySlot: category === 'accessory' ? accessorySlot : undefined,
        subcategory: subcategory.trim().slice(0, 50) || undefined,
        brand: brand.trim().slice(0, 50) || undefined,
        dominantColor,
        season: seasons,
        occasion: occasions,
        tags,
        template3d: category === 'accessory' ? undefined : template3d || undefined,
      };

      if (!navigator.onLine) {
        await enqueueOfflineGarment({
          id: garmentId,
          userId: user.uid,
          createdAtMs: Date.now(),
          metadata,
          blobs,
        });
        onSaved({ queuedOffline: true });
        return;
      }

      try {
        const paths = await uploadGarmentAssets(user.uid, garmentId, blobs, (pct) => {
          setUploadProgress(Math.max(10, pct));
        });
        await createGarment(garmentId, user.uid, {
          ...metadata,
          ...paths,
        });
        await queryClient.invalidateQueries({ queryKey: garmentKeys.list(user.uid) });
        onSaved({ queuedOffline: false });
      } catch (uploadError) {
        if (!navigator.onLine) {
          await enqueueOfflineGarment({
            id: garmentId,
            userId: user.uid,
            createdAtMs: Date.now(),
            metadata,
            blobs,
          });
          onSaved({ queuedOffline: true });
          return;
        }
        throw uploadError;
      }
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar la prenda. Revisa tu conexión e intenta de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl bg-white p-5 sm:p-8 shadow-soft border border-[#E6E0F8] space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Vista previa del recorte final */}
        <div className="md:col-span-4 rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] p-4 flex flex-col items-center gap-3">
          {cutoutPreviewUrl && (
            <img
              src={cutoutPreviewUrl}
              alt={name.trim() || 'Vista previa de prenda recortada'}
              className="max-h-56 w-auto object-contain"
            />
          )}
          <div className="w-full pt-3 border-t border-[#E6E0F8] flex items-center justify-between text-xs text-[#6B6580]">
            <span>Color detectado</span>
            <span className="inline-flex items-center gap-2 font-semibold text-[#4A4458]">
              <span
                className="w-4 h-4 rounded-full border border-[#4A4458]/20"
                style={{ backgroundColor: dominantColor }}
              />
              {dominantColor}
            </span>
          </div>
        </div>

        {/* Formulario de atributos */}
        <div className="md:col-span-8 space-y-5">
          <div>
            <label htmlFor="garment-name" className="block text-sm font-semibold text-[#4A4458] mb-1.5">
              Nombre de la prenda *
            </label>
            <input
              id="garment-name"
              type="text"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Blusa lino crema, Jeans rectos"
              className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458]"
            />
          </div>

          <div>
            <span className="block text-sm font-semibold text-[#4A4458] mb-2">Categoría *</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setCategory(opt.value);
                    setManualTemplatePicked(false);
                  }}
                  className={`min-h-[44px] px-3 py-2 rounded-2xl text-xs sm:text-sm font-semibold border transition-colors ${
                    category === opt.value
                      ? 'bg-[#E6E0F8] border-[#8B7FD4] text-[#4A4458]'
                      : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#6B6580] hover:text-[#4A4458]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Template3DSelector
            category={category}
            subcategory={subcategory}
            value={template3d}
            dominantColor={dominantColor}
            cutoutPreviewUrl={cutoutPreviewUrl}
            onChange={(next) => {
              setManualTemplatePicked(true);
              setTemplate3d(next);
            }}
          />

          {category === 'accessory' && (
            <div>
              <span className="block text-sm font-semibold text-[#4A4458] mb-2">
                Ubicación del accesorio *
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {ACCESSORY_SLOT_OPTIONS.map((slot) => (
                  <button
                    key={slot.value}
                    type="button"
                    onClick={() => setAccessorySlot(slot.value)}
                    className={`min-h-[44px] px-3 py-2 rounded-2xl text-xs font-semibold border transition-colors ${
                      accessorySlot === slot.value
                        ? 'bg-[#D5F5E3]/70 border-[#8B7FD4] text-[#4A4458]'
                        : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#6B6580]'
                    }`}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Color dominante */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[#4A4458]">Color principal</span>
              <label className="text-xs font-semibold text-[#5E51AE] inline-flex items-center gap-2 cursor-pointer">
                <span>Personalizado</span>
                <input
                  type="color"
                  value={dominantColor}
                  onChange={(e) => setDominantColor(e.target.value.toUpperCase())}
                  className="w-7 h-7 rounded-lg border border-[#E6E0F8] bg-transparent cursor-pointer"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESET_GARMENT_COLORS.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  title={swatch.label}
                  aria-label={`Color ${swatch.label}`}
                  onClick={() => setDominantColor(swatch.hex)}
                  className={`w-9 h-9 rounded-full border-2 transition-transform ${
                    dominantColor.toUpperCase() === swatch.hex.toUpperCase()
                      ? 'border-[#6E61BE] scale-110'
                      : 'border-[#E6E0F8]'
                  }`}
                  style={{ backgroundColor: swatch.hex }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="garment-subcat" className="block text-sm font-medium text-[#4A4458] mb-1.5">
                Subcategoría (opcional)
              </label>
              <input
                id="garment-subcat"
                type="text"
                maxLength={50}
                value={subcategory}
                onChange={(e) => setSubcategory(e.target.value)}
                placeholder="Ej. Camisa, Tenis, Blazer"
                className="w-full min-h-[44px] px-4 py-2 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458]"
              />
            </div>

            <div>
              <label htmlFor="garment-brand" className="block text-sm font-medium text-[#4A4458] mb-1.5">
                Marca (opcional)
              </label>
              <input
                id="garment-brand"
                type="text"
                maxLength={50}
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Ej. Zara, Vintage"
                className="w-full min-h-[44px] px-4 py-2 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458]"
              />
            </div>
          </div>

          {/* Temporadas */}
          <div>
            <span className="block text-sm font-medium text-[#4A4458] mb-2">
              Temporada (hasta 4)
            </span>
            <div className="flex flex-wrap gap-2">
              {SEASON_CHIPS.map((s) => {
                const active = seasons.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleListValue(seasons, s, 4, setSeasons)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-2xl text-xs font-semibold border transition-colors ${
                      active
                        ? 'bg-[#D6EAF8] border-[#8B7FD4] text-[#4A4458]'
                        : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#6B6580]'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ocasiones */}
          <div>
            <span className="block text-sm font-medium text-[#4A4458] mb-2">
              Ocasión (hasta 5)
            </span>
            <div className="flex flex-wrap gap-2">
              {OCCASION_CHIPS.map((o) => {
                const active = occasions.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => toggleListValue(occasions, o, 5, setOccasions)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-2xl text-xs font-semibold border transition-colors ${
                      active
                        ? 'bg-[#FFE5D0] border-[#8B7FD4] text-[#4A4458]'
                        : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#6B6580]'
                    }`}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label htmlFor="garment-tag-input" className="block text-sm font-medium text-[#4A4458] mb-1.5">
              Etiquetas libres ({tags.length}/15)
            </label>
            <div className="flex gap-2">
              <input
                id="garment-tag-input"
                type="text"
                maxLength={30}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                placeholder="Ej. favorito, verano, oficina"
                className="flex-1 min-h-[44px] px-4 py-2 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458]"
              />
              <button
                type="button"
                onClick={() => addTag(tagInput)}
                className="min-h-[44px] px-4 rounded-2xl bg-[#E6E0F8] hover:bg-[#E6E0F8]/80 text-[#4A4458] text-xs font-semibold inline-flex items-center gap-1"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Añadir</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => addTag(sug)}
                  className="px-2.5 py-1 rounded-xl bg-[#FFFBFD] border border-[#E6E0F8] text-xs text-[#6B6580] hover:text-[#4A4458]"
                >
                  + {sug}
                </button>
              ))}
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2.5">
                {tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    aria-label={`Quitar etiqueta ${t}`}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-[#E6E0F8]/70 text-xs font-semibold text-[#4A4458]"
                  >
                    <span>{t}</span>
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {!navigator.onLine && (
        <div
          role="status"
          className="rounded-2xl bg-[#FFF9DB] border border-[#E6E0F8] px-4 py-3 text-sm text-[#4A4458] flex items-center gap-2.5"
        >
          <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>
            Estás sin conexión. La prenda se guardará localmente y se subirá automáticamente al
            reconectar.
          </span>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="rounded-2xl bg-[#FADADD]/60 border border-[#FADADD] px-4 py-3 text-sm text-[#4A4458]"
        >
          {errorMsg}
        </div>
      )}

      {saving && (
        <div className="space-y-1.5" aria-live="polite">
          <div className="h-2.5 w-full rounded-full bg-[#E6E0F8]/60 overflow-hidden">
            <div
              className="h-full bg-[#6E61BE] transition-[width] duration-200 rounded-full"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-xs font-semibold text-[#6B6580] tabular-nums">
            Subiendo archivos WebP... {uploadProgress}%
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E6E0F8]">
        <button
          type="button"
          onClick={onBack}
          disabled={saving}
          className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#E6E0F8]/70 hover:bg-[#E6E0F8] text-[#4A4458] text-sm font-semibold transition-colors disabled:opacity-50"
        >
          Volver al pincel
        </button>

        <button
          type="submit"
          disabled={saving}
          className="min-h-[48px] px-6 py-3 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-60"
        >
          <Save className="w-4 h-4" aria-hidden="true" />
          <span>{saving ? 'Guardando...' : 'Guardar prenda'}</span>
        </button>
      </div>
    </form>
  );
}
