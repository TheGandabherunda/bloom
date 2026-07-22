import { SimplePool } from 'nostr-tools';

const pool = new SimplePool();
const relays = ['wss://invalid-relay.com:9999', 'wss://nos.lol'];

console.log('Subscribing to bad and good relay...');
const sub = pool.subscribeMany(relays, [{ kinds: [1], limit: 1 }], {
  onevent(event) {
    console.log('Received event from good relay:', event.id);
    process.exit(0);
  },
  oneose() {
    console.log('EOSE');
  }
});
