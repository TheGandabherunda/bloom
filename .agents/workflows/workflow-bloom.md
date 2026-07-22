---
description: 
---

# Bloom — Workflow Prompt

> Paste this at the **start of a new chat session** when working on Bloom.

---

## What is Bloom?

Bloom is a **decentralized, GPU-accelerated P2P music player** built with:

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 6 |
| Styling | TailwindCSS v3 + custom `src/index.css` |
| P2P Sync | libp2p + Helia (IPFS) + OrbitDB |
| Audio | Custom `CustomAudioPlayer` (WebAudio API) |
| Backend | Netlify Serverless Functions (ESM, Node 20) |
| Icons | Google Material Symbols Rounded + lucide-react |
| Fonts | Inter (via Google Fonts) |

**Always start `netlify dev`, not `npm run dev`**, since serverless functions must run locally.

---

## Architecture in 60 Seconds

### Two Contexts

- **`PlaybackContext`** (`src/context/PlaybackContext.jsx`) — owns everything audio: `currentTrack`, `queue`, `isPlaying`, `currentTime`, `duration`, `volume`, `isShuffled`, `isRepeat`, `isExpanded`, `playerRef`. Access via `usePlayback()`.
- **`OrbitContext`** (`src/context/OrbitContext.jsx`) — owns all P2P: `stateDb`, `chatDb`, `peerId`, `peers`, `peerNames`, `peerRoles`, `status`, `initP2P`, `stopP2P`. Access via `useOrbit()`.

### Audio Pipeline

```
<audio> element
  └─> MediaElementSource
        ├─> audioContext.destination   (speakers)
        └─> analyser
              └─> muteGain (0) ─> destination  (visualizer tap, silent)
```

All audio goes through `CustomAudioPlayer` in `src/services/CustomAudioPlayer.js`.  
Get visualizer data via `playerRef.current.getFrequencyData()` → `Uint8Array`.  
**Never** create a standalone `new Audio()` elsewhere — it breaks the WebAudio graph.

### P2P Security Model

- OrbitDB `stateDb` is writable only by `owner` or `admin` roles.
- Every write includes `originator: peerId`.
- Every `update` event handler skips `originator === peerId` (deduplication).
- Chat system messages: dispatch `bloom:chat-message` CustomEvent locally AND write to `chatDb`.

### Track Data Shape

```js
{
  id: string,           // Unique audio ID
  title: string,
  author: string,
  thumbnail: string,    // album art URL
  duration: number,     // seconds
  downloadUrl: string   // direct audio stream (from audio-stream function)
}
```

---

## Styling Conventions

1. **Use Tailwind utility classes** for all layout, spacing, colors, and typography.
2. **Only write to `src/index.css`** for: `@keyframes`, `::before`/`::after`, CSS custom properties (`--color-1` etc.), and global resets.
3. **Color tokens**: `slate-*` for grays, `pink-*` for primary accent (driven by CSS vars from album art).
4. **Never** use inline `style={{}}` if a Tailwind class can do it.
5. **Scrollable panels** must use the `no-scrollbar` class.
6. **New continuous animations** must add their selector to the `@media (prefers-reduced-motion: reduce)` block in `index.css`.

---

## Netlify Functions

- Located in `netlify/functions/` — ESM format (`export const handler = async (event) => {}`)
- Routes defined as `[[redirects]]` entries in `netlify.toml`
- **Adding a new function?** → also add a redirect to `netlify.toml`
- Secrets go in Netlify environment variables, never in code

### Existing endpoints

| Route | Function | Purpose |
|---|---|---|
| `/api/audio/search` | `audio-search.js` | Audio search |
| `/api/audio/stream/:id` | `audio-stream.js` | Resolve audio stream URL |
| `/api/audio/playlist` | `audio-playlist.js` | Fetch playlist (26s timeout) |
| `/api/audio/recommend` | `audio-recommend.js` | Recommendations |
| `/api/audio/resolve` | `audio-resolve.js` | Resolve URL to ID |
| `/api/audio/image` | `audio-image.js` | Image proxy |
| `/api/lyrics` | `lyrics.js` | Lyrics fetch |

---

## Components at a Glance

| File | Role |
|---|---|
| `App.jsx` | Root: gate between `RoomSetup` and `Layout` |
| `Layout.jsx` | Main shell — sidebar + player panel + content |
| `Player.jsx` | Expanded full-screen player + spectrum visualizer |
| `Queue.jsx` | Queue management |
| `Search.jsx` | Search bar + results |
| `TrackCard.jsx` | Reusable track row |
| `Lyrics.jsx` | Synced lyrics with `lyric-active` animation |
| `Chat.jsx` | P2P room chat (uses `bloom:chat-message` events) |
| `PeersList.jsx` | Connected peers display |
| `RoomSetup.jsx` | Room join/create screen |
| `Skeleton.jsx` | Shimmer skeleton loaders (use `.shimmer` class) |
| `GifPicker.jsx` | GIF picker for chat |

---

## Task Workflow — Follow This Before Writing Code

```
1. READ   → Identify which files are relevant to this task
2. CHECK  → Confirm existing patterns (context hooks, CSS classes, icon names)
3. PLAN   → Describe the change and which files will be touched
4. CODE   → Write the change, following all rules above
5. VERIFY → Does it use usePlayback()/useOrbit()? Tailwind classes? CustomAudioPlayer?
            Are animations reduced-motion safe? Is the track shape correct?
```

> **Reminder**: When in doubt about the audio pipeline or P2P sync behavior,
> read `CustomAudioPlayer.js` and `PlaybackContext.jsx` first — they contain
> important gotchas about stale closures, watchdog timers, and OrbitDB deduplication.
