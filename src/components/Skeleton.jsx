import React from 'react';
import AmbientLight from './AmbientLight';

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

// ─── Lobby Room Tile Skeleton ────────────────────────────────
export const LobbyTileSkeleton = () => (
  <div className="w-full max-w-xl bg-white/[0.03] p-5 rounded-2xl flex flex-col gap-3">
    <div className="flex justify-between items-start">
      <Shimmer className="h-5 w-48 rounded-md" />
    </div>
    <div className="mt-2 w-full">
      <Shimmer className="h-4 w-3/4 rounded-md" />
    </div>
  </div>
);

// ─── Full-screen app init skeleton ───────────────────────────
export const AppInitSkeleton = ({ status }) => {
  const loadingText = status === 'failed' ? 'connection failed' : status === 'connected' ? 'connected' : 'connecting';
  
  const textColor = status === 'failed' ? 'text-red-500' : status === 'connected' ? 'text-emerald-500' : 'text-white/40';
  const dotColor = status === 'failed' ? 'text-red-500/30' : status === 'connected' ? 'text-emerald-500/30' : 'text-white/10';
  const lightVariant = status === 'failed' ? 'error' : status === 'connected' ? 'success' : 'default';

  const isConnecting = status !== 'failed' && status !== 'connected';

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <AmbientLight variant={lightVariant} />
      </div>

      {/* Centered Bloom SVG Text */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[5]">
        <div className="w-3/4 max-w-md overflow-hidden leading-none opacity-100 -translate-y-4">
          <svg viewBox="0 0 100 28" className="w-full h-auto">
            <text 
              x="50%" 
              y="27" 
              textAnchor="middle" 
              className={`font-['Gloock'] tracking-tight transition-all duration-700 ${
                isConnecting ? 'fill-transparent stroke-white/60' : 'fill-white stroke-transparent'
              }`} 
              fontSize="32"
              strokeWidth={isConnecting ? "0.3" : "0"}
            >
              <tspan className={isConnecting ? 'stroke-b' : ''}>B</tspan>
              <tspan className={isConnecting ? 'stroke-l' : ''}>l</tspan>
              <tspan className={isConnecting ? 'stroke-o' : ''}>o</tspan>
              <tspan className={isConnecting ? 'stroke-o' : ''}>o</tspan>
              <tspan className={isConnecting ? 'stroke-m' : ''}>m</tspan>
            </text>
          </svg>
        </div>
      </div>

      <div className="w-full relative z-10 flex mask-image-x overflow-hidden">
        <div className="flex w-max animate-marquee whitespace-nowrap">
          {/* Half 1 */}
          <div className="flex items-center gap-4 shrink-0 pr-4">
            {Array(20).fill(0).map((_, i) => (
              <React.Fragment key={`h1-${i}`}>
                <span className={`text-sm sm:text-base font-medium ${textColor}`}>
                  {loadingText}
                </span>
                <span className={`text-[10px] ${dotColor}`}>•</span>
              </React.Fragment>
            ))}
          </div>
          {/* Half 2 */}
          <div className="flex items-center gap-4 shrink-0 pr-4">
            {Array(20).fill(0).map((_, i) => (
              <React.Fragment key={`h2-${i}`}>
                <span className={`text-sm sm:text-base font-medium ${textColor}`}>
                  {loadingText}
                </span>
                <span className={`text-[10px] ${dotColor}`}>•</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {status === 'failed' && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20">
          <button 
            onClick={() => window.location.href = window.location.pathname} 
            className="h-10 px-6 bg-white/10 hover:bg-white/20 text-white font-medium text-sm rounded-full transition-all flex items-center justify-center backdrop-blur-sm"
          >
            Return Home
          </button>
        </div>
      )}
    </div>
  );
};
