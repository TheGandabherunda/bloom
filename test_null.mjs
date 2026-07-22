import { SimplePool } from 'nostr-tools';

const pool = new SimplePool();
const relays = ['wss://relay.damus.io'];

console.log('Subscribing with authors: [null] ...');
pool.subscribeMany(relays, [{ kinds: [1], authors: [null], limit: 1 }], {
  onevent(event) {
    console.log('Received event from damus.io:', event.id);
  },
  oneose() {
    console.log('EOSE received damus');
  }
});
