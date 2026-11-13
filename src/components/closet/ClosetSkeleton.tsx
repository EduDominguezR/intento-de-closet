export function ClosetSkeleton() {
  return (
    <div
      aria-label="Cargando prendas"
      aria-busy="true"
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
    >
      {Array.from({ length: 8 }, (_, idx) => (
        <div
          key={idx}
          className="rounded-2xl bg-white border border-[#E6E0F8] p-3 space-y-3 animate-pulse"
        >
          <div className="aspect-[4/5] w-full rounded-xl bg-[#E6E0F8]/40" />
          <div className="space-y-2 px-0.5">
            <div className="h-4 w-3/4 rounded-lg bg-[#E6E0F8]/55" />
            <div className="h-3 w-1/2 rounded-lg bg-[#E6E0F8]/35" />
          </div>
        </div>
      ))}
    </div>
  );
}
