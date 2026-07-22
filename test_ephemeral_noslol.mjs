import { SimplePool, generateSecretKey, finalizeEvent } from 'nostr-tools';

const pool = new SimplePool();
const relays = ['wss://nos.lol'];
const sk = generateSecretKey();

const subPool = new SimplePool();
const sub = subPool.subscribeMany(relays, [{ kinds: [20002] }], {
  onevent(event) {
    console.log('Received ephemeral event:', event.content);
    process.exit(0);
  }
});

setTimeout(() => {
    const eventTemplate = {
      kind: 20002,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['r', 'test_room_123']],
      content: 'hello ephemeral'
    };

    const signed = finalizeEvent(eventTemplate, sk);
    console.log('Publishing ephemeral...');
    pool.publish(relays, signed);
}, 3000);
