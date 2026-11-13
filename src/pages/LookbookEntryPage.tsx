import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit3, Trash2 } from 'lucide-react';
import { LookbookPhoto } from '@/src/components/lookbook/LookbookPhoto';
import { StorageImage } from '@/src/components/ui/StorageImage';
import { formatWornOnDisplay } from '@/src/lib/lookbook/image';
import {
  useDeleteLookbookEntryMutation,
  useLookbookEntryQuery,
  useUpdateLookbookNoteMutation,
} from '@/src/queries/lookbook';
import { useOutfitsQuery } from '@/src/queries/outfits';
import { useAuthStore } from '@/src/stores/useAuthStore';

export function LookbookEntryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuthStore();

  const { data: entry, isLoading, isError } = useLookbookEntryQuery(id);
  const { data: outfits = [], isLoading: loadingOutfits } = useOutfitsQuery(user?.uid);
  const updateNoteMutation = useUpdateLookbookNoteMutation(user?.uid);
  const deleteMutation = useDeleteLookbookEntryMutation(user?.uid);

  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const displayName = profile?.displayName || user?.displayName || 'ti';

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto rounded-3xl bg-white p-8 border border-[#E6E0F8] animate-pulse space-y-6">
        <div className="h-6 w-36 rounded-lg bg-[#E6E0F8]/50" />
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-6 aspect-[3/4] rounded-2xl bg-[#E6E0F8]/35" />
          <div className="md:col-span-6 space-y-4">
            <div className="h-8 w-2/3 rounded-lg bg-[#E6E0F8]/55" />
            <div className="h-24 w-full rounded-2xl bg-[#E6E0F8]/25" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !entry) {
    return (
      <div className="max-w-xl mx-auto rounded-3xl bg-white p-8 border border-[#E6E0F8] text-center space-y-4">
        <h1 className="font-display text-xl font-bold text-[#4A4458]">Entrada no encontrada</h1>
        <Link
          to="/lookbook"
          className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#6E61BE] text-white text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Volver a Mi Lookbook</span>
        </Link>
      </div>
    );
  }

  const readableDate = formatWornOnDisplay(entry.wornOn);
  const photoAlt = `Foto de ${displayName} usando el outfit ${entry.outfitSnapshot.name} el ${readableDate}`;
  const originalOutfitExists =
    loadingOutfits || outfits.some((outfit) => outfit.id === entry.outfitId);

  function startEditNote() {
    if (!entry) return;
    setNoteDraft(entry.note ?? '');
    setEditingNote(true);
  }

  async function handleSaveNote(event: FormEvent) {
    event.preventDefault();
    if (!entry) return;
    await updateNoteMutation.mutateAsync({ entryId: entry.id, note: noteDraft });
    setEditingNote(false);
  }

  async function handleDelete() {
    if (!entry) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync({
        entryId: entry.id,
        photoPath: entry.photoPath,
        photoThumbPath: entry.photoThumbPath,
      });
      navigate('/lookbook', { replace: true });
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? `No se pudo borrar la foto de Storage (${error.message}). La entrada se conservó para evitar archivos huérfanos.`
          : 'No se pudo borrar la foto de Storage. La entrada no fue eliminada.',
      );
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/lookbook"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#5E51AE] hover:underline min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Volver a Mi Lookbook</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startEditNote}
            className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#E6E0F8]/75 hover:bg-[#E6E0F8] text-[#4A4458] text-sm font-semibold inline-flex items-center gap-2 transition-colors"
          >
            <Edit3 className="w-4 h-4" aria-hidden="true" />
            <span>Editar nota</span>
          </button>

          {!confirmDelete && (
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setConfirmDelete(true);
              }}
              className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#FADADD]/75 hover:bg-[#FADADD] text-[#4A4458] text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              <span>Eliminar entrada</span>
            </button>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div
          role="alertdialog"
          aria-labelledby="delete-lookbook-title"
          className="rounded-3xl bg-[#FADADD]/55 border border-[#FADADD] p-5 space-y-3"
        >
          <h2 id="delete-lookbook-title" className="font-display text-base font-bold text-[#4A4458]">
            ¿Eliminar esta foto del lookbook?
          </h2>
          <p className="text-sm text-[#4A4458]">
            La foto se borrará de Storage de inmediato y no se puede recuperar.
          </p>
          {deleteError && (
            <p role="alert" className="text-xs font-semibold text-[#9E2A3B]">
              {deleteError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleteMutation.isPending}
              className="min-h-[44px] px-4 py-2 rounded-2xl bg-white text-sm font-semibold text-[#4A4458]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleteMutation.isPending}
              className="min-h-[44px] px-5 py-2 rounded-2xl bg-[#C94C5C] text-white text-sm font-semibold disabled:opacity-60"
            >
              {deleteMutation.isPending ? 'Eliminando...' : 'Sí, borrar de inmediato'}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-3xl bg-white p-5 sm:p-8 shadow-soft border border-[#E6E0F8] grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Foto real en resolución completa (1600px) cargada vía getBlob */}
        <div className="md:col-span-6 aspect-[3/4] w-full rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] overflow-hidden">
          <LookbookPhoto
            path={entry.photoPath}
            alt={photoAlt}
            priority
            className="w-full h-full object-contain"
          />
        </div>

        {/* Detalles y comparación con preview del outfit */}
        <div className="md:col-span-6 space-y-6">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-[#6B6580]">{readableDate}</p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#4A4458]">
              {entry.outfitSnapshot.name}
            </h1>
            {!originalOutfitExists && (
              <p className="text-xs font-medium text-[#6B6580] pt-1">
                El outfit original fue eliminado. La foto se mantiene como registro histórico.
              </p>
            )}
          </div>

          {editingNote ? (
            <form onSubmit={handleSaveNote} className="space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor="edit-look-note" className="text-sm font-semibold text-[#4A4458]">
                  Nota
                </label>
                <span className="text-xs text-[#6B6580] tabular-nums">{noteDraft.length}/200</span>
              </div>
              <textarea
                id="edit-look-note"
                rows={3}
                maxLength={200}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458] resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={updateNoteMutation.isPending}
                  className="min-h-[40px] px-4 py-1.5 rounded-2xl bg-[#6E61BE] text-white text-xs font-semibold"
                >
                  {updateNoteMutation.isPending ? 'Guardando...' : 'Guardar nota'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingNote(false)}
                  className="min-h-[40px] px-4 py-1.5 rounded-2xl bg-[#E6E0F8]/70 text-[#4A4458] text-xs font-semibold"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-1">
              <h2 className="font-display text-xs font-semibold text-[#6B6580]">Nota</h2>
              <p className="text-sm text-[#4A4458] leading-relaxed">
                {entry.note || 'Sin nota registrada.'}
              </p>
            </div>
          )}

          {/* Preview del outfit debajo o lado a lado en desktop */}
          <div className="pt-4 border-t border-[#E6E0F8] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold text-[#4A4458]">
                Outfit armado ({entry.outfitSnapshot.items.length} prendas)
              </h2>
              {originalOutfitExists && (
                <Link
                  to={`/outfits/${entry.outfitId}`}
                  className="text-xs font-semibold text-[#5E51AE] hover:underline"
                >
                  Ver outfit
                </Link>
              )}
            </div>

            {entry.outfitSnapshot.previewPath ? (
              <div className="w-40 aspect-[3/4] rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] p-2 overflow-hidden">
                <StorageImage
                  path={entry.outfitSnapshot.previewPath}
                  alt={`Vista previa del outfit ${entry.outfitSnapshot.name}`}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <p className="text-xs text-[#6B6580]">Sin vista previa guardada del outfit.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
