import { createLibp2p } from 'libp2p';
import { createHelia } from 'helia';
import { createOrbitDB, Identities } from '@orbitdb/core';
import { webSockets } from '@libp2p/websockets';
import { all } from '@libp2p/websockets/filters';
import { webRTC } from '@libp2p/webrtc';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { bootstrap } from '@libp2p/bootstrap';
import { IDBBlockstore } from 'blockstore-idb';
import { IDBDatastore } from 'datastore-idb';

let heliaNode = null;
let orbitdb = null;
let stateDb = null;
let chatDb = null;
let libp2pNode = null;
let myPeerId = null;

self.onmessage = async (e) => {
  const { type, payload, id } = e.data;
  
  try {
    switch (type) {
      case 'INIT':
        await initP2P(payload.roomId, payload.displayName, payload.isHost);
        self.postMessage({ id, success: true, peerId: myPeerId });
        break;
      case 'STOP':
        if (orbitdb) await orbitdb.stop();
        if (heliaNode) await heliaNode.stop();
        self.postMessage({ id, success: true });
        break;
      case 'STATE_PUT':
        if (stateDb) await stateDb.put(payload.key, payload.value);
        self.postMessage({ id, success: true });
        break;
      case 'STATE_GET':
        const val = stateDb ? await stateDb.get(payload.key) : null;
        self.postMessage({ id, success: true, result: val });
        break;
      case 'STATE_ALL':
        const allState = stateDb ? await stateDb.all() : [];
        self.postMessage({ id, success: true, result: allState });
        break;
      case 'CHAT_ADD':
        if (chatDb) await chatDb.add(payload.msg);
        self.postMessage({ id, success: true });
        break;
      case 'CHAT_ALL':
        const allChat = chatDb ? await chatDb.all() : [];
        self.postMessage({ id, success: true, result: allChat });
        break;
      case 'CLOSE_CONNECTIONS':
        if (libp2pNode) {
          try { libp2pNode.components.connectionManager.closeConnections(payload.peerId); } catch(err) {}
        }
        self.postMessage({ id, success: true });
        break;
    }
  } catch (err) {
    self.postMessage({ id, error: err.message || err.toString() });
  }
};

async function initP2P(roomId, displayName, isHost) {
  const libp2p = await createLibp2p({
    addresses: {
      listen: [
        '/webrtc'
      ]
    },
    transports: [
      webSockets({ filter: all }),
      webRTC({
        rtcConfiguration: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      }),
      circuitRelayTransport({ discoverRelays: 1 })
    ],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub({
        allowPublishToZeroPeers: true,
        fallbackToFloodsub: true,
        emitSelf: false 
      }),
    },
    peerDiscovery: [
      bootstrap({
        list: [
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
          '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4VtEQh4BcR56CWsMoP1S2i'
        ]
      })
    ]
  });

  const blockstore = new IDBBlockstore(`bloom/blocks/${roomId}`);
  const datastore = new IDBDatastore(`bloom/data/${roomId}`);
  await blockstore.open();
  await datastore.open();

  heliaNode = await createHelia({
    libp2p,
    blockstore,
    datastore,
    start: false 
  });

  await libp2p.start();
  await heliaNode.start();

  let nodeLibp2p = null;
  try {
    nodeLibp2p = heliaNode.libp2p;
  } catch (e) {
    nodeLibp2p = libp2p;
  }
  if (nodeLibp2p.services && !nodeLibp2p.services.pubsub) {
    nodeLibp2p.services.pubsub = libp2p.services.pubsub;
  }
  if (!nodeLibp2p.pubsub) nodeLibp2p.pubsub = libp2p.services.pubsub;

  libp2pNode = libp2p;
  myPeerId = libp2p.peerId.toString();

  const identities = await Identities({ ipfs: heliaNode });
  const identity = await identities.createIdentity({ id: displayName });

  orbitdb = await createOrbitDB({ ipfs: heliaNode, identity });
  
  stateDb = await orbitdb.open(`${roomId}-state`, { type: 'keyvalue' });
  chatDb = await orbitdb.open(`${roomId}-chat`, { type: 'events' });

  // Broadcast initial join data (best-effort)
  try {
    await stateDb.put(`peer_name_${myPeerId}`, displayName);
    if (isHost) {
      await stateDb.put(`peer_role_${myPeerId}`, 'owner');
    }
    await chatDb.add({
      text: `${displayName} joined the room`,
      type: 'system',
      sender: 'System',
      timestamp: Date.now()
    });
  } catch (e) {}

  // Wire up event listeners to bridge back to the UI thread
  libp2p.addEventListener('peer:discovery', (evt) => {
    console.log(`[P2P Worker] Discovered peer: ${evt.detail.id.toString()}`);
  });

  libp2p.addEventListener('peer:connect', (evt) => {
    console.log(`[P2P Worker] Connected to peer: ${evt.detail.toString()}`);
    self.postMessage({ type: 'PEER_CONNECT', peerId: evt.detail.toString() });
  });
  
  libp2p.addEventListener('peer:disconnect', (evt) => {
    console.log(`[P2P Worker] Disconnected from peer: ${evt.detail.toString()}`);
    self.postMessage({ type: 'PEER_DISCONNECT', peerId: evt.detail.toString() });
  });

  stateDb.events.on('update', (entry) => {
    console.log(`[P2P Worker] State DB updated:`, entry.payload.key);
    self.postMessage({ type: 'STATE_UPDATE', entry: { payload: entry.payload } });
  });
  
  chatDb.events.on('update', (entry) => {
    self.postMessage({ type: 'CHAT_UPDATE', entry: { payload: entry.payload } });
  });
}
