import React from 'react';

/**
 * ContinuousMarquee
 * 
 * Provides a mathematically and visually unbroken, infinite marquee moving leftward (right-to-left).
 * Eliminates all empty gaps, breaks, and sudden jumps by rendering two identical, GPU-composited
 * sets of items with matching spacing so the 100% -> 0% loop is completely seamless and invisible.
 */
const ContinuousMarquee = ({
  children,
  repeat = 4,
  speed = 'slow', // 'slow' | 'normal' | 'fast' | 'gentle'
  duration = null, // Custom duration in seconds or css string (e.g. 60 or '60s')
  separator = null,
  pauseOnHover = true,
  className = '',
  innerClassName = '',
}) => {
  const speedClass = 
    speed === 'gentle' ? 'animate-marquee-gentle' :
    speed === 'slow' ? 'animate-marquee-slow' :
    speed === 'fast' ? 'animate-marquee-fast' :
    'animate-marquee';

  const pauseClass = pauseOnHover ? 'hover:[animation-play-state:paused]' : '';
  const customDuration = duration 
    ? (typeof duration === 'number' ? `${duration}s` : duration) 
    : undefined;

  const renderSet = (prefix, isAriaHidden = false) => (
    <div 
      className="flex items-center shrink-0" 
      aria-hidden={isAriaHidden ? 'true' : undefined}
    >
      {Array.from({ length: repeat }).map((_, index) => (
        <div key={`${prefix}-${index}`} className={`flex items-center shrink-0 ${innerClassName}`}>
          {typeof children === 'function' ? children(index) : children}
          {separator && (
            <span className="shrink-0 select-none flex items-center justify-center">
              {separator}
            </span>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className={`w-full overflow-hidden mask-image-x relative flex min-w-0 ${className}`}>
      <div 
        className={`flex w-max ${speedClass} ${pauseClass} whitespace-nowrap items-center will-change-transform`}
        style={customDuration ? { animationDuration: customDuration } : undefined}
      >
        {renderSet('s1', false)}
        {renderSet('s2', true)}
      </div>
    </div>
  );
};

export default ContinuousMarquee;
