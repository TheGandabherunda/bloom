// ─────────────────────────────────────────────────────────────
//  peer.js  —  WebRTC / PeerJS connection management
// ─────────────────────────────────────────────────────────────

let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let hostConnectAttempts = 0;
const MAX_HOST_CONNECT_ATTEMPTS = 25;

// Incremented each time a new conn attempt starts — lets stale timeouts self-invalidate
let activeConnAttemptId = 0;

// TRUE while we are waiting for the PeerJS signaling 'open' to re-fire after a drop.
// connectToHost() returns immediately when this is set, preventing wasted attempts
// against a signaling server we are not yet connected to.
let waitingForSignalingReconnect = false;

// TRUE after initializeWebRTC(true) has been called once — avoids re-escalating
// to relay mode endlessly when relay itself is timing out.
let relayModeActive = false;

// ─── ICE / TURN configuration ────────────────────────────────
// Dynamic Fetching from Metered.live API directly in frontend.
// ─────────────────────────────────────────────────────────────

const METERED_API_KEY = 'f76e5b2098fdbbbe6631dfca0301739d9eac';
const METERED_API_URL = `https://bloom-p2p.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`;

// Fetches the ICE servers directly from Metered API.
async function fetchIceServers(relayOnly = false) {
    try {
        const response = await fetch(METERED_API_URL);
        let iceServers = await response.json();

        // In relay-only mode skip STUN (no point gathering host/srflx candidates)
        if (relayOnly) {
            iceServers = iceServers.filter(server => {
                const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
                return urls.some(url => url.startsWith('turn:') || url.startsWith('turns:'));
            });
        }

        return iceServers;
    } catch (err) {
        sysLog('ERROR', 'Failed to fetch Metered TURN credentials', err);

        // Fallback to basic Google STUN if fetch fails
        const stunFallback = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];
        return relayOnly ? [] : stunFallback;
    }
}

function buildPeerConfig(iceServers, forceRelay = false) {
    return {
        debug: 2,
        config: {
            iceServers: iceServers,
            iceCandidatePoolSize: 10,
            iceTransportPolicy: forceRelay ? 'relay' : 'all',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
        }
    };
}

// ─── Core init ───────────────────────────────────────────────

async function initializeWebRTC(forceRelay = false) {
    updateStatus('Initializing WebRTC', 'yellow');
    relayModeActive = forceRelay;

    const requestedId = AppState.isHost ? AppState.roomId : undefined;

    // ── Tear down the old peer cleanly FIRST ──────────────────────
    const oldPeer = peer;
    peer = null;  // disarm all stale event callbacks immediately

    if (oldPeer && !oldPeer.destroyed) {
        try { oldPeer.destroy(); } catch(e) {}
    }

    // Reset handshake guards
    isConnecting = false;
    waitingForSignalingReconnect = false;
    activeConnAttemptId++;

    // Save current attempt ID to prevent race conditions during the async fetch
    const currentAttemptId = activeConnAttemptId;

    // Wait for the Metered API to give us the servers
    const iceServers = await fetchIceServers(forceRelay);

    // If another initializeWebRTC call happened while we were waiting, abort this one
    if (currentAttemptId !== activeConnAttemptId) {
        sysLog('WEBRTC', 'Aborting stale init after API fetch');
        return;
    }

    let newPeer;
    try {
        newPeer = new Peer(requestedId, buildPeerConfig(iceServers, forceRelay));
    } catch (err) {
        sysLog('ERROR', 'Peer construction failed', err);
        return updateStatus('Failed', 'red');
    }

    peer = newPeer;

    // ── open ────────────────────────────────────────────────
    peer.on('open', (id) => {
        if (peer !== newPeer) return; // a newer reinit happened — discard
        AppState.peerId = id;
        reconnectAttempts = 0;
        sysLog('WEBRTC', `Connected to Signaling Server. My ID: ${id}${forceRelay ? ' [RELAY MODE]' : ''}`);

        if (AppState.isHost) {
            if (id !== AppState.roomId) {
                sysLog('ERROR', `ID Mismatch! Wanted ${AppState.roomId} but got ${id}.`);
                showToast('Room ID already taken. Try a different name.', 'error');
                updateStatus('ID Conflict', 'red');
                return;
            }
            updateStatus('Hosting', 'green');
            AppState.members = [{ id: AppState.peerId, name: AppState.displayName, role: ROLES.OWNER }];
            applyRoleUI();
            updateMembersList();
            setupHostListeners();
            startSyncLoop();
        } else {
            updateStatus('Connecting...', 'yellow');

            if (waitingForSignalingReconnect) {
                // Signaling came back after a mid-handshake drop — resume
                waitingForSignalingReconnect = false;
                sysLog('WEBRTC', 'Signaling reconnected — resuming host connection');
                setTimeout(() => connectToHost(), 500);
                return;
            }

            if (!forceRelay) hostConnectAttempts = 0;
            setTimeout(() => connectToHost(), 1500);
        }
    });

    // ── disconnected ────────────────────────────────────────
    peer.on('disconnected', () => {
        if (peer !== newPeer) return; // stale — ignore
        sysLog('WEBRTC', 'Disconnected from signaling server. Attempting reconnect...');

        isConnecting = false;
        waitingForSignalingReconnect = true;
        activeConnAttemptId++;

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && !newPeer.destroyed) {
            reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts - 1), 15000);
            sysLog('WEBRTC', `Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${Math.round(delay / 1000)}s`);
            setTimeout(() => {
                // Only reconnect if this is still the active peer AND it is
                // genuinely disconnected (not open, not destroyed).
                if (peer === newPeer && !newPeer.destroyed && newPeer.disconnected) {
                    newPeer.reconnect();
                }
            }, delay);
        } else {
            sysLog('ERROR', 'Max reconnect attempts reached or peer destroyed.');
            waitingForSignalingReconnect = false;
            updateStatus('Offline', 'red');
        }
    });

    // ── error ────────────────────────────────────────────────
    peer.on('error', (err) => {
        if (peer !== newPeer) return; // stale
        sysLog('ERROR', `PeerJS Error: ${err.type}`, err);

        if (err.type === 'peer-unavailable') {
            isConnecting = false;
            if (!AppState.isHost) {
                if (hostConnectAttempts < MAX_HOST_CONNECT_ATTEMPTS) {
                    hostConnectAttempts++;
                    const delay = Math.min(2000 + (hostConnectAttempts * 800), 12000);
                    updateStatus('Waiting for host...', 'yellow');
                    if (hostConnectAttempts <= 3) showToast('Host not online yet. Retrying...', 'info');
                    setTimeout(() => connectToHost(), delay);
                } else {
                    updateStatus('Host not found', 'red');
                    showToast('Could not connect to host after multiple attempts.', 'error');
                }
            }
        }

        if (err.type === 'unavailable-id' && AppState.isHost) {
            showToast('Room name already in use.', 'error');
            updateStatus('ID Taken', 'red');
        }

        if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
            isConnecting = false;
            activeConnAttemptId++;
            waitingForSignalingReconnect = true;
            sysLog('WEBRTC', `Signaling lost mid-handshake (${err.type}) — pausing until reconnect`);
        }

        if (err.type === 'webrtc') {
            isConnecting = false;
            sysLog('ERROR', 'WebRTC ICE/DTLS failure', err);
            if (!AppState.isHost && hostConnectAttempts < MAX_HOST_CONNECT_ATTEMPTS) {
                hostConnectAttempts++;
                if (!relayModeActive) {
                    sysLog('WEBRTC', 'Switching to relay-only mode after ICE failure');
                    showToast('Trying relay connection...', 'info');
                    setTimeout(() => initializeWebRTC(true), 1000);
                } else {
                    const delay = Math.min(3000 + (hostConnectAttempts * 1000), 15000);
                    setTimeout(() => connectToHost(), delay);
                }
            }
        }
    });

    // ── close ────────────────────────────────────────────────
    peer.on('close', () => {
        if (peer !== newPeer) return; // stale
        sysLog('WEBRTC', 'Peer destroyed/closed.');
        isConnecting = false;
        waitingForSignalingReconnect = false;
        updateStatus('Disconnected', 'red');
    });
}

// ─── Host-side listener setup ────────────────────────────────

function setupHostListeners() {
    peer.on('connection', (conn) => {
        sysLog('WEBRTC', `Incoming handshake from: ${conn.peer}`);

        // 90 s — generous enough for TURN relay on slow mobile networks.
        // Fires only if the data channel never opens.
        const failTimeout = setTimeout(() => {
            if (!conn.open) {
                sysLog('WARN', `Handshake with ${conn.peer} timed out (90s). Cleaning up.`);
                try { conn.close(); } catch(e) {}
            }
        }, 90000);

        conn.on('open', () => {
            clearTimeout(failTimeout);
            sysLog('WEBRTC', `Data channel established with: ${conn.peer}`);

            if (AppState.peers.has(conn.peer)) {
                try { AppState.peers.get(conn.peer).close(); } catch(e) {}
            }
            AppState.peers.set(conn.peer, conn);

            conn.on('close', () => handlePeerDisconnect(conn.peer));
            conn.on('error', (err) => {
                sysLog('ERROR', `Conn Error with ${conn.peer}`, err);
                handlePeerDisconnect(conn.peer);
            });
            conn.on('data', (data) => handleIncomingData(data, conn.peer));
        });

        conn.on('error', (err) => {
            clearTimeout(failTimeout);
            sysLog('ERROR', `Pre-open handshake error with ${conn.peer}:`, err);
            try { conn.close(); } catch(e) {}
        });
    });

    setInterval(() => {
        if (!AppState.isHost) return;
        for (const [peerId, conn] of AppState.peers.entries()) {
            const iceState = conn.peerConnection?.iceConnectionState;
            if (!conn.open || (iceState && ['disconnected', 'failed', 'closed'].includes(iceState))) {
                sysLog('WEBRTC', `Cleaning up dead peer: ${peerId} (ICE: ${iceState})`);
                handlePeerDisconnect(peerId);
            }
        }
    }, 5000);
}

function handlePeerDisconnect(peerId) {
    if (!AppState.isHost) return;
    if (!AppState.peers.has(peerId)) return;

    sysLog('WEBRTC', `Peer disconnected: ${peerId}`);
    AppState.peers.delete(peerId);
    AppState.members = AppState.members.filter(m => m.id !== peerId);
    broadcast({ type: 'MEMBERS_UPDATE', members: AppState.members });
    updateMembersList();
}

// ─── Guest-side host connection ──────────────────────────────

function connectToHost() {
    if (!peer || peer.destroyed) {
        sysLog('WARN', 'connectToHost: peer is gone — reinitializing');
        initializeWebRTC(relayModeActive);
        return;
    }

    if (isConnecting) return;

    if (peer.disconnected || waitingForSignalingReconnect) {
        sysLog('WARN', 'connectToHost: signaling not ready — will retry after reconnect');
        return;
    }

    isConnecting = true;
    const thisAttemptId = ++activeConnAttemptId;
    sysLog('WEBRTC', `Initiating connection to host: ${AppState.roomId} (attempt ${hostConnectAttempts + 1})`);

    let conn;
    try {
        conn = peer.connect(AppState.roomId, {
            reliable: true,
            serialization: 'json',
        });
    } catch (err) {
        sysLog('ERROR', 'peer.connect() threw synchronously', err);
        isConnecting = false;
        return;
    }

    // Guest timeout = 45 s.  Host timeout = 90 s.
    // Guest always closes first, so the host can still accept a late open event.
    const CONN_TIMEOUT_MS = 45000;

    const connTimeout = setTimeout(() => {
        if (thisAttemptId !== activeConnAttemptId) return;
        if (conn.open) return;

        sysLog('ERROR', `Handshake timed out (attempt ${hostConnectAttempts + 1})`);
        isConnecting = false;
        try { conn.close(); } catch(e) {}

        if (hostConnectAttempts >= MAX_HOST_CONNECT_ATTEMPTS) {
            updateStatus('Connection failed', 'red');
            showToast('Could not connect. Please check your network or ask the host to refresh.', 'error');
            return;
        }

        hostConnectAttempts++;

        if (!relayModeActive) {
            sysLog('WEBRTC', 'Switching to relay-only mode after ICE timeout');
            showToast('Switching to relay mode...', 'info');
            setTimeout(() => initializeWebRTC(true), 500);
        } else {
            // Already in relay mode — TURN server may be overloaded, back off
            const delay = Math.min(3000 + (hostConnectAttempts * 1000), 15000);
            sysLog('WEBRTC', `Relay timeout — retrying in ${Math.round(delay / 1000)}s`);
            setTimeout(() => connectToHost(), delay);
        }
    }, CONN_TIMEOUT_MS);

    conn.on('open', () => {
        if (thisAttemptId !== activeConnAttemptId) {
            sysLog('WARN', 'Stale conn opened — discarding');
            try { conn.close(); } catch(e) {}
            return;
        }
        clearTimeout(connTimeout);
        isConnecting = false;
        hostConnectAttempts = 0;
        sysLog('WEBRTC', 'Data channel established with Host!');
        AppState.hostConnection = conn;
        updateStatus('Connected', 'green');

        sendToHost({ type: 'IDENTITY', name: AppState.displayName });
        conn.on('data', (data) => handleIncomingData(data, 'host'));

        // Watch ICE health post-connect; reconnect if it degrades
        const pc = conn.peerConnection;
        if (pc) {
            pc.addEventListener('iceconnectionstatechange', () => {
                const state = pc.iceConnectionState;
                sysLog('WEBRTC', `ICE state changed: ${state}`);
                if ((state === 'failed' || state === 'disconnected') && AppState.hostConnection === conn) {
                    sysLog('WEBRTC', 'ICE degraded post-connect — scheduling reconnect');
                    AppState.hostConnection = null;
                    updateStatus('Reconnecting...', 'yellow');
                    showToast('Connection interrupted. Reconnecting...', 'info');
                    if (hostConnectAttempts < MAX_HOST_CONNECT_ATTEMPTS) {
                        hostConnectAttempts++;
                        setTimeout(() => connectToHost(), 3000);
                    }
                }
            });
        }
    });

    conn.on('close', () => {
        if (thisAttemptId !== activeConnAttemptId) return;
        clearTimeout(connTimeout);
        isConnecting = false;

        if (AppState.hostConnection === conn) {
            AppState.hostConnection = null;
            updateStatus('Disconnected', 'red');
            showToast('Lost connection to host. Reconnecting...', 'error');
            if (hostConnectAttempts < MAX_HOST_CONNECT_ATTEMPTS) {
                hostConnectAttempts++;
                setTimeout(() => connectToHost(), 3000);
            }
        }
    });

    conn.on('error', (err) => {
        if (thisAttemptId !== activeConnAttemptId) return;
        clearTimeout(connTimeout);
        isConnecting = false;
        sysLog('ERROR', 'Conn handshake error', err);
    });
}

// ─── Data handling ───────────────────────────────────────────

function handleIncomingData(data, sourceId) {
    if (data.type === 'CHAT') {
        renderChatMessage(data, false);
        if (AppState.isHost) broadcast(data, [sourceId]);
    }

    if (AppState.isHost) {
        if (data.type === 'IDENTITY') {
            sysLog('WEBRTC', `Identity received: ${data.name}`);
            AppState.members = AppState.members.filter(m => m.id !== sourceId);
            AppState.members.push({ id: sourceId, name: data.name, role: ROLES.MEMBER });
            updateMembersList();

            const guestConn = AppState.peers.get(sourceId);
            if (guestConn && guestConn.open) {
                guestConn.send({
                    type: 'INIT_STATE',
                    currentVideo: AppState.currentVideo,
                    queue: AppState.queue,
                    currentIndex: AppState.currentIndex,
                    isShuffled: AppState.isShuffled,
                    time:  (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') ? ytPlayer.getCurrentTime() : 0,
                    state: (ytPlayer && typeof ytPlayer.getPlayerState === 'function') ? ytPlayer.getPlayerState() : -1,
                    members: AppState.members
                });
            }
            broadcast({ type: 'MEMBERS_UPDATE', members: AppState.members }, [sourceId]);
        }
        if (data.type === 'COMMAND') processCommandLocally(data.action, data.payload, sourceId);
    } else {
        switch (data.type) {
            case 'INIT_STATE': {
                sysLog('WEBRTC', 'Room state synchronized');
                AppState.members = data.members;
                const meInit = AppState.members.find(m => m.id === AppState.peerId);
                if (meInit) AppState.myRole = meInit.role;
                applyRoleUI();
                updateMembersList();
                AppState.queue = data.queue;
                AppState.currentIndex = data.currentIndex;
                if (data.isShuffled !== undefined) AppState.isShuffled = data.isShuffled;
                renderQueue();
                if (data.currentVideo) loadVideoInternal(data.currentVideo, data.time, data.state);
                break;
            }
            case 'MEMBERS_UPDATE': {
                AppState.members = data.members;
                const meUpdate = AppState.members.find(m => m.id === AppState.peerId);
                if (meUpdate && meUpdate.role !== AppState.myRole) {
                    AppState.myRole = meUpdate.role;
                    applyRoleUI();
                    showToast(`Role updated to ${AppState.myRole}`, 'success');
                }
                updateMembersList();
                break;
            }
            case 'SYNC_QUEUE':
                AppState.queue = data.queue;
                AppState.currentIndex = data.currentIndex;
                if (data.isShuffled !== undefined) AppState.isShuffled = data.isShuffled;
                renderQueue();
                break;
            case 'LOAD_VIDEO':
                loadVideoInternal(data.video, 0, 1);
                break;
            case 'SYNC_STATE':
                enforceHostState(data);
                break;
            case 'KICKED':
                showToast('Removed from room.', 'error');
                setTimeout(() => { window.location.hash = ''; window.location.reload(); }, 2000);
                break;
        }
    }
}

// ─── Broadcast helpers ───────────────────────────────────────

function broadcast(data, excludeIds = []) {
    if (!AppState.isHost) return;
    for (const [peerId, conn] of AppState.peers.entries()) {
        if (!excludeIds.includes(peerId) && conn.open) {
            try { conn.send(data); } catch(e) {
                sysLog('WARN', `Failed to send to ${peerId}`, e);
            }
        }
    }
}

function sendToHost(data) {
    if (AppState.hostConnection && AppState.hostConnection.open) {
        try { AppState.hostConnection.send(data); } catch(e) {
            sysLog('WARN', 'Failed to send to host', e);
        }
    }
}