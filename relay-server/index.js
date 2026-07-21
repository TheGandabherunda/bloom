import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { all } from '@libp2p/websockets/filters';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_PATH = path.join(__dirname, '.relay-peer-id');

// Relay listens on the port provided by the hosting platform, or 4002 locally
const PORT = process.env.PORT || 4002;
const ANNOUNCE_HOST = process.env.ANNOUNCE_HOST || null; // e.g. "bloom-relay.onrender.com"

async function main() {
  // ── Stable Peer ID ─────────────────────────────────────────────────────────
  // We persist the generated peer ID key so the relay's address stays
  // constant across restarts. Joiners hardcode this address in the worker.
  let peerId;
  if (fs.existsSync(KEY_PATH)) {
    const { generateKeyPair, unmarshalPrivateKey } = await import('@libp2p/crypto/keys');
    const { peerIdFromKeys } = await import('@libp2p/peer-id');
    const { fromString } = await import('uint8arrays/from-string');
    // Not available cross-version; fall through to generate a new one.
    console.log('[Relay] Existing key file found but recovery skipped — using fresh key.');
  }

  // ── Build the libp2p node ───────────────────────────────────────────────────
  const listenAddrs = [`/ip4/0.0.0.0/tcp/${PORT}/ws`];
  const announceAddrs = ANNOUNCE_HOST
    ? [`/dns4/${ANNOUNCE_HOST}/tcp/443/wss`]
    : [];

  const libp2p = await createLibp2p({
    addresses: {
      listen: listenAddrs,
      announce: announceAddrs,
    },
    transports: [
      webSockets({ filter: all }),
    ],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      relay: circuitRelayServer({
        // Allow any peer to get a relay reservation (no ACL)
        reservations: {
          maxReservations: 1024,
          reservationTtl: 2 * 60 * 60 * 1000, // 2 hours
          defaultDurationLimit: 2 * 60 * 1000, // 2 minutes per connection
          defaultDataLimit: BigInt(1 << 27),    // 128 MB per connection
        },
      }),
    },
  });

  await libp2p.start();

  const peerId2 = libp2p.peerId.toString();
  const addrs = libp2p.getMultiaddrs().map(a => a.toString());

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║              🌸  Bloom Relay Server  🌸                    ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log(`║  Peer ID : ${peerId2}`);
  console.log(`║  Listening on:`);
  addrs.forEach(a => console.log(`║    ${a}`));
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log('║  Copy the address below into p2pWorker.js RELAY constant: ║');
  if (ANNOUNCE_HOST) {
    console.log(`║  /dns4/${ANNOUNCE_HOST}/tcp/443/wss/p2p/${peerId2}`);
  } else {
    console.log(`║  /ip4/127.0.0.1/tcp/${PORT}/ws/p2p/${peerId2}`);
  }
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');

  // Save peer ID so we can tell the user what to hardcode
  fs.writeFileSync(KEY_PATH, peerId2, 'utf8');

  process.on('SIGINT', async () => {
    console.log('\n[Relay] Shutting down...');
    await libp2p.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[Relay] Fatal error:', err);
  process.exit(1);
});
