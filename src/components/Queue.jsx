import React, { useState, useEffect } from 'react';
import { usePlayback } from '../context/PlaybackContext';
import { useOrbit } from '../context/OrbitContext';
import { extractPrimaryColor } from '../utils/colorExtractor';
import { importPlaylist, searchTracks } from '../services/monochromeApi';

const formatTime = (seconds) => {
  if (isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const TileVisualizer = ({ playerRef, cardColor }) => {
  const barsRef = React.useRef([]);

  React.useEffect(() => {
    let animationFrameId;
    
    const renderLoop = () => {
      let data = new Uint8Array(0);
      if (playerRef?.current) {
        data = playerRef.current.getFrequencyData();
      }
      
      for (let i = 0; i < 6; i++) {
        if (barsRef.current[i]) {
           const idx = Math.floor((i / 6) * 48); // sample like Player does
           const val = data.length > idx ? data[idx] : 0;
           const normalized = Math.pow(val / 255, 1.4);
           barsRef.current[i].style.height = `${Math.max(5, normalized * 100)}%`;
        }
      }
      
      animationFrameId = requestAnimationFrame(renderLoop);
    };
    
    renderLoop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [playerRef]);

  return (
    <div className="absolute inset-0 bg-black/70 flex items-end justify-between gap-[2px] px-1 pt-4 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div 
          key={i} 
          ref={el => barsRef.current[i] = el}
          className="flex-1 rounded-t-sm transition-all duration-75 ease-out will-change-[height]"
          style={{ height: '5%', backgroundColor: cardColor }}
        />
      ))}
    </div>
  );
};

const QueueItem = ({ track, idx, isActive, isPlaying, canControl, loadTrack, removeFromQueue, hoveredIdx, setHoveredIdx, playerRef }) => {
  const [cardColor, setCardColor] = useState('var(--color-primary)');
  const isAnyHovered = hoveredIdx !== -1;
  const isHovered = hoveredIdx === idx;
  
  useEffect(() => {
    if (!track?.thumbnail) return;
    let cancelled = false;
    extractPrimaryColor(track.thumbnail).then(color => {
      if (!cancelled) setCardColor(color);
    });
    return () => { cancelled = true; };
  }, [track?.thumbnail]);

  return (
    <div
      onClick={() => { 
        console.log(`[QueueItem] Clicked on track: ${track.title} (id: ${track.id}), idx: ${idx}, canControl: ${canControl}`);
        if (canControl) { loadTrack(track, idx); } 
      }}
      onMouseEnter={() => setHoveredIdx(idx)}
      onMouseLeave={() => setHoveredIdx(-1)}
      className={`relative flex items-center gap-3 p-2.5 rounded-xl transition-all ${canControl ? 'cursor-pointer' : ''} bg-white/[0.04] ${isHovered ? '!opacity-100 hover:bg-white/10' : (isAnyHovered && !isActive ? 'opacity-40' : 'opacity-100')} ${isActive ? '!opacity-100' : ''}`}
      style={isActive ? { background: `linear-gradient(90deg, color-mix(in srgb, ${cardColor} 20%, transparent) 0%, transparent 100%)` } : {}}
    >
      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-white/10 shrink-0 shadow-lg ml-1">
        <img src={track.thumbnail} className="w-full h-full object-cover" alt="" />
        {(isActive && isPlaying) && (
          <TileVisualizer playerRef={playerRef} cardColor={cardColor} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className={`text-xs font-bold truncate ${isActive ? '' : 'text-white/90'}`} style={{ color: isActive ? cardColor : undefined }}>{track.title}</h4>
        <p className="text-[10px] text-white/40 font-medium truncate mt-0.5">{track.author}</p>
      </div>
      <div className="flex items-center">
        <div className="text-[10px] font-mono text-white/30 tabular-nums">
          {formatTime(track.duration / 1000)}
        </div>
      </div>
      
      {canControl && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeFromQueue(idx);
          }}
          className={`absolute -top-2 -right-2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-neutral-900 border border-white/20 transition-all ${isHovered ? 'text-white hover:bg-neutral-800 opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'}`}
          title="Remove from queue"
        >
          <span className="material-symbols-rounded text-[14px] leading-none">close</span>
        </button>
      )}
    </div>
  );
};

const Queue = () => {
  const { queue, currentIndex, loadTrack, isPlaying, removeFromQueue, playerRef, addToQueue } = usePlayback();
  const { peerId, peerRoles, peerNames, chatDb } = useOrbit();
  const role = peerRoles[peerId] || 'peer';
  const canControl = role === 'owner' || role === 'admin';
  const [hoveredIdx, setHoveredIdx] = useState(-1);
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async (e) => {
    e.preventDefault();
    if (!importUrl.trim() || !canControl) return;
    
    setIsImporting(true);
    const urlToImport = importUrl;
    setImportUrl('');

    try {
      const parsedTracks = await importPlaylist(urlToImport);
      if (parsedTracks.length === 0) {
        setIsImporting(false);
        return;
      }
      
      let importedCount = 0;
      for (const t of parsedTracks) {
        // Clean up common YouTube noise to improve JioSaavn search match rate
        const cleanTitle = t.title.replace(/[\(\[].*?[\)\]]|official|video|audio|lyric|mv/ig, '').trim();
        const cleanAuthor = t.author.replace(/- Topic|VEVO|music/ig, '').trim();
        const query = (cleanTitle + ' ' + cleanAuthor).trim();

        // Silently search JioSaavn for the high-res stream
        try {
          const results = await searchTracks(query);
          if (results && results.length > 0) {
            addToQueue(results[0]);
            importedCount++;
          } else {
            // Fallback: search just the title if author + title failed
            const fallbackResults = await searchTracks(cleanTitle);
            if (fallbackResults && fallbackResults.length > 0) {
              addToQueue(fallbackResults[0]);
              importedCount++;
            }
          }
        } catch (err) {
          console.log(`Failed to match track: ${t.title}`);
        }
      }

      if (importedCount > 0) {
        const userName = peerNames[peerId] || localStorage.getItem('bloom_name') || 'Someone';
        const systemMsg = { 
          text: `${userName} imported ${importedCount} songs from a playlist.`, 
          type: 'system', 
          sender: 'System', 
          timestamp: Date.now() 
        };
        window.dispatchEvent(new CustomEvent('bloom:chat-message', { detail: systemMsg }));
        if (chatDb) {
          try { await chatDb.add(systemMsg); } catch(err) {}
        }
      }
    } catch (error) {
      console.error('Failed to import playlist:', error);
    }
    setIsImporting(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0" onMouseLeave={() => setHoveredIdx(-1)}>
      {/* Import Playlist Bar */}
      {canControl && (
        <div className="px-4 pt-4 pb-2 shrink-0">
          <form onSubmit={handleImport} className="relative flex items-center">
            <span className="material-symbols-rounded absolute left-3 text-white/40 text-lg pointer-events-none">link</span>
            <input 
              type="text" 
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="Paste YouTube or Spotify Playlist Link..." 
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-10 text-[13px] text-white placeholder-white/40 focus:outline-none focus:bg-white/10 transition-colors"
              disabled={isImporting}
            />
            {isImporting ? (
              <span className="material-symbols-rounded absolute right-3 text-white/50 text-lg animate-spin pointer-events-none">progress_activity</span>
            ) : importUrl ? (
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 bg-[var(--color-primary)] text-black w-7 h-7 rounded-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all">
                <span className="material-symbols-rounded text-[16px] font-bold">add</span>
              </button>
            ) : null}
          </form>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-2">
        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-white/20 group-hover/queue:opacity-100">
             <span className="material-symbols-rounded text-5xl">music_note</span>
             <p className="text-xs font-bold uppercase tracking-widest">Queue is empty</p>
          </div>
        ) : (
          queue.map((track, idx) => (
            <QueueItem 
              key={track.id + idx}
              track={track}
              idx={idx}
              isActive={idx === currentIndex}
              isPlaying={isPlaying}
              canControl={canControl}
              loadTrack={loadTrack}
              removeFromQueue={removeFromQueue}
              hoveredIdx={hoveredIdx}
              setHoveredIdx={setHoveredIdx}
              playerRef={playerRef}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default Queue;
