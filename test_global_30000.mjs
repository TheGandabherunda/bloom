import { SimplePool, generateSecretKey, finalizeEvent } from 'nostr-tools';

const pool = new SimplePool();
const relays = ['wss://nos.lol'];
const sk = generateSecretKey();

const subPool = new SimplePool();
const sub = subPool.subscribeMany(relays, [{ kinds: [30000], '#d': ['bloom_lobby_test'], limit: 10 }], {
  onevent(event) {
    console.log('Received global 30000 event:', event.content);
    process.exit(0);
  }
});

setTimeout(() => {
    const eventTemplate = {
      kind: 30000,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', 'bloom_lobby_test']],
      content: 'hello lobby'
    };

    const signed = finalizeEvent(eventTemplate, sk);
    console.log('Publishing 30000...');
    pool.publish(relays, signed);
}, 3000);
