import { getPublicKey, finalizeEvent } from 'nostr-tools';
import { hexToBytes } from './src/services/nostr.js';

const DIRECTORY_SK_HEX = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const DIRECTORY_SK = hexToBytes(DIRECTORY_SK_HEX);
const DIRECTORY_PK = getPublicKey(DIRECTORY_SK);

console.log('DIRECTORY_PK:', DIRECTORY_PK);

const beaconEvent = {
  kind: 30000,
  created_at: Math.floor(Date.now() / 1000),
  tags: [['d', `lobby-test`]],
  content: "test"
};
const signedBeacon = finalizeEvent(beaconEvent, DIRECTORY_SK);
console.log('signedBeacon pubkey:', signedBeacon.pubkey);
