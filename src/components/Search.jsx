import React, { useState, useEffect } from 'react';
import { searchTracks } from '../services/monochromeApi';
import { usePlayback } from '../context/PlaybackContext';
import { useOrbit } from '../context/OrbitContext';
import TrackCard from './TrackCard';
import { TrackGridSkeleton } from './Skeleton';

const Search = ({ query, onClose }) => {
  const { loadTrack, addToQueue } = usePlayback();
  const { peerId, peerRoles } = useOrbit();
  const role = peerRoles[peerId] || 'peer';
  const canControl = role === 'owner' || role === 'admin';
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      return;
    }

    let isMounted = true;
    setLoading(true);
    searchTracks(debouncedQuery)
      .then(res => {
        if (isMounted) {
          setResults(res);
          setLoading(false);
        }
      })
      .catch(e => {
        console.error(e);
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [debouncedQuery]);

  return (
    <div className="flex-1 overflow-y-auto p-6 animate-in fade-in duration-200 no-scrollbar pb-32 relative h-full">
        {loading ? (
          <div className="animate-in fade-in duration-300 w-full">
            <div className="h-4 w-40 shimmer rounded-lg mb-6" />
            <TrackGridSkeleton count={10} />
          </div>
        ) : results.length > 0 ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 w-full">
            <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest mb-6 flex items-center gap-2">
              <span className="material-symbols-rounded text-[var(--color-primary)] text-[20px]">search</span>
              Search Results
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {results.map(track => (
                <div key={track.id} className={!canControl ? 'opacity-50 pointer-events-none' : ''}>
                  <TrackCard track={track} addToQueue={addToQueue} onClick={() => { if (canControl) { loadTrack(track, -1); onClose(); } }} />
                </div>
              ))}
            </div>
          </div>
        ) : query && query.length >= 2 ? (
          <div className="absolute inset-0 flex items-center justify-center text-white/40 pointer-events-none">
             No results found for &quot;{query}&quot;
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/20 pointer-events-none">
             <span className="material-symbols-rounded text-6xl">search</span>
             <p className="text-sm font-bold uppercase tracking-widest">Type to start searching</p>
          </div>
        )}
    </div>
  );
};

export default Search;
