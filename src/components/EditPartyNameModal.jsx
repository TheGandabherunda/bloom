import React, { useState, useEffect } from 'react';
import { useOrbit } from '../context/OrbitContext';

const EditPartyNameModal = ({ isOpen, onClose, currentPartyName, onSave }) => {
  const [partyName, setPartyName] = useState(currentPartyName || '');
  const { stateDb, peerId, peerRoles, isHost } = useOrbit() || {};

  const isOwner = Boolean(isHost || (peerId && peerRoles?.[peerId] === 'owner'));
  const canEdit = Boolean(isOwner || (peerId && peerRoles?.[peerId] === 'admin'));

  useEffect(() => {
    setPartyName(currentPartyName || '');
  }, [currentPartyName, isOpen]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !canEdit) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    const cleanName = partyName.trim();
    if (!cleanName) return;

    // 1. Synchronize to P2P network if connected to a room
    if (stateDb) {
      try {
        await stateDb.put('roomName', cleanName);
      } catch (err) {
        console.warn('Failed to sync updated party name to room:', err);
      }
    }

    // 2. Dispatch global events so UI updates reactively everywhere
    window.dispatchEvent(new CustomEvent('orbit:state:update', { 
      detail: { key: 'roomName', value: cleanName }, 
      payload: { key: 'roomName', value: cleanName } 
    }));
    window.dispatchEvent(new CustomEvent('bloom:notify', { 
      detail: { text: `Party name updated to "${cleanName}"`, type: 'system', sender: 'System' } 
    }));

    if (onSave) onSave(cleanName);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100] flex flex-col justify-end md:justify-center items-center p-4 sm:p-6 pb-6 md:pb-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="w-full max-w-[420px] bg-[#0a0a0a] rounded-[32px] p-8 shadow-2xl relative"
        style={{ animation: 'slideUpModal 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        {/* Bottom Sheet Handle (Mobile only) */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/10 rounded-full md:hidden"></div>
        
        <button 
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors z-10"
        >
          <span className="material-symbols-rounded text-[20px]">close</span>
        </button>

        <div className="mt-2 mb-8 text-center px-4">
          <h3 
            className="text-4xl text-white font-serif" 
            style={{ fontFamily: '"Gloock", serif', letterSpacing: 'normal', fontWeight: 400 }}
          >
            Change Party Name
          </h3>
          <p className="text-white/40 text-sm mt-2">
            Update the party name for everyone in this room.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5 ml-2">Party Name</label>
            <input
              type="text"
              autoFocus
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              placeholder="e.g., chill vibes"
              autoComplete="off"
              maxLength={40}
              className="w-full h-[48px] bg-white/[0.06] rounded-full px-6 text-lg text-white focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors shadow-inner"
            />
          </div>
          
          <div className="mt-12 pt-4">
            <button 
              type="submit" 
              disabled={!partyName.trim()}
              className="w-full bg-white hover:bg-white/90 disabled:opacity-50 text-black font-bold rounded-full h-[48px] transition-colors flex items-center justify-center text-lg shadow-xl"
            >
              Save Party Name
            </button>
          </div>
        </form>
      </div>
      <style>{`
        @keyframes slideUpModal {
          0% { opacity: 0; transform: translateY(40px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};

export default EditPartyNameModal;
