import { useState } from 'react';
import { Camera } from 'lucide-react';
import { useLookbookPhotoBlob } from '@/src/queries/lookbook';

interface LookbookPhotoProps {
  path: string;
  alt: string;
  className?: string;
  priority?: boolean;
}

export function LookbookPhoto({
  path,
  alt,
  className = 'w-full h-full object-cover',
  priority = false,
}: LookbookPhotoProps) {
  const [imgError, setImgError] = useState(false);
  const { objectUrl, isLoading, isError } = useLookbookPhotoBlob(path);

  if (isLoading) {
    return <div className="w-full h-full bg-[#E6E0F8]/35 animate-pulse rounded-2xl" />;
  }

  if (isError || !objectUrl || imgError) {
    return (
      <div
        role="img"
        aria-label={alt}
        className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#E6E0F8]/30 text-[#6B6580] p-4 text-center rounded-2xl"
      >
        <Camera className="w-6 h-6 opacity-70" aria-hidden="true" />
        <span className="text-xs font-medium line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={objectUrl}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setImgError(true)}
      className={className}
    />
  );
}
