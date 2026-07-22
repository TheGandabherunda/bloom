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

export const getUserRelays = async () => {
  let userRelays = [...DEFAULT_RELAYS];
  const isExtension = !!localStorage.getItem('bloom_nip07');
  
  if (isExtension && window.nostr && window.nostr.getRelays) {
    try {
      const extRelays = await window.nostr.getRelays();
      if (extRelays && Object.keys(extRelays).length > 0) {
        const activeExtRelays = Object.keys(extRelays).filter(r => extRelays[r].read || extRelays[r].write);
        if (activeExtRelays.length > 0) {
          userRelays = activeExtRelays;
        }
      }
    } catch(e) {
      console.warn('[Nostr] Failed to fetch relays from extension:', e);
    }
  }
  return userRelays;
};

export const signEvent = (eventTemplate, sk) => {
  return finalizeEvent(eventTemplate, sk);
};
