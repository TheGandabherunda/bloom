import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createLibp2p } from 'libp2p';
import { createHelia } from 'helia';
import { createOrbitDB, Identities } from '@orbitdb/core';
import { webSockets } from '@libp2p/websockets';
import { webRTC } from '@libp2p/webrtc';

import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { bootstrap } from '@libp2p/bootstrap';
import { IDBBlockstore } from 'blockstore-idb';
import { IDBDatastore } from 'datastore-idb';

const OrbitContext = createContext(null);

export const OrbitProvider = ({ children }) => {
  const [helia, setHelia] = useState(null);
  const [orbitdb, setOrbitdb] = useState(null);
  const [stateDb, setStateDb] = useState(null);
  const [chatDb, setChatDb] = useState(null);
  const [status, setStatus] = useState('disconnected');
  const [peerId, setPeerId] = useState(null);
  const [peers, setPeers] = useState([]);
  const [peerNames, setPeerNames] = useState({});
  const [peerRoles, setPeerRoles] = useState({});
  const initializingRef = useRef(false);
  const statusRef = useRef('disconnected');

  const setStatusWrapped = (newStatus) => {
    statusRef.current = newStatus;
    setStatus(newStatus);
  };

  const stopP2P = useCallback(async () => {
    if (orbitdb) {
      await orbitdb.stop();
      setOrbitdb(null);
    }
    if (helia) {
      await helia.stop();
      setHelia(null);
    }
    setStatusWrapped('disconnected');
    initializingRef.current = false;
  }, [helia, orbitdb]);

  const initP2P = useCallback(async (roomId, displayName, isHost = false) => {
    if (initializingRef.current || statusRef.current === 'connected') {
      console.log('P2P initialization skipped: already initializing or connected', {
        initializing: initializingRef.current,
        status: statusRef.current
      });
      return;
    }

    try {
      initializingRef.current = true;
      setStatusWrapped('initializing');
      console.log('Starting P2P initialization...');

      // 1. Configure libp2p first
      const libp2p = await createLibp2p({
        addresses: {
          listen: ['/webrtc']
        },
        transports: [
          webSockets(),
          webRTC(),
          circuitRelayTransport()
        ],
        connectionEncryption: [noise()],
        streamMuxers: [yamux()],
        services: {
          identify: identify(),
          pubsub: gossipsub({
            allowPublishToZeroPeers: true,
            fallbackToFloodsub: true,
            emitSelf: false // Don't emit to ourselves via pubsub to reduce noise
          }),
        },
        peerDiscovery: [
          bootstrap({
            list: [
              '/dns4/bootstrap.libp2p.io/tcp/443/wss/p2p/QmNnoo2uRhyKmRkUMvBxTRCM9D2Eryqk9TqZ8D5x5hAn6v',
              '/dns4/bootstrap.libp2p.io/tcp/443/wss/p2p/QmQCU2EcNmSRRL6JWvAa6uW7YyqK13f99ZcsNqXF8vMpxU',
              '/dns4/bootstrap.libp2p.io/tcp/443/wss/p2p/QmbLHAnMoUv8H75Fm6nU78Y4XvW3N9N9X4x4Wq3vS6xU6x'
            ]
          })
        ]
      });

      // 2. Initialize Helia with the existing libp2p instance
      const blockstore = new IDBBlockstore(`bloom/blocks/${roomId}`);
      const datastore = new IDBDatastore(`bloom/data/${roomId}`);
      await blockstore.open();
      await datastore.open();

      console.log('Creating Helia node with custom libp2p...');
      const heliaNode = await createHelia({
        libp2p,
        blockstore,
        datastore,
        start: false // We will start it explicitly
      });

      console.log('Starting Helia and libp2p...');
      await libp2p.start();
      await heliaNode.start();

      console.log('Helia and libp2p started successfully');

      // Professional Service Alignment - ONLY after start
      const ipfsNode = heliaNode;

      // Ensure the internal libp2p instance is accessible
      let nodeLibp2p = null;
      try {
        nodeLibp2p = ipfsNode.libp2p;
      } catch (e) {
        console.warn('Helia.libp2p getter failed, using configured instance');
        nodeLibp2p = libp2p;
      }

      if (nodeLibp2p.services && !nodeLibp2p.services.pubsub) {
        nodeLibp2p.services.pubsub = libp2p.services.pubsub;
      }

      // Top-level shim for older consumer patterns
      if (!nodeLibp2p.pubsub) nodeLibp2p.pubsub = libp2p.services.pubsub;

      setHelia(ipfsNode);
      setPeerId(libp2p.peerId.toString());

      // 3. Initialize OrbitDB Identities
      console.log('Initializing OrbitDB Identities...');
      const identities = await Identities({ ipfs: ipfsNode });

      // 4. Create Identity
      const identity = await identities.createIdentity({ id: displayName });

      // 5. Initialize OrbitDB
      console.log('Creating OrbitDB instance...');
      const orbit = await createOrbitDB({ ipfs: ipfsNode, identity });
      setOrbitdb(orbit);

      // 6. Open Databases
      console.log('Opening databases...');
      try {
        const state = await orbit.open(`${roomId}-state`, { type: 'keyvalue' });
        console.log('State DB opened');
        const chat = await orbit.open(`${roomId}-chat`, { type: 'events' });
        console.log('Chat DB opened');

        setStateDb(state);
        setChatDb(chat);
        setStatusWrapped('connected');
        initializingRef.current = false;
        console.log('P2P connected successfully');

        const myPeerId = libp2p.peerId.toString();

        // Set local state immediately so UI reflects role even before DB write succeeds
        setPeerNames(prev => ({ ...prev, [myPeerId]: displayName }));
        if (isHost) {
          setPeerRoles(prev => ({ ...prev, [myPeerId]: 'owner' }));
        }

        // Write name and role (best-effort — may fail when alone due to gossipsub)
        try {
          await state.put(`peer_name_${myPeerId}`, displayName);
          if (isHost) {
            await state.put(`peer_role_${myPeerId}`, 'owner');
          }

          // Send join system message
          await chat.add({
            text: `${displayName} joined the room`,
            type: 'system',
            sender: 'System',
            timestamp: Date.now()
          });
        } catch (broadcastErr) {
          console.warn('Initial broadcast warning (expected if alone):', broadcastErr.message);
        }

        // Track connections
        libp2p.addEventListener('peer:connect', (evt) => {
          setPeers(prev => [...new Set([...prev, evt.detail.toString()])]);
        });
        libp2p.addEventListener('peer:disconnect', (evt) => {
          setPeers(prev => prev.filter(p => p !== evt.detail.toString()));
        });

        // Sync any additional names/roles from DB (for rejoining rooms with history)
        const allState = await state.all();
        const initialNames = { [myPeerId]: displayName };
        const initialRoles = isHost ? { [myPeerId]: 'owner' } : {};
        allState.forEach(entry => {
          if (entry.key.startsWith('peer_name_')) initialNames[entry.key.replace('peer_name_', '')] = entry.value;
          if (entry.key.startsWith('peer_role_')) initialRoles[entry.key.replace('peer_role_', '')] = entry.value;
        });
        setPeerNames(initialNames);
        setPeerRoles(initialRoles);

        state.events.on('update', (entry) => {
          const { key, value } = entry.payload;
          if (key.startsWith('peer_name_')) {
            setPeerNames(prev => ({...prev, [key.replace('peer_name_', '')]: value}));
          } else if (key.startsWith('peer_role_')) {
            setPeerRoles(prev => ({...prev, [key.replace('peer_role_', '')]: value}));
          } else if (key === 'banned') {
            if (value === myPeerId) {
              window.location.reload();
            } else {
              try { libp2p.components.connectionManager.closeConnections(value); } catch(e) {}
            }
          }
        });

        return { state, chat };
      } catch (dbErr) {
        console.error('Failed to open OrbitDB databases:', dbErr);
        throw dbErr;
      }
    } catch (err) {
      console.error('P2P Init Error:', err);
      setStatusWrapped('failed');
      initializingRef.current = false;
      throw err;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // In React Strict Mode, this might trigger on mount, so we're careful.
      // But typically we want to close DBs and stop nodes when the provider is destroyed.
    };
  }, []);

  return (
    <OrbitContext.Provider value={{ helia, orbitdb, stateDb, chatDb, status, peerId, peers, peerNames, peerRoles, initP2P, stopP2P }}>
      {children}
    </OrbitContext.Provider>
  );
};

export const useOrbit = () => useContext(OrbitContext);
