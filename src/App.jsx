import React, { useState, useEffect } from 'react';
import { OrbitProvider } from './context/OrbitContext';
import { PlaybackProvider } from './context/PlaybackContext';
import Layout from './components/Layout';
import RoomSetup from './components/RoomSetup';

function App() {
  const [setupComplete, setSetupComplete] = useState(false);
  const [config, setConfig] = useState({ roomId: '', displayName: '', isHost: false, hostId: null });

  useEffect(() => {
    const hashPart = window.location.hash.substring(1);
    if (hashPart) {
      const [roomId, query] = hashPart.split('?');
      const params = new URLSearchParams(query || '');
      const hostId = params.get('host');
      
      if (hostId) {
        const isActuallyHost = sessionStorage.getItem(`bloom_host_${roomId}`) === 'true';
        if (isActuallyHost) {
          // Reclaim host status
          window.history.replaceState(null, '', `#${roomId}`);
          setConfig(prev => ({ ...prev, roomId, isHost: true }));
        } else {
          setConfig(prev => ({ ...prev, roomId, hostId, isHost: false }));
        }
      } else {
        // Invalid join attempt (missing host ID). Clear the hash and treat as a new host.
        window.history.replaceState(null, '', window.location.pathname);
        setConfig(prev => ({ ...prev, isHost: true }));
      }
    } else {
      setConfig(prev => ({ ...prev, isHost: true }));
    }
  }, []);

  const handleSetup = (newConfig) => {
    setConfig(newConfig);
    setSetupComplete(true);
    // Let Layout.jsx handle updating the hash once the peerId is known
  };

  return (
    <OrbitProvider>
      <PlaybackProvider>
        {!setupComplete ? (
          <RoomSetup config={config} onComplete={handleSetup} />
        ) : (
          <Layout config={config} />
        )}
      </PlaybackProvider>
    </OrbitProvider>
  );
}

export default App;
