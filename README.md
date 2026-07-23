# Bloom 🌸

A beautiful, GPU-accelerated, decentralized P2P music player built with React and WebRTC.

## ✨ Features
- **P2P Listening Rooms**: Listen to music perfectly in sync with friends using OrbitDB, WebRTC, and IPFS (no central server required!).
- **Flawless HD Audio**: Features a custom-built dual-audio pipeline that bypasses notorious browser WebAudio engine bugs to deliver distortion-free, gapless 320kbps playback.
- **Professional Visualizations**: A real-time, DAW-grade spectrum analyzer. Maps frequencies into precise logarithmic octaves with peak-extraction for razor-sharp transient response.
- **GPU-Accelerated UI**: Buttery smooth shimmer skeleton loaders, glassmorphism, and hardware-accelerated animations that won't block the main thread.
- **Git-Hosted & Zero-Config Deployment**: The project is primarily hosted on a Git repository. It features a zero-config serverless proxy backend built for Netlify, allowing the frontend to be easily deployed from the repository.

## 🛠️ Tech Stack
- **Frontend**: React 18, Vite 6, TailwindCSS v3
- **Decentralization**: libp2p, Helia, OrbitDB
- **Backend/Proxy**: Netlify Functions (Serverless, ESM, Node 20)

## 🏗️ Latest Implementation

- **Frontend Styling**: Uses Tailwind utility classes primarily, paired with `src/index.css` for complex CSS animations, variables, and global resets.
- **Audio Pipeline**: Centralized within `CustomAudioPlayer` (`src/services/CustomAudioPlayer.js`). It leverages the WebAudio API with a `MediaElementSource` routing through an analyzer and mute gain before reaching the destination.
- **Context Architecture**: 
  - `PlaybackContext`: Manages all audio playback state (`currentTrack`, `queue`, `isPlaying`, `currentTime`, `duration`, `volume`, etc.).
  - `OrbitContext`: Owns P2P state (`stateDb`, `chatDb`, `peerId`, `peers`, `status`). It uses a silent background audio loop to bypass browser background throttling of WebAudio and JS execution.
- **P2P Sync**: Real-time state synchronization across peers is driven by OrbitDB via `stateDb`. Host proactively full-syncs state with joining peers to resolve reconnections.

## ⚠️ Cautions

- **Never bypass `CustomAudioPlayer`**: Creating a standalone `new Audio()` element breaks the WebAudio analyser graph and causes distortion. Always route audio through `CustomAudioPlayer`.
- **State Deduplication**: When writing to `stateDb`, always include `originator: peerId` in the payload. When handling OrbitDB `update` events, ensure you skip updates where `originator === peerId`.
- **Serverless API Timeout**: Netlify functions, specifically `audio-playlist`, have a hard timeout limit of 26 seconds.
- **P2P Initialization Guards**: `initP2P` is tightly guarded by `initializingRef` and `statusRef` to prevent duplicate initialization. Never bypass these guards.
- **Animations**: Continuously running CSS animations must use `will-change: transform` and remain `paused` by default unless audio is playing, respecting the user's `prefers-reduced-motion` settings.



## ⚖️ Disclaimer & Copyright Notice

**Important Legal Information:**
Bloom is strictly an educational open-source project. It functions solely as a specialized web interface and client-side search tool.

- **No Content Hosted:** This repository, application, and its developers **do not** host, upload, database, or store any copyrighted audio, video, media files, or metadata.
- **No Copyright Ownership:** The developers of Bloom do not own or claim the copyrights to any music, album art, lyrics, or metadata displayed within the application. All rights belong to their respective original creators and copyright holders.
- **API Aggregation:** The application acts purely as a passthrough interface that formats user queries and proxies them to publicly accessible third-party APIs on the internet. 
- **Personal Use:** This tool is provided "as is" for personal, educational, and non-commercial use only. The developers hold no liability for how end-users choose to utilize this software. 

By running or deploying this software, you agree that you are solely responsible for complying with all applicable copyright and digital media laws in your jurisdiction.
