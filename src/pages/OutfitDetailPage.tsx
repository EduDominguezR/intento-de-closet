import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Images, Sparkles, Trash2 } from 'lucide-react';
import { RegisterLookModal } from '@/src/components/lookbook/RegisterLookModal';
import { StorageImage } from '@/src/components/ui/StorageImage';
import { CATEGORY_LABELS } from '@/src/lib/closet/constants';
import { formatWornOnDisplay } from '@/src/lib/lookbook/image';
import { SLOT_LABELS } from '@/src/lib/outfit/slots';
import { useGarmentsQuery } from '@/src/queries/garments';
import { useLookbookQuery } from '@/src/queries/lookbook';
import { useDeleteOutfitMutation, useOutfitQuery } from '@/src/queries/outfits';
import { useAuthStore } from '@/src/stores/useAuthStore';
import { useOutfitDraftStore } from '@/src/stores/useOutfitDraftStore';
import type { Garment, OutfitCollection } from '@/src/types/models';

const COLLECTION_LABELS: Record<OutfitCollection, string> = {
  casual: 'Casual',
  work: 'Trabajo',
  party: 'Fiesta',
  travel: 'Viaje',
  custom: 'Custom',
};

export function OutfitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const { data: outfit, isLoading, isError } = useOutfitQuery(id);
  const { data: garments = [] } = useGarmentsQuery(user?.uid);
  const { data: lookbookEntries = [] } = useLookbookQuery(user?.uid);
  const deleteMutation = useDeleteOutfitMutation(user?.uid);
  const { loadItems } = useOutfitDraftStore();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [registerLookOpen, setRegisterLookOpen] = useState(false);

  const garmentsById = useMemo(() => {
    const map = new Map<string, Garment>();
    for (const g of garments) map.set(g.id, g);
    return map;
  }, [garments]);

  const outfitLookbookEntries = useMemo(() => {
    if (!outfit) return [];
    return lookbookEntries.filter((e) => e.outfitId === outfit.id);
  }, [lookbookEntries, outfit]);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto rounded-3xl bg-white p-8 border border-[#E6E0F8] animate-pulse space-y-6">
        <div className="h-6 w-36 rounded-lg bg-[#E6E0F8]/50" />
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-5 aspect-[3/4] rounded-2xl bg-[#E6E0F8]/35" />
          <div className="md:col-span-7 space-y-4">
            <div className="h-8 w-2/3 rounded-lg bg-[#E6E0F8]/55" />
            <div className="h-24 w-full rounded-2xl bg-[#E6E0F8]/25" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !outfit) {
    return (
      <div className="max-w-xl mx-auto rounded-3xl bg-white p-8 border border-[#E6E0F8] text-center space-y-4">
        <h1 className="font-display text-xl font-bold text-[#4A4458]">Outfit no encontrado</h1>
        <Link
          to="/outfits"
          className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#6E61BE] text-white text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Volver a Mis Outfits</span>
        </Link>
      </div>
    );
  }

  async function handleDelete() {
    if (!outfit) return;
    await deleteMutation.mutateAsync({
      outfitId: outfit.id,
      previewPath: outfit.previewPath,
    });
    navigate('/outfits?deleted=1', { replace: true });
  }

  function handleLoadInBuilder() {
    if (!outfit) return;
    loadItems(outfit.items);
    navigate('/outfits/new');
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/outfits"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#5E51AE] hover:underline min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Volver a Mis Outfits</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRegisterLookOpen(true)}
            className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
          >
            <Camera className="w-4 h-4" aria-hidden="true" />
            <span>Usé este outfit</span>
          </button>

          {outfitLookbookEntries.length > 0 && (
            <Link
              to={`/lookbook?outfitId=${outfit.id}`}
              className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#D5F5E3]/70 hover:bg-[#D5F5E3] text-[#4A4458] text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Images className="w-4 h-4" aria-hidden="true" />
              <span>Ver fotos ({outfitLookbookEntries.length})</span>
            </Link>
          )}

          <button
            type="button"
            onClick={handleLoadInBuilder}
            className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#E6E0F8]/75 hover:bg-[#E6E0F8] text-[#4A4458] text-sm font-semibold inline-flex items-center gap-2 transition-colors"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            <span>Editar en armador</span>
          </button>

          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#FADADD]/75 hover:bg-[#FADADD] text-[#4A4458] text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              <span>Eliminar</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleteMutation.isPending}
                className="min-h-[44px] px-3 py-2 rounded-2xl bg-[#E6E0F8]/60 text-xs font-semibold text-[#4A4458]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleteMutation.isPending}
                className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#C94C5C] text-white text-xs font-semibold"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Confirmar borrado'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl bg-white p-5 sm:p-8 shadow-soft border border-[#E6E0F8] grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        <div className="md:col-span-5 aspect-[3/4] w-full rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] overflow-hidden flex items-center justify-center p-2">
          {outfit.previewPath ? (
            <StorageImage
              path={outfit.previewPath}
              alt={`${outfit.name} (${COLLECTION_LABELS[outfit.collection]})`}
              priority
              className="w-full h-full object-contain"
            />
          ) : (
            <p className="text-sm text-[#6B6580]">Sin imagen de vista previa</p>
          )}
        </div>

        <div className="md:col-span-7 space-y-6">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[#6B6580]">
              {COLLECTION_LABELS[outfit.collection]}
              {outfit.occasion ? ` · ${outfit.occasion}` : ''}
              {typeof outfit.wornCount === 'number' && outfit.wornCount > 0
                ? ` · Usado ${outfit.wornCount} ${outfit.wornCount === 1 ? 'vez' : 'veces'}`
                : ''}
              {outfit.lastWornOn ? ` · Último uso: ${formatWornOnDisplay(outfit.lastWornOn)}` : ''}
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#4A4458]">
              {outfit.name}
            </h1>
          </div>

          <div className="space-y-3">
            <h2 className="font-display text-sm font-semibold text-[#4A4458]">
              Prendas en este outfit ({outfit.items.length})
            </h2>

            {outfit.items.length === 0 ? (
              <p className="text-sm text-[#6B6580]">
                Las prendas anteriores de este outfit fueron eliminadas del closet.
              </p>
            ) : (
              <div className="divide-y divide-[#E6E0F8] border-y border-[#E6E0F8]">
                {outfit.items.map((item) => {
                  const garment = garmentsById.get(item.garmentId);
                  if (!garment) return null;
                  return (
                    <Link
                      key={item.slotKey}
                      to={`/garments/${garment.id}`}
                      className="py-3 flex items-center gap-3.5 hover:bg-[#FFFBFD] transition-colors"
                    >
                      <div className="w-14 h-14 rounded-xl bg-[#FFFBFD] border border-[#E6E0F8] p-1 shrink-0 overflow-hidden">
                        <StorageImage
                          path={garment.imageThumbPath || garment.cutoutPath}
                          alt={`${garment.name} (${CATEGORY_LABELS[garment.category]})`}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-sm font-semibold text-[#4A4458] truncate">
                          {garment.name}
                        </p>
                        <p className="text-xs text-[#6B6580]">
                          {SLOT_LABELS[item.slotKey]} · {CATEGORY_LABELS[garment.category]}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <RegisterLookModal
        open={registerLookOpen}
        initialOutfitId={outfit.id}
        onClose={() => setRegisterLookOpen(false)}
        onSaved={(entryId) => {
          setRegisterLookOpen(false);
          navigate(`/lookbook/${entryId}`);
        }}
      />
    </div>
  );
}
