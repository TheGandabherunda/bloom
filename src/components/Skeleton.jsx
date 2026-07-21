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
export const AppInitSkeleton = ({ status }) => {
  const loadingText = status === 'initializing' ? 'Connecting to peers...' : 'Starting Node...';
  
  return (
    <div className="fixed inset-0 z-[300] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 to-black flex flex-col items-center justify-center overflow-hidden">
      
      {/* Spinning logo in middle */}
      <div className="z-10 flex flex-col items-center gap-6">
        <div className="relative flex items-center justify-center">
          <img 
            src="./assets/Bloom.svg" 
            className="w-24 h-24 sm:w-32 sm:h-32 animate-[spin_4s_linear_infinite]" 
            alt="Bloom Logo" 
          />
        </div>
        
        <p className="text-white/40 text-sm tracking-[0.2em] uppercase font-medium">
          {loadingText}
        </p>
      </div>
    </div>
  );
};
