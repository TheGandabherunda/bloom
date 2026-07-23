import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useOrbit } from '../context/OrbitContext';
import { getPeerColor } from '../utils/peerColors';

const PeersList = () => {
  const { peers, peerId, peerNames, peerRoles, stateDb, status } = useOrbit();
  const [loading, setLoading] = useState(true);
  const [kickConfirmPeer, setKickConfirmPeer] = useState(null);

  useEffect(() => {
    // Shimmer loading wait for connections
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const handleMakeAdmin = async (targetId) => {
    if (!stateDb) return;
    await stateDb.put(`peer_role_${targetId}`, 'admin');
  };

  const handleRemoveAdmin = async (targetId) => {
    if (!stateDb) return;
    await stateDb.put(`peer_role_${targetId}`, 'peer');
  };

  const handleKick = async (targetId) => {
    if (!stateDb) return;
    await stateDb.put('banned', targetId);
  };

  const allPeers = [...new Set([peerId, ...peers])].filter(Boolean); // Include self
  const isOwner = peerRoles[peerId] === 'owner';
  const canManage = isOwner || peerRoles[peerId] === 'admin';

  if (loading || status === 'initializing') {
    return (
      <div className="flex-1 p-4 space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-6 bg-white/5 rounded-md w-full animate-pulse"></div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
      {allPeers.map(p => {
        const name = peerNames[p] || (p === peerId ? localStorage.getItem('bloom_name') : 'Unknown');
        const role = peerRoles[p] || 'peer';
        const color = getPeerColor(p);
        
        return (
          <div key={p} className="flex items-center justify-between group h-8">
            <div className="flex items-center gap-2">
              <span className="font-medium" style={{ color }}>{name}</span>
              {role === 'owner' && (
                <div className="bg-purple-600 px-2 py-0.5 rounded-full flex items-center justify-center" title="Owner">
                  <span className="material-symbols-rounded text-[14px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>crown</span>
                </div>
              )}
              {role === 'admin' && (
                <div className="bg-yellow-500 px-2 py-0.5 rounded-full flex items-center justify-center" title="Admin">
                  <span className="material-symbols-rounded text-[14px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>award_star</span>
                </div>
              )}
              {p === peerId && <span className="text-[10px] text-white/30 uppercase tracking-widest">(You)</span>}
            </div>

            {canManage && p !== peerId && peers.includes(p) && (
              <div className="relative opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <button className="text-white/40 hover:text-white flex items-center justify-center p-1 rounded-full peer">
                  <span className="material-symbols-rounded text-[26px] leading-none">more_vert</span>
                </button>
                <div className="absolute right-0 top-full mt-1 w-32 bg-slate-900 border border-white/10 rounded-lg shadow-xl opacity-0 invisible peer-focus:opacity-100 peer-focus:visible focus-within:opacity-100 focus-within:visible transition-all z-50 overflow-hidden">
                  {isOwner && (
                    role !== 'admin' ? (
                      <button 
                        onClick={() => handleMakeAdmin(p)}
                        className="w-full text-left px-3 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        Make Admin
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleRemoveAdmin(p)}
                        className="w-full text-left px-3 py-2 text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        Remove Admin
                      </button>
                    )
                  )}
                  <button 
                    onClick={() => setKickConfirmPeer(p)}
                    className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                  >
                    Kick
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
      
      {/* Kick Confirmation Modal via Portal */}
      {kickConfirmPeer && createPortal(
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[200] flex flex-col justify-end md:justify-center items-center p-4 sm:p-6 pb-6 md:pb-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setKickConfirmPeer(null);
          }}
        >
          <div 
            className="w-full max-w-[420px] bg-[#0a0a0a] rounded-[32px] p-8 shadow-2xl relative"
            style={{ animation: 'slideUpModal 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
          >
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/10 rounded-full md:hidden"></div>
            
            <button 
              type="button"
              onClick={() => setKickConfirmPeer(null)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors z-10"
            >
              <span className="material-symbols-rounded text-[20px]">close</span>
            </button>

            <div className="mt-2 mb-8 text-center px-4">
              <h3 className="text-2xl font-bold text-white tracking-tight truncate">Kick {peerNames[kickConfirmPeer] || 'Unknown'}?</h3>
              <p className="text-white/40 text-sm mt-3 leading-relaxed">
                Are you sure you want to kick <strong className="text-white/80">{peerNames[kickConfirmPeer] || 'Unknown'}</strong>? They will be banned from this party.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setKickConfirmPeer(null)}
                className="flex items-center justify-center bg-white/[0.03] hover:bg-white/[0.06] rounded-full text-white font-bold transition-colors h-[48px]"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  handleKick(kickConfirmPeer);
                  setKickConfirmPeer(null);
                }}
                className="flex items-center justify-center bg-red-500 hover:bg-red-600 text-white font-bold rounded-full transition-colors h-[48px]"
              >
                Kick
              </button>
            </div>
          </div>
          <style>{`
            @keyframes slideUpModal {
              0% { opacity: 0; transform: translateY(40px) scale(0.96); }
              100% { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </div>,
        document.body
      )}
    </>
  );
};

export default PeersList;
