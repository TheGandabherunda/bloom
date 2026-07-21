import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { joinRoom, selfId } from 'trystero/nostr';

const OrbitContext = createContext(null);

class MiniEmitter {
  constructor() { this.listeners = {}; }
  on(event, cb) { 
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }
  off(event, cb) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(l => l !== cb);
  }
  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => cb(data));
  }
}

export const OrbitProvider = ({ children }) => {
  const [status, setStatus] = useState('disconnected');
  const [peerId, setPeerId] = useState(null);
  const [peers, setPeers] = useState([]);
  const [peerNames, setPeerNames] = useState({});
  const [peerRoles, setPeerRoles] = useState({});
  
  const peerRolesRef = useRef({});
  const peerNamesRef = useRef({});

  useEffect(() => {
    peerRolesRef.current = peerRoles;
  }, [peerRoles]);

  useEffect(() => {
    peerNamesRef.current = peerNames;
  }, [peerNames]);

  const statusRef = useRef('disconnected');
  const roomRef = useRef(null);
  const silentAudioRef = useRef(null);

  useEffect(() => {
    // Generate a minimal valid silent WAV file to keep the browser's media session active
    // This prevents Chrome/Safari from completely freezing the tab and blocking P2P play() commands in the background
    const silentWav = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    const audio = new Audio(silentWav);
    audio.loop = true;
    // CRITICAL: Do NOT set volume = 0 or muted = true. 
    // Mobile browsers will ignore muted audio when deciding whether to kill a background tab!
    // The WAV file itself is mathematically silent, so the user hears nothing, but the browser sees volume=1.
    silentAudioRef.current = audio;
    
    // Screen Wake Lock API to prevent the device from sleeping if the user walks away
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        // Ignore wake lock errors
      }
    };
    requestWakeLock();
    
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    
    return () => {
      audio.pause();
      audio.src = '';
      silentAudioRef.current = null;
      if (wakeLock) wakeLock.release().catch(() => {});
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
  
  const [stateDbReady, setStateDbReady] = useState(null);
  const [chatDbReady, setChatDbReady] = useState(null);

  const setStatusWrapped = (newStatus) => {
    statusRef.current = newStatus;
    setStatus(newStatus);
  };

  const stopP2P = useCallback(async () => {
    if (roomRef.current) {
      roomRef.current.leave();
      roomRef.current = null;
    }
    setStateDbReady(null);
    setChatDbReady(null);
    setPeers([]);
    setStatusWrapped('disconnected');
  }, []);

  const initP2P = useCallback(async (roomId, displayName, isHost = false, hostId = null) => {
    if (statusRef.current === 'connected' || statusRef.current === 'initializing') return;
    
    try {
      setStatusWrapped('initializing');
      console.log('Starting Trystero initialization...');

      // Start the background silent loop to keep the tab alive
      if (silentAudioRef.current) {
        silentAudioRef.current.play().catch(e => console.warn('Silent loop autoplay blocked:', e));
      }

      const config = {
        appId: 'bloom-p2p',
        rtcConfig: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
            { urls: 'stun:stun.cloudflare.com:3478' }
          ]
        }
      };
      const room = joinRoom(config, roomId);
      roomRef.current = room;
      setPeerId(selfId);

      const stateProxy = {
        events: new MiniEmitter(),
        store: {},
        put: async (key, value) => {
          stateProxy.store[key] = value;
          stateProxy.sendPut({ key, value });
          stateProxy.events.emit('update', { payload: { key, value } });
          
          if (key.startsWith('peer_name_')) {
            setPeerNames(prev => ({...prev, [key.replace('peer_name_', '')]: value}));
          } else if (key.startsWith('peer_role_')) {
            setPeerRoles(prev => ({...prev, [key.replace('peer_role_', '')]: value}));
          } else if (key === 'banned') {
            room.leave();
          }
        },
        get: async (key) => stateProxy.store[key],
        all: async () => Object.entries(stateProxy.store).map(([key, value]) => ({ key, value }))
      };

      const chatProxy = {
        events: new MiniEmitter(),
        arr: [],
        add: async (msg) => {
          chatProxy.arr.push(msg);
          chatProxy.sendAdd({ msg });
          chatProxy.events.emit('update', { payload: { value: msg } });
        },
        all: async () => chatProxy.arr.map(value => ({ payload: { value } }))
      };

      // Trystero Actions
      const statePutAction = room.makeAction('statePut');
      const chatAddAction = room.makeAction('chatAdd');
      const reqSyncAction = room.makeAction('reqSync');
      const fullSyncAction = room.makeAction('fullSync');

      stateProxy.sendPut = statePutAction.send;
      chatProxy.sendAdd = chatAddAction.send;

      statePutAction.onMessage = (data, { peerId: pId }) => {
        const senderRole = peerRolesRef.current[pId] || 'peer';
        
        // Security check for role changes and bans
        if (data.key.startsWith('peer_role_') || data.key === 'banned') {
          // Bypass check if the sender is the actual host claiming their own owner role
          const isHostSelfClaim = pId === hostId && data.key === `peer_role_${hostId}` && data.value === 'owner';
          
          if (senderRole !== 'owner' && !isHostSelfClaim) {
            console.warn(`[P2P] Unauthorized role/ban change attempt by ${pId}`);
            return;
          }
        }

        console.log(`[P2P] Received state update from ${pId}:`, data.key);
        stateProxy.store[data.key] = data.value;
        stateProxy.events.emit('update', { payload: { key: data.key, value: data.value } });
        
        if (data.key.startsWith('peer_name_')) {
          const extractedId = data.key.replace('peer_name_', '');
          const pName = data.value;
          setPeerNames(prev => {
            if (isHost && !prev[extractedId]) {
              chatProxy.add({
                text: `${pName} joined the room`,
                type: 'system',
                sender: 'System',
                timestamp: Date.now(),
              });
            }
            return {...prev, [extractedId]: pName};
          });
        } else if (data.key.startsWith('peer_role_')) {
          setPeerRoles(prev => {
            const targetId = data.key.replace('peer_role_', '');
            const newRole = data.value;
            if (prev[targetId] !== newRole && newRole === 'admin') {
              const targetName = peerNamesRef.current[targetId] || 'Someone';
              chatProxy.events.emit('update', {
                payload: {
                  value: { id: Math.random().toString(36).substring(2,9), text: `${targetName} got promoted to admin.`, sender: 'System', timestamp: Date.now() }
                }
              });
            }
            return {...prev, [targetId]: newRole};
          });
        } else if (data.key === 'banned') {
          const targetName = peerNamesRef.current[data.value] || 'Someone';
          const kickerName = peerNamesRef.current[pId] || 'An admin';
          chatProxy.events.emit('update', {
            payload: {
              value: { id: Math.random().toString(36).substring(2,9), text: `${targetName} got kicked out by ${kickerName}.`, sender: 'System', timestamp: Date.now() }
            }
          });
          
          if (data.value === selfId) {
            window.location.reload();
          }
        }
      };

      chatAddAction.onMessage = (data, { peerId: pId }) => {
        console.log(`[P2P] Received chat message from ${pId}`);
        chatProxy.arr.push(data.msg);
        chatProxy.events.emit('update', { payload: { value: data.msg } });
      };

      // Peer Lifecycle
      room.onPeerJoin = (pId) => {
        console.log(`[P2P] Peer joined room: ${pId}`);
        setPeers(prev => [...new Set([...prev, pId])]);
        
        // Announce our identity to the new peer so they know who we are
        statePutAction.send({ key: `peer_name_${selfId}`, value: displayName }, { target: pId });
        if (isHost) {
          statePutAction.send({ key: `peer_role_${selfId}`, value: 'owner' }, { target: pId });
          
          // Proactively send full sync in case the peer is reconnecting and dropped their reqSync
          const storeCopy = { ...stateProxy.store };
          let liveTime = 0;
          if (window.__bloomPlayer) liveTime = window.__bloomPlayer.getCurrentTime() || 0;
          if (storeCopy['currentTrack']) storeCopy['currentTrack'] = { ...storeCopy['currentTrack'], liveTime };
          
          console.log(`[P2P] Proactively sending full sync to new/reconnecting peer ${pId}`);
          fullSyncAction.send({
            state: storeCopy,
            chat: chatProxy.arr,
            names: storeCopy,
          }, { target: pId });
        }

        // Request state sync ONLY from the host
        if (!isHost && pId === hostId) {
          console.log(`[P2P] Requesting full state sync from host ${pId}...`);
          reqSyncAction.send({}, { target: pId });
        }
      };

      room.onPeerLeave = (pId) => {
        console.log(`[P2P] Peer left room: ${pId}`);
        setPeers(prev => prev.filter(p => p !== pId));
        
        const targetName = peerNamesRef.current[pId];
        if (targetName) {
          chatProxy.events.emit('update', {
            payload: {
              value: { id: Math.random().toString(36).substring(2,9), text: `${targetName} left the room.`, sender: 'System', timestamp: Date.now() }
            }
          });
        }

        // If the owner leaves, kick everyone out to prevent the room from playing songs infinitely as a zombie room
        if (peerRolesRef.current[pId] === 'owner' && !isHost) {
          console.warn('[P2P] Owner has left the room. Redirecting to home...');
          window.location.href = '/';
        }
      };

      // State Synchronization Logic
      reqSyncAction.onMessage = (_, { peerId: pId }) => {
        console.log(`[P2P] Received sync request from ${pId}. Sending full state...`);
        
        let liveTime = 0;
        if (window.__bloomPlayer) {
           liveTime = window.__bloomPlayer.getCurrentTime() || 0;
        }
        
        const storeCopy = { ...stateProxy.store };
        if (storeCopy['currentTrack']) {
          storeCopy['currentTrack'] = {
            ...storeCopy['currentTrack'],
            liveTime
          };
        }

        fullSyncAction.send({
          state: storeCopy,
          chat: chatProxy.arr,
          names: storeCopy,
        }, { target: pId });
      };

      fullSyncAction.onMessage = (data, { peerId: pId }) => {
        console.log(`[P2P] Received full sync from ${pId}`, data);
        
        stateProxy.store = { ...stateProxy.store, ...data.state };
        chatProxy.arr = data.chat;
        
        const initialNames = { [selfId]: displayName };
        const initialRoles = isHost ? { [selfId]: 'owner' } : {};
        
        Object.entries(stateProxy.store).forEach(([key, value]) => {
          if (key.startsWith('peer_name_')) initialNames[key.replace('peer_name_', '')] = value;
          if (key.startsWith('peer_role_')) initialRoles[key.replace('peer_role_', '')] = value;
        });
        
        setPeerNames(prev => ({ ...prev, ...initialNames }));
        setPeerRoles(prev => ({ ...prev, ...initialRoles }));

        if (!isHost) {
          setStatusWrapped('connected');
        }

        // Emit updates so mounted components (PlaybackContext, Chat) catch the new state
        data.chat.forEach(msg => {
          chatProxy.events.emit('update', { payload: { value: msg } });
        });
        
        Object.entries(data.state).forEach(([key, value]) => {
          stateProxy.events.emit('update', { payload: { key, value } });
        });
      };

      // Initial Local State Setup
      setPeerNames(prev => ({ ...prev, [selfId]: displayName }));
      if (isHost) setPeerRoles(prev => ({ ...prev, [selfId]: 'owner' }));

      await stateProxy.put(`peer_name_${selfId}`, displayName);
      if (isHost) {
        await stateProxy.put(`peer_role_${selfId}`, 'owner');
      }

      setStateDbReady(stateProxy);
      setChatDbReady(chatProxy);
      
      if (isHost) {
        setStatusWrapped('connected');
      } else {
        setStatusWrapped('syncing');
        if (!isHost) {
          // Actively ping the network to force the device's Wi-Fi/Cellular radio into a high-power state.
          // This prevents the OS from delaying WebRTC UDP packets while the app is loading.
          const pingInterval = setInterval(() => {
            if (statusRef.current === 'syncing' || statusRef.current === 'initializing') {
              fetch('/?ping=' + Date.now()).catch(() => {});
            } else {
              clearInterval(pingInterval);
            }
          }, 2000);

          // Fallback timeout: if we don't receive sync after 60s, fail.
          setTimeout(() => {
            clearInterval(pingInterval);
            if (statusRef.current === 'syncing' || statusRef.current === 'initializing') {
              console.error('[P2P] Sync timeout');
              setStatusWrapped('failed');
            }
          }, 60000);
        }
      }

    } catch (err) {
      console.error('P2P Init Error:', err);
      setStatusWrapped('failed');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (roomRef.current) roomRef.current.leave();
    };
  }, []);

  const contextValue = React.useMemo(() => ({
    helia: null, orbitdb: null, stateDb: stateDbReady, chatDb: chatDbReady, 
    status, peerId, peers, peerNames, peerRoles, initP2P, stopP2P
  }), [stateDbReady, chatDbReady, status, peerId, peers, peerNames, peerRoles, initP2P, stopP2P]);

  return (
    <OrbitContext.Provider value={contextValue}>
      {children}
    </OrbitContext.Provider>
  );
};

export const useOrbit = () => useContext(OrbitContext);
