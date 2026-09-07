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

      // Respect the global notification mute setting
      if (localStorage.getItem('bloom_chat_sound') === 'false') return;

      // Ignore if the message was sent by the current user (unless it's a local system message without a peerId)
      if (peerId && msg.peerId === peerId && msg.type !== 'system') return;

      // Ignore standard "is now playing" spam to avoid annoyance when users change songs
      if (msg.type === 'system' && msg.text && (msg.text.toLowerCase().includes('playing') || msg.text.toLowerCase().includes('started'))) {
        return;
      }
      
      // Update with new message, using a unique key to force animation reset
      setNotification({ ...msg, keyId: Date.now() });
      
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setNotification(null);
      }, 4000);
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
  
  // If the message has a specific peerId, use their color. Otherwise (system/local messages), use the local user's color.
  const color = notification.peerId ? getPeerColor(notification.peerId) : getPeerColor(peerId);
  const textColor = getContrastColor(color);
  const sender = notification.sender || 'System';
  
  let displayText = '';
  if (isSystem) {
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
        className="flex items-center justify-between px-3 py-0.5 pointer-events-auto shadow-sm relative"
        style={{ backgroundColor: color }}
      >
        <p 
          className="text-[11px] font-bold truncate leading-tight" 
          style={{ color: textColor }}
        >
          {displayText}
        </p>
        
        <button 
          onClick={() => setNotification(null)}
          className="shrink-0 transition-opacity hover:opacity-70 ml-2 flex items-center"
          style={{ color: textColor }}
        >
          <span className="material-symbols-rounded text-[14px]">close</span>
        </button>

        {/* Timer Bar filling from left to right indicating auto-close */}
        <div 
          className="absolute bottom-0 left-0 h-[2px] bg-white/50"
          style={{ animation: 'fillRight 4s linear forwards' }}
        />
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
