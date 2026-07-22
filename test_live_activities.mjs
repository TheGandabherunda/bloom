import { SimplePool } from 'nostr-tools';

const pool = new SimplePool();
const relays = ['wss://nos.lol', 'wss://relay.damus.io', 'wss://relay.nostr.band'];

console.log('Fetching NIP-53 Live Activities (kind 30311)...');

pool.subscribeMany(relays, [{ kinds: [30311], limit: 5 }], {
  onevent(event) {
    console.log('\n--- Live Activity ---');
    console.log('ID:', event.id);
    console.log('Pubkey:', event.pubkey);
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
