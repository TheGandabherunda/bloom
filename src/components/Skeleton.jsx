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
    <div className="fixed inset-0 z-[300] bg-black flex flex-col items-center justify-center overflow-hidden">
      {/* Ambient background logo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <img 
          src="./assets/Bloom.svg" 
          className="w-[150vw] sm:w-[90vw] max-w-[800px] opacity-[0.12] rotate-slow blur-xl mix-blend-screen saturate-150" 
          alt="" 
        />
      </div>

      {/* Spinning logo in middle */}
      <div className="z-10 flex flex-col items-center gap-8">
        <div className="relative flex items-center justify-center">
          <img 
            src="./assets/Bloom.svg" 
            className="w-24 h-24 sm:w-32 sm:h-32 animate-[spin_4s_linear_infinite] drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]" 
            alt="Bloom Logo" 
          />
        </div>
        
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-4xl font-bold tracking-tight text-white/90 drop-shadow-md">Bloom</h1>
          <p className="text-white/50 text-sm tracking-[0.2em] uppercase font-medium animate-pulse">
            {loadingText}
          </p>
        </div>
      </div>
    </div>
  );
};
