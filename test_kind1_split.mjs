import { SimplePool, generateSecretKey, finalizeEvent } from 'nostr-tools';

const pool = new SimplePool();
const relays = ['wss://nos.lol'];
const sk = generateSecretKey();

// Connection 1 (Subscriber)
const subPool = new SimplePool();
const sub = subPool.subscribeMany(relays, [{ kinds: [1], '#t': ['bloom_test_party'], limit: 10 }], {
  onevent(event) {
    console.log('Subscriber received event:', event.content);
    process.exit(0);
  }
});

setTimeout(() => {
    const eventTemplate = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', 'bloom_test_party']],
      content: 'hello bloom party from publisher'
    };

    const signed = finalizeEvent(eventTemplate, sk);
    console.log('Publishing kind 1 with tag bloom_test_party...');
    pool.publish(relays, signed);
}, 3000);
