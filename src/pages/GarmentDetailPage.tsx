import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Box, Pencil, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
import { Template3DSelector } from '@/src/components/capture/Template3DSelector';
import { DeleteGarmentModal } from '@/src/components/closet/DeleteGarmentModal';
import { GarmentViewerModal } from '@/src/components/three/GarmentViewerModal';
import { StorageImage } from '@/src/components/ui/StorageImage';
import { countAffectedOutfitsForGarment } from '@/src/firebase/firestore';
import {
  ACCESSORY_SLOT_LABELS,
  CATEGORY_LABELS,
  GARMENT_TEMPLATE_OPTIONS,
  OCCASION_OPTIONS,
  SEASON_OPTIONS,
  suggestTemplate3dForCategory,
  TEMPLATE_3D_LABELS,
} from '@/src/lib/closet/constants';
import { PRESET_GARMENT_COLORS } from '@/src/lib/color';
import {
  useDeleteGarmentMutation,
  useGarmentQuery,
  useUpdateGarmentMutation,
} from '@/src/queries/garments';
import { useAuthStore } from '@/src/stores/useAuthStore';
import type { AccessorySlot, GarmentCategory, GarmentTemplate3DId } from '@/src/types/models';

export function GarmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const { data: garment, isLoading, isError } = useGarmentQuery(id);
  const updateMutation = useUpdateGarmentMutation(user?.uid);
  const deleteMutation = useDeleteGarmentMutation(user?.uid);

  const [viewMode, setViewMode] = useState<'cutout' | 'full'>('cutout');
  const [editing, setEditing] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Estado del formulario de edición
  const [name, setName] = useState('');
  const [category, setCategory] = useState<GarmentCategory>('top');
  const [accessorySlot, setAccessorySlot] = useState<AccessorySlot>('neck');
  const [subcategory, setSubcategory] = useState('');
  const [brand, setBrand] = useState('');
  const [dominantColor, setDominantColor] = useState('#8B7FD4');
  const [seasons, setSeasons] = useState<string[]>([]);
  const [occasions, setOccasions] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [template3d, setTemplate3d] = useState<GarmentTemplate3DId | ''>('');
  const [quickTemplate, setQuickTemplate] = useState<GarmentTemplate3DId | ''>('');
  const [editError, setEditError] = useState<string | null>(null);

  // Estado del modal de borrado
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [affectedOutfitsCount, setAffectedOutfitsCount] = useState<number | null>(null);
  const [loadingAffectedCount, setLoadingAffectedCount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!garment) return;
    setName(garment.name);
    setCategory(garment.category);
    setAccessorySlot(garment.accessorySlot ?? 'neck');
    setSubcategory(garment.subcategory ?? '');
    setBrand(garment.brand ?? '');
    setDominantColor(garment.dominantColor);
    setSeasons(garment.season);
    setOccasions(garment.occasion);
    setTags(garment.tags);
    setTemplate3d(garment.template3d ?? '');
    setQuickTemplate(
      garment.template3d ??
        suggestTemplate3dForCategory(garment.category, garment.subcategory ?? '') ??
        'tshirt',
    );
  }, [garment]);

  function toggleList(list: string[], val: string, max: number, setter: (v: string[]) => void) {
    if (list.includes(val)) {
      setter(list.filter((item) => item !== val));
    } else if (list.length < max) {
      setter([...list, val]);
    }
  }

  function addTag() {
    const clean = tagInput.trim().toLowerCase().slice(0, 30);
    if (!clean || tags.includes(clean) || tags.length >= 15) return;
    setTags([...tags, clean]);
    setTagInput('');
  }

  async function handleSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!garment) return;
    setEditError(null);
    if (!name.trim()) {
      setEditError('El nombre de la prenda es obligatorio.');
      return;
    }

    try {
      await updateMutation.mutateAsync({
        garmentId: garment.id,
        patch: {
          name: name.trim().slice(0, 80),
          category,
          accessorySlot: category === 'accessory' ? accessorySlot : undefined,
          subcategory,
          brand,
          dominantColor,
          season: seasons,
          occasion: occasions,
          tags,
          template3d: category === 'accessory' ? '' : template3d,
        },
      });
      setEditing(false);
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : 'No se pudieron guardar los cambios.',
      );
    }
  }

  async function handleOpenDeleteModal() {
    if (!garment || !user) return;
    setDeleteError(null);
    setDeleteOpen(true);
    setLoadingAffectedCount(true);
    try {
      const count = await countAffectedOutfitsForGarment(user.uid, garment.id);
      setAffectedOutfitsCount(count);
    } catch {
      setAffectedOutfitsCount(null);
    } finally {
      setLoadingAffectedCount(false);
    }
  }

  async function handleConfirmDelete() {
    if (!garment) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync({
        garmentId: garment.id,
        paths: {
          imageFullPath: garment.imageFullPath,
          imageThumbPath: garment.imageThumbPath,
          cutoutPath: garment.cutoutPath,
        },
      });
      navigate('/closet?deleted=1', { replace: true });
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : 'No se pudo eliminar la prenda. Intenta de nuevo.',
      );
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto rounded-3xl bg-white p-6 sm:p-8 border border-[#E6E0F8] animate-pulse space-y-6">
        <div className="h-6 w-36 rounded-lg bg-[#E6E0F8]/50" />
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-5 aspect-[4/5] rounded-2xl bg-[#E6E0F8]/35" />
          <div className="md:col-span-7 space-y-4">
            <div className="h-8 w-2/3 rounded-lg bg-[#E6E0F8]/55" />
            <div className="h-4 w-1/2 rounded-lg bg-[#E6E0F8]/35" />
            <div className="h-24 w-full rounded-2xl bg-[#E6E0F8]/25" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !garment) {
    return (
      <div className="max-w-xl mx-auto rounded-3xl bg-white p-8 border border-[#E6E0F8] text-center space-y-4">
        <h1 className="font-display text-xl font-bold text-[#4A4458]">Prenda no encontrada</h1>
        <p className="text-sm text-[#6B6580]">
          Es posible que haya sido eliminada o no tengas permiso para consultarla.
        </p>
        <Link
          to="/closet"
          className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#6E61BE] text-white text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Volver a Mi Closet</span>
        </Link>
      </div>
    );
  }

  const categoryLabel = CATEGORY_LABELS[garment.category];
  const activeImagePath = viewMode === 'cutout' ? garment.cutoutPath : garment.imageFullPath;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/closet"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#5E51AE] hover:underline min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Volver a Mi Closet</span>
        </Link>

        <div className="flex items-center gap-2">
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#E6E0F8]/75 hover:bg-[#E6E0F8] text-[#4A4458] text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
              <span>Editar</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleOpenDeleteModal()}
            className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#FADADD]/75 hover:bg-[#FADADD] text-[#4A4458] text-sm font-semibold inline-flex items-center gap-2 transition-colors"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            <span>Eliminar</span>
          </button>
        </div>
      </div>

      <div className="rounded-3xl bg-white p-5 sm:p-8 shadow-soft border border-[#E6E0F8] grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Visor de prenda */}
        <div className="md:col-span-5 space-y-3">
          <div className="aspect-[4/5] w-full rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] p-4 flex items-center justify-center overflow-hidden">
            <StorageImage
              path={activeImagePath}
              alt={`${garment.name} (${categoryLabel})`}
              priority
              className="w-full h-full object-contain"
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-2xl bg-[#E6E0F8]/45">
            <button
              type="button"
              onClick={() => setViewMode('cutout')}
              className={`flex-1 min-h-[40px] rounded-xl text-xs font-semibold transition-colors ${
                viewMode === 'cutout'
                  ? 'bg-white text-[#4A4458] shadow-sm'
                  : 'text-[#6B6580] hover:text-[#4A4458]'
              }`}
            >
              Recorte sin fondo
            </button>
            <button
              type="button"
              onClick={() => setViewMode('full')}
              className={`flex-1 min-h-[40px] rounded-xl text-xs font-semibold transition-colors ${
                viewMode === 'full'
                  ? 'bg-white text-[#4A4458] shadow-sm'
                  : 'text-[#6B6580] hover:text-[#4A4458]'
              }`}
            >
              Foto original
            </button>
          </div>
        </div>

        {/* Detalles o formulario de edición */}
        <div className="md:col-span-7">
          {!editing ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#6B6580]">
                  {categoryLabel}
                  {garment.category === 'accessory' && garment.accessorySlot
                    ? ` · ${ACCESSORY_SLOT_LABELS[garment.accessorySlot]}`
                    : ''}
                  {garment.subcategory ? ` · ${garment.subcategory}` : ''}
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#4A4458]">
                  {garment.name}
                </h1>
              </div>

              <div className="grid grid-cols-2 gap-4 py-4 border-y border-[#E6E0F8]">
                <div>
                  <span className="block text-xs text-[#6B6580]">Color principal</span>
                  <div className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-[#4A4458]">
                    <span
                      className="w-4 h-4 rounded-full border border-[#4A4458]/20"
                      style={{ backgroundColor: garment.dominantColor }}
                    />
                    <span>{garment.dominantColor}</span>
                  </div>
                </div>
                <div>
                  <span className="block text-xs text-[#6B6580]">Marca</span>
                  <span className="mt-1 block text-sm font-semibold text-[#4A4458]">
                    {garment.brand || 'Sin especificar'}
                  </span>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-xs font-semibold text-[#6B6580] block">Temporada</span>
                  <p className="text-[#4A4458] mt-0.5">
                    {garment.season.length > 0 ? garment.season.join(' · ') : 'Todas'}
                  </p>
                </div>

                <div>
                  <span className="text-xs font-semibold text-[#6B6580] block">Ocasión</span>
                  <p className="text-[#4A4458] mt-0.5">
                    {garment.occasion.length > 0 ? garment.occasion.join(' · ') : 'Uso diario'}
                  </p>
                </div>

                {garment.tags.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold text-[#6B6580] block">Etiquetas</span>
                    <p className="text-[#4A4458] mt-0.5">{garment.tags.join(' · ')}</p>
                  </div>
                )}

                <div>
                  <span className="text-xs font-semibold text-[#6B6580] block">Plantilla 3D</span>
                  {garment.category === 'accessory' ? (
                    <p className="text-xs text-[#6B6580] mt-0.5">
                      Los accesorios se muestran solo en vista 2D.
                    </p>
                  ) : garment.template3d ? (
                    <p className="text-[#4A4458] mt-0.5 font-medium">
                      {TEMPLATE_3D_LABELS[garment.template3d]}
                    </p>
                  ) : (
                    <div className="mt-1.5 rounded-2xl bg-[#FFF9DB] border border-[#E6E0F8] p-3 space-y-2.5">
                      <p className="text-xs text-[#4A4458]">
                        Esta prenda aún no tiene plantilla 3D asignada y se omitirá en la vista 3D del
                        armador.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label="Elegir plantilla 3D"
                          value={quickTemplate}
                          onChange={(e) => setQuickTemplate(e.target.value as GarmentTemplate3DId)}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E6E0F8] bg-white text-xs font-semibold text-[#4A4458]"
                        >
                          {GARMENT_TEMPLATE_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={updateMutation.isPending || !quickTemplate}
                          onClick={() => {
                            if (!quickTemplate) return;
                            void updateMutation.mutateAsync({
                              garmentId: garment.id,
                              patch: { template3d: quickTemplate },
                            });
                          }}
                          className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-xs font-semibold disabled:opacity-60"
                        >
                          {updateMutation.isPending ? 'Asignando...' : 'Asignar plantilla'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <Link
                  to={`/outfits/new?garmentId=${garment.id}`}
                  className="inline-flex items-center gap-2 min-h-[48px] px-6 py-3 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold transition-colors"
                >
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  <span>Usar en el armador</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setViewerOpen(true)}
                  className="inline-flex items-center gap-2 min-h-[48px] px-5 py-3 rounded-2xl bg-[#D6EAF8] hover:bg-[#C6E2F5] text-[#4A4458] text-sm font-semibold transition-colors"
                >
                  <Box className="w-4 h-4" aria-hidden="true" />
                  <span>Ver en 3D</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label htmlFor="edit-name" className="block text-sm font-semibold text-[#4A4458] mb-1">
                  Nombre
                </label>
                <input
                  id="edit-name"
                  type="text"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[44px] px-4 py-2 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458]"
                />
              </div>

              <div>
                <label htmlFor="edit-category" className="block text-sm font-semibold text-[#4A4458] mb-1">
                  Categoría
                </label>
                <select
                  id="edit-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as GarmentCategory)}
                  className="w-full min-h-[44px] px-4 py-2 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458]"
                >
                  {(Object.keys(CATEGORY_LABELS) as GarmentCategory[]).map((key) => (
                    <option key={key} value={key}>
                      {CATEGORY_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>

              {category === 'accessory' && (
                <div>
                  <label htmlFor="edit-acc-slot" className="block text-sm font-semibold text-[#4A4458] mb-1">
                    Ubicación del accesorio
                  </label>
                  <select
                    id="edit-acc-slot"
                    value={accessorySlot}
                    onChange={(e) => setAccessorySlot(e.target.value as AccessorySlot)}
                    className="w-full min-h-[44px] px-4 py-2 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458]"
                  >
                    {(Object.keys(ACCESSORY_SLOT_LABELS) as AccessorySlot[]).map((slot) => (
                      <option key={slot} value={slot}>
                        {ACCESSORY_SLOT_LABELS[slot]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <Template3DSelector
                category={category}
                subcategory={subcategory}
                value={template3d}
                dominantColor={dominantColor}
                onChange={setTemplate3d}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-subcat" className="block text-xs font-semibold text-[#4A4458] mb-1">
                    Subcategoría
                  </label>
                  <input
                    id="edit-subcat"
                    type="text"
                    maxLength={50}
                    value={subcategory}
                    onChange={(e) => setSubcategory(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="edit-brand" className="block text-xs font-semibold text-[#4A4458] mb-1">
                    Marca
                  </label>
                  <input
                    id="edit-brand"
                    type="text"
                    maxLength={50}
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm"
                  />
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold text-[#4A4458] mb-1.5">Color</span>
                <div className="flex flex-wrap items-center gap-2">
                  {PRESET_GARMENT_COLORS.map((swatch) => (
                    <button
                      key={swatch.hex}
                      type="button"
                      onClick={() => setDominantColor(swatch.hex)}
                      aria-label={`Color ${swatch.label}`}
                      className={`w-8 h-8 rounded-full border-2 ${
                        dominantColor.toUpperCase() === swatch.hex.toUpperCase()
                          ? 'border-[#6E61BE] scale-110'
                          : 'border-[#E6E0F8]'
                      }`}
                      style={{ backgroundColor: swatch.hex }}
                    />
                  ))}
                  <input
                    type="color"
                    value={dominantColor}
                    onChange={(e) => setDominantColor(e.target.value.toUpperCase())}
                    aria-label="Selector de color personalizado"
                    className="w-8 h-8 rounded-lg border border-[#E6E0F8] bg-transparent"
                  />
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold text-[#4A4458] mb-1.5">Temporada</span>
                <div className="flex flex-wrap gap-1.5">
                  {SEASON_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleList(seasons, s, 4, setSeasons)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                        seasons.includes(s)
                          ? 'bg-[#D6EAF8] border-[#8B7FD4] text-[#4A4458]'
                          : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#6B6580]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold text-[#4A4458] mb-1.5">Ocasión</span>
                <div className="flex flex-wrap gap-1.5">
                  {OCCASION_OPTIONS.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => toggleList(occasions, o, 5, setOccasions)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                        occasions.includes(o)
                          ? 'bg-[#FFE5D0] border-[#8B7FD4] text-[#4A4458]'
                          : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#6B6580]'
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-xs font-semibold text-[#4A4458] mb-1.5">
                  Etiquetas ({tags.length}/15)
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={30}
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="Nueva etiqueta"
                    className="flex-1 min-h-[40px] px-3 rounded-xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm"
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    className="min-h-[40px] px-3 rounded-xl bg-[#E6E0F8] text-xs font-semibold text-[#4A4458] inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Añadir</span>
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTags(tags.filter((x) => x !== t))}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#E6E0F8]/70 text-xs font-semibold text-[#4A4458]"
                      >
                        <span>{t}</span>
                        <X className="w-3 h-3" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {editError && (
                <div role="alert" className="rounded-2xl bg-[#FADADD]/70 px-4 py-2.5 text-sm">
                  {editError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={updateMutation.isPending}
                  className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#E6E0F8]/60 text-sm font-semibold text-[#4A4458]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="min-h-[44px] px-5 py-2 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
                >
                  <Save className="w-4 h-4" aria-hidden="true" />
                  <span>{updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <DeleteGarmentModal
        open={deleteOpen}
        garmentName={garment.name}
        affectedOutfitsCount={affectedOutfitsCount}
        loadingCount={loadingAffectedCount}
        deleting={deleteMutation.isPending}
        errorMsg={deleteError}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void handleConfirmDelete()}
      />

      <GarmentViewerModal
        garment={viewerOpen ? garment : null}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  );
}
