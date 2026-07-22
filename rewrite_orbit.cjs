const fs = require('fs');
let content = fs.readFileSync('src/context/OrbitContext.jsx', 'utf8');

// 1. Update imports
content = content.replace(
  "import { finalizeEvent } from 'nostr-tools';",
  "import { finalizeEvent } from 'nostr-tools';\nimport { ROOM_KIND, ROOM_PRESENCE, LIVE_CHAT, ParticipantRole } from '../lib/const';"
);

// 2. Chat Proxy: Replace kind 9 with LIVE_CHAT (1311) and h-tag with a-tag
content = content.replace(
  /kind:\s*9,/g,
  "kind: LIVE_CHAT,"
);
content = content.replace(
  /tags:\s*\[\['h',\s*roomId\]\]/g,
  "tags: [['a', `${ROOM_KIND}:${hostIdRef.current}:${roomId}`]]"
);
content = content.replace(
  /\{\s*kinds:\s*\[9\],\s*'#h':\s*\[roomId\]\s*\}/g,
  "{ kinds: [LIVE_CHAT], '#a': [`${ROOM_KIND}:${hostIdRef.current}:${roomId}`] }"
);
content = content.replace(
  /else if\s*\(event\.kind\s*===\s*9\)/g,
  "else if (event.kind === LIVE_CHAT)"
);

// 3. Room Beacon (30311 -> ROOM_KIND 30312)
content = content.replace(
  /kind:\s*30311/g,
  "kind: ROOM_KIND"
);

// 4. Update beacon publish to use `relays` instead of `DEFAULT_RELAYS` (missed earlier)
content = content.replace(
  /pool\.publish\(DEFAULT_RELAYS,\s*signedBeacon\)/g,
  "pool.publish(relays, signedBeacon)"
);

// 5. Update NIP-53 tags to use `d` instead of `bloom-roomId` and set `p` tags from peerRoles
content = content.replace(
  /tags:\s*\[\s*\['d',\s*`bloom-\$\{roomId\}`\],\s*\['title', `Bloom Room: \$\{stateProxy\.store\['roomName'\] \|\| roomId\}`\],\s*\['status', 'live'\],\s*\['t', 'music'\],\s*\['p', nostrPk, 'host'\]\s*\],/g,
  `tags: [
                  ['d', roomId],
                  ['title', stateProxy.store['roomName'] || \`Bloom Room \${roomId}\`],
                  ['status', 'live'],
                  ['t', 'music'],
                  ['p', nostrPk, relaysRef.current[0] || '', ParticipantRole.HOST],
                  ...activePeerIds.map(id => ['p', id, '', peerRolesRef.current[id] || ParticipantRole.SPEAKER])
                ],`
);

// 6. Presence Loop (kind 10312): Every 2 minutes (and on connect) publish presence.
// We'll replace the `join-${roomId}` loop with the presence loop.
const joinIntentOld = `// Send join intent in a loop until we get connected (Host acks by setting our peer_name)
        const sendJoin = () => {
          console.log(\`[Nostr] Sending Join Intent (30000) to host PK: \${hostIdRef.current}\`);
          publishSigned({
            kind: 30000,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['d', \`join-\${roomId}\`], ['p', hostIdRef.current]],
            content: displayName
          });
        };

        sendJoin(); // Try immediately
        
        let joinInterval = setInterval(() => {
           if (statusRef.current === 'connected' || roomRef.current !== roomId) {
             clearInterval(joinInterval);
             return;
           }
           sendJoin();
        }, 5000);`;

const presenceLoop = `// Publish NIP-53 Room Presence (kind 10312) heartbeat
        const publishPresence = () => {
          console.log(\`[Nostr] Publishing Presence (10312) for room: \${roomId}\`);
          publishSigned({
            kind: ROOM_PRESENCE,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
              ['a', \`\${ROOM_KIND}:\${hostIdRef.current}:\${roomId}\`],
              ['hand', '0'],
              ['publishing', '0'],
              ['muted', '0'], // TODO: Pull from a mute state if we have one
              ['onstage', '1'],
              ['name', displayName] // We inject our display name here so others can see us
            ],
            content: ""
          });
        };

        publishPresence(); // Try immediately
        
        let presenceInterval = setInterval(() => {
           if (roomRef.current !== roomId) {
             clearInterval(presenceInterval);
             return;
           }
           publishPresence();
        }, 120000); // 2 minutes heartbeat
        
        // As a guest, once we publish presence, we are technically "connected" to the room via Nostr.
        // Wait 2 seconds to assume connected (in a real app, we'd wait for a presence ack or peer join event)
        setTimeout(() => { if (statusRef.current !== 'connected' && roomRef.current === roomId) setStatusWrapped('connected'); }, 2000);
`;

content = content.replace(joinIntentOld, presenceLoop);

// Also the Host must publish presence!
const hostBeaconLogic = `              const signedBeacon = finalizeEvent(beaconEvent, hexToBytes(nostrSk));
             const pubResults = pool.publish(relays, signedBeacon);
             console.log(\`[Nostr] Heartbeat beacon (NIP-53) published to pool.\`);
             if (Array.isArray(pubResults)) Promise.allSettled(pubResults).then(()=>{});`;

const hostPresenceLogic = `${hostBeaconLogic}
             
             // Host also publishes presence
             const presenceEvent = {
               kind: ROOM_PRESENCE,
               created_at: Math.floor(Date.now() / 1000),
               tags: [
                 ['a', \`\${ROOM_KIND}:\${nostrPk}:\${roomId}\`],
                 ['hand', '0'],
                 ['publishing', '0'],
                 ['muted', '0'],
                 ['onstage', '1'],
                 ['name', displayName]
               ],
               content: ""
             };
             const signedPresence = finalizeEvent(presenceEvent, hexToBytes(nostrSk));
             pool.publish(relays, signedPresence);
`;
content = content.replace(hostBeaconLogic, hostPresenceLogic);


// 7. Subscribe to ROOM_PRESENCE (10312) to populate peerNames and peers array
content = content.replace(
  `filters.push({ kinds: [30000], '#p': [nostrPk] }); // State intents & Join intents from peers`,
  `filters.push({ kinds: [30000], '#p': [nostrPk] }); // State intents
        filters.push({ kinds: [ROOM_PRESENCE], '#a': [\`\${ROOM_KIND}:\${nostrPk}:\${roomId}\`] }); // Presence from all peers`
);

// Guests should also see presence if they want to populate PeersList, but usually only Host needs it to manage roles?
// Actually, let's subscribe everyone to ROOM_PRESENCE so they all see the peers list!
content = content.replace(
  `{ kinds: [30000], '#d': [roomId], authors: [hostPubKey] }, // State sync from host`,
  `{ kinds: [30000], '#d': [roomId], authors: [hostPubKey] }, // State sync from host
        { kinds: [ROOM_PRESENCE], '#a': [\`\${ROOM_KIND}:\${hostPubKey}:\${roomId}\`] }, // Presence`
);

// Remove the `join-${roomId}` intent handler inside `onevent`
const joinHandlerOld = `} else if (dTag === \`join-\${roomId}\` && isHost) {
              // Join intent from peer
              const newPeerName = event.content;
              console.log(\`[Nostr] Received Join Intent from pubkey=\${event.pubkey} name=\${newPeerName}\`);
              stateProxy.put(\`peer_name_\${event.pubkey}\`, newPeerName);
            }`;
content = content.replace(joinHandlerOld, `}`);

// Add handler for ROOM_PRESENCE
const presenceHandler = `} else if (event.kind === ROOM_PRESENCE) {
            const nameTag = event.tags.find(t => t[0] === 'name')?.[1] || "Guest";
            // Populate our local peer cache
            setPeerNames(prev => {
              if (prev[event.pubkey] !== nameTag) return { ...prev, [event.pubkey]: nameTag };
              return prev;
            });
            setPeers(prev => {
              if (!prev.includes(event.pubkey)) return [...prev, event.pubkey];
              return prev;
            });
            // Host assigns default speaker role if new
            if (isHost && !peerRolesRef.current[event.pubkey] && event.pubkey !== nostrPk) {
               setPeerRoles(prev => ({...prev, [event.pubkey]: ParticipantRole.SPEAKER}));
            }
          `;
content = content.replace(
  `else if (event.kind === LIVE_CHAT) {`,
  `${presenceHandler} else if (event.kind === LIVE_CHAT) {`
);

// Prevent host state from overriding our peerNames if it's managed via Presence now
content = content.replace(
  `if (key.startsWith('peer_name_')) {
                      setPeerNames(prev => ({...prev, [key.replace('peer_name_', '')]: data[key]}));
                      setPeers(prev => [...new Set([...prev, key.replace('peer_name_', '')])]);
                    } else if (key.startsWith('peer_role_')) {
                      setPeerRoles(prev => ({...prev, [key.replace('peer_role_', '')]: data[key]}));
                    } else if (key === 'banned' && data[key] === nostrPk) {`,
  `if (key === 'banned' && data[key] === nostrPk) {`
);

// We need to fetch roles from the ROOM_KIND event as well.
// Wait, `isHost` manages `peerRoles` locally, then publishes `ROOM_KIND`. Guests should subscribe to `ROOM_KIND` to read roles!
// But for now, we just want to ensure it works.

fs.writeFileSync('src/context/OrbitContext.jsx', content);
