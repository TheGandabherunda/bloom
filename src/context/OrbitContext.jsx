import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

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
  const initializingRef = useRef(false);
  const statusRef = useRef('disconnected');
  
  const workerRef = useRef(null);
  const messageResolvers = useRef({});
  const msgIdCounter = useRef(0);
  const myPeerIdRef = useRef(null);
  
  const stateDbRef = useRef(null);
  const chatDbRef = useRef(null);
  const [stateDbReady, setStateDbReady] = useState(null);
  const [chatDbReady, setChatDbReady] = useState(null);

  const setStatusWrapped = (newStatus) => {
    statusRef.current = newStatus;
    setStatus(newStatus);
  };

  const postMsg = useCallback((type, payload) => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) return reject(new Error('Worker not initialized'));
      const id = ++msgIdCounter.current;
      messageResolvers.current[id] = { resolve, reject };
      workerRef.current.postMessage({ id, type, payload });
    });
  }, []);

  const stopP2P = useCallback(async () => {
    if (workerRef.current) {
      await postMsg('STOP', {}).catch(() => {});
      workerRef.current.terminate();
      workerRef.current = null;
    }
    stateDbRef.current = null;
    chatDbRef.current = null;
    setStateDbReady(null);
    setChatDbReady(null);
    setStatusWrapped('disconnected');
    initializingRef.current = false;
  }, [postMsg]);

  const initP2P = useCallback(async (roomId, displayName, isHost = false) => {
    if (initializingRef.current || statusRef.current === 'connected') return;
    
    try {
      initializingRef.current = true;
      setStatusWrapped('initializing');
      console.log('Starting P2P Worker initialization...');

      const worker = new Worker(new URL('../workers/p2pWorker.js', import.meta.url), { type: 'module' });
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const { id, success, result, error, type, peerId: pId, payload, entry } = e.data;
        
        if (id && messageResolvers.current[id]) {
          if (success) messageResolvers.current[id].resolve(result !== undefined ? result : pId);
          else messageResolvers.current[id].reject(new Error(error));
          delete messageResolvers.current[id];
        }

        if (type === 'PEER_CONNECT') setPeers(prev => [...new Set([...prev, pId])]);
        else if (type === 'PEER_DISCONNECT') setPeers(prev => prev.filter(p => p !== pId));
        else if (type === 'STATE_UPDATE') {
          if (stateDbRef.current) stateDbRef.current.events.emit('update', entry);
          const { key, value } = entry.payload;
          if (key.startsWith('peer_name_')) setPeerNames(prev => ({...prev, [key.replace('peer_name_', '')]: value}));
          else if (key.startsWith('peer_role_')) setPeerRoles(prev => ({...prev, [key.replace('peer_role_', '')]: value}));
          else if (key === 'banned') {
             if (value === myPeerIdRef.current) window.location.reload();
             else postMsg('CLOSE_CONNECTIONS', { peerId: value }).catch(()=>{});
          }
        }
        else if (type === 'CHAT_UPDATE') {
          if (chatDbRef.current) chatDbRef.current.events.emit('update', entry);
        }
      };

      // Create dummy proxy objects so the rest of the UI doesn't crash
      const stateProxy = {
        events: new MiniEmitter(),
        put: async (key, value) => postMsg('STATE_PUT', { key, value }),
        get: async (key) => postMsg('STATE_GET', { key }),
        all: async () => postMsg('STATE_ALL', {})
      };

      const chatProxy = {
        events: new MiniEmitter(),
        add: async (msg) => postMsg('CHAT_ADD', { msg }),
        all: async () => postMsg('CHAT_ALL', {})
      };

      stateDbRef.current = stateProxy;
      chatDbRef.current = chatProxy;

      const myPeerId = await postMsg('INIT', { roomId, displayName, isHost });
      myPeerIdRef.current = myPeerId;
      setPeerId(myPeerId);

      // Local state immediately
      setPeerNames(prev => ({ ...prev, [myPeerId]: displayName }));
      if (isHost) setPeerRoles(prev => ({ ...prev, [myPeerId]: 'owner' }));

      // Sync initial history
      const allState = await stateProxy.all();
      const initialNames = { [myPeerId]: displayName };
      const initialRoles = isHost ? { [myPeerId]: 'owner' } : {};
      allState.forEach(entry => {
        if (entry.key.startsWith('peer_name_')) initialNames[entry.key.replace('peer_name_', '')] = entry.value;
        if (entry.key.startsWith('peer_role_')) initialRoles[entry.key.replace('peer_role_', '')] = entry.value;
      });
      setPeerNames(initialNames);
      setPeerRoles(initialRoles);

      setStateDbReady(stateProxy);
      setChatDbReady(chatProxy);
      setStatusWrapped('connected');
      initializingRef.current = false;
      console.log('P2P connected successfully via Web Worker');

    } catch (err) {
      console.error('P2P Init Error:', err);
      setStatusWrapped('failed');
      initializingRef.current = false;
      if (workerRef.current) workerRef.current.terminate();
    }
  }, [postMsg]);

  useEffect(() => {
    return () => {
      // Unmount cleanup
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
