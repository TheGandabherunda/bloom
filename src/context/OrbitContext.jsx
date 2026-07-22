import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { pool, signEvent, hexToBytes, DEFAULT_RELAYS } from '../services/nostr';
import { finalizeEvent } from 'nostr-tools';

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
  const relaysRef = useRef([]);
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
        const results = pool.publish(relaysRef.current, signedEvent);
        if (Array.isArray(results)) {
          Promise.allSettled(results).then(() => {});
        } else if (results && typeof results.catch === 'function') {
          results.catch(() => {});
        }
      } catch (err) {
        console.warn('[Nostr] pool.publish error:', err);
      }
    } catch (e) {
      console.error("[Nostr] Failed to publish event", e);
    }
  };

  const deleteRoom = useCallback(async () => {
    if (isHostRef.current && roomRef.current && skRef.current) {
      console.log(`[Nostr] Deleting room ${roomRef.current} from network...`);
      const beaconEvent = {
        kind: 30311,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['d', `bloom-${roomRef.current}`],
          ['status', 'ended'],
          ['p', peerId, 'host']
        ],
        content: JSON.stringify({ roomId: roomRef.current, activePeerIds: [], hostPk: peerId })
      };
      try {
        const signedBeacon = finalizeEvent(beaconEvent, skRef.current);
        const pubResults = pool.publish(DEFAULT_RELAYS, signedBeacon);
        await Promise.allSettled(pubResults);
        console.log(`[Nostr] Room marked as ended on relays.`);
      } catch (err) {
        console.error('[Nostr] Error deleting room:', err);
      }
    }
  }, [peerId]);

  const stopP2P = useCallback(async () => {
    roomRef.current = null;
    setStateDbReady(null);
    setChatDbReady(null);
    setPeers([]);
    setStatusWrapped('disconnected');
  }, []);

  const initP2P = useCallback(async (roomId, displayName, isHost = false, hostId = null, nostrPk = null, nostrSk = null, isPublic = false, relays = []) => {
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
      relaysRef.current = relays;

      // Debouncers for state and beacon
      let statePublishTimeout = null;
      let beaconPublishTimeout = null;

      const stateProxy = {
        events: new MiniEmitter(),
        store: {},
        put: async (key, value) => {
          if (isHostRef.current) {
            // Host updates local state
            stateProxy.store[key] = value;
            
            // Check for names/roles directly
            if (key.startsWith('peer_name_')) {
              const pubkey = key.replace('peer_name_', '');
              setPeerNames(prev => ({...prev, [pubkey]: value}));
              setPeers(prev => [...new Set([...prev, pubkey])]);
            } else if (key.startsWith('peer_role_')) {
              setPeerRoles(prev => ({...prev, [key.replace('peer_role_', '')]: value}));
            }
            
            // Debounce state publish
            if (statePublishTimeout) clearTimeout(statePublishTimeout);
            statePublishTimeout = setTimeout(async () => {
              await publishSigned({
                kind: 30000,
                created_at: Math.floor(Date.now() / 1000),
                tags: [['d', roomId]],
                content: JSON.stringify(stateProxy.store)
              });
            }, 500);

            // Debounce beacon publish if public
            if (isPublicRef.current && (key === 'currentTrack' || key.startsWith('peer_name_'))) {
               if (beaconPublishTimeout) clearTimeout(beaconPublishTimeout);
               beaconPublishTimeout = setTimeout(() => {
                 const beaconEvent = {
                   kind: 30000,
                   created_at: Math.floor(Date.now() / 1000),
                   tags: [['d', `lobby-${roomId}`]],
                   content: JSON.stringify({ 
                     roomId, 
                     roomName: stateProxy.store['roomName'] || roomId,
                     hostName: peerNamesRef.current[hostIdRef.current] || displayName, 
                     currentTrack: stateProxy.store['currentTrack'],
                     activePeers: Object.keys(peerNamesRef.current).length,
                     hostPk: hostIdRef.current
                   })
                 };
                 const signedBeacon = finalizeEvent(beaconEvent, skRef.current);
                 const pubResults = pool.publish(DEFAULT_RELAYS, signedBeacon);
                 if (Array.isArray(pubResults)) Promise.allSettled(pubResults).then(()=>{});
               }, 1000);
            }
          } else {
            // Peer sends intent to host (using Replaceable event 30000 to prevent ephemeral drops and spam)
            await publishSigned({
              kind: 30000,
              created_at: Math.floor(Date.now() / 1000),
              tags: [['d', `intent-${roomId}`], ['p', hostIdRef.current]],
              content: JSON.stringify({ key, value, ts: Date.now() }) // ts ensures content changes
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
      const hostPubKey = isHost ? nostrPk : hostIdRef.current;
      const filters = [
        { kinds: [30000], '#d': [roomId], authors: [hostPubKey] }, // State sync from host
        { kinds: [9], '#h': [roomId] }, // Chat
      ];
      
      if (isHost) {
        filters.push({ kinds: [30000], '#p': [nostrPk] }); // State intents & Join intents from peers
      }

      console.log(`[Nostr] Subscribing with filters:`, filters);

      pool.subscribeMany(relays, filters, {
        onevent(event) {
          console.log(`[Nostr] Received event id=${event.id} kind=${event.kind} from pubkey=${event.pubkey}`);
          if (event.kind === 30000) {
            const dTag = event.tags.find(t => t[0] === 'd')?.[1];
            
            if (dTag === roomId) {
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
            } else if (dTag === `intent-${roomId}` && isHost) {
              // State mutation intent from peer
              try {
                console.log(`[Nostr] Parsing state mutation intent from peer:`, event.content);
                const { key, value } = JSON.parse(event.content);
                const senderRole = peerRolesRef.current[event.pubkey] || 'peer';
                console.log(`[Nostr] Sender role is ${senderRole}. Requesting mutation of ${key}`);
                
                if (key.startsWith('peer_role_') || key === 'banned') {
                  if (senderRole !== 'owner') {
                    console.warn(`[Nostr] Rejected role/ban mutation from non-owner peer.`);
                    return;
                  }
                }

                const playbackKeys = ['currentTrack', 'isPlaying', 'currentTime', 'queue', 'originalQueue', 'isShuffled'];
                if (playbackKeys.includes(key)) {
                  if (senderRole !== 'owner' && senderRole !== 'admin') {
                    console.warn(`[Nostr] Rejected playback mutation from non-admin peer.`);
                    return;
                  }
                }
                
                if (JSON.stringify(stateProxy.store[key]) !== JSON.stringify(value)) {
                  stateProxy.events.emit('update', { payload: { key, value } });
                }
                stateProxy.put(key, value);
              } catch(e) { console.error('[Nostr] Failed to parse intent:', e); }
            } else if (dTag === `join-${roomId}` && isHost) {
              // Join intent from peer
              const newPeerName = event.content;
              console.log(`[Nostr] Received Join Intent from pubkey=${event.pubkey} name=${newPeerName}`);
              stateProxy.put(`peer_name_${event.pubkey}`, newPeerName);
            }
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

        // Heartbeat beacon every 30s to ensure Lobby visibility without spamming
        const beaconInterval = setInterval(() => {
          if (roomRef.current !== roomId) {
            clearInterval(beaconInterval);
            return;
          }
          if (isPublicRef.current) {
             const activePeerIds = Object.keys(peerNamesRef.current);
             const beaconEvent = {
               kind: 30311,
               created_at: Math.floor(Date.now() / 1000),
               tags: [
                 ['d', `bloom-${roomId}`],
                 ['title', `Bloom Room: ${stateProxy.store['roomName'] || roomId}`],
                 ['status', 'live'],
                 ['t', 'music'],
                 ['p', nostrPk, 'host']
               ],
               content: JSON.stringify({ roomId, activePeerIds, hostPk: nostrPk })
             };
             const signedBeacon = finalizeEvent(beaconEvent, nostrSk);
             const pubResults = pool.publish(DEFAULT_RELAYS, signedBeacon);
             console.log(`[Nostr] Heartbeat beacon (NIP-53) published to pool.`);
             if (Array.isArray(pubResults)) Promise.allSettled(pubResults).then(()=>{});
          }
        }, 30000);

      } else {
        // Send join intent in a loop until we get connected (Host acks by setting our peer_name)
        const sendJoin = () => {
          console.log(`[Nostr] Sending Join Intent (30000) to host PK: ${hostIdRef.current}`);
          publishSigned({
            kind: 30000,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['d', `join-${roomId}`], ['p', hostIdRef.current]],
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
            console.log(`[Nostr] Re-sending join intent... (Retry #, Still initializing)`);
            sendJoin();
          } else {
            console.log(`[Nostr] Peer connected or failed! Stopping join intent loop.`);
            clearInterval(joinInterval);
          }
        }, 8000);
        
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

  const getConnectedRelays = useCallback(() => relaysRef.current, []);

  const contextValue = React.useMemo(() => ({
    helia: null, orbitdb: null, stateDb: stateDbReady, chatDb: chatDbReady, 
    status, peerId, peers, peerNames, peerRoles, initP2P, stopP2P, getConnectedRelays, deleteRoom
  }), [stateDbReady, chatDbReady, status, peerId, peers, peerNames, peerRoles, initP2P, stopP2P, getConnectedRelays, deleteRoom]);

  return (
    <OrbitContext.Provider value={contextValue}>
      {children}
    </OrbitContext.Provider>
  );
};

export const useOrbit = () => useContext(OrbitContext);
