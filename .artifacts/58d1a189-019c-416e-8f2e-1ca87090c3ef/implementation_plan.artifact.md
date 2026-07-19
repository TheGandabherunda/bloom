# Fix OrbitDB Initialization NotStartedError

The app is failing to initialize OrbitDB with a `NotStartedError: Not started`. This happens because `createOrbitDB` accesses `helia.libp2p` while the Helia node is not in a "started" state, or there is a race condition during initialization.

## Proposed Changes

### OrbitContext.jsx

#### [MODIFY] [OrbitContext.jsx](file:///A:/Development/Apps/Bloom/src/context/OrbitContext.jsx)
- Add a `useRef` to track if initialization is in progress or completed to prevent multiple concurrent `initP2P` calls.
- Modify `createLibp2p` to include `start: false` so that Helia can manage the libp2p lifecycle.
- Explicitly call `heliaNode.start()` and wait for it before proceeding to OrbitDB initialization.
- Add a cleanup function to stop Helia and OrbitDB instances properly.
- Improve logging to pinpoint initialization stages.

### Layout.jsx

#### [MODIFY] [Layout.jsx](file:///A:/Development/Apps/Bloom/src/components/Layout.jsx)
- Ensure that `initP2P` is not called redundantly if already connected.
- (Optional) Add a cleanup effect to stop P2P when the layout unmounts.

## Verification Plan

### Automated Tests
- N/A (Unit tests for P2P initialization are complex in this environment, but I will check for syntax and structure).

### Manual Verification
- Observe the browser console to ensure `NotStartedError` is gone.
- Verify that the "Initializing P2P Swarm" overlay disappears and the status changes to "connected".
- Check that the room ID is displayed and the app functions normally.
