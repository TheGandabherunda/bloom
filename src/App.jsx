/* eslint-disable no-unused-vars */  
import React, { useState, useEffect } from 'react';
import { OrbitProvider } from './context/OrbitContext';
import { PlaybackProvider } from './context/PlaybackContext';
import Layout from './components/Layout';
import Login from './components/Login';
import Lobby from './components/Lobby';
import NotificationStrip from './components/NotificationStrip';
import { getOrCreateKeys, getUserRelays } from './services/nostr';

function App() {
  const [config, setConfig] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('bloom_name'));
  const [userName, setUserName] = useState(() => localStorage.getItem('bloom_name') || '');
  const [hasInvite, setHasInvite] = useState(false);
  const [inviteRoomId, setInviteRoomId] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    const handleNameChange = (e) => {
      const newName = e.detail;
      if (newName) {
        setUserName(newName);
        setConfig((prev) => (prev ? { ...prev, displayName: newName } : prev));
      }
    };
    window.addEventListener('bloom:name-change', handleNameChange);
    return () => window.removeEventListener('bloom:name-change', handleNameChange);
  }, []);

  const fetchKeysAndSetConfig = async (baseConfig) => {
    let pk = null;
    let sk = null;
    const isExtension = !!localStorage.getItem('bloom_nip07');
    
    if (isExtension && window.nostr) {
      try {
        pk = await window.nostr.getPublicKey();
        sk = 'extension';
      } catch (e) {
        /* NIP-07 extension key fetch failed, fallback to local generated keys */
      }
    } 
    
    if (!pk) {
      const keys = getOrCreateKeys();
      pk = keys.pk;
      sk = keys.sk;
    }
    
    const userRelays = await getUserRelays();
    setConfig({ ...baseConfig, nostrPk: pk, nostrSk: sk, relays: userRelays });
  };

  useEffect(() => {
    // Parse URL hash for invites
    const hashPart = window.location.hash.substring(1);
    if (hashPart) {
      const [roomId, query] = hashPart.split('?');
      if (roomId) {
        setHasInvite(true);
        setInviteRoomId(roomId);
        
        // If already logged in and have an invite, go straight to the room
        if (isLoggedIn) {
          const params = new URLSearchParams(query || '');
          const hostId = params.get('host');
          
          fetchKeysAndSetConfig({
            roomId,
            isHost: sessionStorage.getItem(`bloom_host_${roomId}`) === 'true',
            displayName: localStorage.getItem('bloom_name'),
            hostId
          });
        }
      }
    }
  }, [isLoggedIn]);

  const handleLogin = (loginData) => {
    setIsLoggedIn(true);
    setUserName(localStorage.getItem('bloom_name') || '');
  };

  const handleJoinLobby = (roomId, hostId, roomName) => {
    fetchKeysAndSetConfig({
      roomId,
      roomName: roomName && !roomName.startsWith('bloom-') ? roomName : null,
      isHost: false,
      displayName: localStorage.getItem('bloom_name'),
      hostId
    });
  };

  const handleCreateRoom = (roomId, isPublic, roomName) => {
    sessionStorage.setItem(`bloom_host_${roomId}`, 'true');
    const finalName = roomName && !roomName.startsWith('bloom-') ? roomName : 'Bloom Party';
    fetchKeysAndSetConfig({
      roomId,
      roomName: finalName,
      isHost: true,
      isPublic,
      displayName: localStorage.getItem('bloom_name')
    });
  };

  return (
    <OrbitProvider>
      <PlaybackProvider>
        <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-[#050505] text-white">
          <NotificationStrip />
          <div className="flex-1 relative overflow-hidden">
            {!isLoggedIn ? (
              <Login onComplete={handleLogin} />
            ) : config ? (
              <>
                <div className="absolute inset-0 z-0 bg-[#050505]">
                  <Lobby 
                    onJoin={handleJoinLobby} 
                    onCreateRoom={handleCreateRoom} 
                    displayName={userName} 
                    onRestore={() => setIsMinimized(false)}
                    minimizedConfig={config}
                  />
                </div>
                <div 
                  className={`absolute inset-0 z-[100] transition-transform duration-[400ms] ${isMinimized ? 'translate-y-full' : 'translate-y-0'}`}
                  style={{ transitionTimingFunction: 'cubic-bezier(0.2, 1, 0.4, 1)' }}
                >
                  <Layout config={config} onLeave={() => {
                    sessionStorage.removeItem(`bloom_host_${config.roomId}`);
                    window.dispatchEvent(new CustomEvent('bloom:stop-playback'));
                    setConfig(null);
                    setIsMinimized(false);
                    window.location.hash = '';
                  }} onMinimize={() => setIsMinimized(true)} />
                </div>
              </>
            ) : (
              <div className="absolute inset-0 bg-[#050505]">
                <Lobby 
                  onJoin={handleJoinLobby} 
                  onCreateRoom={handleCreateRoom} 
                  displayName={userName} 
                />
              </div>
            )}
          </div>
        </div>
      </PlaybackProvider>
    </OrbitProvider>
  );
}

export default App;
