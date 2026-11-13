import { useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface DeleteGarmentModalProps {
  open: boolean;
  garmentName: string;
  affectedOutfitsCount: number | null;
  loadingCount: boolean;
  deleting: boolean;
  errorMsg: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteGarmentModal({
  open,
  garmentName,
  affectedOutfitsCount,
  loadingCount,
  deleting,
  errorMsg,
  onConfirm,
  onCancel,
}: DeleteGarmentModalProps) {
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    cancelBtnRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleting, onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4A4458]/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-garment-title"
    >
      <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-7 shadow-sheet border border-[#E6E0F8] space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FADADD] flex items-center justify-center text-[#4A4458] shrink-0">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <h2 id="delete-garment-title" className="font-display text-lg font-bold text-[#4A4458]">
              Eliminar prenda
            </h2>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            aria-label="Cerrar diálogo"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[#6B6580] hover:bg-[#E6E0F8]/50"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-2 text-sm text-[#4A4458]">
          <p>
            ¿Seguro que deseas eliminar <strong>{garmentName}</strong>? Se borrarán sus archivos
            definitivamente.
          </p>

          {loadingCount ? (
            <p className="text-xs text-[#6B6580]">Verificando outfits relacionados...</p>
          ) : affectedOutfitsCount !== null && affectedOutfitsCount > 0 ? (
            <div className="rounded-2xl bg-[#FFF9DB] border border-[#E6E0F8] px-4 py-3 text-xs sm:text-sm text-[#4A4458]">
              Esta prenda aparece en{' '}
              <strong className="tabular-nums">
                {affectedOutfitsCount}{' '}
                {affectedOutfitsCount === 1 ? 'outfit guardado' : 'outfits guardados'}
              </strong>
              . Se quitará esa pieza de esos outfits sin eliminarlos.
            </div>
          ) : (
            <p className="text-xs text-[#6B6580]">
              Esta prenda no está asignada en ningún outfit guardado.
            </p>
          )}
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-2xl bg-[#FADADD]/70 px-4 py-3 text-sm text-[#4A4458]"
          >
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#E6E0F8]/70 hover:bg-[#E6E0F8] text-[#4A4458] text-sm font-semibold transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting || loadingCount}
            className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#C94C5C] hover:bg-[#B23D4C] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-60"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            <span>{deleting ? 'Eliminando...' : 'Sí, eliminar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
