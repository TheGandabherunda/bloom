import React, { useState, useEffect } from 'react';
import { OrbitProvider } from './context/OrbitContext';
import { PlaybackProvider } from './context/PlaybackContext';
import Layout from './components/Layout';
import Login from './components/Login';
import Lobby from './components/Lobby';
import { getOrCreateKeys } from './services/nostr';

function App() {
  const [config, setConfig] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('bloom_name'));
  const [hasInvite, setHasInvite] = useState(false);
  const [inviteRoomId, setInviteRoomId] = useState(null);

  const fetchKeysAndSetConfig = async (baseConfig) => {
    console.log(`[App] fetchKeysAndSetConfig called for roomId=${baseConfig.roomId}`);
    let pk = null;
    let sk = null;
    const isExtension = !!localStorage.getItem('bloom_nip07');
    
    if (isExtension && window.nostr) {
      try {
        console.log(`[App] Extension detected, fetching pubkey...`);
        pk = await window.nostr.getPublicKey();
        sk = 'extension';
        console.log(`[App] Successfully fetched pubkey from extension: ${pk}`);
      } catch(e) { console.error('[App] Failed to fetch pubkey from extension:', e); }
    } 
    
    if (!pk) {
      console.log(`[App] No extension pubkey found, falling back to local keys...`);
      const keys = getOrCreateKeys();
      pk = keys.pk;
      sk = keys.sk;
      console.log(`[App] Successfully loaded local keys. pubkey=${pk}`);
    }
    
    console.log(`[App] Setting config with nostrPk=${pk} and hasNostrSk=${!!sk}`);
    setConfig({ ...baseConfig, nostrPk: pk, nostrSk: sk });
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
    if (hasInvite && inviteRoomId) {
      setConfig({
        roomId: inviteRoomId,
        isHost: false,
        displayName: loginData.displayName,
        nostrPk: loginData.nostrPk,
        nostrSk: loginData.nostrSk
      });
    }
  };

  const handleJoinLobby = (roomId, hostId) => {
    fetchKeysAndSetConfig({
      roomId,
      isHost: false,
      displayName: localStorage.getItem('bloom_name'),
      hostId
    });
  };

  const handleCreateRoom = (roomId, isPublic) => {
    sessionStorage.setItem(`bloom_host_${roomId}`, 'true');
    fetchKeysAndSetConfig({
      roomId,
      isHost: true,
      isPublic,
      displayName: localStorage.getItem('bloom_name')
    });
  };

  return (
    <OrbitProvider>
      <PlaybackProvider>
        {!isLoggedIn ? (
          <Login onComplete={handleLogin} />
        ) : config ? (
          <Layout config={config} onLeave={() => {
            sessionStorage.removeItem(`bloom_host_${config.roomId}`);
            setConfig(null);
            window.location.hash = '';
          }} />
        ) : (
          <Lobby 
            onJoin={handleJoinLobby} 
            onCreateRoom={handleCreateRoom} 
            displayName={localStorage.getItem('bloom_name')} 
          />
        )}
      </PlaybackProvider>
    </OrbitProvider>
  );
}

export default App;
