import React, { useState, useEffect } from 'react';
import { pool, DEFAULT_RELAYS } from '../services/nostr';


const Lobby = ({ onJoin, onCreateRoom, displayName }) => {
  const [rooms, setRooms] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [isPublic, setIsPublic] = useState(true);

  useEffect(() => {
    // Subscribe to Beacon events (kind 31337)
    const sub = pool.subscribeMany(
      DEFAULT_RELAYS,
      [{ kinds: [31337], limit: 50 }],
      {
        onevent(event) {
          try {
            const data = JSON.parse(event.content);
            const rTag = event.tags.find(t => t[0] === 'r');
            if (!rTag || !data.roomId) return;
            
            setRooms(prev => {
              const existing = prev[data.roomId];
              // Only update if newer
              if (existing && existing.timestamp > event.created_at) return prev;
              
              return {
                ...prev,
                [data.roomId]: {
                  ...data,
                  timestamp: event.created_at,
                  pubkey: event.pubkey
                }
              };
            });
          } catch (e) { console.error(e); }
        }
      }
    );

    return () => sub.close();
  }, []);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    let finalRoomId = `bloom-${Math.random().toString(36).substring(2, 8)}`;
    if (newRoomName) {
      finalRoomId = `bloom-${newRoomName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
    }
    onCreateRoom(finalRoomId, isPublic);
  };

  const filteredRooms = Object.values(rooms)
    .filter(r => 
      r.roomId.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (r.roomName && r.roomName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (r.hostName && r.hostName.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => b.timestamp - a.timestamp); // Newest beacons first

  return (
    <div className="h-[100dvh] w-screen overflow-hidden flex flex-col antialiased bg-black relative">
      
      <header className="bg-black/40 backdrop-blur-xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between border-b border-white/10 shrink-0 z-40 relative gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto justify-between">
          <h2 className="font-bold text-white tracking-wide text-2xl flex items-center gap-2">
            Bloom
            {displayName && (
              <>
                <span className="text-white/30 text-lg">•</span>
                <span className="text-lg font-medium text-white/70">{displayName}</span>
              </>
            )}
          </h2>
          <button 
            onClick={() => setShowCreate(true)}
            className="md:hidden bg-white text-black px-4 py-2 rounded-full font-bold text-sm"
          >
            Host
          </button>
        </div>

        <div className="flex-1 w-full max-w-xl mx-0 md:mx-8 relative group">
          <span className="material-symbols-rounded absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-white transition-colors">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search active parties..."
            className="w-full h-11 bg-white/[0.06] border border-white/10 rounded-full pl-12 pr-4 text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-all shadow-inner"
          />
        </div>

        <button 
          onClick={() => setShowCreate(true)}
          className="hidden md:flex bg-white hover:bg-white/90 text-black px-6 py-2.5 rounded-full font-bold transition-colors items-center gap-2"
        >
          <span className="material-symbols-rounded text-[20px]">music_cast</span>
          Host Party
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 z-10 flex flex-col">
        <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col relative">
          
          {filteredRooms.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-white/30 pb-20">
              <span className="material-symbols-rounded text-6xl mb-4 opacity-50">music_off</span>
              <p className="text-lg">No active public parties found.</p>
              <button 
                onClick={() => setShowCreate(true)}
                className="mt-6 bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full font-bold transition-colors items-center gap-2 flex"
              >
                <span className="material-symbols-rounded text-[20px]">music_cast</span>
                Host Party
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-20">
              {filteredRooms.map(room => (
                <div 
                  key={room.roomId} 
                  onClick={() => onJoin(room.roomId, room.pubkey)}
                  className="bg-white/[0.03] border border-white/5 hover:border-white/20 hover:bg-white/[0.06] p-4 rounded-2xl cursor-pointer transition-all flex flex-col gap-3 group"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-white font-bold text-lg">{room.roomName || room.roomId}</h4>
                      <p className="text-white/50 text-sm flex items-center gap-1">
                        <span className="material-symbols-rounded text-[14px]">person</span>
                        Host: {room.hostName || 'Unknown'}
                      </p>
                    </div>
                    {room.activePeers && (
                      <span className="bg-white/10 text-white/70 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                        <span className="material-symbols-rounded text-[12px]">headset</span>
                        {room.activePeers}
                      </span>
                    )}
                  </div>
                  
                  {room.currentTrack ? (
                    <div className="mt-2 bg-black/40 rounded-xl p-3 flex items-center gap-3">
                      {room.currentTrack.thumbnail ? (
                        <img src={room.currentTrack.thumbnail} className="w-12 h-12 rounded-md object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-md bg-white/10 flex items-center justify-center">
                           <span className="material-symbols-rounded text-white/40">music_note</span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-bold truncate group-hover:text-blue-400 transition-colors">{room.currentTrack.title}</p>
                        <p className="text-white/50 text-xs truncate">{room.currentTrack.author}</p>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="material-symbols-rounded text-white text-sm">play_arrow</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-white/30 text-sm italic">Nothing playing right now...</div>
                  )}
                </div>
              ))}
            </div>
          )}
          
        </div>
      </div>

      <div className="fixed bottom-4 left-4 z-40">
        <p className="text-white/30 text-xs font-medium">Total live parties: {filteredRooms.length}</p>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-black/90 lg:bg-black lg:backdrop-blur-none backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl w-full max-w-md transform transition-all relative">
            <h3 className="text-2xl font-bold text-white mb-6 text-center">Host a Party</h3>
            <form onSubmit={handleCreateSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5 ml-2">Party Name (Optional)</label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g., chill-vibes"
                  autoComplete="off"
                  className="w-full h-[48px] bg-white/[0.06] border border-white/10 rounded-full px-6 text-lg text-white focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/20 transition-colors shadow-inner"
                />
              </div>
              
              <label className="flex items-center gap-4 p-4 bg-white/[0.04] border border-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-colors mt-2">
                <input 
                  type="checkbox" 
                  checked={isPublic} 
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="w-5 h-5 rounded border-white/20 bg-black text-[var(--color-primary)] focus:ring-0 focus:ring-offset-0"
                />
                <div>
                  <div className="text-white font-medium">Public Party</div>
                  <div className="text-white/40 text-xs mt-0.5">Visible in the global lobby</div>
                </div>
              </label>
              
              <div className="flex gap-3 mt-8">
                <button 
                  type="button" 
                  onClick={() => setShowCreate(false)} 
                  className="flex-1 py-3 text-white/60 hover:text-white font-bold h-[48px] rounded-full transition-colors flex items-center justify-center"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-white hover:bg-white/90 text-black font-bold rounded-full h-[48px] transition-colors flex items-center justify-center text-lg shadow-lg"
                >
                  Host
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Lobby;
