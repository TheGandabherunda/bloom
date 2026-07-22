import { finalizeEvent } from 'nostr-tools';
import { hexToBytes, generateKeys } from './src/services/nostr.js';

const { pk, sk } = generateKeys();

const activePeerIds = [pk, 'peer2'];
const beaconEvent = {
  kind: 30311,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['d', `bloom-test`],
    ['title', `Bloom Room: test`],
    ['status', 'live'],
    ['t', 'music'],
    ['p', pk, 'host']
  ],
  content: JSON.stringify({ roomId: 'test', activePeerIds, hostPk: pk })
};

const signedBeacon = finalizeEvent(beaconEvent, hexToBytes(sk));
console.log('Signed beacon:', signedBeacon);
