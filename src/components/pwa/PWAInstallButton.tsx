import { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '@/src/hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'card';
}

export function PWAInstallButton({ variant = 'compact' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={
          variant === 'card'
            ? 'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold transition-colors'
            : 'inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-2xl bg-[#E6E0F8] hover:bg-[#D6CCF4] text-[#4A4458] text-xs font-semibold whitespace-nowrap transition-colors'
        }
      >
        <Download className="w-4 h-4" aria-hidden="true" />
        <span>{variant === 'card' ? 'Instalar Closetly en este dispositivo' : 'Instalar app'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'card'
              ? 'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#E6E0F8] hover:bg-[#D6CCF4] text-[#4A4458] text-sm font-semibold transition-colors'
              : 'inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-2xl bg-[#E6E0F8]/80 hover:bg-[#E6E0F8] text-[#4A4458] text-xs font-semibold whitespace-nowrap transition-colors'
          }
        >
          <Smartphone className="w-4 h-4" aria-hidden="true" />
          <span>Instalar en iOS</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#4A4458]/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E6E0F8] p-6 shadow-sheet space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="ios-install-title" className="font-display text-lg font-bold text-[#4A4458]">
                    Instalar en iPhone o iPad
                  </h3>
                  <p className="text-xs text-[#6B6580] mt-1">
                    Añade Closetly a tu pantalla de inicio desde Safari.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Cerrar instrucciones"
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-[#6B6580] hover:bg-[#E6E0F8]/50"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>

              <ol className="space-y-3 text-sm text-[#4A4458] bg-[#FFFBFD] border border-[#E6E0F8] rounded-2xl p-4">
                <li className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-[#E6E0F8] text-[#4A4458] text-xs font-bold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <span>
                    Toca el botón{' '}
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Share className="w-3.5 h-3.5" aria-hidden="true" />
                      Compartir
                    </span>{' '}
                    en la barra de Safari.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-[#D5F5E3] text-[#4A4458] text-xs font-bold flex items-center justify-center shrink-0">
                    2
                  </span>
                  <span>
                    Desliza hacia abajo y selecciona <strong>Agregar a inicio</strong>.
                  </span>
                </li>
              </ol>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
