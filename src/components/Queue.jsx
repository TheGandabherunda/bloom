/* eslint-disable react-hooks/exhaustive-deps, react/display-name, no-empty, no-useless-escape */  
import React, { useState, useEffect, useRef } from 'react';
import { usePlayback } from '../context/PlaybackContext';
import { useOrbit } from '../context/OrbitContext';
import { extractPrimaryColor } from '../utils/colorExtractor';
import { importPlaylist, searchTracks } from '../services/musicApi';

const formatTime = (seconds) => {
  if (isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

const TileVisualizer = ({ playerRef, isPlaying, cardColor }) => {
  const barsRef = useRef([]);

  useEffect(() => {
    if (!isPlaying) {
      for (let i = 0; i < 6; i++) {
        if (barsRef.current[i]) barsRef.current[i].style.transform = 'scaleY(0.05)';
      }
      return;
    }

    const handleVisualizerFrame = (data) => {
      for (let i = 0; i < 6; i++) {
        if (barsRef.current[i]) {
          const idx = Math.floor((i / 6) * 48);
          const val = data.length > idx ? data[idx] : 0;
          const normalized = Math.pow(val / 255, 1.4);
          barsRef.current[i].style.transform = `scaleY(${Math.max(0.05, normalized)})`;
        }
      }
    };

    if (playerRef?.current) {
      playerRef.current.addVisualizer(handleVisualizerFrame);
    }

    return () => {
      if (playerRef?.current) {
        playerRef.current.removeVisualizer(handleVisualizerFrame);
      }
    };
  }, [isPlaying, playerRef]);

  return (
    <div className="absolute inset-0 bg-black/70 flex items-end justify-between gap-[2px] px-1 pt-4 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div 
          key={i} 
          ref={el => barsRef.current[i] = el}
          className="flex-1 rounded-t-sm origin-bottom will-change-transform"
          style={{ transform: 'scaleY(0.05)', backgroundColor: cardColor }}
        />
      ))}
    </div>
  );
};

const QueueItem = React.memo(({ 
  track, idx, queueLength, isActive, isPlaying, isLoading, canControl, 
  loadTrack, removeFromQueue, moveQueueItem, 
  draggedIdx, dragOverIdx, handleDragStart, handleDragOver, handleDrop, handleDragEnd, handleTouchStart, playerRef 
}) => {
  const [cardColor, setCardColor] = useState('var(--color-primary)');
  const isDragging = draggedIdx === idx;
  const isDragOver = dragOverIdx === idx && !isDragging;

  useEffect(() => {
    // ONLY extract color for the active playing track — avoids 100 parallel worker jobs when importing playlists
    if (!isActive || !track?.thumbnail) return;
    let cancelled = false;
    extractPrimaryColor(track.thumbnail).then(color => {
      if (!cancelled) setCardColor(color);
    });
    return () => { cancelled = true; };
  }, [isActive, track?.thumbnail]);

  return (
    <div
      data-queue-idx={idx}
      draggable={canControl}
      onDragStart={(e) => handleDragStart(e, idx)}
      onDragOver={(e) => handleDragOver(e, idx)}
      onDrop={(e) => handleDrop(e, idx)}
      onDragEnd={handleDragEnd}
      onClick={() => { 
        if (canControl) { loadTrack(track, idx); } 
      }}
      className={`relative flex items-center gap-2 p-2 rounded-xl transition-all ${
        canControl ? 'cursor-pointer' : ''
      } bg-white/[0.04] hover:!opacity-100 hover:bg-white/10 ${
        isActive ? '!opacity-100' : 'opacity-85 group-hover/queue:opacity-50'
      } ${
        isDragging ? 'opacity-30 scale-[0.98]' : ''
      } ${
        isDragOver ? 'ring-2 ring-[var(--color-primary)] bg-white/10 scale-[1.01]' : ''
      }`}
      style={isActive ? { background: `linear-gradient(90deg, color-mix(in srgb, ${cardColor} 20%, transparent) 0%, transparent 100%)` } : {}}
    >
      {/* Drag Handle Icon for Desktop & Mobile */}
      {canControl && (
        <div 
          onTouchStart={(e) => {
            e.stopPropagation();
            handleTouchStart(e, idx);
          }}
          className="cursor-grab active:cursor-grabbing text-white/30 hover:text-white/80 shrink-0 flex items-center justify-center p-1 touch-none"
          title="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="material-symbols-rounded text-[18px]">drag_indicator</span>
        </div>
      )}

      {/* Album Art Thumbnail */}
      <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-white/10 shrink-0 shadow-lg">
        <img src={track.thumbnail} className={`w-full h-full object-cover transition-opacity ${isActive && isLoading ? 'opacity-50' : 'opacity-100'}`} alt="" />
        {(isActive && isLoading) && (
          <div className="absolute inset-0 z-20 shimmer" />
        )}
        {(isActive && isPlaying && !isLoading) && (
          <TileVisualizer playerRef={playerRef} isPlaying={isPlaying} cardColor={cardColor} />
        )}
      </div>

      {/* Song Details */}
      <div className={`min-w-0 flex-1 relative ${isActive && isLoading ? 'rounded overflow-hidden' : ''}`}>
        {(isActive && isLoading) && (
          <div className="absolute inset-0 z-20 shimmer mix-blend-overlay opacity-50" />
        )}
        <h4 className={`text-xs font-bold truncate ${isActive ? '' : 'text-white/90'}`} style={{ color: isActive ? cardColor : undefined }}>{track.title}</h4>
        <p className="text-[10px] text-white/40 font-medium truncate mt-0.5">{track.author}</p>
      </div>

      {/* Control Action Buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="text-[10px] font-mono text-white/30 tabular-nums mr-0.5">
          {formatTime(track.duration / 1000)}
        </div>

        {/* ALWAYS-VISIBLE UP & DOWN ARROWS for Queue Reordering */}
        {canControl && (
          <div className="flex items-center gap-0.5 shrink-0 bg-white/5 rounded-lg p-0.5 border border-white/10">
            <button
              type="button"
              disabled={idx === 0}
              onClick={(e) => {
                e.stopPropagation();
                moveQueueItem(idx, 'up');
              }}
              className={`w-6 h-6 flex items-center justify-center rounded-md transition-all ${
                idx === 0
                  ? 'text-white/15 cursor-not-allowed'
                  : 'text-white/70 hover:text-white hover:bg-white/15 active:scale-90'
              }`}
              title="Move Up"
            >
              <span className="material-symbols-rounded text-[18px] leading-none">keyboard_arrow_up</span>
            </button>

            <button
              type="button"
              disabled={idx === queueLength - 1}
              onClick={(e) => {
                e.stopPropagation();
                moveQueueItem(idx, 'down');
              }}
              className={`w-6 h-6 flex items-center justify-center rounded-md transition-all ${
                idx === queueLength - 1
                  ? 'text-white/15 cursor-not-allowed'
                  : 'text-white/70 hover:text-white hover:bg-white/15 active:scale-90'
              }`}
              title="Move Down"
            >
              <span className="material-symbols-rounded text-[18px] leading-none">keyboard_arrow_down</span>
            </button>
          </div>
        )}

        {/* Delete / Remove button */}
        {canControl && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeFromQueue(idx);
            }}
            className="w-6 h-6 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            title="Remove from queue"
          >
            <span className="material-symbols-rounded text-[14px] leading-none">close</span>
          </button>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  return prev.isActive === next.isActive &&
         prev.isLoading === next.isLoading &&
         (!prev.isActive || prev.isPlaying === next.isPlaying) &&
         prev.canControl === next.canControl &&
         prev.draggedIdx === next.draggedIdx &&
         prev.dragOverIdx === next.dragOverIdx &&
         prev.idx === next.idx &&
         prev.queueLength === next.queueLength &&
         prev.track.id === next.track.id;
});

const Queue = () => {
  const { 
    queue, currentIndex, loadTrack, isPlaying, isLoading, 
    removeFromQueue, reorderQueue, moveQueueItem, playerRef, addMultipleToQueue 
  } = usePlayback();
  const { peerId, peerRoles, peerNames, chatDb } = useOrbit();
  const role = peerRoles[peerId] || 'peer';
  const canControl = role === 'owner' || role === 'admin';
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const containerRef = useRef(null);
  const touchActiveIdxRef = useRef(null);
  const lastScrolledTrackIdRef = useRef(null);
  const isUserInteractingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);

  const handleScroll = () => {
    isUserInteractingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isUserInteractingRef.current = false;
    }, 2000);
  };

  // Auto-scroll current playing song to top of queue section ONLY once per track change
  useEffect(() => {
    if (currentIndex < 0 || queue.length === 0) return;
    const currentTrackId = queue[currentIndex]?.id;
    if (!currentTrackId) return;

    // Never auto-scroll if we already scrolled for this track, or if user is actively interacting with the queue
    if (lastScrolledTrackIdRef.current === currentTrackId || isUserInteractingRef.current) {
      return;
    }

    lastScrolledTrackIdRef.current = currentTrackId;

    const timer = setTimeout(() => {
      if (!containerRef.current || isUserInteractingRef.current) return;
      const activeEl = containerRef.current.querySelector(`[data-queue-idx="${currentIndex}"]`);
      if (activeEl) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const activeRect = activeEl.getBoundingClientRect();
        const targetScrollTop = containerRef.current.scrollTop + (activeRect.top - containerRect.top) - 8;
        containerRef.current.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth'
        });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [currentIndex, queue]);

  // Desktop Drag Handlers
  const handleDragStart = (e, index) => {
    if (!canControl) return;
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
    setDraggedIdx(index);
  };

  const handleDragOver = (e, index) => {
    if (!canControl) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== index) setDragOverIdx(index);
  };

  const handleDrop = (e, index) => {
    if (!canControl) return;
    e.preventDefault();
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(fromIndex) && fromIndex !== index) {
      reorderQueue(fromIndex, index);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  // Touch Drag Handlers (Mobile) — Only active when explicitly holding the drag handle
  const handleTouchStart = (e, index) => {
    if (!canControl) return;
    touchActiveIdxRef.current = index;
    setDraggedIdx(index);
  };

  useEffect(() => {
    if (draggedIdx === null) return;

    const onTouchMove = (e) => {
      if (touchActiveIdxRef.current === null || !canControl) return;
      const touch = e.touches[0];
      const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
      if (targetEl) {
        const queueItemEl = targetEl.closest('[data-queue-idx]');
        if (queueItemEl) {
          const targetIdx = parseInt(queueItemEl.getAttribute('data-queue-idx'), 10);
          if (!isNaN(targetIdx) && targetIdx !== dragOverIdx) {
            setDragOverIdx(targetIdx);
          }
        }
      }
    };

    const onTouchEnd = () => {
      if (touchActiveIdxRef.current !== null && dragOverIdx !== null && touchActiveIdxRef.current !== dragOverIdx) {
        reorderQueue(touchActiveIdxRef.current, dragOverIdx);
      }
      touchActiveIdxRef.current = null;
      setDraggedIdx(null);
      setDragOverIdx(null);
    };

    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [draggedIdx, dragOverIdx, canControl, reorderQueue]);

  const handleImport = async (e) => {
    e.preventDefault();
    if (!importUrl.trim() || !canControl) return;
    
    setIsImporting(true);
    const urlToImport = importUrl.trim();
    setImportUrl('');

    // Stage 1: Initializing & fetching playlist metadata
    window.dispatchEvent(new CustomEvent('bloom:notify', {
      detail: {
        id: 'playlist-import',
        type: 'progress',
        progress: 5,
        text: 'Fetching playlist tracks...',
        sender: 'Queue'
      }
    }));

    try {
      const parsedTracks = await importPlaylist(urlToImport);
      if (!parsedTracks || parsedTracks.length === 0) {
        setIsImporting(false);
        window.dispatchEvent(new CustomEvent('bloom:notify', {
          detail: {
            id: 'playlist-import',
            type: 'system',
            complete: true,
            text: 'Could not find any playable tracks in this playlist.',
            sender: 'Queue'
          }
        }));
        return;
      }
      
      const total = parsedTracks.length;
      window.dispatchEvent(new CustomEvent('bloom:notify', {
        detail: {
          id: 'playlist-import',
          type: 'progress',
          progress: 10,
          text: `Found ${total} songs. Resolving audio streams...`,
          sender: 'Queue'
        }
      }));

      let importedTracks = [];
      const BATCH_SIZE = 4;

      for (let i = 0; i < total; i += BATCH_SIZE) {
        const chunk = parsedTracks.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(chunk.map(async (t) => {
          const cleanTitle = t.title.replace(/[\(\[].*?[\)\]]|official|video|audio|lyric|mv/ig, '').trim();
          const cleanAuthor = t.author.replace(/- Topic|VEVO|music/ig, '').trim();
          const query = (cleanTitle + ' ' + cleanAuthor).trim();

          try {
            const results = await searchTracks(query);
            if (results && results.length > 0) {
              return results[0];
            } else {
              const fallbackResults = await searchTracks(cleanTitle);
              if (fallbackResults && fallbackResults.length > 0) {
                return fallbackResults[0];
              }
            }
          } catch (err) {
            console.warn(`Failed to match track: ${t.title}`);
          }
          return null;
        }));

        for (const res of batchResults) {
          if (res) importedTracks.push(res);
        }

        const currentCount = Math.min(i + chunk.length, total);
        const percent = Math.min(95, Math.round(10 + (currentCount / total) * 85));
        const statusText = `Importing playlist: ${currentCount} of ${total} (${percent}%)...`;

        window.dispatchEvent(new CustomEvent('bloom:notify', {
          detail: {
            id: 'playlist-import',
            type: 'progress',
            progress: percent,
            text: statusText,
            sender: 'Queue'
          }
        }));
      }

      if (importedTracks.length > 0) {
        addMultipleToQueue(importedTracks);
        const userName = peerNames[peerId] || localStorage.getItem('bloom_name') || 'Someone';

        // Notify local user with 100% completed status in NotificationStrip
        window.dispatchEvent(new CustomEvent('bloom:notify', {
          detail: {
            id: 'playlist-import',
            type: 'progress',
            progress: 100,
            complete: true,
            text: `Successfully added ${importedTracks.length} tracks to queue!`,
            sender: 'Queue'
          }
        }));

        // Broadcast a single system announcement to the room chat
        const systemMsg = { 
          text: `${userName} imported ${importedTracks.length} songs from a playlist.`, 
          type: 'system', 
          sender: 'System', 
          timestamp: Date.now() 
        };
        window.dispatchEvent(new CustomEvent('bloom:chat-message', { detail: systemMsg }));
        if (chatDb) {
          try { await chatDb.add(systemMsg); } catch(err) {}
        }
      } else {
        window.dispatchEvent(new CustomEvent('bloom:notify', {
          detail: {
            id: 'playlist-import',
            type: 'system',
            complete: true,
            text: 'Could not match any tracks to playable audio streams.',
            sender: 'Queue'
          }
        }));
      }
    } catch (error) {
      console.error('Failed to import playlist:', error);
      window.dispatchEvent(new CustomEvent('bloom:notify', {
        detail: {
          id: 'playlist-import',
          type: 'system',
          complete: true,
          text: `Failed to import playlist: ${error.message || 'Unknown error'}`,
          sender: 'Queue'
        }
      }));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
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
            {importUrl && !isImporting && (
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 bg-[var(--color-primary)] text-black w-7 h-7 rounded-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-all">
                <span className="material-symbols-rounded text-[16px] font-bold">add</span>
              </button>
            )}
          </form>
        </div>
      )}

      <div 
        ref={containerRef} 
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 pt-2 pb-12 space-y-2 group/queue overscroll-contain"
      >
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
              queueLength={queue.length}
              isActive={idx === currentIndex}
              isPlaying={isPlaying}
              isLoading={idx === currentIndex && isLoading}
              canControl={canControl}
              loadTrack={loadTrack}
              removeFromQueue={removeFromQueue}
              moveQueueItem={moveQueueItem}
              reorderQueue={reorderQueue}
              draggedIdx={draggedIdx}
              dragOverIdx={dragOverIdx}
              handleDragStart={handleDragStart}
              handleDragOver={handleDragOver}
              handleDrop={handleDrop}
              handleDragEnd={handleDragEnd}
              handleTouchStart={handleTouchStart}
              playerRef={playerRef}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default Queue;
