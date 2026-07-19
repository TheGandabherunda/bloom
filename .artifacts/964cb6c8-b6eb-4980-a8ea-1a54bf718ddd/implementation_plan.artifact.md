# Implementation Plan - API and P2P Migration to OrbitDB & Monochrome API

Migrate the existing Bloom music/video player from YouTube-based search/playback and PeerJS-based P2P to a Tidal-powered Monochrome API and OrbitDB-based P2P architecture.

## User Review Required

> [!IMPORTANT]
> **API Key/Authentication**: The Monochrome API (`api.monochrome.tf`) documentation mentions that music piracy is illegal and suggests hosting the API yourself with a valid Tidal account. If the public instance requires specific headers or tokens, those must be configured.
>
> **OrbitDB Browser Support**: OrbitDB requires a modern IPFS implementation (Helia). This can be resource-intensive in the browser. We will use Helia with WebRTC transport for browser-to-browser communication.

## Proposed Changes

### [Dependencies]
- Add **Shaka Player** for robust DASH/HLS playback and DRM support.
- Add **Helia** (IPFS) and **OrbitDB** for decentralized room state.

#### [MODIFY] [index.html](file:///A:/Development/Apps/Bloom/index.html)
- Replace PeerJS script with Helia, OrbitDB, and Shaka Player scripts.
- Update UI to handle room naming and group creation more explicitly.

### [API Migration - Monochrome API]
- Switch from YouTube scraping to `api.monochrome.tf`.

#### [MODIFY] [js/search.js](file:///A:/Development/Apps/Bloom/js/search.js)
- Rewrite `performSearch` to use `/search/` endpoint.
- Implement `/recommendations/` for the home screen/initial state.
- Map search results to the existing UI cards (adjusting for Tidal data structure).

#### [MODIFY] [js/media.js](file:///A:/Development/Apps/Bloom/js/media.js)
- Replace YouTube IFrame API with Shaka Player.
- Update `loadVideoInternal` to fetch manifests from `/trackManifests/` and `/widevine` for DRM.
- Implement playback logic for FLAC/AAC/DASH/HLS sources.

### [P2P Migration - OrbitDB]
- Replace PeerJS with OrbitDB-based synchronization.

#### [MODIFY] [js/peer.js](file:///A:/Development/Apps/Bloom/js/peer.js)
- Initialize Helia and OrbitDB.
- Create an `EventLog` or `Key-Value` database for each room.
- Use the room name as a key to discover/connect to the room's database address.
- Sync queue, playback state (time, play/pause), and chat messages via OrbitDB.

#### [MODIFY] [js/state.js](file:///A:/Development/Apps/Bloom/js/state.js)
- Adjust global state to match the new data models from Monochrome API.

### [General App Logic]
#### [MODIFY] [js/app.js](file:///A:/Development/Apps/Bloom/js/app.js)
- Update initialization flow to handle OrbitDB setup.
- Add a "Recommendations" section to the home view as requested.

## Verification Plan

### Automated Tests
- Not applicable for this environment (web project without test runner).

### Manual Verification
- **Search**: Verify that searching returns results from the Monochrome API.
- **Playback**: Verify that tracks play correctly using Shaka Player (including FLAC/DASH).
- **P2P Sync**: Open two browser tabs and verify that joining the same room name syncs the queue and playback state via OrbitDB.
- **Recommendations**: Verify that recommendations are shown on the home screen when not searching.
