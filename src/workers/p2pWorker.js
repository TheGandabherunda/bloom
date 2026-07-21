import { createLibp2p } from 'libp2p';
import { createHelia } from 'helia';
import { createOrbitDB, Identities } from '@orbitdb/core';
import { webSockets } from '@libp2p/websockets';
import { all } from '@libp2p/websockets/filters';
import { webTransport } from '@libp2p/webtransport';
import { webRTC } from '@libp2p/webrtc';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { IDBBlockstore } from 'blockstore-idb';
import { IDBDatastore } from 'datastore-idb';
import { multiaddr } from '@multiformats/multiaddr';

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
        await initP2P(payload.roomId, payload.displayName, payload.isHost, payload.hostId);
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

/**
 * Dynamically fetches the current WebSockets/WebTransport addresses of the public
 * libp2p bootstrap nodes using the IPFS delegated routing API.
 * This ensures we always have fresh relay addresses, avoiding hardcoded dead nodes.
 */
async function getPublicRelayAddrs() {
  const BOOTSTRAP_PEER_IDS = [
    'QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
    'QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
    'QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
    'QmcZf59bWwK5XFi76CZX8cbJ4VtEQh4BcR56CWsMoP1S2i'
  ];

  const relayListenAddrs = [];
  try {
    for (const peerId of BOOTSTRAP_PEER_IDS) {
      const res = await fetch(`https://delegated-ipfs.dev/routing/v1/peers/${peerId}`);
      if (!res.ok) continue;
      const json = await res.json();
      if (json.Peers && json.Peers.length > 0) {
        const peer = json.Peers[0];
        if (peer.Addrs) {
          for (const addr of peer.Addrs) {
            // We want WebSocket Secure (wss) or WebTransport
            if (addr.includes('/wss') || addr.includes('/webtransport')) {
              // Skip ipv6 loopback or local ip4
              if (addr.includes('127.0.0.1') || addr.includes('::1') || addr.includes('192.168.')) continue;
              
              // Construct the p2p-circuit multiaddr for this relay
              const relayAddr = `${addr}/p2p/${peerId}/p2p-circuit`;
              if (!relayListenAddrs.includes(relayAddr)) {
                relayListenAddrs.push(relayAddr);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[P2P Worker] Failed to fetch public relays:', err);
  }
  return relayListenAddrs;
}

async function initP2P(roomId, displayName, isHost, hostId) {
  console.log('[P2P Worker] Fetching public relay addresses from delegated routing...');
  const relayAddrs = await getPublicRelayAddrs();
  console.log(`[P2P Worker] Found ${relayAddrs.length} public relay addresses to listen on.`);

  const libp2p = await createLibp2p({
    addresses: {
      // Listen on /webrtc to accept direct browser-to-browser connections
      // AND explicitly listen on the public relays to force reservation negotiation
      listen: [
        '/webrtc',
        ...relayAddrs
      ],
    },
    transports: [
      webSockets({ filter: all }),
      webTransport(),
      webRTC({
        rtcConfiguration: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      }),
      circuitRelayTransport({
        // We explicitly provided listen addresses, so we don't need discoverRelays to search
        discoverRelays: 0,
      }),
    ],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      // Required to allow dialing public addresses dynamically
      denyDialMultiaddr: async () => false,
    },
    services: {
      identify: identify(),
      pubsub: gossipsub({
        allowPublishToZeroPeers: true,
        fallbackToFloodsub: true,
        emitSelf: false,
      }),
    },
  });

  const blockstore = new IDBBlockstore(`bloom/blocks/${roomId}`);
  const datastore = new IDBDatastore(`bloom/data/${roomId}`);
  await blockstore.open();
  await datastore.open();

  heliaNode = await createHelia({
    libp2p,
    blockstore,
    datastore,
    start: false,
  });

  await libp2p.start();
  await heliaNode.start();

  libp2pNode = libp2p;
  myPeerId = libp2p.peerId.toString();

  // ── Step 1: Set up OrbitDB ───────────────────────────────────────────────
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

  const identities = await Identities({ ipfs: heliaNode });
  const identity = await identities.createIdentity({ id: displayName });

  orbitdb = await createOrbitDB({ ipfs: heliaNode, identity });
  stateDb = await orbitdb.open(`${roomId}-state`, { type: 'keyvalue' });
  chatDb = await orbitdb.open(`${roomId}-chat`, { type: 'events' });

  // ── Step 2: Broadcast initial join data ──────────────────────────────────
  try {
    await stateDb.put(`peer_name_${myPeerId}`, displayName);
    if (isHost) {
      await stateDb.put(`peer_role_${myPeerId}`, 'owner');
    }
    await chatDb.add({
      text: `${displayName} joined the room`,
      type: 'system',
      sender: 'System',
      timestamp: Date.now(),
    });
  } catch (e) {}

  // ── Step 3: Wire up event listeners ──────────────────────────────────────
  libp2p.addEventListener('peer:connect', (evt) => {
    const pid = evt.detail.toString();
    console.log(`[P2P Worker] ✅ Connected to peer: ${pid}`);
    self.postMessage({ type: 'PEER_CONNECT', peerId: pid });
  });

  libp2p.addEventListener('peer:disconnect', (evt) => {
    const pid = evt.detail.toString();
    console.log(`[P2P Worker] ❌ Disconnected from peer: ${pid}`);
    self.postMessage({ type: 'PEER_DISCONNECT', peerId: pid });
  });

  stateDb.events.on('update', (entry) => {
    console.log(`[P2P Worker] State DB updated:`, entry.payload.key);
    self.postMessage({ type: 'STATE_UPDATE', entry: { payload: entry.payload } });
  });

  chatDb.events.on('update', (entry) => {
    self.postMessage({ type: 'CHAT_UPDATE', entry: { payload: entry.payload } });
  });

  // ── Step 4: Dial Host via all known public relays ─────────────────────────
  if (hostId && hostId !== myPeerId) {
    console.log(`[P2P Worker] Joiner mode — dialing host ${hostId} via public relays...`);
    const dialHost = async () => {
      let success = false;
      
      // We shuffle the relay array so multiple joiners don't hammer the exact same relay
      const shuffledRelays = [...relayAddrs].sort(() => 0.5 - Math.random());
      
      // Try to dial the host via each known relay circuit
      for (const relayAddr of shuffledRelays) {
        try {
          const hostCircuitAddr = multiaddr(`${relayAddr}/p2p/${hostId}`);
          console.log(`[P2P Worker] Attempting to dial host via: ${hostCircuitAddr.toString()}`);
          await libp2p.dial(hostCircuitAddr);
          console.log(`[P2P Worker] ✅ Dialed host successfully via ${relayAddr}`);
          success = true;
          break; // Stop trying if we succeed
        } catch (err) {
          console.warn(`[P2P Worker] Dial failed for ${relayAddr}: ${err.message}`);
        }
      }

      if (!success) {
        console.error('[P2P Worker] ❌ Could not dial host on any public relay. Will retry in 5s...');
        setTimeout(dialHost, 5000);
      }
    };
    // Wait a few seconds for the host to establish their reservations before we dial
    setTimeout(dialHost, 4000);
  }

  // Debugging: Periodically log our actual listening addresses (reservations)
  if (isHost) {
    const logAddrs = () => {
      const addrs = libp2p.getMultiaddrs().map(a => a.toString());
      const circuitAddrs = addrs.filter(a => a.includes('p2p-circuit'));
      console.log(`[P2P Worker] Host multiaddrs (Total: ${addrs.length}, Circuit Reservations: ${circuitAddrs.length}):`, addrs);
    };
    logAddrs();
    setInterval(logAddrs, 10000);
  }
}
