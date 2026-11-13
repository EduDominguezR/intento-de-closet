import { Link } from 'react-router-dom';
import { StorageImage } from '@/src/components/ui/StorageImage';
import { CATEGORY_LABELS } from '@/src/lib/closet/constants';
import type { Garment } from '@/src/types/models';

interface GarmentCardProps {
  garment: Garment;
}

export function GarmentCard({ garment }: GarmentCardProps) {
  const categoryLabel = CATEGORY_LABELS[garment.category];
  const altText = `${garment.name} (${categoryLabel})`;

  const secondaryParts = [categoryLabel];
  if (garment.brand) {
    secondaryParts.push(garment.brand);
  } else if (garment.season.length > 0) {
    secondaryParts.push(garment.season[0]);
  }

  return (
    <Link
      to={`/garments/${garment.id}`}
      className="group rounded-2xl bg-white border border-[#E6E0F8] p-3 flex flex-col gap-3 shadow-soft transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-2"
    >
      <div className="aspect-[4/5] w-full rounded-xl bg-[#FFFBFD] border border-[#E6E0F8]/60 p-2.5 flex items-center justify-center overflow-hidden">
        <StorageImage
          path={garment.imageThumbPath || garment.cutoutPath}
          alt={altText}
          className="w-full h-full object-contain transition-transform duration-200 group-hover:scale-[1.03]"
        />
      </div>

      <div className="space-y-1 px-0.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold text-[#4A4458] truncate">
            {garment.name}
          </h3>
          <span
            className="w-3 h-3 rounded-full border border-[#4A4458]/20 shrink-0"
            style={{ backgroundColor: garment.dominantColor }}
            title={`Color ${garment.dominantColor}`}
            aria-hidden="true"
          />
        </div>

        <p className="text-xs text-[#6B6580] truncate">{secondaryParts.join(' · ')}</p>
      </div>
    </Link>
  );
}
