import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { joinRoom, selfId } from 'trystero';

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
  
  const statusRef = useRef('disconnected');
  const roomRef = useRef(null);
  
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

      const room = joinRoom({ appId: 'bloom-p2p' }, roomId);
      roomRef.current = room;
      setPeerId(selfId);

      const stateProxy = {
        events: new MiniEmitter(),
        store: {},
        put: async (key, value) => {
          stateProxy.store[key] = value;
          stateProxy.sendPut({ key, value });
          stateProxy.events.emit('update', { payload: { key, value } });
          
          if (key === 'banned') {
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
        console.log(`[P2P] Received state update from ${pId}:`, data.key);
        stateProxy.store[data.key] = data.value;
        stateProxy.events.emit('update', { payload: { key: data.key, value: data.value } });
        
        if (data.key.startsWith('peer_name_')) {
          setPeerNames(prev => ({...prev, [data.key.replace('peer_name_', '')]: data.value}));
        } else if (data.key.startsWith('peer_role_')) {
          setPeerRoles(prev => ({...prev, [data.key.replace('peer_role_', '')]: data.value}));
        } else if (data.key === 'banned' && data.value === selfId) {
          window.location.reload();
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
        }

        // Request state sync from newly joined peer just in case they have history
        if (!isHost) {
          console.log(`[P2P] Requesting full state sync from ${pId}...`);
          reqSyncAction.send({}, { target: pId });
        }
      };

      room.onPeerLeave = (pId) => {
        console.log(`[P2P] Peer left room: ${pId}`);
        setPeers(prev => prev.filter(p => p !== pId));
      };

      // State Synchronization Logic
      reqSyncAction.onMessage = (_, { peerId: pId }) => {
        console.log(`[P2P] Received sync request from ${pId}. Sending full state...`);
        fullSyncAction.send({
          state: stateProxy.store,
          chat: chatProxy.arr,
          names: stateProxy.store,
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
        
        setPeerNames(initialNames);
        setPeerRoles(initialRoles);

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

      await chatProxy.add({
        text: `${displayName} joined the room`,
        type: 'system',
        sender: 'System',
        timestamp: Date.now(),
      });

      setStateDbReady(stateProxy);
      setChatDbReady(chatProxy);
      setStatusWrapped('connected');
      console.log('Trystero connected successfully!');

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
