import { SimplePool, generateSecretKey, getPublicKey, finalizeEvent, nip04 } from 'nostr-tools';

const pool = new SimplePool();
const relays = ['wss://nos.lol'];
const senderSk = generateSecretKey();
const senderPk = getPublicKey(senderSk);
const receiverSk = generateSecretKey();
const receiverPk = getPublicKey(receiverSk);

const subPool = new SimplePool();
const sub = subPool.subscribeMany(relays, [{ kinds: [4], '#p': [receiverPk] }], {
  async onevent(event) {
    const decrypted = await nip04.decrypt(receiverSk, event.pubkey, event.content);
    console.log('Received DM:', decrypted);
    process.exit(0);
  }
});

setTimeout(async () => {
    const text = 'hello dm';
    const encrypted = await nip04.encrypt(senderSk, receiverPk, text);
    const eventTemplate = {
      kind: 4,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', receiverPk]],
      content: encrypted
    };

    const signed = finalizeEvent(eventTemplate, senderSk);
    console.log('Publishing DM...');
    pool.publish(relays, signed);
}, 3000);
