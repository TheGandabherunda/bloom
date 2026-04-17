let isConnecting = false;

function initializeWebRTC() {
    updateStatus('Initializing WebRTC', 'yellow');

    // The Host MUST use the roomId as their Peer ID so others can find them.
    const requestedId = AppState.isHost ? AppState.roomId : undefined;

    try {
        // We use PeerJS's default cloud server for signaling.
        // We increase debug levels to see granular details of the WebRTC handshake.
        peer = new Peer(requestedId, {
            ...AppState.peerConfig,
            debug: 3,
            config: {
                ...AppState.peerConfig.config,
                iceCandidatePoolSize: 10 // Pre-fetch candidates for faster connection
            }
        });
    } catch (err) {
        sysLog('ERROR', 'Peer construction failed', err);
        return updateStatus('Failed', 'red');
    }

    peer.on('open', (id) => {
        AppState.peerId = id;
        sysLog('WEBRTC', `Connected to Signaling Server. My ID: ${id}`);

        if (AppState.isHost) {
            // Safety check: ensure the signaling server hasn't assigned a random ID to the host.
            if (id !== AppState.roomId) {
                sysLog('ERROR', `ID Mismatch! Wanted ${AppState.roomId} but got ${id}. Someone may be hosting this room.`);
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
            // Give the signaling server a moment to propagate the Host ID.
            setTimeout(() => connectToHost(), 1500);
        }
    });

    peer.on('disconnected', () => {
        sysLog('WEBRTC', 'Disconnected from signaling server. Reconnecting...');
        isConnecting = false;
        peer.reconnect();
    });

    peer.on('error', (err) => {
        sysLog('ERROR', `PeerJS Error: ${err.type}`, err);

        if (err.type === 'peer-unavailable') {
            isConnecting = false;
            if (!AppState.isHost) {
                updateStatus('Host offline', 'red');
                showToast('Host is not online yet. Retrying...', 'info');
                setTimeout(() => connectToHost(), 5000);
            }
        }

        if (err.type === 'unavailable-id' && AppState.isHost) {
            showToast('Room name already in use.', 'error');
            updateStatus('ID Taken', 'red');
        }
    });
}

function setupHostListeners() {
    peer.on('connection', (conn) => {
        sysLog('WEBRTC', `Incoming handshake from: ${conn.peer}`);

        // Timeout if connection doesn't open within 15 seconds.
        // This clears "zombie" handshakes where candidates never match.
        const failTimeout = setTimeout(() => {
            if (!conn.open) {
                sysLog('WARN', `Handshake with ${conn.peer} timed out. Cleaning up.`);
                conn.close();
            }
        }, 15000);

        conn.on('open', () => {
            clearTimeout(failTimeout);
            sysLog('WEBRTC', `Data channel fully established with: ${conn.peer}`);

            // Clean up stale connections from the same peer (e.g. after a refresh)
            if (AppState.peers.has(conn.peer)) {
                try { AppState.peers.get(conn.peer).close(); } catch(e){}
            }

            AppState.peers.set(conn.peer, conn);

            conn.on('close', () => handlePeerDisconnect(conn.peer));
            conn.on('error', (err) => {
                sysLog('ERROR', `Conn Error with ${conn.peer}`, err);
                handlePeerDisconnect(conn.peer);
            });
            conn.on('data', (data) => handleIncomingData(data, conn.peer));
        });
    });

    // Cleanup interval to remove stale peer objects from memory.
    setInterval(() => {
        if (!AppState.isHost) return;
        for (const [peerId, conn] of AppState.peers.entries()) {
            if (!conn.open || (conn.peerConnection && ['disconnected', 'failed', 'closed'].includes(conn.peerConnection.iceConnectionState))) {
                sysLog('WEBRTC', `Cleaning up dead peer: ${peerId}`);
                handlePeerDisconnect(peerId);
            }
        }
    }, 5000);
}

function handlePeerDisconnect(peerId) {
    if (!AppState.isHost) return;

    const hadPeer = AppState.peers.has(peerId);
    if (!hadPeer) return;

    sysLog('WEBRTC', `Peer disconnected: ${peerId}`);
    AppState.peers.delete(peerId);
    AppState.members = AppState.members.filter(m => m.id !== peerId);
    broadcast({ type: 'MEMBERS_UPDATE', members: AppState.members });
    updateMembersList();
}

function connectToHost() {
    if (!peer || peer.destroyed || isConnecting) return;

    isConnecting = true;
    sysLog('WEBRTC', `Initiating connection to host: ${AppState.roomId}`);

    // Explicitly request reliable data channels to prevent message drops.
    const conn = peer.connect(AppState.roomId, {
        reliable: true,
        serialization: 'json'
    });

    const connTimeout = setTimeout(() => {
        if (!conn.open) {
            sysLog('ERROR', 'Handshake timed out. Retrying...');
            isConnecting = false;
            conn.close();
            setTimeout(() => connectToHost(), 3000);
        }
    }, 15000);

    conn.on('open', () => {
        clearTimeout(connTimeout);
        isConnecting = false;
        sysLog('WEBRTC', 'Data channel established with Host!');
        AppState.hostConnection = conn;
        updateStatus('Connected', 'green');

        // Immediately identify so the Host can send current Room State.
        sendToHost({ type: 'IDENTITY', name: AppState.displayName });
        conn.on('data', (data) => handleIncomingData(data, 'host'));
    });

    conn.on('close', () => {
        isConnecting = false;
        updateStatus('Disconnected', 'red');
        showToast("Lost connection to host.", "error");
    });

    conn.on('error', (err) => {
        isConnecting = false;
        sysLog('ERROR', 'Handshake failed', err);
    });
}

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

            // Send current playback position and queue ONLY to the joining user.
            const guestConn = AppState.peers.get(sourceId);
            if (guestConn && guestConn.open) {
                guestConn.send({
                    type: 'INIT_STATE',
                    currentVideo: AppState.currentVideo,
                    queue: AppState.queue,
                    currentIndex: AppState.currentIndex,
                    isShuffled: AppState.isShuffled,
                    time: (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') ? ytPlayer.getCurrentTime() : 0,
                    state: (ytPlayer && typeof ytPlayer.getPlayerState === 'function') ? ytPlayer.getPlayerState() : -1,
                    members: AppState.members
                });
            }
            // Notify others of the new user.
            broadcast({ type: 'MEMBERS_UPDATE', members: AppState.members }, [sourceId]);
        }
        if (data.type === 'COMMAND') processCommandLocally(data.action, data.payload, sourceId);
    } else {
        switch (data.type) {
            case 'INIT_STATE':
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
            case 'MEMBERS_UPDATE':
                AppState.members = data.members;
                const meUpdate = AppState.members.find(m => m.id === AppState.peerId);
                if (meUpdate && meUpdate.role !== AppState.myRole) {
                    AppState.myRole = meUpdate.role;
                    applyRoleUI();
                    showToast(`Role updated to ${AppState.myRole}`, 'success');
                }
                updateMembersList();
                break;
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
                showToast("Removed from room.", 'error');
                setTimeout(() => { window.location.hash = ''; window.location.reload(); }, 2000);
                break;
        }
    }
}

function broadcast(data, excludeIds = []) {
    if (!AppState.isHost) return;
    for (const [peerId, conn] of AppState.peers.entries()) {
        if (!excludeIds.includes(peerId) && conn.open) {
            try { conn.send(data); } catch(e) {}
        }
    }
}

function sendToHost(data) {
    if (AppState.hostConnection && AppState.hostConnection.open) {
        try { AppState.hostConnection.send(data); } catch(e) {}
    }
}