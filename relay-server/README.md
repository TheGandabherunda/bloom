# Bloom Relay Server

A tiny libp2p Circuit Relay v2 server that bridges browser peers in Bloom rooms.

## Deploy to Render.com (Free — takes ~2 min)

1. Push the **`relay-server/`** folder to a GitHub repo (it can be a new repo or the same Bloom repo).
2. Go to [render.com](https://render.com) → **New > Web Service**.
3. Connect your GitHub repo.
4. Set these settings:
   - **Root Directory:** `relay-server` (if using the Bloom mono-repo) or `.` (if dedicated repo)
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
5. Add **one Environment Variable**:
   - `ANNOUNCE_HOST` = `your-service-name.onrender.com` *(use the URL Render gives you)*
6. Deploy!

When the server starts, it will log the full relay multiaddr, for example:
```
/dns4/bloom-relay.onrender.com/tcp/443/wss/p2p/12D3KooW...
```

Copy that address and add it to your `.env` or directly into `p2pWorker.js` as the `RELAY_MULTIADDR` constant.

## Deploy to Railway.app (Also Free)

1. Go to [railway.app](https://railway.app) → **New Project > Deploy from GitHub**.
2. Select the `relay-server` folder or repo.
3. Railway auto-detects Node.js.
4. Add environment variable: `ANNOUNCE_HOST` = `your-app.railway.app`
5. Deploy.

## Run Locally (for testing)

```bash
cd relay-server
npm install
node index.js
```

It will start on `ws://127.0.0.1:4002` and print the peer ID.
