# Bloom — Project Rules for Antigravity

## Project Identity

Bloom is a **decentralized P2P music player** built with:
- **Frontend**: React 18 + Vite 6 + **TailwindCSS v3** (already installed — always use Tailwind)
- **Styling**: `index.css` for custom classes + Tailwind utility classes in JSX
- **P2P Layer**: libp2p + Helia (IPFS) + OrbitDB
- **Backend**: Netlify serverless functions (ESM, Node 20, esbuild bundler)
- **Dev Server**: `netlify dev` (NOT `npm run dev`) — required to proxy serverless functions locally
- **Audio**: `CustomAudioPlayer` (`src/services/CustomAudioPlayer.js`) — wraps a single `<audio>` element + WebAudio API analyser

---

## Critical Rules

### 1. Styling — Always Use TailwindCSS
- This project uses **TailwindCSS v3** (`tailwind.config.js`). Always use Tailwind utility classes for layout, spacing, color, etc.
- Only write to `src/index.css` for things Tailwind cannot handle: complex CSS animations (`@keyframes`), `::before`/`::after` pseudo-elements, CSS custom properties (`--color-1`, etc.), and global resets.
- **Never** write inline `style={{}}` for anything that can be expressed as a Tailwind class.
- Color palette: `slate-*` = grays (custom grayscale from `#ffffff` to `#000000`), `pink-*` = primary accent (dynamically driven by CSS vars from album art). Always prefer these over generic Tailwind colors.

### 2. Audio — Never Bypass `CustomAudioPlayer`
- All audio operations go through `CustomAudioPlayer` in `src/services/CustomAudioPlayer.js`.
- Never create a standalone `new Audio()` element elsewhere — doing so breaks the WebAudio analyser graph and causes distortion.
- Frequency data for the visualizer is fetched via `playerRef.current.getFrequencyData()` (returns `Uint8Array`).
- The audio pipeline is: `audio element -> MediaElementSource -> [destination (speakers)] + [analyser -> muteGain -> destination]`.

### 3. State — Context Architecture
- **`PlaybackContext`** owns all playback state: `currentTrack`, `queue`, `isPlaying`, `currentTime`, `duration`, `volume`, `isShuffled`, `isRepeat`, `isExpanded`. Import via `usePlayback()`.
  - The `queue` and `originalQueue` MUST be synchronized over OrbitDB via `stateDb`. Do not treat them as local state.
- **`OrbitContext`** owns all P2P state: `stateDb`, `chatDb`, `peerId`, `peers`, `peerNames`, `peerRoles`, `status`. Import via `useOrbit()`.
  - Maintains a silent `<audio loop>` in the background starting from room join to keep the tab active and bypass browser background-throttling of JS/WebAudio.
- Do **not** lift state above these providers or duplicate state elsewhere. If a component needs playback info, it must consume `usePlayback()`.
- Use `useRef` for values needed inside OrbitDB event listeners to avoid stale closures (see `isPlayingRef`, `currentTrackRef`, `peerRolesRef` patterns).

### 4. P2P Sync — Security & Reconnection
- Only peers with role `'owner'` or `'admin'` can mutate playback state or the `queue` in the OrbitDB `stateDb`.
- When writing to `stateDb`, always include `originator: peerId` in the value object.
- When handling OrbitDB `update` events, always skip updates where `originator === peerId` (deduplication).
- Chat system messages dispatched locally must use `window.dispatchEvent(new CustomEvent('bloom:chat-message', { detail: msg }))` in addition to writing to `chatDb`.
- **Reconnection/Discovery:** The Host must proactively push a `fullSyncAction` to any peer that triggers `room.onPeerJoin`, ensuring peers who reconnect or manually type the room code receive the room state.
- **Host Recovery:** The Host reclaims their status on refresh by checking `sessionStorage.getItem('bloom_host_${roomId}')`.

### 5. Netlify Functions — Serverless Backend
- All functions live in `netlify/functions/` and use ESM (`export const handler = async (event) => {}`).
- API routes are defined in `netlify.toml` as redirects. When adding a new function, add its redirect to `netlify.toml`.
- The `audio-playlist` function has a 26s timeout — do not reduce it.
- Never add secrets or API keys directly to function code; use Netlify environment variables.
- Dev server: **`netlify dev`** — never suggest `npm run dev` for local development.

### 6. Track Data Shape
Every track object used in playback must have these fields:
```js
{
  id: string,          // Unique audio ID
  title: string,
  author: string,
  thumbnail: string,   // URL to album art
  duration: number,    // seconds
  downloadUrl: string  // direct audio stream URL
}
```
- `downloadUrl` is resolved by the `audio-stream` Netlify function and must be present before calling `loadTrack()`.

### 7. Animations & Performance
- CSS animations that run continuously (blobs, `rotate-slow`, `audio-mode::before`) must be declared with `will-change: transform` and `animation-play-state: paused` by default — only `running` when audio is active.
- Always respect `@media (prefers-reduced-motion: reduce)` — this is already in `index.css`; new animations must add their selector there too.
- Visualizer canvas redraws must use `requestAnimationFrame` and cancel the frame on component unmount via `cancelAnimationFrame`.

### 8. Icons
- This project uses **Google Material Symbols Rounded** (loaded via `<link>` in `index.html`) — use `<span className="material-symbols-rounded">icon_name</span>`.
- Also has `lucide-react` installed — use for icons not available in Material Symbols.
- Never use emoji as icons in UI.

### 9. Scrollbars & Overflow
- Panels that scroll must use the `no-scrollbar` class (`src/index.css`) to hide native scrollbars.
- The app root is `overflow: hidden` at 100dvh — all scrollable regions must be contained inside fixed-height flex children.

### 10. OrbitDB / Helia — Initialization
- P2P initialization (`initP2P`) is guarded by `initializingRef` and `statusRef` to prevent duplicate calls — never bypass these guards.
- IDB stores are keyed by `roomId`: `bloom/blocks/${roomId}` and `bloom/data/${roomId}` — do not change this naming scheme.
- OrbitDB databases: `${roomId}-state` (keyvalue) and `${roomId}-chat` (events).

### 11. Repository Cleanliness
- Do not leave temporary test files (`test_*.js`, `.png` dumps, `playlist_info.json`) or standalone binaries (`yt-dlp.exe`) in the project root.
- Clean up any scratch scripts or API testing scripts before committing.

---

## File Structure Reference

```
src/
  App.jsx                    # Root — RoomSetup -> Layout routing
  main.jsx                   # React DOM entry
  index.css                  # Global styles, animations, custom classes
  components/
    Layout.jsx               # Main shell: sidebar, player panel, content area
    Player.jsx               # Full-screen expanded player + visualizer
    Queue.jsx                # Queue management panel
    Search.jsx               # Search input + results
    TrackCard.jsx            # Reusable track list item
    Lyrics.jsx               # Synchronized lyrics display
    Chat.jsx                 # P2P room chat
    PeersList.jsx            # Connected peers panel
    Sidebar.jsx              # Navigation sidebar
    RoomSetup.jsx            # Initial room join/create screen
    Skeleton.jsx             # Shimmer skeleton loaders
    GifPicker.jsx            # GIF picker for chat
  context/
    PlaybackContext.jsx      # All audio/playback state
    OrbitContext.jsx         # All P2P/OrbitDB state
  services/
    CustomAudioPlayer.js     # WebAudio pipeline class
    musicApi.js         # API service layer (search, stream resolution)
  utils/                     # Utility functions
netlify/
  functions/                 # Serverless API functions
    audio-search.js
    audio-stream.js
    audio-playlist.js
    audio-recommend.js
    audio-resolve.js
    audio-image.js
    lyrics.js
```

---

## Dev Commands

| Task | Command |
|---|---|
| Start local dev server | `netlify dev` |
| Build for production | `npm run build` |
| Lint | `npm run lint` |
| Preview production build | `npm run preview` |
