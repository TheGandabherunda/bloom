import React, { useState, useEffect } from 'react';
import { OrbitProvider } from './context/OrbitContext';
import { PlaybackProvider } from './context/PlaybackContext';
import Layout from './components/Layout';
import Login from './components/Login';
import Lobby from './components/Lobby';

function App() {
  const [config, setConfig] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('bloom_name'));
  const [hasInvite, setHasInvite] = useState(false);
  const [inviteRoomId, setInviteRoomId] = useState(null);

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
          
          setConfig({
            roomId,
            isHost: sessionStorage.getItem(`bloom_host_${roomId}`) === 'true',
            displayName: localStorage.getItem('bloom_name'),
            nostrPk: localStorage.getItem('bloom_nip07') ? null : null, // The real keys are handled inside Layout/Context now or passed via Login
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
    setConfig({
      roomId,
      isHost: false,
      displayName: localStorage.getItem('bloom_name'),
      hostId
    });
  };

  const handleCreateRoom = (roomId, isPublic) => {
    sessionStorage.setItem(`bloom_host_${roomId}`, 'true');
    setConfig({
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
