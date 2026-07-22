import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { pool, signEvent, hexToBytes } from '../services/nostr';
import { finalizeEvent } from 'nostr-tools';
import { ROOM_KIND, ROOM_PRESENCE, LIVE_CHAT, ParticipantRole } from '../lib/const';

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
  const initializingRef = useRef(false);
  
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

  const stopP2P = useCallback(async () => {
    roomRef.current = null;
    initializingRef.current = false;
    setStateDbReady(null);
    setChatDbReady(null);
    setPeers([]);
    setStatusWrapped('disconnected');
  }, []);

  const initP2P = useCallback(async (roomId, displayName, isHost = false, hostId = null, nostrPk = null, nostrSk = null, isPublic = false, relays = []) => {
    if (initializingRef.current || statusRef.current === 'connected') return;
    initializingRef.current = true;
    
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

      // Debouncers for state
      let statePublishTimeout = null;

      const stateProxy = {
        events: new MiniEmitter(),
        store: {},
        put: async (key, value) => {
          if (isHostRef.current) {
            // Host updates local state
            stateProxy.store[key] = value;
            
            // Check for names/roles directly
            if (key.startsWith('peer_name_')) {
              setPeerNames(prev => ({...prev, [key.replace('peer_name_', '')]: value}));
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
            kind: LIVE_CHAT,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['a', `${ROOM_KIND}:${hostIdRef.current}:${roomId}`]],
            content: JSON.stringify(msg)
          });
        },
        all: async () => chatProxy.arr.map(value => ({ payload: { value } }))
      };

      // Set up subscriptions
      const hostPubKey = isHost ? nostrPk : hostIdRef.current;
      const filters = [
        { kinds: [30000], '#d': [roomId], authors: [hostPubKey] }, // State sync from host
        { kinds: [ROOM_PRESENCE], '#a': [`${ROOM_KIND}:${hostPubKey}:${roomId}`] }, // Presence from peers
        { kinds: [LIVE_CHAT], '#a': [`${ROOM_KIND}:${hostPubKey}:${roomId}`] }, // Chat
      ];
      
      if (isHost) {
        filters.push({ kinds: [30000], '#p': [nostrPk] }); // State intents from peers
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
                
                stateProxy.put(key, value);
              } catch(e) { console.error('[Nostr] Failed to parse intent:', e); }
            }
          } else if (event.kind === ROOM_PRESENCE) {
            const nameTag = event.tags.find(t => t[0] === 'name')?.[1] || "Guest";
            // Populate our local peer cache
            setPeerNames(prev => {
              if (prev[event.pubkey] !== nameTag) return { ...prev, [event.pubkey]: nameTag };
              return prev;
            });
            setPeers(prev => {
              if (!prev.includes(event.pubkey)) return [...prev, event.pubkey];
              return prev;
            });
            // If host sees a new peer, assign them a role in local state, which then gets published!
            if (isHostRef.current && !peerRolesRef.current[event.pubkey] && event.pubkey !== nostrPk) {
               stateProxy.put(`peer_role_${event.pubkey}`, ParticipantRole.SPEAKER);
               stateProxy.put(`peer_name_${event.pubkey}`, nameTag);
            }
          } else if (event.kind === LIVE_CHAT) {
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
        
        // Wait briefly for subscriptions to open before slamming them with the initial state
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
               kind: ROOM_KIND,
               created_at: Math.floor(Date.now() / 1000),
               tags: [
                 ['d', roomId],
                 ['title', stateProxy.store['roomName'] || `Bloom Room ${roomId}`],
                 ['status', 'live'],
                 ['t', 'music'],
                 ['streaming', relaysRef.current[0] || 'wss://nos.lol'],
                 ['auth', 'https://moq-auth.nostrnests.com'],
                 ['relays', ...relaysRef.current],
                 ['p', nostrPk, relaysRef.current[0] || '', ParticipantRole.HOST],
                 ...activePeerIds.filter(id => id !== nostrPk).map(id => [
                   'p', id, '', 
                   peerRolesRef.current[id] === 'owner' ? ParticipantRole.HOST : 
                   peerRolesRef.current[id] === 'admin' ? ParticipantRole.ADMIN : 
                   ParticipantRole.SPEAKER
                 ])
               ],
               content: ""
             };
             // Only finalize and publish if we have a real secret key
             if (nostrSk && nostrSk !== 'extension') {
               const signedBeacon = finalizeEvent(beaconEvent, nostrSk);
               const pubResults = pool.publish(relays, signedBeacon);
               console.log(`[Nostr] Heartbeat beacon (NIP-53 kind: 30312) published.`);
               if (Array.isArray(pubResults)) Promise.allSettled(pubResults).then(()=>{});
             } else {
               // Extension users need to manually sign the beacon which is annoying for an interval.
               // We could prompt signEvent, but it blocks. Let's skip automatic beacon for extension users for now,
               // or handle it upstream.
               publishSigned(beaconEvent);
             }
          }
        }, 30000);
      }

      // Publish NIP-53 Room Presence (kind 10312) heartbeat for ALL peers
      const publishPresence = () => {
        console.log(`[Nostr] Publishing Presence (10312) for room: ${roomId}`);
        publishSigned({
          kind: ROOM_PRESENCE,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ['a', `${ROOM_KIND}:${hostIdRef.current}:${roomId}`],
            ['hand', '0'],
            ['publishing', '0'],
            ['muted', '0'],
            ['onstage', '1'],
            ['name', displayName]
          ],
          content: ""
        });
      };

      publishPresence(); // Try immediately
      
      const presenceInterval = setInterval(() => {
         if (roomRef.current !== roomId) {
           clearInterval(presenceInterval);
           return;
         }
         publishPresence();
      }, 120000); // 2 minutes heartbeat
      
      if (!isHost) {
        // As a guest, once we publish presence, we assume we are connected
        setTimeout(() => { 
          if (statusRef.current !== 'connected' && roomRef.current === roomId) {
            setStatusWrapped('connected'); 
          }
        }, 2000);
      }

    } catch (err) {
      console.error('Nostr Init Error:', err);
      setStatusWrapped('failed');
      initializingRef.current = false;
    }
  }, []);

  const getConnectedRelays = useCallback(() => relaysRef.current, []);

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
