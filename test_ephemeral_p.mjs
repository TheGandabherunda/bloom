import { SimplePool, generateSecretKey, finalizeEvent, getPublicKey } from 'nostr-tools';

const pool = new SimplePool();
const relays = ['wss://nos.lol'];
const sk = generateSecretKey();
const pk = getPublicKey(sk);

const subPool = new SimplePool();
const sub = subPool.subscribeMany(relays, [{ kinds: [20002], '#p': [pk] }], {
  onevent(event) {
    console.log('Received ephemeral event via #p:', event.content);
    process.exit(0);
  }
});

setTimeout(() => {
    const eventTemplate = {
      kind: 20002,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', pk]],
      content: 'hello ephemeral'
    };

    const signed = finalizeEvent(eventTemplate, generateSecretKey());
    console.log('Publishing ephemeral...');
    pool.publish(relays, signed);
}, 3000);
