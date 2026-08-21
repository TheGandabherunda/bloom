import React from 'react';

// Exact mask coordinates based on 1000x633 coordinate space
// The transparent hole is formed by a black rectangle, CROPPED by the white tape rolls!
// Oversized base rectangles (-100, -100, 1200x833) prevent any 1px mask gaps on the outer edges.
const maskUrl = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 633'%3E%3Cmask id='m'%3E%3Crect x='-100' y='-100' width='1200' height='833' fill='white'/%3E%3Crect x='310' y='223' width='380' height='59' fill='black'/%3E%3Ccircle cx='310' cy='263' r='86' fill='white'/%3E%3Ccircle cx='690' cy='263' r='73' fill='white'/%3E%3Ccircle cx='170' cy='565' r='22' fill='black'/%3E%3Ccircle cx='830' cy='565' r='22' fill='black'/%3E%3Crect x='320' y='535' width='80' height='60' rx='6' fill='black'/%3E%3Crect x='600' y='535' width='80' height='60' rx='6' fill='black'/%3E%3C/mask%3E%3Crect x='-100' y='-100' width='1200' height='833' fill='black' mask='url(%23m)'/%3E%3C/svg%3E")`;

const NoiseOverlay = ({ opacity, blendMode }) => (
  <div className={`absolute inset-0 pointer-events-none ${blendMode}`} style={{ opacity }}>
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" preserveAspectRatio="none">
      <filter id="noiseFilter">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="matrix" values="1 0 0 0 0, 1 0 0 0 0, 1 0 0 0 0, 0 0 0 1 0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#noiseFilter)" />
    </svg>
  </div>
);

const SpoolSVG = ({ forwardRef }) => (
  <svg ref={forwardRef} viewBox="0 0 100 100" className="w-full h-full drop-shadow-md z-10 will-change-transform">
    {/* Outer white ring with thickness */}
    <path fill="#e5e5e5" fillRule="evenodd" d="M 50 2 A 48 48 0 1 1 49.9 2 M 50 22 A 28 28 0 1 0 50.1 22" />
    
    {/* 6 Beautifully tapered teeth with rounded inner tips, pointing inward! */}
    <g fill="#e5e5e5">
      {[0, 60, 120, 180, 240, 300].map(deg => (
        <path key={deg} d="M 45 22 L 47 34 A 3 3 0 0 0 53 34 L 55 22 Z" transform={`rotate(${deg} 50 50)`} />
      ))}
    </g>
  </svg>
);

const CassetteTape = ({ thumbnail, isPlaying, isExpanded, playerRef }) => {
  const leftSpoolRef = React.useRef(null);
  const rightSpoolRef = React.useRef(null);
  const scrubRatioRef = React.useRef(null);

  React.useEffect(() => {
    const handleScrub = (e) => {
      scrubRatioRef.current = e.detail;
      updateRotation();
    };
    window.addEventListener('bloom:scrub', handleScrub);
    return () => window.removeEventListener('bloom:scrub', handleScrub);
  }, []);

  React.useEffect(() => {
    const handleScrubEnd = () => {
      scrubRatioRef.current = null;
    };
    window.addEventListener('bloom:scrubEnd', handleScrubEnd);
    return () => window.removeEventListener('bloom:scrubEnd', handleScrubEnd);
  }, []);

  const updateRotation = React.useCallback(() => {
    let time = 0;
    if (scrubRatioRef.current !== null && playerRef?.current) {
      time = scrubRatioRef.current * (playerRef.current.audio?.duration || 0);
    } else if (playerRef?.current?.audio) {
      time = playerRef.current.audio.currentTime;
    }
    
    // 90 degrees per second means 4 seconds per full rotation
    const deg = time * 90;
    if (leftSpoolRef.current) leftSpoolRef.current.style.transform = `rotate(${deg}deg)`;
    if (rightSpoolRef.current) rightSpoolRef.current.style.transform = `rotate(${deg}deg)`;
  }, [playerRef]);

  React.useEffect(() => {
    if (!playerRef?.current) return;
    
    let animationFrameId;
    const loop = () => {
       if (isPlaying && scrubRatioRef.current === null) {
          updateRotation();
       }
       animationFrameId = requestAnimationFrame(loop);
    };
    loop();
    
    const handleTime = () => {
      if (!isPlaying && scrubRatioRef.current === null) updateRotation();
    };
    playerRef.current.addTimeListener(handleTime);
    
    return () => {
      cancelAnimationFrame(animationFrameId);
      if (playerRef.current) playerRef.current.removeTimeListener(handleTime);
    };
  }, [playerRef, isPlaying, updateRotation]);

  return (
    <div 
      className={`relative w-[90vw] max-w-[500px] aspect-[1.58/1] rounded-[4%] flex items-center justify-center transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${!isExpanded ? 'scale-95 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}`}
      style={{
        // Replaced box-shadow with drop-shadow so the shadow perfectly matches the SVG mask holes, eliminating any bounding box glow lines!
        filter: 'drop-shadow(0px 15px 15px rgba(0,0,0,0.7)) drop-shadow(0px 5px 5px rgba(0,0,0,0.5))'
      }}
    >
      {/* Magnetic Tape Ribbon (Behind the cassette, visible through the continuous center mask hole!) */}
      <div 
        className="absolute shadow-[0_2px_4px_rgba(0,0,0,0.6)] z-0"
        style={{ 
          // Extended bottom to 54% to ensure it overlaps the mask hole entirely, preventing transparent glitch lines!
          top: '41.5%', bottom: '54%', left: '31%', right: '31%',
          background: 'linear-gradient(to bottom, #110a08 0%, #2a1a14 20%, #1e130d 80%, #0a0604 100%)' 
        }}
      ></div>

      {/* Wrapper to clip the outer drop-shadows so we don't get glitch lines on the edge. Added a 1px border to cover subpixel antialiasing gaps! */}
      <div className="absolute inset-0 rounded-[4%] overflow-hidden z-10 border border-[#111]">
        {/* Outer Cassette Body */}
        <div 
          className="absolute inset-0 bg-[#262626] rounded-[4%] shadow-[inset_0_2px_1px_rgba(255,255,255,0.3),_inset_1.5px_0_1px_rgba(255,255,255,0.1),_inset_-1.5px_0_1px_rgba(255,255,255,0.1),_inset_0_-4px_8px_rgba(0,0,0,0.6)]"
          style={{ 
            WebkitMaskImage: maskUrl, 
            maskImage: maskUrl,
            WebkitMaskSize: '100% 100%',
            maskSize: '100% 100%',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            // SHARP INNER BEVEL: Casts a hard extrusion shadow and a soft ambient shadow into the hole, making the plastic look thick and realistic!
            filter: 'drop-shadow(0px 3px 0px rgba(0,0,0,0.85)) drop-shadow(0px 5px 6px rgba(0,0,0,0.6))'
          }}
        >
          <NoiseOverlay opacity={0.3} blendMode="mix-blend-overlay" />

        {/* 4 Corner Screws */}
        <div className="absolute top-[3%] left-[2%] w-[3.5%] aspect-square rounded-full bg-[#111] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8),_0_1px_1px_rgba(255,255,255,0.1)] flex items-center justify-center">
          <div className="w-[80%] h-[80%] rounded-full bg-[#1a1a1a] flex items-center justify-center rotate-45"><div className="w-full h-[15%] bg-[#050505] absolute"></div><div className="h-full w-[15%] bg-[#050505] absolute"></div></div>
        </div>
        <div className="absolute top-[3%] right-[2%] w-[3.5%] aspect-square rounded-full bg-[#111] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8),_0_1px_1px_rgba(255,255,255,0.1)] flex items-center justify-center">
          <div className="w-[80%] h-[80%] rounded-full bg-[#1a1a1a] flex items-center justify-center rotate-[70deg]"><div className="w-full h-[15%] bg-[#050505] absolute"></div><div className="h-full w-[15%] bg-[#050505] absolute"></div></div>
        </div>
        <div className="absolute bottom-[3%] left-[2%] w-[3.5%] aspect-square rounded-full bg-[#111] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8),_0_1px_1px_rgba(255,255,255,0.1)] flex items-center justify-center">
          <div className="w-[80%] h-[80%] rounded-full bg-[#1a1a1a] flex items-center justify-center rotate-12"><div className="w-full h-[15%] bg-[#050505] absolute"></div><div className="h-full w-[15%] bg-[#050505] absolute"></div></div>
        </div>
        <div className="absolute bottom-[3%] right-[2%] w-[3.5%] aspect-square rounded-full bg-[#111] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8),_0_1px_1px_rgba(255,255,255,0.1)] flex items-center justify-center">
          <div className="w-[80%] h-[80%] rounded-full bg-[#1a1a1a] flex items-center justify-center -rotate-12"><div className="w-full h-[15%] bg-[#050505] absolute"></div><div className="h-full w-[15%] bg-[#050505] absolute"></div></div>
        </div>



        {/* Album Art Sticker Label - Top corners CHOPPED exactly like the mockup! */}
        <div 
          className="absolute bg-[#111] overflow-hidden border border-white/10"
          style={{ 
            top: '8%', bottom: '25%', left: '5%', right: '5%',
            clipPath: 'polygon(6% 0%, 94% 0%, 100% 12%, 100% 100%, 0% 100%, 0% 12%)'
          }}
        >
          <img 
            src={thumbnail.replace('w120-h120', 'w1080-h1080').replace('hqdefault', 'maxresdefault')}
            alt="Cassette Label"
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
          <NoiseOverlay opacity={0.15} blendMode="mix-blend-multiply" />
          {/* Inner shadow overlay for sticker depth since clipPath removes outer shadow */}
          <div className="absolute inset-0 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] pointer-events-none"></div>
        </div>

        {/* Black Cutout Window */}
        <div 
          className="absolute bg-[#1a1a1a] shadow-[inset_0_3px_10px_rgba(0,0,0,1),_inset_0_-1.5px_1px_rgba(255,255,255,0.2),_inset_1.5px_0_1px_rgba(255,255,255,0.05),_inset_-1.5px_0_1px_rgba(255,255,255,0.05)] overflow-hidden border-[2px] border-[#0a0a0a]"
          style={{ 
            top: '27.5%', bottom: '44.5%', left: '22%', right: '22%',
            borderRadius: '999px' 
          }}
        >
          {/* Tape Background */}
          <div className="absolute inset-0 bg-[#161616]"></div>

          {/* The center hole is now entirely handled by the SVG mask punching through the cassette! */}

          {/* Raised Plastic Shelf at the bottom of the window */}
          <div className="absolute bottom-0 left-[10%] right-[10%] h-[40%] bg-[#1a1a1a] shadow-[0_-2px_4px_rgba(0,0,0,0.8),_inset_0_2px_2px_rgba(255,255,255,0.05)] border-t border-[#333] rounded-t-md">
             {/* Measurement Track engraved on the shelf */}
             <div 
               className="absolute flex justify-between px-[5%] text-[#555]"
               style={{ top: '15%', height: '30%', left: '15%', right: '15%' }}
             >
               <div className="flex flex-col items-center justify-end"><div className="w-[1.5px] h-[60%] bg-[#333] rounded-full"></div><span className="text-[5px] font-bold leading-none mt-[2px]">100</span></div>
               <div className="flex flex-col items-center justify-start"><div className="w-[1px] h-[40%] bg-[#333]"></div></div>
               <div className="flex flex-col items-center justify-start"><div className="w-[1px] h-[40%] bg-[#333]"></div></div>
               <div className="flex flex-col items-center justify-start"><div className="w-[1px] h-[40%] bg-[#333]"></div></div>
               <div className="flex flex-col items-center justify-end"><div className="w-[1.5px] h-[60%] bg-[#333] rounded-full"></div><span className="text-[5px] font-bold leading-none mt-[2px]">50</span></div>
               <div className="flex flex-col items-center justify-start"><div className="w-[1px] h-[40%] bg-[#333]"></div></div>
               <div className="flex flex-col items-center justify-start"><div className="w-[1px] h-[40%] bg-[#333]"></div></div>
               <div className="flex flex-col items-center justify-start"><div className="w-[1px] h-[40%] bg-[#333]"></div></div>
               <div className="flex flex-col items-center justify-end"><div className="w-[1.5px] h-[60%] bg-[#333] rounded-full"></div><span className="text-[5px] font-bold leading-none mt-[2px]">0</span></div>
             </div>
          </div>

          {/* Left Spool - Perfectly centered in the pill shape end */}
          <div 
            className="absolute flex items-center justify-center rounded-full"
            style={{ 
              top: '50%', left: '16%', transform: 'translate(-50%, -50%)',
              height: '75%', aspectRatio: '1/1'
            }}
          >
            {/* Magnetic Tape Wrapped on Spool - Shrunk to allow center hole to be visible! */}
            <div className="absolute w-[130%] h-[130%] rounded-full bg-[#1e130d] shadow-[inset_0_0_10px_rgba(0,0,0,1)] border-[2px] border-[#111]"></div>
            
            {/* Black background for the inner wheel spindle to hide the tape color */}
            <div className="absolute w-[70%] h-[70%] rounded-full bg-[#050505] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"></div>

            <SpoolSVG forwardRef={leftSpoolRef} />
          </div>

          {/* Right Spool - Perfectly centered in the pill shape end */}
          <div 
            className="absolute flex items-center justify-center rounded-full"
            style={{ 
              top: '50%', left: '84%', transform: 'translate(-50%, -50%)',
              height: '75%', aspectRatio: '1/1'
            }}
          >
            {/* Magnetic Tape Wrapped on Spool (Less tape on the right) */}
            <div className="absolute w-[110%] h-[110%] rounded-full bg-[#1e130d] shadow-[inset_0_0_10px_rgba(0,0,0,1)] border-[2px] border-[#111]"></div>
            
            {/* Black background for the inner wheel spindle to hide the tape color */}
            <div className="absolute w-[70%] h-[70%] rounded-full bg-[#050505] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"></div>

            <SpoolSVG forwardRef={rightSpoolRef} />
          </div>
        </div>

        {/* Bottom Trapeze - Moved INSIDE the Cassette Body so the SVG mask punches the 4 outer holes cleanly through it! */}
        <div 
          className="absolute bottom-0 left-[12%] right-[12%] h-[24%] bg-[#222] shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.25)] border-t-[1.5px] border-[#1a1a1a]"
          style={{ clipPath: 'polygon(6% 0%, 94% 0%, 100% 100%, 0% 100%)' }}
        >
          {/* The center hole is a blind indentation holding a screw. The other 4 outer holes are punched completely through by the SVG mask! */}
          <div className="absolute bottom-[35%] left-1/2 -translate-x-1/2 h-[22%] aspect-square rounded-full bg-[#111] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] flex items-center justify-center">
            <div className="w-[80%] h-[80%] rounded-full bg-[#1a1a1a] flex items-center justify-center rotate-45"><div className="w-full h-[15%] bg-[#050505] absolute"></div><div className="h-full w-[15%] bg-[#050505] absolute"></div></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

export default React.memo(CassetteTape);
