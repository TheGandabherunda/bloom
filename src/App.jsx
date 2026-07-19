import React, { useState, useEffect } from 'react';
import { OrbitProvider } from './context/OrbitContext';
import { PlaybackProvider } from './context/PlaybackContext';
import Layout from './components/Layout';
import RoomSetup from './components/RoomSetup';

function App() {
  const [setupComplete, setSetupComplete] = useState(false);
  const [config, setConfig] = useState({ roomId: '', displayName: '', isHost: false });

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    if (hash) {
      setConfig(prev => ({ ...prev, roomId: hash, isHost: false }));
    } else {
      setConfig(prev => ({ ...prev, isHost: true }));
    }
  }, []);

  const handleSetup = (newConfig) => {
    setConfig(newConfig);
    setSetupComplete(true);
    window.location.hash = newConfig.roomId;
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
