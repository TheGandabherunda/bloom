import { SimplePool } from 'nostr-tools';

const pool = new SimplePool();
const relays = ['wss://relay.damus.io'];

const sub = pool.subscribeMany(relays, [{ kinds: [1], limit: 1 }], {
  onevent(event) {
    console.log('Received event from damus.io:', event.id);
  },
  oneose() {
    console.log('EOSE received damus');
  }
});
console.log('Sub object keys:', Object.keys(sub));
console.log('Sub object proto:', Object.keys(Object.getPrototypeOf(sub)));
