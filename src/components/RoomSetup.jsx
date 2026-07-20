import React, { useState, useEffect } from 'react';
import { findBestMirror, getApiBase, getMirrorStatus } from '../services/monochromeApi';

const RoomSetup = ({ config, onComplete }) => {
  const [name, setName] = useState(localStorage.getItem('bloom_name') || '');
  const [room, setRoom] = useState(config.roomId || '');
  const [isOptimizing, setIsOptimizing] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customApi, setCustomApi] = useState(localStorage.getItem('bloom_api_base') || '');
  const [statuses, setStatuses] = useState({});

  useEffect(() => {
    const optimize = async () => {
      await findBestMirror(true);
      setStatuses(getMirrorStatus());
      setIsOptimizing(false);
    };
    optimize();
  }, []);

  const handleRefresh = async () => {
    setIsOptimizing(true);
    await findBestMirror(true);
    setStatuses(getMirrorStatus());
    setIsOptimizing(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || isOptimizing) return;

    let finalRoomId = room;
    if (config.isHost && !room) {
      finalRoomId = `bloom-${Math.random().toString(36).substring(2, 8)}`;
    } else if (config.isHost) {
      finalRoomId = `bloom-${room.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
    }

    if (customApi) {
      localStorage.setItem('bloom_api_base', customApi);
    } else {
      localStorage.removeItem('bloom_api_base');
    }

    localStorage.setItem('bloom_name', name);
    onComplete({ ...config, displayName: name, roomId: finalRoomId });
  };

  return (
    <div className="fixed inset-0 bg-black z-[200] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 bloom-enter-wrap">
        <img src="./assets/Bloom.svg" className="w-[150vw] sm:w-[90vw] max-w-[800px] opacity-[0.12] rotate-slow" alt="" />
      </div>

      <div className="bg-black border border-white/10 p-8 rounded-3xl shadow-2xl w-full max-w-md mx-4 transform transition-all pointer-events-auto relative z-10">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Bloom</h1>
          <p className="text-white/50 text-base">
            {config.isHost ? 'Create a New Room' : `Joining Room: ${config.roomId}`}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-white/60 mb-1.5 ml-2">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              className="w-full h-[48px] bg-white/[0.06] border border-white/10 rounded-full px-6 text-lg text-white focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/20 transition-colors shadow-inner"
              placeholder="e.g., Alice"
              required
            />
          </div>

          {config.isHost && (
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1.5 ml-2">Room Name (Optional)</label>
              <input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                autoComplete="off"
                className="w-full h-[48px] bg-white/[0.06] border border-white/10 rounded-full px-6 text-lg text-white focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/20 transition-colors shadow-inner"
                placeholder="e.g., movie-night"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isOptimizing}
            className="w-full bg-white hover:bg-white/90 disabled:bg-white/10 disabled:text-white/20 text-black font-bold rounded-full h-[48px] mt-4 transition-colors flex items-center justify-center text-lg relative overflow-hidden"
          >
            {isOptimizing ? (
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                <span className="text-sm font-bold uppercase tracking-widest">Optimizing Connection...</span>
              </div>
            ) : (
              config.isHost ? 'Create Room' : 'Join Room'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RoomSetup;
