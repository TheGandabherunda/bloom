import React, { useState, useEffect, useRef } from 'react';
import { getLyrics } from '../services/monochromeApi';

const Lyrics = React.memo(({ currentTrack, playerRef }) => {
  const [lyricsData, setLyricsData] = useState([]);
  const [isSynced, setIsSynced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeIndexRef = useRef(-1);
  
  const containerRef = useRef(null);
  const lineRefs = useRef([]);
  const [offsetY, setOffsetY] = useState(0);

  // Parse LRC format: [mm:ss.xx] text
  const parseLrc = (lrcString) => {
    const lines = lrcString.split('\n');
    const parsed = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = timeRegex.exec(line);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const milliseconds = parseInt(match[3], 10);
        
        // Convert to seconds
        const timeInSeconds = minutes * 60 + seconds + (milliseconds / (match[3].length === 3 ? 1000 : 100));
        const text = line.replace(timeRegex, '').trim();
        
        // Skip empty lines with time tags
        if (text) {
          const isInst = text === '♪' || text === '🎵' || text.toLowerCase() === 'instrumental' || text === '...';
          parsed.push({ time: timeInSeconds, text: isInst ? '•••' : text, isInstrumental: isInst });
        }
      } else if (line.trim()) {
         // Fallback for non-synced lines in a synced file
         parsed.push({ time: -1, text: line.trim() });
      }
    }
    
    // Auto-inject instrumental breaks for long gaps (> 12 seconds)
    const withBreaks = [];
    for (let i = 0; i < parsed.length; i++) {
      withBreaks.push(parsed[i]);
      if (i < parsed.length - 1 && parsed[i].time >= 0 && parsed[i+1].time >= 0) {
        const gap = parsed[i+1].time - parsed[i].time;
        if (gap > 12 && !parsed[i].isInstrumental && !parsed[i+1].isInstrumental) {
          withBreaks.push({
            time: parsed[i].time + Math.min(5, gap / 3),
            text: '•••',
            isInstrumental: true
          });
        }
      }
    }
    
    return withBreaks;
  };

  useEffect(() => {
    let isMounted = true;

    const fetchLyrics = async () => {
      if (!currentTrack) return;
      
      setLoading(true);
      setError(false);
      setLyricsData([]);
      setActiveIndex(-1);
      activeIndexRef.current = -1;
      
      try {
        const data = await getLyrics(currentTrack.title, currentTrack.author);
        
        if (isMounted && data && data.lyrics) {
          if (data.isSynced) {
            const parsed = parseLrc(data.lyrics);
            setLyricsData(parsed);
            setIsSynced(true);
          } else {
            // Plain text lyrics
            const lines = data.lyrics.split('\n').map(text => ({ time: -1, text: text.trim() })).filter(l => l.text);
            setLyricsData(lines);
            setIsSynced(false);
          }
        } else if (isMounted) {
          setError(true);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchLyrics();

    return () => {
      isMounted = false;
    };
  }, [currentTrack?.id]);

  // Determine active line index via direct timeListener (only triggers state change when line index changes)
  useEffect(() => {
    if (!playerRef?.current || !isSynced || lyricsData.length === 0) return;

    const handleTime = (time) => {
      let idx = -1;
      for (let i = 0; i < lyricsData.length; i++) {
        if (time >= lyricsData[i].time) {
          idx = i;
        } else {
          break;
        }
      }
      if (idx !== activeIndexRef.current) {
        activeIndexRef.current = idx;
        setActiveIndex(idx);
      }
    };

    handleTime(playerRef.current.getCurrentTime());

    playerRef.current.addTimeListener(handleTime);
    return () => {
      if (playerRef?.current) {
        playerRef.current.removeTimeListener(handleTime);
      }
    };
  }, [playerRef, isSynced, lyricsData]);

  // Smooth cinematic glide to active line
  useEffect(() => {
    if (!isSynced || activeIndex < 0) {
      setOffsetY(0);
      return;
    }
    
    const activeLine = lineRefs.current[activeIndex];
    const container = containerRef.current;
    
    if (activeLine && container) {
      const containerHeight = container.clientHeight;
      // Calculate offset to center the active line in the container
      const targetOffset = activeLine.offsetTop - (containerHeight / 2) + (activeLine.offsetHeight / 2);
      setOffsetY(Math.max(0, targetOffset)); // Prevent negative scroll
    }
  }, [activeIndex, isSynced, lyricsData]);

  if (loading) {
    return (
      <div className="flex-1 w-full px-6 md:px-12 lg:px-24 z-10 relative">
        <div className="max-w-3xl mx-auto flex flex-col gap-8 text-center pt-32">
          {Array.from({ length: 6 }).map((_, i) => (
            <div 
              key={i} 
              className={`shimmer rounded-lg mx-auto ${
                i % 2 === 0 ? 'h-8 md:h-10 w-3/4' : 'h-8 md:h-10 w-2/4'
              }`}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || lyricsData.length === 0) {
    return (
      <div className="flex-1 w-full flex items-center justify-center text-white/50 text-sm z-10 relative">
        <div className="flex flex-col items-center gap-2">
          <span className="material-symbols-rounded text-3xl opacity-50">lyrics</span>
          <p>No lyrics found for this track.</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`flex-1 w-full px-6 md:px-12 lg:px-24 z-10 relative mask-image-fade ${isSynced ? 'overflow-hidden' : 'overflow-y-auto no-scrollbar py-[20vh]'}`}
      style={{
        maskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)'
      }}
    >
      <div 
        className={`max-w-3xl mx-auto flex flex-col gap-6 text-center ${isSynced ? 'transition-transform duration-[1000ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]' : 'pb-[20vh]'}`}
        style={isSynced ? {
          transform: `translateY(-${offsetY}px)`,
          paddingTop: '50vh',
          paddingBottom: '50vh'
        } : {}}
      >
        {lyricsData.map((line, idx) => {
          const isActive = isSynced && idx === activeIndex;
          const isPassed = isSynced && idx < activeIndex;
          
          return (
            <p
              key={idx}
              ref={el => lineRefs.current[idx] = el}
              className={`text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight transition-all duration-700 ease-out origin-center cursor-default
                ${isActive 
                  ? `text-white scale-110 opacity-100 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] ${line.isInstrumental ? 'animate-pulse text-white/80' : ''}` 
                  : isPassed
                    ? 'text-white/40 scale-100 opacity-100 blur-[1px]'
                    : 'text-white/20 scale-100 opacity-50'
                }
                ${!isSynced && 'text-white/70 scale-100 text-xl md:text-2xl font-medium'}
              `}
            >
              {line.text}
            </p>
          );
        })}
      </div>
    </div>
  );
});

export default Lyrics;
