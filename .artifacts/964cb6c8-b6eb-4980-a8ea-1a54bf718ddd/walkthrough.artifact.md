# Walkthrough - Bloom Migration to Monochrome & OrbitDB

The Bloom media player has been migrated to a modern, decentralized architecture using the **Monochrome API** for high-fidelity audio and **OrbitDB** for peer-to-peer synchronization.

## Key Changes

### 1. High-Fidelity Audio Engine
- **Shaka Player Integration**: Replaced the YouTube IFrame API with Shaka Player, enabling support for DASH/HLS streaming and high-quality formats (FLAC/AAC).
- **Format Support**: Added explicit support for `HI_RES_LOSSLESS`, `LOSSLESS`, `HIGH`, and `LOW` qualities.
- **Adaptive Bitrate**: The player now uses Tidal's track manifests for optimized playback.
- **Quality Selector**: A new UI component allows users to manually select their preferred audio quality.

### 2. Decentralized P2P Synchronization
- **OrbitDB & Helia**: Replaced PeerJS with a decentralized database layer. Bloom now uses an IPFS-backed Key-Value store for room state and an EventLog for chat.
- **Room Persistence**: Rooms are now identified by their name, and discovery is handled via the IPFS swarm.
- **No Signaling Server Required**: Synchronization is truly peer-to-peer, reducing reliance on centralized infrastructure.

### 3. Monochrome API Integration
- **Tidal-Powered Search**: Search results are now sourced from Tidal via the Monochrome API.
- **Smart Recommendations**: The home screen now displays recommendations on startup, giving users something to play without needing to search.
- **DRM Support**: Integrated with the Widevine proxy for playback of protected content.

## How to Test
1. **Open Bloom**: Notice the "Loading recommendations..." state on the home screen.
2. **Search**: Enter a track or artist. You will see high-quality results with format badges (Hi-Res/Lossless).
3. **P2P Sync**: Open the same room ID in another tab. Chat and playback will stay in sync via OrbitDB.
4. **Quality**: Use the quality selector (top-right of controls on desktop) to switch between formats.

> [!NOTE]
> High-fidelity formats (Hi-Res/Lossless) require a compatible browser and network speed. Shaka Player will automatically adapt based on your conditions.

> [!WARNING]
> Widevine DRM playback might be restricted by browser settings or the API's current token status.
