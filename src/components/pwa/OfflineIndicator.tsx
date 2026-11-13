import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-[#FFF9DB] border-b border-[#E6E0F8] text-[#4A4458] px-4 py-2 text-xs font-medium flex items-center justify-center gap-2"
    >
      <WifiOff className="w-3.5 h-3.5 text-[#5E51AE] shrink-0" aria-hidden="true" />
      <span>Sin conexión — mostrando tu closet e imágenes guardadas en caché.</span>
    </div>
  );
}
