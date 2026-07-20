# Bloom 🌸

A beautiful, GPU-accelerated, decentralized P2P music player built with React and WebRTC.

## ✨ Features
- **P2P Listening Rooms**: Listen to music perfectly in sync with friends using OrbitDB, WebRTC, and IPFS (no central server required!).
- **Flawless HD Audio**: Features a custom-built dual-audio pipeline that bypasses notorious browser WebAudio engine bugs to deliver distortion-free, gapless 320kbps playback.
- **Professional Visualizations**: A real-time, DAW-grade spectrum analyzer. Maps frequencies into precise logarithmic octaves with peak-extraction for razor-sharp transient response.
- **GPU-Accelerated UI**: Buttery smooth shimmer skeleton loaders, glassmorphism, and hardware-accelerated animations that won't block the main thread.
- **Zero-Config Deployment**: Serverless proxy backend built specifically for 1-click Netlify deployment.

## 🛠️ Tech Stack
- **Frontend**: React, Vite, TailwindCSS
- **Decentralization**: libp2p, Helia, OrbitDB
- **Backend/Proxy**: Netlify Functions (Serverless)

## 🚀 How to Run Locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Install the Netlify CLI (required to run the serverless proxy functions locally):
   ```bash
   npm install netlify-cli -g
   ```
3. Start the development server:
   ```bash
   netlify dev
   ```

## ⚖️ Disclaimer & Copyright Notice

**Important Legal Information:**
Bloom is strictly an educational open-source project. It functions solely as a specialized web interface and client-side search tool.

- **No Content Hosted:** This repository, application, and its developers **do not** host, upload, database, or store any copyrighted audio, video, media files, or metadata.
- **No Copyright Ownership:** The developers of Bloom do not own or claim the copyrights to any music, album art, lyrics, or metadata displayed within the application. All rights belong to their respective original creators and copyright holders.
- **API Aggregation:** The application acts purely as a passthrough interface that formats user queries and proxies them to publicly accessible third-party APIs on the internet. 
- **Personal Use:** This tool is provided "as is" for personal, educational, and non-commercial use only. The developers hold no liability for how end-users choose to utilize this software. 

By running or deploying this software, you agree that you are solely responsible for complying with all applicable copyright and digital media laws in your jurisdiction.
