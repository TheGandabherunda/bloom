import React, { useState, useEffect } from 'react';
import { searchTracks } from '../services/musicApi';

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const RecommendSongModal = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setHasSearched(true);
      try {
        const tracks = await searchTracks(query.trim());
        setResults(tracks || []);
      } catch (err) {
        console.warn('Recommend search failed:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="absolute bottom-[160px] lg:bottom-[80px] left-4 right-4 bg-slate-800 rounded-2xl shadow-2xl flex flex-col z-[100] h-[360px] overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      {/* Header Search Bar matching GIF modal style */}
      <div className="p-3 bg-slate-900/50 flex gap-2 shrink-0 items-center">
        <div className="flex-1 relative">
          <span className="material-symbols-rounded absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px] pointer-events-none">
            search
          </span>
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search song, artist, or paste link..."
            className="w-full h-10 bg-white/[0.08] rounded-full pl-10 pr-9 text-sm text-white focus:outline-none placeholder-white/35 transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
            >
              <span className="material-symbols-rounded text-base">close</span>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors shrink-0"
          title="Close"
        >
          <span className="material-symbols-rounded">close</span>
        </button>
      </div>

      {/* Results List without any strokes/borders */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar">
        {loading ? (
          <div className="p-4 space-y-2.5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.03]">
                <div className="w-11 h-11 rounded-lg bg-white/5 shimmer shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/5 bg-white/5 shimmer rounded" />
                  <div className="h-2.5 w-2/5 bg-white/5 shimmer rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : results.length > 0 ? (
          results.map((track) => (
            <div
              key={track.id}
              onClick={() => {
                onSelect(track);
                onClose();
              }}
              className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.08] transition-all cursor-pointer group active:scale-[0.99]"
            >
              <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-white/10 shrink-0 shadow">
                <img src={track.thumbnail} className="w-full h-full object-cover" alt="" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-white truncate group-hover:text-[var(--color-primary)] transition-colors">
                  {track.title}
                </h4>
                <p className="text-[11px] text-white/50 truncate mt-0.5 font-medium">
                  {track.author}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 pr-1">
                <span className="text-[10px] font-mono text-white/40 tabular-nums">
                  {formatDuration(track.duration)}
                </span>
                <div className="w-7 h-7 rounded-full bg-white/10 group-hover:bg-white group-hover:text-black text-white/70 flex items-center justify-center transition-all">
                  <span className="material-symbols-rounded text-base">add</span>
                </div>
              </div>
            </div>
          ))
        ) : hasSearched && query.trim() ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-white/40 gap-2">
            <span className="material-symbols-rounded text-3xl text-white/20">music_off</span>
            <p className="text-xs font-medium">No songs found for &ldquo;{query}&rdquo;</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center text-white/40 gap-2">
            <span className="material-symbols-rounded text-3xl text-white/20">queue_music</span>
            <div>
              <p className="text-xs font-semibold text-white/70">Recommend a song to the party</p>
              <p className="text-[11px] text-white/40 mt-0.5">Search by title, artist, or paste a link</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecommendSongModal;
