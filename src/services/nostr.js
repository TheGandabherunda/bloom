import { SimplePool, generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';

export const bytesToHex = (bytes) => bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
export const hexToBytes = (hex) => new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

export const pool = new SimplePool();

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net'
];

export const getOrCreateKeys = () => {
  let privKeyHex = localStorage.getItem('bloom_nsec_hex');
  if (!privKeyHex) {
    const sk = generateSecretKey();
    privKeyHex = bytesToHex(sk);
    localStorage.setItem('bloom_nsec_hex', privKeyHex);
  }
  const sk = hexToBytes(privKeyHex);
  const pk = getPublicKey(sk);
  return { sk, pk, privKeyHex };
};

export const signEvent = (eventTemplate, sk) => {
  return finalizeEvent(eventTemplate, sk);
};
