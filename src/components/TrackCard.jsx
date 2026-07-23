import React, { useState, useEffect } from 'react';
import { extractPrimaryColor } from '../utils/colorExtractor';
import { useOrbit } from '../context/OrbitContext';

const TrackCard = React.memo(({ track, onClick, addToQueue }) => {
  const [cardColor, setCardColor] = useState('rgb(255, 255, 255)');
  const [hovered, setHovered] = useState(false);
  const [showMobileDropdown, setShowMobileDropdown] = useState(false);
  const { chatDb, peerNames, peerId } = useOrbit();

  useEffect(() => {
    if (!hovered || !track?.thumbnail) {
      setCardColor('rgb(255, 255, 255)');
      return;
    }
    let cancelled = false;
    extractPrimaryColor(track.thumbnail).then(color => {
      if (!cancelled) setCardColor(color);
    });
    return () => { cancelled = true; };
  }, [hovered, track?.thumbnail]);

  // Convert rgb(R, G, B) → rgba(R, G, B, opacity)
  const rgba = (color, opacity) => {
    const m = color.match(/\d+/g);
    if (m && m.length >= 3) return `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${opacity})`;
    return color;
  };

  return (
    <div
      className="flex flex-col gap-3 cursor-pointer"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image container */}
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-white/[0.06]"
      >
        <img src={track.thumbnail} className="w-full h-full object-cover" alt="" />

        {/* Dark veil only — no color tint */}
        <div
          className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
          style={{ opacity: hovered ? 1 : 0, background: 'rgba(0,0,0,0.55)' }}
        >
          {/* Play button scales from center */}
          {onClick && (
            <button className="w-14 h-14 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-all hover:scale-105 active:scale-95 shadow-2xl z-20" onClick={(e) => { e.stopPropagation(); onClick && onClick(e); }} style={{
                transform: hovered ? 'scale(1)' : 'scale(0)',
                opacity: hovered ? 1 : 0,
              }}>
              <span className="material-symbols-rounded text-white text-[38px] leading-none icon-fill" style={{ fontVariationSettings: "'FILL' 1" }}>
                play_arrow
              </span>
            </button>
          )}

          {/* Add to Queue Button */}
          {addToQueue && (
            <button 
              className="hidden lg:flex absolute top-2 right-2 h-8 px-3 bg-black/60 hover:bg-black/80 text-white rounded-full items-center justify-center gap-1.5 backdrop-blur-md transition-all hover:scale-105 active:scale-95 shadow-2xl z-30"
              style={{
                opacity: hovered ? 1 : 0,
                transform: hovered ? 'scale(1)' : 'scale(0.8)'
              }}
              onClick={async (e) => {
                e.stopPropagation();
                addToQueue(track);
                const userName = peerNames[peerId] || localStorage.getItem('bloom_name') || 'Someone';
                const systemMsg = { text: `${userName} added "${track.title}" to the queue.`, type: 'system', sender: 'System', timestamp: Date.now() };
                window.dispatchEvent(new CustomEvent('bloom:chat-message', { detail: systemMsg }));
                if (chatDb) {
                  try { await chatDb.add(systemMsg); } catch(err) { /* ignore */ }
                }
              }}
              title="Add to Queue"
            >
              <span className="material-symbols-rounded text-[18px] leading-none">playlist_add</span>
              <span className="text-[12px] font-semibold pt-[1px]">Queue</span>
            </button>
          )}
        </div>

        {/* HD badge — card's extracted color */}
        {track.audioQuality === 'HD' && (
          <div className="absolute top-2 left-2 z-10 bg-black/60 px-1 py-0.5 rounded shadow-xl backdrop-blur-md flex items-center justify-center border border-white/5">
            <span
              className="material-symbols-rounded text-[22px] leading-none"
              style={{ fontVariationSettings: "'FILL' 1", color: cardColor }}
            >
              hd
            </span>
          </div>
        )}
      </div>

      {/* Text — colors driven by CSS vars set on parent, guaranteed cascade */}
      <div className="px-1 flex items-start justify-between gap-2">
        <div
          className="flex-1 min-w-0"
          style={{
            '--title-clr': hovered ? cardColor : 'rgba(255,255,255,0.95)',
            '--desc-clr': hovered ? rgba(cardColor, 0.7) : 'rgba(255,255,255,0.4)',
          }}
        >
          <h4 className="text-sm font-semibold truncate" style={{ color: 'var(--title-clr)', transition: 'color 0.2s ease' }}>
            {track.title}
          </h4>
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--desc-clr)', transition: 'color 0.2s ease' }}>
            {track.author}
          </p>
        </div>
        
        {/* Mobile Options Button */}
        {addToQueue && (
          <div className="lg:hidden relative">
            <button 
              className="text-white/40 hover:text-white transition-colors p-1 rounded-full active:bg-white/10"
              onClick={(e) => { e.stopPropagation(); setShowMobileDropdown(!showMobileDropdown); }}
            >
              <span className="material-symbols-rounded text-[20px]">more_vert</span>
            </button>
            
            {showMobileDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={(e) => { e.stopPropagation(); setShowMobileDropdown(false); }} 
                />
                <div className="absolute right-0 top-full mt-2 bg-black/60 backdrop-blur-2xl border border-white/10 rounded-full shadow-2xl z-50 py-1.5 px-2 min-w-[100px] animate-in fade-in zoom-in-95 duration-200">
                  <button 
                    className="w-full text-left px-3 py-2 text-sm font-semibold text-white/90 hover:text-white hover:bg-white/10 active:bg-white/10 rounded-full transition-colors flex items-center justify-center gap-2"
                    onClick={async (e) => {
                      e.stopPropagation();
                      setShowMobileDropdown(false);
                      addToQueue(track);
                      const userName = peerNames[peerId] || localStorage.getItem('bloom_name') || 'Someone';
                      const systemMsg = { text: `${userName} added "${track.title}" to the queue.`, type: 'system', sender: 'System', timestamp: Date.now() };
                      window.dispatchEvent(new CustomEvent('bloom:chat-message', { detail: systemMsg }));
                      if (chatDb) {
                        try { await chatDb.add(systemMsg); } catch(err) { /* ignore */ }
                      }
                    }}
                  >
                    <span className="material-symbols-rounded text-[18px]">playlist_add</span>
                    Queue
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default TrackCard;
