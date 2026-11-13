import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shirt } from 'lucide-react';
import { getStorageDownloadUrl } from '@/src/firebase/storage';

interface StorageImageProps {
  path: string;
  alt: string;
  className?: string;
  priority?: boolean;
}

export function StorageImage({
  path,
  alt,
  className = 'w-full h-full object-contain',
  priority = false,
}: StorageImageProps) {
  const [imgError, setImgError] = useState(false);

  const { data: url, isLoading, isError } = useQuery({
    queryKey: ['storage-url', path],
    queryFn: () => getStorageDownloadUrl(path),
    enabled: Boolean(path),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return <div className="w-full h-full bg-[#E6E0F8]/35 animate-pulse rounded-xl" />;
  }

  if (isError || !url || imgError) {
    return (
      <div
        role="img"
        aria-label={alt}
        className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-[#E6E0F8]/30 text-[#6B6580] p-3 text-center rounded-xl"
      >
        <Shirt className="w-6 h-6 opacity-70" aria-hidden="true" />
        <span className="text-[11px] font-medium line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setImgError(true)}
      className={className}
    />
  );
}
