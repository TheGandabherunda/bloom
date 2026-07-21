import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { joinRoom, selfId } from 'trystero/torrent';

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
      const [sendPut, getPut] = room.makeAction('statePut');
      const [sendAdd, getAdd] = room.makeAction('chatAdd');
      const [requestSync, getSyncRequest] = room.makeAction('reqSync');
      const [sendFullSync, getFullSync] = room.makeAction('fullSync');

      stateProxy.sendPut = sendPut;
      chatProxy.sendAdd = sendAdd;

      getPut((data, pId) => {
        stateProxy.store[data.key] = data.value;
        stateProxy.events.emit('update', { payload: { key: data.key, value: data.value } });
        
        if (data.key.startsWith('peer_name_')) {
          setPeerNames(prev => ({...prev, [data.key.replace('peer_name_', '')]: data.value}));
        } else if (data.key.startsWith('peer_role_')) {
          setPeerRoles(prev => ({...prev, [data.key.replace('peer_role_', '')]: data.value}));
        } else if (data.key === 'banned' && data.value === selfId) {
          window.location.reload();
        }
      });

      getAdd((data, pId) => {
        chatProxy.arr.push(data.msg);
        chatProxy.events.emit('update', { payload: { value: data.msg } });
      });

      // Peer Lifecycle
      room.onPeerJoin = (pId) => {
        setPeers(prev => [...new Set([...prev, pId])]);
        // Request state sync from newly joined peer just in case they have history
        if (!isHost) requestSync({}, pId);
      };

      room.onPeerLeave = (pId) => {
        setPeers(prev => prev.filter(p => p !== pId));
      };

      // State Synchronization Logic
      getSyncRequest((_, pId) => {
        sendFullSync({
          state: stateProxy.store,
          chat: chatProxy.arr,
          names: stateProxy.store,
        }, { target: pId });
      });

      getFullSync((data) => {
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
      });

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
