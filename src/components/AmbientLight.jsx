import React, { useMemo } from 'react';

const AmbientLight = ({ maxWidth = "max-w-full", variant = "default" }) => {
  const particles = useMemo(() => {
    return Array.from({ length: 30 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: `${Math.random() * 4 + 2}px`,
      duration: `${Math.random() * 5 + 4}s`,
      waveDuration: `${Math.random() * 4 + 3}s`,
      delay: `${Math.random() * 5}s`,
      opacity: Math.random() * 0.5 + 0.3
    }));
  }, []);

  const themes = {
    default: {
      spread1: 'rgba(124, 58, 237, 0.4)',
      spread1Fade: 'rgba(76, 29, 149, 0.1)',
      spread2: 'rgba(236, 72, 153, 0.5)',
      spread2Fade: 'rgba(190, 24, 93, 0.15)',
      ledEdge: 'rgba(236,72,153,0.8)',
      ledCenter: 'rgba(255,255,255,0.9)',
      shadowOuter: 'rgba(236,72,153,0.6)',
      shadowInner: 'rgba(255,255,255,0.5)',
      particleGlow: 'rgba(236,72,153,0.6)'
    },
    error: {
      spread1: 'rgba(220, 38, 38, 0.4)',
      spread1Fade: 'rgba(153, 27, 27, 0.1)',
      spread2: 'rgba(239, 68, 68, 0.5)',
      spread2Fade: 'rgba(185, 28, 28, 0.15)',
      ledEdge: 'rgba(239,68,68,0.8)',
      ledCenter: 'rgba(255,255,255,0.9)',
      shadowOuter: 'rgba(239,68,68,0.6)',
      shadowInner: 'rgba(255,255,255,0.5)',
      particleGlow: 'rgba(239,68,68,0.6)'
    },
    success: {
      spread1: 'rgba(5, 150, 105, 0.4)',
      spread1Fade: 'rgba(6, 78, 59, 0.1)',
      spread2: 'rgba(16, 185, 129, 0.5)',
      spread2Fade: 'rgba(6, 95, 70, 0.15)',
      ledEdge: 'rgba(16,185,129,0.8)',
      ledCenter: 'rgba(255,255,255,0.9)',
      shadowOuter: 'rgba(16,185,129,0.6)',
      shadowInner: 'rgba(255,255,255,0.5)',
      particleGlow: 'rgba(16,185,129,0.6)'
    }
  };

  const t = themes[variant] || themes.default;
  const isDefault = variant === 'default';
  const isStatic = variant === 'error'; // optionally we could also disable pulse for error if requested, but let's just use the boolean.

  return (
    <div className={`absolute inset-0 pointer-events-none z-0 overflow-hidden flex items-end ${isDefault ? 'animate-color-flow' : ''}`}>
      {/* Deep ambient spread */}
      <div 
        className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-[200vw] lg:w-[150vw] h-[70vh] mix-blend-screen opacity-60 ${!isStatic ? 'animate-pulse' : ''}`}
        style={{
          background: `radial-gradient(ellipse at 50% 100%, ${t.spread1} 0%, ${t.spread1Fade} 50%, transparent 70%)`,
          animationDuration: '7s'
        }}
      />
      {/* Vibrant ambient spread */}
      <div 
        className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-[150vw] lg:w-[100vw] h-[50vh] mix-blend-screen opacity-70 ${!isStatic ? 'animate-pulse' : ''}`}
        style={{
          background: `radial-gradient(ellipse at 50% 100%, ${t.spread2} 0%, ${t.spread2Fade} 50%, transparent 70%)`,
          animationDuration: '4s'
        }}
      />
      {/* Harsh LED source line at extreme bottom */}
      <div 
        className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-full ${maxWidth} h-[2px] opacity-100 z-10`}
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${t.ledEdge} 20%, ${t.ledCenter} 50%, ${t.ledEdge} 80%, transparent 100%)`,
          boxShadow: `0 -4px 20px 2px ${t.shadowOuter}, 0 -2px 10px 0 ${t.shadowInner}`
        }}
      />
      
      {/* Floating Particles */}
      <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-full ${maxWidth} h-full pointer-events-none z-10 overflow-hidden`}>
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute bottom-0 animate-float-up"
            style={{
              left: p.left,
              animationDuration: p.duration,
              animationDelay: p.delay,
            }}
          >
            <div
              className="rounded-full bg-white mix-blend-screen animate-wave"
              style={{
                width: p.size,
                height: p.size,
                opacity: p.opacity,
                animationDuration: p.waveDuration,
                boxShadow: `0 0 10px 2px ${t.particleGlow}`
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default AmbientLight;
