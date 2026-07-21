import React, { useState, useEffect } from 'react';
import { useOrbit } from '../context/OrbitContext';
import { getPeerColor } from '../utils/peerColors';

const PeersList = () => {
  const { peers, peerId, peerNames, peerRoles, stateDb, status } = useOrbit();
  const [loading, setLoading] = useState(true);

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

  const allPeers = [peerId, ...peers].filter(Boolean); // Include self
  const isOwner = peerRoles[peerId] === 'owner';

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
                  <span className="material-symbols-rounded text-[14px] text-white" style={{ fontVariationSettings: "'FILL' 1" }}>military_tech</span>
                </div>
              )}
              {p === peerId && <span className="text-[10px] text-white/30 uppercase tracking-widest">(You)</span>}
            </div>

            {isOwner && p !== peerId && peers.includes(p) && (
              <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="text-white/40 hover:text-white flex items-center justify-center p-1 rounded-full peer">
                  <span className="material-symbols-rounded text-[26px] leading-none">more_vert</span>
                </button>
                <div className="absolute right-0 top-full mt-1 w-32 bg-slate-900 border border-white/10 rounded-lg shadow-xl opacity-0 invisible peer-focus:opacity-100 peer-focus:visible focus-within:opacity-100 focus-within:visible transition-all z-50 overflow-hidden">
                  {role !== 'admin' ? (
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
                  )}
                  <button 
                    onClick={() => handleKick(p)}
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
  );
};

export default PeersList;
