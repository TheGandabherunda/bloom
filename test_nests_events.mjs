import { SimplePool } from 'nostr-tools';

const pool = new SimplePool();
const relays = ['wss://nos.lol', 'wss://relay.damus.io'];

console.log('Fetching recent events from Nostr Nests...');

// Let's see what Nostr Nests actually publishes
pool.subscribeMany(relays, [{ limit: 20, '#t': ['nostrnests'] }], {
  onevent(event) {
    console.log('\n--- Nostr Nests Event ---');
    console.log('ID:', event.id);
    console.log('Kind:', event.kind);
    console.log('Content:', event.content);
    console.log('Tags:');
    event.tags.forEach(t => console.log('  ', t));
  },
  oneose() {
    console.log('\n[EOSE] Finished fetching.');
    pool.close(relays);
    process.exit(0);
  }
});
