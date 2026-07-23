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
        
        // Broadcast room_ended to connected peers so they are kicked
        const endStateEvent = {
          kind: 30000,
          created_at: Math.floor(Date.now() / 1000),
          tags: [['d', roomRef.current]],
          content: JSON.stringify({ room_ended: true })
        };
        const signedEndState = finalizeEvent(endStateEvent, skRef.current);
        await Promise.allSettled(pool.publish(DEFAULT_RELAYS, signedEndState));
        
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

  const initP2P = useCallback(async (roomId, displayName, isHost = false, hostId = null, nostrPk = null, nostrSk = null, isPublic = false, relays = [], roomName = null) => {
    if (statusRef.current === 'connected' || statusRef.current === 'initializing') return;
    
    try {
      setStatusWrapped('initializing');
      console.log(`[Nostr] initP2P called with: roomId=${roomId}, isHost=${isHost}, hostId=${hostId}, nostrPk=${nostrPk}, hasNostrSk=${!!nostrSk}, isPublic=${isPublic}, roomName=${roomName}`);
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
            stateProxy.events.emit('update', { payload: { key, value } });
            window.dispatchEvent(new CustomEvent('orbit:state:update', { detail: { key, value }, payload: { key, value } }));
            
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
            if (isPublicRef.current && (key === 'currentTrack' || key === 'roomName' || key.startsWith('peer_name_'))) {
               if (beaconPublishTimeout) clearTimeout(beaconPublishTimeout);
               beaconPublishTimeout = setTimeout(() => {
                  const activeRoomName = stateProxy.store['roomName'] || roomName || 'Bloom Party';
                  const beaconEvent = {
                    kind: 30311,
                    created_at: Math.floor(Date.now() / 1000),
                    tags: [
                      ['d', `bloom-${roomId}`],
                      ['title', `Bloom Room: ${activeRoomName}`],
                      ['status', 'live'],
                      ['t', 'music'],
                      ['p', hostIdRef.current, 'host']
                    ],
                    content: JSON.stringify({ 
                      roomId, 
                      roomName: activeRoomName,
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

      setStateDbReady(stateProxy);

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

      setChatDbReady(chatProxy);

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
                console.log(`[OrbitContext] Parsed state update from relay:`, data);
                let stateRecovered = false;

                const newPeerNames = {};
                const newPeerRoles = {};
                const peerList = [];

                Object.keys(data).forEach(key => {
                  if (JSON.stringify(stateProxy.store[key]) !== JSON.stringify(data[key])) {
                    console.log(`[OrbitContext] Emitting update for key: ${key}`, data[key]);
                    stateProxy.store[key] = data[key];
                    stateRecovered = true;
                    stateProxy.events.emit('update', { payload: { key, value: data[key] } });
                    window.dispatchEvent(new CustomEvent('orbit:state:update', { detail: { key, value: data[key] }, payload: { key, value: data[key] } }));
                    
                    if (key.startsWith('peer_name_')) {
                      const pk = key.replace('peer_name_', '');
                      newPeerNames[pk] = data[key];
                      peerList.push(pk);
                    } else if (key.startsWith('peer_role_')) {
                      const pk = key.replace('peer_role_', '');
                      newPeerRoles[pk] = data[key];
                      peerList.push(pk);
                    } else if (key === 'banned' && data[key] === nostrPk) {
                       window.location.href = window.location.pathname;
                    } else if (key === 'room_ended' && data[key] === true) {
                       window.location.href = window.location.pathname;
                    }
                  } else {
                    if (key.startsWith('peer_name_')) {
                      const pk = key.replace('peer_name_', '');
                      newPeerNames[pk] = data[key];
                      peerList.push(pk);
                    } else if (key.startsWith('peer_role_')) {
                      const pk = key.replace('peer_role_', '');
                      newPeerRoles[pk] = data[key];
                      peerList.push(pk);
                    }
                  }
                });
                
                if (Object.keys(newPeerNames).length > 0) {
                  setPeerNames(prev => ({ ...prev, ...newPeerNames }));
                }
                if (Object.keys(newPeerRoles).length > 0) {
                  setPeerRoles(prev => ({ ...prev, ...newPeerRoles }));
                }
                if (peerList.length > 0) {
                  setPeers(prev => [...new Set([...prev, ...peerList])]);
                }

                if (stateRecovered && isHostRef.current) {
                  // We recovered state from the relay. Publish merged state to avoid partial overwrites.
                  if (statePublishTimeout) clearTimeout(statePublishTimeout);
                  statePublishTimeout = setTimeout(async () => {
                    await publishSigned({
                      kind: 30000,
                      created_at: Math.floor(Date.now() / 1000),
                      tags: [['d', roomId]],
                      content: JSON.stringify(stateProxy.store)
                    });
                  }, 500);
                }

                if (!isHostRef.current && statusRef.current !== 'connected') {
                  setStatusWrapped('connected');
                }
              } catch (e) {
                console.error('[OrbitContext] Failed to parse state event from relay:', e);
              }
            } else if (dTag === `intent-${roomId}` && isHost) {
              // Peer intent to host
              try {
                const intent = JSON.parse(event.content);
                console.log(`[OrbitContext] Host received state intent from peer ${event.pubkey}:`, intent);
                
                // Validate peer has permission (or setting own name)
                const role = peerRolesRef.current[event.pubkey] || 'peer';
                const isSelfName = intent.key === `peer_name_${event.pubkey}`;
                const canModifyTrack = intent.key === 'currentTrack' || intent.key === 'playbackState';
                
                if (role === 'owner' || role === 'admin' || isSelfName || (canModifyTrack && role === 'peer')) {
                  stateProxy.put(intent.key, intent.value);
                } else {
                  console.warn(`[OrbitContext] Peer ${event.pubkey} denied intent for key ${intent.key}`);
                }
              } catch (e) {
                console.error('[OrbitContext] Failed to parse intent from peer:', e);
              }
            } else if (dTag === `join-${roomId}` && isHost) {
              // Peer join intent to host
              try {
                let peerName = null;
                try {
                  const parsed = JSON.parse(event.content);
                  if (typeof parsed === 'string') peerName = parsed;
                  else if (parsed && parsed.displayName) peerName = parsed.displayName;
                } catch (e) {
                  peerName = event.content;
                }

                console.log(`[OrbitContext] Host received join intent from peer ${event.pubkey}: name=${peerName}`);
                
                // Add peer to roles as 'peer' if not already assigned, and set their name
                stateProxy.put(`peer_role_${event.pubkey}`, 'peer');
                if (peerName) {
                  stateProxy.put(`peer_name_${event.pubkey}`, peerName);
                }
              } catch (e) {
                console.error('[OrbitContext] Failed to parse join intent:', e);
              }
            }
          } else if (event.kind === 9) {
            // Chat event
            try {
              const msg = JSON.parse(event.content);
              console.log('[OrbitContext] Received chat message from relay:', msg);
              const isDuplicate = chatProxy.arr.some(m => m.id === msg.id && m.timestamp === msg.timestamp);
              if (!isDuplicate) {
                chatProxy.arr.push(msg);
                chatProxy.events.emit('update', { payload: { value: msg } });
              }
              window.dispatchEvent(new CustomEvent('bloom:chat-message', { detail: msg }));
            } catch (e) {
              console.error('[OrbitContext] Failed to parse chat event:', e);
            }
          }
        }
      });

      // Initial Local State Setup
      if (isHost) {
        setPeerNames(prev => ({ ...prev, [nostrPk]: displayName }));
        setPeerRoles(prev => ({ ...prev, [nostrPk]: 'owner' }));
        setPeers(prev => [...new Set([...prev, nostrPk])]);
        
        // Wait briefly for WebSockets to open before slamming them with the initial state
        setTimeout(() => {
          if (roomRef.current !== roomId) return;
          stateProxy.put(`peer_name_${nostrPk}`, displayName);
          stateProxy.put(`peer_role_${nostrPk}`, 'owner');
          if (roomName) {
            stateProxy.put('roomName', roomName);
          }
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
             const activeRoomName = stateProxy.store['roomName'] || roomName || 'Bloom Party';
              const beaconEvent = {
                kind: 30311,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                  ['d', `bloom-${roomId}`],
                  ['title', `Bloom Room: ${activeRoomName}`],
                  ['status', 'live'],
                  ['t', 'music'],
                  ['p', nostrPk, 'host']
                ],
                content: JSON.stringify({ 
                  roomId, 
                  roomName: activeRoomName,
                  hostName: peerNamesRef.current[nostrPk] || displayName,
                  currentTrack: stateProxy.store['currentTrack'],
                  activePeers: activePeerIds.length, 
                  hostPk: nostrPk 
                })
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
            content: JSON.stringify({ displayName })
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
