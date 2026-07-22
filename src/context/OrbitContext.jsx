import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { pool, DEFAULT_RELAYS, signEvent } from '../services/nostr';

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
  const [peerId, setPeerId] = useState(null); // This is the nostr pubkey
  const [peers, setPeers] = useState([]);
  const [peerNames, setPeerNames] = useState({});
  const [peerRoles, setPeerRoles] = useState({});
  
  const peerRolesRef = useRef({});
  const peerNamesRef = useRef({});
  const statusRef = useRef('disconnected');
  const roomRef = useRef(null);
  
  const skRef = useRef(null);
  const hostIdRef = useRef(null);
  const isHostRef = useRef(false);
  const isPublicRef = useRef(false);

  useEffect(() => { peerRolesRef.current = peerRoles; }, [peerRoles]);
  useEffect(() => { peerNamesRef.current = peerNames; }, [peerNames]);

  const [stateDbReady, setStateDbReady] = useState(null);
  const [chatDbReady, setChatDbReady] = useState(null);

  const setStatusWrapped = (newStatus) => {
    statusRef.current = newStatus;
    setStatus(newStatus);
  };

  const publishSigned = async (eventTemplate) => {
    try {
      console.log(`[Nostr] Attempting to sign and publish event kind: ${eventTemplate.kind}`, eventTemplate);
      let signedEvent;
      if (skRef.current === 'extension') {
        signedEvent = await window.nostr.signEvent(eventTemplate);
      } else {
        if (!skRef.current) {
          console.error('[Nostr] FATAL: skRef.current is null or undefined! Cannot sign event.');
        }
        signedEvent = signEvent(eventTemplate, skRef.current);
      }
      console.log(`[Nostr] Successfully signed event, publishing to pool...`, signedEvent);
      try {
        const pubPromise = pool.publish(DEFAULT_RELAYS, signedEvent);
        if (pubPromise instanceof Promise) pubPromise.catch(e => console.log('[Nostr] Publish notice:', e.message));
        else if (Array.isArray(pubPromise)) pubPromise.forEach(p => p instanceof Promise && p.catch(e => {}));
      } catch (err) {
        console.warn('[Nostr] pool.publish error:', err);
      }
    } catch (e) {
      console.error("[Nostr] Failed to publish event", e);
    }
  };

  const stopP2P = useCallback(async () => {
    roomRef.current = null;
    setStateDbReady(null);
    setChatDbReady(null);
    setPeers([]);
    setStatusWrapped('disconnected');
  }, []);

  const initP2P = useCallback(async (roomId, displayName, isHost = false, hostId = null, nostrPk = null, nostrSk = null, isPublic = false) => {
    if (statusRef.current === 'connected' || statusRef.current === 'initializing') return;
    
    try {
      setStatusWrapped('initializing');
      console.log(`[Nostr] initP2P called with: roomId=${roomId}, isHost=${isHost}, hostId=${hostId}, nostrPk=${nostrPk}, hasNostrSk=${!!nostrSk}, isPublic=${isPublic}`);
      console.log('Connecting to Nostr Relays...');

      roomRef.current = roomId;
      setPeerId(nostrPk);
      skRef.current = nostrSk;
      hostIdRef.current = hostId || nostrPk;
      isHostRef.current = isHost;
      isPublicRef.current = isPublic;

      const stateProxy = {
        events: new MiniEmitter(),
        store: {},
        put: async (key, value) => {
          if (isHostRef.current) {
            // Host updates local state and publishes
            stateProxy.store[key] = value;
            
            // Check for names/roles directly
            if (key.startsWith('peer_name_')) {
              setPeerNames(prev => ({...prev, [key.replace('peer_name_', '')]: value}));
            } else if (key.startsWith('peer_role_')) {
              setPeerRoles(prev => ({...prev, [key.replace('peer_role_', '')]: value}));
            }
            
            // Publish full state
            await publishSigned({
              kind: 30000,
              created_at: Math.floor(Date.now() / 1000),
              tags: [['d', roomId]],
              content: JSON.stringify(stateProxy.store)
            });

            // Update beacon if public
            if (isPublicRef.current && (key === 'currentTrack' || key.startsWith('peer_name_'))) {
               // Throttle/dedupe could go here, but for now we just publish
               publishSigned({
                 kind: 31337,
                 created_at: Math.floor(Date.now() / 1000),
                 tags: [['d', roomId], ['r', roomId]],
                   content: JSON.stringify({ 
                     roomId, 
                     roomName: stateProxy.store['roomName'] || roomId,
                     hostName: peerNamesRef.current[hostIdRef.current] || displayName, 
                     currentTrack: stateProxy.store['currentTrack'],
                     activePeers: Object.keys(peerNamesRef.current).length
                   })
               });
            }
          } else {
            // Peer sends intent to host
            await publishSigned({
              kind: 20001,
              created_at: Math.floor(Date.now() / 1000),
              tags: [['r', roomId]],
              content: JSON.stringify({ key, value })
            });
          }
        },
        get: async (key) => stateProxy.store[key],
        all: async () => Object.entries(stateProxy.store).map(([key, value]) => ({ key, value }))
      };

      const chatProxy = {
        events: new MiniEmitter(),
        arr: [],
        add: async (msg) => {
          // Both host and peers can publish chat
          await publishSigned({
            kind: 9,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['h', roomId]],
            content: JSON.stringify(msg)
          });
        },
        all: async () => chatProxy.arr.map(value => ({ payload: { value } }))
      };

      // Set up subscriptions
      const filters = [
        { kinds: [30000], '#d': [roomId], authors: [hostIdRef.current] }, // State sync from host
        { kinds: [9], '#h': [roomId] }, // Chat
      ];
      
      if (isHost) {
        filters.push({ kinds: [20001, 20002], '#r': [roomId] }); // State intents & Join intents from peers
      }

      pool.subscribeMany(DEFAULT_RELAYS, filters, {
        onevent(event) {
          if (event.kind === 30000) {
            // Host state update
            try {
              const data = JSON.parse(event.content);
              Object.keys(data).forEach(key => {
                if (JSON.stringify(stateProxy.store[key]) !== JSON.stringify(data[key])) {
                  stateProxy.store[key] = data[key];
                  stateProxy.events.emit('update', { payload: { key, value: data[key] } });
                  
                  if (key.startsWith('peer_name_')) {
                    setPeerNames(prev => ({...prev, [key.replace('peer_name_', '')]: data[key]}));
                    setPeers(prev => [...new Set([...prev, key.replace('peer_name_', '')])]);
                  } else if (key.startsWith('peer_role_')) {
                    setPeerRoles(prev => ({...prev, [key.replace('peer_role_', '')]: data[key]}));
                  } else if (key === 'banned' && data[key] === nostrPk) {
                     window.location.reload();
                  }
                }
              });
              if (!isHostRef.current && statusRef.current !== 'connected') {
                setStatusWrapped('connected');
              }
            } catch(e) { console.error(e); }
          } else if (event.kind === 9) {
            // Chat message
            try {
              const msg = JSON.parse(event.content);
              const isDuplicate = chatProxy.arr.some(m => m.id === msg.id && m.timestamp === msg.timestamp);
              if (!isDuplicate) {
                chatProxy.arr.push(msg);
                chatProxy.events.emit('update', { payload: { value: msg } });
              }
            } catch(e) { console.error(e); }
          } else if (event.kind === 20001 && isHost) {
            // State mutation intent from peer
            try {
              const { key, value } = JSON.parse(event.content);
              const senderRole = peerRolesRef.current[event.pubkey] || 'peer';
              
              if (key.startsWith('peer_role_') || key === 'banned') {
                if (senderRole !== 'owner') return; // Only owner can promote/ban
              }
              
              stateProxy.put(key, value);
            } catch(e) { console.error(e); }
          } else if (event.kind === 20002 && isHost) {
            // Join intent
            const newPeerName = event.content;
            stateProxy.put(`peer_name_${event.pubkey}`, newPeerName);
          }
        }
      });

      // Initial Local State Setup
      setStateDbReady(stateProxy);
      setChatDbReady(chatProxy);
      
      if (isHost) {
        setPeerNames(prev => ({ ...prev, [nostrPk]: displayName }));
        setPeerRoles(prev => ({ ...prev, [nostrPk]: 'owner' }));
        
        // Wait briefly for WebSockets to open before slamming them with the initial state
        setTimeout(() => {
          if (roomRef.current !== roomId) return;
          stateProxy.put(`peer_name_${nostrPk}`, displayName);
          stateProxy.put(`peer_role_${nostrPk}`, 'owner');
          setStatusWrapped('connected');
        }, 1500);

        // Heartbeat beacon every 15s to ensure Lobby visibility even if connection dropped
        const beaconInterval = setInterval(() => {
          if (roomRef.current !== roomId) {
            clearInterval(beaconInterval);
            return;
          }
          if (isPublicRef.current) {
             publishSigned({
               kind: 31337,
               created_at: Math.floor(Date.now() / 1000),
               tags: [['d', roomId], ['r', roomId]],
                 content: JSON.stringify({ 
                   roomId, 
                   roomName: stateProxy.store['roomName'] || roomId,
                   hostName: peerNamesRef.current[hostIdRef.current] || displayName, 
                   currentTrack: stateProxy.store['currentTrack'],
                   activePeers: Object.keys(peerNamesRef.current).length
                 })
             });
          }
        }, 15000);

      } else {
        // Send join intent in a loop until we get connected (Host acks by setting our peer_name)
        const sendJoin = () => {
          publishSigned({
            kind: 20002,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['r', roomId]],
            content: displayName
          });
        };

        sendJoin(); // Try immediately
        
        const joinInterval = setInterval(() => {
          if (roomRef.current !== roomId) {
            clearInterval(joinInterval);
            return;
          }
          if (statusRef.current === 'initializing') {
            console.log('[Nostr] Re-sending join intent...');
            sendJoin();
          } else {
            clearInterval(joinInterval);
          }
        }, 2000);
        
        // Fallback timeout
        setTimeout(() => {
          clearInterval(joinInterval);
          if (statusRef.current === 'initializing') {
            setStatusWrapped('failed');
          }
        }, 30000);
      }

    } catch (err) {
      console.error('Nostr Init Error:', err);
      setStatusWrapped('failed');
    }
  }, []);

  const getConnectedRelays = useCallback(() => DEFAULT_RELAYS, []);

  const contextValue = React.useMemo(() => ({
    helia: null, orbitdb: null, stateDb: stateDbReady, chatDb: chatDbReady, 
    status, peerId, peers, peerNames, peerRoles, initP2P, stopP2P, getConnectedRelays
  }), [stateDbReady, chatDbReady, status, peerId, peers, peerNames, peerRoles, initP2P, stopP2P, getConnectedRelays]);

  return (
    <OrbitContext.Provider value={contextValue}>
      {children}
    </OrbitContext.Provider>
  );
};

export const useOrbit = () => useContext(OrbitContext);
