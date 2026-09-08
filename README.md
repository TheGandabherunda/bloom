<div align="center">

# 🌸 Bloom

### Listen together. No account. No server. Just music.

[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite)](https://vitejs.dev)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v3-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![Netlify](https://img.shields.io/badge/Deployed%20on-Netlify-00C7B7?style=flat-square&logo=netlify)](https://netlify.com)

</div>

---

## What is Bloom?

Bloom is a **shared music player** — think of it like a virtual listening room you can invite your friends into.

Create a room, share the code, and everyone hears the same song at the same time. No sign-up. No account. No server in the middle. When everyone leaves, the room disappears. Clean and simple.

---

## 🎵 What can you do with it?

- **Create or join a listening room** with just a short room code
- **Play music in perfect sync** with everyone in the room
- **Chat with your friends** while the music plays — GIFs included
- **Build a queue together** — anyone can suggest a song, the host decides what plays
- **See real-time lyrics** synced to the track
- **Watch the music visualizer** pulse to the beat
- **Rename your party** and make it feel like yours

---

## 👑 How rooms work

Every room has a **Host**. The host controls playback — play, pause, skip, rename the party, and manage the queue. The host can also promote friends to **Admin**, giving them the same controls.

### 🗳️ Song recommendations & voting

Anyone in the room can suggest a song. When they do, a voting card appears in the chat for everyone:

| Situation | What happens |
|---|---|
| Host or admin votes **Agree** | Song is immediately added to the queue |
| Host or admin votes **Disagree** | Song is rejected (host veto) |
| Host/admin doesn't vote | If **50% or more** of the room votes Agree, it gets auto-added |

A live progress bar on each recommendation card shows how many votes are in and how many are needed — so no one's left guessing.

When everyone leaves, the room is gone. No history, no data stored.

---

## 🚀 Running Bloom locally

You'll need [Node.js](https://nodejs.org) (v20+) and the [Netlify CLI](https://docs.netlify.com/cli/get-started/) installed.

```bash
# Install Netlify CLI (one-time setup)
npm install -g netlify-cli

# Clone and install
git clone https://github.com/TheGandabherunda/bloom.git
cd bloom
npm install

# Start the app
netlify dev
```

Then open `http://localhost:8888` in your browser.

> **Note:** Use `netlify dev` — not `npm run dev`. The app needs the backend functions to work correctly.

---

## 🌐 Deploying

Bloom is built to deploy on [Netlify](https://netlify.com) straight from this repo — no extra configuration needed. Just connect the repo in Netlify and it handles the rest.

---

## ⚖️ Legal Notice

Bloom is an **educational, open-source project** and is intended for **personal, non-commercial use only**.

- This app does not host, store, or own any music, lyrics, or album art.
- All content is sourced in real-time from publicly available third-party services.
- All rights to any music displayed belong to their respective artists and rights holders.

By using this software, you take full responsibility for complying with copyright laws in your region.

---

<div align="center">
  Made with 🌸 — for the love of music and good company.
</div>
