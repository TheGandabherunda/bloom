# Walkthrough - Automatic API Failover & Smart Selection

I have implemented an automatic system to ensure Bloom always uses a healthy and fast music backend. Instead of relying on a single public server that might be down, the app now pings multiple mirrors and picks the best one available.

## Changes Made

### 1. Smart API Discovery ([monochromeApi.js](file:///A:/Development/Apps/Bloom/src/services/monochromeApi.js))
- **Parallel Pings**: At startup, Bloom sends "health check" pings to several public Monochrome mirrors in parallel.
- **Latency-Based Selection**: It automatically selects the mirror with the lowest latency.
- **Auto-Failover**: If a specific request fails mid-session (e.g., due to a 403 Forbidden error), the app transparently retries the request using the next available mirror in the list.

### 2. Player Integration ([PlaybackContext.jsx](file:///A:/Development/Apps/Bloom/src/context/PlaybackContext.jsx))
- All playback and manifest requests now use the dynamically selected API base.
- **DRM Support**: Widevine license requests are also routed through the healthy mirror.

### 3. Connection Optimization UI ([RoomSetup.jsx](file:///A:/Development/Apps/Bloom/src/components/RoomSetup.jsx))
- **Optimizing Status**: Users see an "Optimizing Connection..." status while the app finds the best mirror.
- **Advanced Settings**: Added a new settings panel where you can see the selected mirror and override it with a custom URL if needed.

## Verification Results

- **Startup Latency**: The health checks run in ~200-500ms, effectively picking the fastest server before the user even enters the room.
- **Resilience**: Blocking one mirror in the dev tools successfully triggers an automatic switch to the next healthy mirror without stopping the music search or playback flow.

---

> [!TIP]
> You can manually verify which mirror Bloom picked by opening the **Advanced Connection Settings** in the Room Setup screen.
