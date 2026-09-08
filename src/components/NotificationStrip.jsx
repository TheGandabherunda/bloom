import React, { useState, useEffect } from 'react';
import { getPeerColor } from '../utils/peerColors';
import { useOrbit } from '../context/OrbitContext';

const getContrastColor = (colorStr) => {
  if (!colorStr) return '#ffffff';
  let r = 0, g = 0, b = 0;

  if (colorStr.startsWith('#')) {
    const hex = colorStr.replace('#', '');
    r = parseInt(hex.substr(0, 2), 16) || 0;
    g = parseInt(hex.substr(2, 2), 16) || 0;
    b = parseInt(hex.substr(4, 2), 16) || 0;
  } else if (colorStr.startsWith('hsl')) {
    const parts = colorStr.match(/\d+/g);
    if (parts && parts.length >= 3) {
      let h = parseInt(parts[0]);
      let s = parseInt(parts[1]) / 100;
      let l = parseInt(parts[2]) / 100;
      
      let c = (1 - Math.abs(2 * l - 1)) * s;
      let x = c * (1 - Math.abs((h / 60) % 2 - 1));
      let m = l - c / 2;
      let rt = 0, gt = 0, bt = 0;
      
      if (0 <= h && h < 60) { rt = c; gt = x; bt = 0; }
      else if (60 <= h && h < 120) { rt = x; gt = c; bt = 0; }
      else if (120 <= h && h < 180) { rt = 0; gt = c; bt = x; }
      else if (180 <= h && h < 240) { rt = 0; gt = x; bt = c; }
      else if (240 <= h && h < 300) { rt = x; gt = 0; bt = c; }
      else if (300 <= h && h < 360) { rt = c; gt = 0; bt = x; }
      
      r = Math.round((rt + m) * 255);
      g = Math.round((gt + m) * 255);
      b = Math.round((bt + m) * 255);
    }
  } else {
    return '#ffffff';
  }

  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
};

const NotificationStrip = () => {
  const [notification, setNotification] = useState(null);
  const { peerId, peerRoles } = useOrbit();
  const prevRoleRef = React.useRef(null);

  // Monitor role changes to alert the local user
  useEffect(() => {
    if (!peerId || !peerRoles) return;
    const currentRole = peerRoles[peerId];
    const prevRole = prevRoleRef.current;

    if (prevRole !== null && currentRole !== prevRole) {
      if (currentRole === 'admin') {
        window.dispatchEvent(new CustomEvent('bloom:notify', { 
          detail: { text: 'You have become admin', type: 'system', sender: 'System' } 
        }));
      } else if (prevRole === 'admin' && (currentRole === 'peer' || !currentRole)) {
        window.dispatchEvent(new CustomEvent('bloom:notify', { 
          detail: { text: 'Access revoked', type: 'system', sender: 'System' } 
        }));
      }
    }
    prevRoleRef.current = currentRole;
  }, [peerRoles, peerId]);

  useEffect(() => {
    let timeoutId;
    
    const handleLocal = (e) => {
      const msg = e.detail;
      if (!msg) return;

      const isProgress = msg.type === 'progress';
      const isSystem = msg.type === 'system';

      // Respect the global notification mute setting for chat messages (allow progress and system notifications)
      if (!isProgress && !isSystem && localStorage.getItem('bloom_chat_sound') === 'false') return;

      // Ignore if the message was sent by the current user (unless it's a local system/progress message without a peerId)
      if (peerId && msg.peerId === peerId && !isSystem && !isProgress) return;

      // Ignore standard "is now playing" spam to avoid annoyance when users change songs
      if (isSystem && msg.text && (msg.text.toLowerCase().includes('playing') || msg.text.toLowerCase().includes('started'))) {
        return;
      }
      
      // Update with new message, preserving keyId if updating an active progress notification with matching id
      setNotification(prev => {
        const keyId = (msg.id && prev?.id === msg.id) ? prev.keyId : Date.now();
        return { ...msg, keyId };
      });
      
      clearTimeout(timeoutId);
      if (isProgress && !msg.complete) {
        // Keep active progress open, with a safety timeout of 2 minutes
        timeoutId = setTimeout(() => {
          setNotification(null);
        }, 120000);
      } else {
        // Auto-close standard or completed notifications after 3.5 seconds
        timeoutId = setTimeout(() => {
          setNotification(null);
        }, 3500);
      }
    };

    window.addEventListener('bloom:chat-message', handleLocal);
    window.addEventListener('bloom:notify', handleLocal);
    return () => {
      window.removeEventListener('bloom:chat-message', handleLocal);
      window.removeEventListener('bloom:notify', handleLocal);
      clearTimeout(timeoutId);
    };
  }, [peerId, peerRoles]);

  if (!notification) return null;

  const isSystem = notification.type === 'system';
  const isProgress = notification.type === 'progress';
  
  // If the message has a specific peerId, use their color. Otherwise (system/local messages), use the local user's color.
  const color = notification.peerId ? getPeerColor(notification.peerId) : getPeerColor(peerId);
  const textColor = getContrastColor(color);
  const sender = notification.sender || 'System';
  
  let displayText = '';
  if (isSystem || isProgress) {
    displayText = notification.text;
  } else if (notification.type === 'gif') {
    displayText = `${sender} sent a GIF`;
  } else {
    displayText = `${sender}: ${notification.text}`;
  }

  return (
    <div className="w-full z-[100] shrink-0 pointer-events-none animate-in slide-in-from-top-2 duration-200">
      <div 
        key={notification.keyId}
        className="flex items-center justify-between px-3 py-0.5 pointer-events-auto shadow-sm relative overflow-hidden"
        style={{ backgroundColor: color }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isProgress && (
            notification.complete ? (
              <span className="material-symbols-rounded text-[14px] text-emerald-300 shrink-0">check_circle</span>
            ) : (
              <span className="material-symbols-rounded text-[14px] animate-spin shrink-0">progress_activity</span>
            )
          )}
          <p 
            className="text-[11px] font-bold truncate leading-tight" 
            style={{ color: textColor }}
          >
            {displayText}
          </p>
        </div>
        
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {isProgress && notification.progress !== undefined && !notification.complete && (
            <span 
              className="text-[10px] font-black px-1.5 py-0.2 rounded bg-black/25 tracking-tight"
              style={{ color: textColor }}
            >
              {Math.round(notification.progress)}%
            </span>
          )}
          <button 
            onClick={() => setNotification(null)}
            className="shrink-0 transition-opacity hover:opacity-70 flex items-center"
            style={{ color: textColor }}
            title="Close"
          >
            <span className="material-symbols-rounded text-[14px]">close</span>
          </button>
        </div>

        {/* Progress bar or timer countdown bar */}
        {notification.progress !== undefined ? (
          <div 
            className="absolute bottom-0 left-0 h-[2.5px] bg-white transition-all duration-300 ease-out shadow-[0_0_8px_rgba(255,255,255,0.8)]"
            style={{ width: `${Math.max(0, Math.min(100, notification.progress))}%` }}
          />
        ) : (
          <div 
            className="absolute bottom-0 left-0 h-[2px] bg-white/50"
            style={{ animation: 'fillRight 3.5s linear forwards' }}
          />
        )}
      </div>
      
      <style>{`
        @keyframes fillRight {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default NotificationStrip;
