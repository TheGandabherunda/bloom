import { SimplePool } from 'nostr-tools';

const pool = new SimplePool();
const relays = ['wss://relay.damus.io', 'wss://nos.lol'];

console.log('Connecting to relays and fetching kind 31337 events...');

const sub = pool.subscribeMany(relays, [{ kinds: [31337], limit: 10 }], {
  onevent(event) {
    console.log('--- FOUND BEACON ---');
    console.log('Created At:', new Date(event.created_at * 1000).toLocaleString());
    console.log('Content:', event.content);
    console.log('Tags:', event.tags);
  },
  oneose() {
    console.log('Eose reached.');
    pool.close(relays);
    process.exit(0);
  }
});
