import { SimplePool, generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';

const pool = new SimplePool();
const relays = ['wss://relay.damus.io', 'wss://nos.lol'];
const sk = generateSecretKey();

const sub = pool.subscribeMany(relays, [{ kinds: [1], '#t': ['bloom_party'], limit: 5 }], {
  onevent(event) {
    console.log('Received bloom party event:', event.content);
    process.exit(0);
  }
});

setTimeout(() => {
    const eventTemplate = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', 'bloom_party']],
      content: 'hello bloom party'
    };

    const signed = finalizeEvent(eventTemplate, sk);
    console.log('Publishing kind 1 with tag bloom_party...');
    pool.publish(relays, signed);
}, 2000);
