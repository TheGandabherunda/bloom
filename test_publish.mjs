import { SimplePool, generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';

const pool = new SimplePool();
const relays = ['wss://relay.damus.io', 'wss://nos.lol'];
const sk = generateSecretKey();

const eventTemplate = {
  kind: 30000,
  created_at: Math.floor(Date.now() / 1000),
  tags: [['d', 'beacon-test-123'], ['r', 'test-123']],
  content: JSON.stringify({ hello: 'world' })
};

const signed = finalizeEvent(eventTemplate, sk);
console.log('Publishing event...', signed);

try {
    const pubs = pool.publish(relays, signed);
    const results = await Promise.allSettled(pubs);
    console.log('Publish results:', results);
} catch (e) {
    console.error('Publish error:', e);
}

await new Promise(r => setTimeout(r, 2000));

const sub = pool.subscribeMany(relays, [{ kinds: [30000], limit: 10, '#d': ['beacon-test-123'], since: 0 }], {
  onevent(event) {
    console.log('Found it:', event.content);
  },
  oneose() {
    console.log('EOSE');
    process.exit(0);
  }
});
