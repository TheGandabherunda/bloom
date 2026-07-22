import { SimplePool } from 'nostr-tools';

const pool = new SimplePool();
const relays = ['wss://relay.damus.io'];

console.log('Fetching...');

const sub = pool.subscribeMany(relays, [{ kinds: [30000], limit: 5 }], {
  onevent(event) {
    console.log('Found it:', event.id, event.tags);
  },
  oneose() {
    console.log('EOSE');
    process.exit(0);
  }
});
