import { SimplePool, generateSecretKey, finalizeEvent } from 'nostr-tools';

const pool = new SimplePool();
const relays = ['wss://relay.damus.io'];
const sk = generateSecretKey();

const sub = pool.subscribeMany(relays, [{ kinds: [21337] }], {
  onevent(event) {
    console.log('Received ephemeral event:', event.content);
    process.exit(0);
  }
});

setTimeout(() => {
    const eventTemplate = {
      kind: 21337,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: 'hello ephemeral'
    };

    const signed = finalizeEvent(eventTemplate, sk);
    console.log('Publishing ephemeral...');
    pool.publish(relays, signed);
}, 2000);
