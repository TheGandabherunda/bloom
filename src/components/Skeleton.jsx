import React from 'react';

// ─── Base shimmer block ──────────────────────────────────────
export const Shimmer = ({ className = '' }) => (
  <div className={`shimmer rounded-lg ${className}`} />
);

// ─── Single TrackCard skeleton ───────────────────────────────
export const TrackCardSkeleton = () => (
  <div className="flex flex-col gap-3">
    {/* Square thumbnail */}
    <Shimmer className="aspect-square w-full rounded-2xl" />
    {/* Title */}
    <div className="px-1 space-y-2">
      <Shimmer className="h-3.5 w-4/5" />
      <Shimmer className="h-3 w-3/5" />
    </div>
  </div>
);

// ─── Grid of TrackCard skeletons (search / recommendations) ──
export const TrackGridSkeleton = ({ count = 10 }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
    {Array.from({ length: count }).map((_, i) => (
      <TrackCardSkeleton key={i} />
    ))}
  </div>
);

// ─── Player bar skeleton (track info area) ───────────────────
export const PlayerTrackSkeleton = () => (
  <div className="flex items-center gap-4 w-full justify-center">
    {/* Thumbnail */}
    <Shimmer className="w-12 h-12 rounded-lg shrink-0" />
    <div className="space-y-2 min-w-0">
      <Shimmer className="h-3.5 w-36" />
      <Shimmer className="h-3 w-24" />
    </div>
  </div>
);

// ─── Full-screen app init skeleton ───────────────────────────
export const AppInitSkeleton = ({ status }) => (
  <div className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-xl flex flex-col overflow-hidden">

    {/* Fake header */}
    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
      <div className="flex items-center gap-3">
        <Shimmer className="h-5 w-16" />
        <Shimmer className="h-5 w-24" />
      </div>
      {/* Fake search bar */}
      <Shimmer className="h-11 w-80 rounded-full" />
      <Shimmer className="h-5 w-24" />
    </div>

    {/* Fake content area */}
    <div className="flex flex-1 overflow-hidden">
      <main className="flex-1 p-6 space-y-10">
        {/* Section header */}
        <div className="space-y-6">
          <Shimmer className="h-4 w-40" />
          <TrackGridSkeleton count={10} />
        </div>
      </main>

      {/* Fake sidebar */}
      <aside className="w-72 border-l border-white/10 p-4 space-y-4 hidden lg:block">
        <Shimmer className="h-4 w-32 mb-6" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Shimmer className="w-10 h-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Shimmer className="h-3 w-3/4" />
              <Shimmer className="h-2.5 w-1/2" />
            </div>
          </div>
        ))}
      </aside>
    </div>

    {/* Fake player bar */}
    <div className="h-[77px] border-t border-white/10 flex items-center px-6 gap-6 shrink-0">
      <div className="flex items-center gap-4 w-1/3">
        <Shimmer className="w-10 h-10 rounded-full" />
        <Shimmer className="w-14 h-14 rounded-full" />
        <Shimmer className="w-10 h-10 rounded-full" />
      </div>
      <div className="flex items-center gap-4 justify-center w-1/3">
        <Shimmer className="w-12 h-12 rounded-lg" />
        <div className="space-y-2">
          <Shimmer className="h-3.5 w-36" />
          <Shimmer className="h-3 w-24" />
        </div>
      </div>
      <div className="flex items-center gap-3 justify-end w-1/3">
        <Shimmer className="h-3 w-28 rounded-full" />
      </div>
    </div>

    {/* Status label */}
    <div className="absolute bottom-24 left-0 right-0 flex justify-center">
      <p className="text-white/20 text-xs font-bold uppercase tracking-widest animate-pulse">
        {status}…
      </p>
    </div>
  </div>
);
