// ---------------------------------------------------------
// CORE APP LOGIC & COMMAND BUS
// ---------------------------------------------------------

function applyRoleUI() {
    const isController = AppState.myRole === ROLES.OWNER || AppState.myRole === ROLES.ADMIN;
    document.querySelectorAll('.control-ui').forEach(el => el.classList.toggle('hidden', !isController));
    document.querySelectorAll('.viewer-ui').forEach(el => el.classList.toggle('hidden', isController));
    if (!isLyricsMode) document.querySelectorAll('.control-block').forEach(el => el.classList.toggle('hidden', !isController));

    ui.progressBar.disabled = !isController;
    ui.roleBadge.textContent = AppState.myRole;

    if (AppState.myRole === ROLES.OWNER) {
        ui.roleBadge.className = 'px-2 py-0.5 rounded font-semibold transition-colors bg-[#be0aff]/20 text-[#be0aff] hidden sm:inline-block';
        ui.emptyStateText.textContent = "Search or add videos to the queue to get started.";
    } else if (AppState.myRole === ROLES.ADMIN) {
        ui.roleBadge.className = 'px-2 py-0.5 rounded font-semibold transition-colors bg-[#ff8700]/20 text-[#ff8700] hidden sm:inline-block';
        ui.emptyStateText.textContent = "Search or add videos to the queue to get started.";
    } else {
        ui.roleBadge.className = 'px-2 py-0.5 rounded font-semibold transition-colors bg-blue-500/20 text-blue-400 hidden sm:inline-block';
        ui.emptyStateText.textContent = "Waiting for the Admins to play something.";
    }
    renderQueue();
}

function executeCommand(action, payload = {}) {
    if (AppState.myRole === ROLES.MEMBER) {
        showToast("Only Admins can perform this action.", "error");
        return;
    }
    if (AppState.myRole === ROLES.OWNER) processCommandLocally(action, payload, AppState.peerId);
    else if (AppState.myRole === ROLES.ADMIN) sendToHost({ type: 'COMMAND', action, payload });
}

function processCommandLocally(action, payload, sourceId) {
    const sender = AppState.members.find(m => m.id === sourceId);
    if (!sender) return;

    const isOwner = sender.role === ROLES.OWNER;
    const isAdmin = sender.role === ROLES.ADMIN;
    if (!isOwner && !isAdmin) return;

    isProgrammaticAction = true;

    switch(action) {
        case 'TOGGLE_PLAY':
            if (!isPlayerReady || !AppState.currentVideo) break;
            if (AppState.isPlaying) {
                ytPlayer.pauseVideo(); triggerPlaybackOverlay(false);
                broadcast({ type: 'SYNC_STATE', state: 2, time: ytPlayer.getCurrentTime() });
            } else {
                ytPlayer.playVideo(); triggerPlaybackOverlay(true);
                broadcast({ type: 'SYNC_STATE', state: 1, time: ytPlayer.getCurrentTime() });
            }
            break;
        case 'SEEK':
            if (!isPlayerReady || !AppState.currentVideo) break;
            ytPlayer.seekTo(payload.time, true);
            broadcast({ type: 'SYNC_STATE', state: AppState.isPlaying ? 1 : 2, time: payload.time });
            break;
        case 'PREV':
            if (AppState.queue.length > 0 && AppState.currentIndex > 0) {
                AppState.currentIndex--; hostPlayItem(AppState.queue[AppState.currentIndex]); updateQueueState();
            }
            break;
        case 'NEXT': playNextInQueue(); break;
        case 'SHUFFLE': toggleShuffle(); break;
        case 'CLEAR_QUEUE':
            AppState.queue = []; AppState.originalQueue = []; AppState.currentIndex = -1; AppState.isShuffled = false; AppState.currentVideo = null;
            if (isPlayerReady && ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
            ui.videoWrapper.classList.remove('video-loaded'); ui.emptyState.classList.remove('opacity-0', 'pointer-events-none');
            ui.nowPlayingCover.classList.add('hidden'); ui.nowPlayingTitle.textContent = "Ready to Play"; ui.nowPlayingAuthor.textContent = "Bloom Player";
            updateAmbientColors(null); AppState.lastFetchedLyricsId = null; AppState.currentLyrics = [];
            ui.lyricsContainer.innerHTML = `<div class="text-slate-500 text-sm mt-16 flex flex-col items-center gap-2"><span class="material-symbols-rounded text-[32px]">lyrics</span><span>Select a song to load lyrics</span></div>`;
            if(isLyricsMode) toggleLyricsMode();
            updateQueueState();
            break;
        case 'ADD_TO_QUEUE':
            const startIndex = AppState.queue.length;
            AppState.queue.push(...payload.items);
            if (AppState.isShuffled) AppState.originalQueue.push(...payload.items);

            let pState = null;
            if (isPlayerReady && ytPlayer && typeof ytPlayer.getPlayerState === 'function') {
                try { pState = ytPlayer.getPlayerState(); } catch(e) {}
            }

            const isIdle = !AppState.currentVideo || pState === 0 || pState === -1 || pState === 5;
            if (payload.playNow || isIdle) {
                AppState.currentIndex = startIndex;
                hostPlayItem(AppState.queue[AppState.currentIndex]);
            }
            updateQueueState();
            break;
        case 'PLAY_DIRECT':
            if (AppState.currentIndex === -1) {
                AppState.queue.unshift(payload.video);
                if (AppState.isShuffled) AppState.originalQueue.unshift(payload.video);
                AppState.currentIndex = 0;
            } else {
                AppState.queue.splice(AppState.currentIndex + 1, 0, payload.video);
                if (AppState.isShuffled) AppState.originalQueue.splice(AppState.currentIndex + 1, 0, payload.video);
                AppState.currentIndex++;
            }
            hostPlayItem(AppState.queue[AppState.currentIndex]);
            updateQueueState();
            break;
        case 'REPLACE_QUEUE':
            AppState.queue = payload.items; AppState.originalQueue = [...payload.items];
            AppState.currentIndex = payload.playIndex; AppState.isShuffled = false;
            hostPlayItem(AppState.queue[AppState.currentIndex]);
            updateQueueState();
            break;
        case 'REMOVE_FROM_QUEUE':
            const itemToRemove = AppState.queue[payload.index]; AppState.queue.splice(payload.index, 1);
            if (AppState.isShuffled) { const origIdx = AppState.originalQueue.indexOf(itemToRemove); if (origIdx !== -1) AppState.originalQueue.splice(origIdx, 1); }
            if (AppState.currentIndex === payload.index) AppState.currentIndex = -1; else if (AppState.currentIndex > payload.index) AppState.currentIndex--;
            updateQueueState();
            break;
        case 'PLAY_FROM_QUEUE':
            AppState.currentIndex = payload.index; hostPlayItem(AppState.queue[payload.index]); updateQueueState();
            break;
        case 'REORDER_QUEUE':
            const item = AppState.queue.splice(payload.fromIndex, 1)[0]; AppState.queue.splice(payload.toIndex, 0, item);
            if (AppState.currentIndex === payload.fromIndex) AppState.currentIndex = payload.toIndex;
            else if (payload.fromIndex < AppState.currentIndex && payload.toIndex >= AppState.currentIndex) AppState.currentIndex--;
            else if (payload.fromIndex > AppState.currentIndex && payload.toIndex <= AppState.currentIndex) AppState.currentIndex++;
            updateQueueState();
            break;
        case 'KICK':
            const targetToKick = AppState.members.find(m => m.id === payload.targetId);
            if (!targetToKick || targetToKick.id === AppState.peerId) break;
            if (isAdmin && targetToKick.role !== ROLES.MEMBER) break;
            const conn = AppState.peers.get(payload.targetId);
            if (conn) { conn.send({ type: 'KICKED' }); setTimeout(() => { conn.close(); handlePeerDisconnect(payload.targetId); }, 500); }
            else { handlePeerDisconnect(payload.targetId); }
            break;
        case 'SET_ROLE':
            if (!isOwner) break;
            const targetToRole = AppState.members.find(m => m.id === payload.targetId);
            if (targetToRole && targetToRole.id !== AppState.peerId) {
                targetToRole.role = payload.role; broadcast({ type: 'MEMBERS_UPDATE', members: AppState.members }); updateMembersList();
            }
            break;
    }
    setTimeout(() => isProgrammaticAction = false, 300);
}

function triggerPlaybackOverlay(isPlaying) {
    const target = isPlaying ? ui.overlayPlay : ui.overlayPause;
    const other = isPlaying ? ui.overlayPause : ui.overlayPlay;
    other.classList.remove('animate-pop-fade'); other.classList.add('hidden');
    target.classList.remove('animate-pop-fade'); void target.offsetWidth;
    target.classList.remove('hidden'); target.classList.add('animate-pop-fade');
}

// ---------------------------------------------------------
// UI TOGGLES & MODES
// ---------------------------------------------------------
function setPlayerMode(mode) {
    currentPlayerMode = mode;
    if (ui.btnModeVideo) {
        ui.btnModeVideo.classList.remove('bg-slate-700', 'text-white'); ui.btnModeVideo.classList.add('text-slate-400', 'bg-transparent');
        ui.btnModeAudio.classList.remove('bg-slate-700', 'text-white'); ui.btnModeAudio.classList.add('text-slate-400', 'bg-transparent');
    }
    if (ui.btnMobileModeVideo) {
        ui.btnMobileModeVideo.classList.remove('bg-slate-700', 'text-white'); ui.btnMobileModeVideo.classList.add('text-slate-400', 'bg-transparent');
        ui.btnMobileModeAudio.classList.remove('bg-slate-700', 'text-white'); ui.btnMobileModeAudio.classList.add('text-slate-400', 'bg-transparent');
    }

    if (mode === 'video') {
        if (ui.btnModeVideo) { ui.btnModeVideo.classList.add('bg-slate-700', 'text-white'); ui.btnModeVideo.classList.remove('text-slate-400', 'bg-transparent'); }
        if (ui.btnMobileModeVideo) { ui.btnMobileModeVideo.classList.add('bg-slate-700', 'text-white'); ui.btnMobileModeVideo.classList.remove('text-slate-400', 'bg-transparent'); }
        ui.videoWrapper.classList.remove('audio-mode');
    } else if (mode === 'audio') {
        if (ui.btnModeAudio) { ui.btnModeAudio.classList.add('bg-slate-700', 'text-white'); ui.btnModeAudio.classList.remove('text-slate-400', 'bg-transparent'); }
        if (ui.btnMobileModeAudio) { ui.btnMobileModeAudio.classList.add('bg-slate-700', 'text-white'); ui.btnMobileModeAudio.classList.remove('text-slate-400', 'bg-transparent'); }
        ui.videoWrapper.classList.add('audio-mode');
    }
}

function toggleLyricsMode() {
    isLyricsMode = !isLyricsMode;
    if (isLyricsMode) {
        ui.btnModeLyrics.classList.add('text-white', 'bg-pink-600/20'); ui.btnModeLyrics.classList.remove('text-slate-400');
        ui.videoWrapper.classList.add('audio-mode');
        showLyricsPanel();
    } else {
        ui.btnModeLyrics.classList.remove('text-white', 'bg-pink-600/20'); ui.btnModeLyrics.classList.add('text-slate-400');
        setPlayerMode(currentPlayerMode);
        showQueuePanel();
    }
}

function showQueuePanel() {
    ui.queueList.classList.remove('hidden'); ui.lyricsContainer.classList.add('hidden');
    ui.queueTitleIcon.classList.remove('hidden'); ui.btnLyricsBack.classList.add('hidden');
    ui.queueTitleIcon.textContent = 'queue_music'; ui.queueTitleText.textContent = ''; ui.queueTitleText.style.display = 'none';
    ui.queueCountContainer.classList.remove('hidden');
    if(ui.queueActions) ui.queueActions.classList.remove('hidden');
    if (AppState.myRole === ROLES.OWNER || AppState.myRole === ROLES.ADMIN) document.querySelectorAll('.control-block').forEach(el => el.classList.remove('hidden'));
}

function showLyricsPanel() {
    ui.queueList.classList.add('hidden'); ui.lyricsContainer.classList.remove('hidden');
    ui.queueTitleIcon.classList.add('hidden'); ui.btnLyricsBack.classList.remove('hidden');
    ui.queueTitleText.textContent = 'Lyrics'; ui.queueTitleText.style.display = 'inline';
    ui.queueCountContainer.classList.add('hidden');
    if(ui.queueActions) ui.queueActions.classList.add('hidden');
    document.querySelectorAll('.control-block').forEach(el => el.classList.add('hidden'));
    if (AppState.currentVideo && AppState.lastFetchedLyricsId !== AppState.currentVideo.id) fetchAndRenderLyrics();
}

function togglePlayerExpand() {
    isPlayerCollapsed = !isPlayerCollapsed;
    if (isPlayerCollapsed) {
        ui.videoWrapper.classList.add('is-collapsed');
        if(ui.playerToggleIcon) ui.playerToggleIcon.textContent = 'expand_less';
        document.body.classList.remove('player-expanded');
    }
    else {
        ui.videoWrapper.classList.remove('is-collapsed');
        if(ui.playerToggleIcon) ui.playerToggleIcon.textContent = 'expand_more';
        document.body.classList.add('player-expanded');
        adjustMobileLayout();
    }
}

// UI Bindings
if (ui.btnModeVideo) ui.btnModeVideo.addEventListener('click', () => { setPlayerMode('video'); if(isLyricsMode) toggleLyricsMode(); });
if (ui.btnModeAudio) ui.btnModeAudio.addEventListener('click', () => { setPlayerMode('audio'); if(isLyricsMode) toggleLyricsMode(); });
if (ui.btnMobileModeVideo) ui.btnMobileModeVideo.addEventListener('click', () => { setPlayerMode('video'); if(isLyricsMode) toggleLyricsMode(); });
if (ui.btnMobileModeAudio) ui.btnMobileModeAudio.addEventListener('click', () => { setPlayerMode('audio'); if(isLyricsMode) toggleLyricsMode(); });
ui.btnModeLyrics.addEventListener('click', toggleLyricsMode);
ui.btnLyricsBack.addEventListener('click', toggleLyricsMode);

if(ui.btnTogglePlayer) { ui.btnTogglePlayer.addEventListener('click', (e) => { if (e) e.stopPropagation(); togglePlayerExpand(); }); }
if(ui.btnCollapseMobile) { ui.btnCollapseMobile.addEventListener('click', (e) => { e.stopPropagation(); if (!isPlayerCollapsed) togglePlayerExpand(); }); }

if (ui.playerControls) {
    ui.playerControls.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('.queue-action-btn')) return;
        togglePlayerExpand();
    });
}

if(ui.btnMobileChatToggle) { ui.btnMobileChatToggle.addEventListener('click', () => { ui.mainSidebar.classList.remove('max-lg:hidden'); ui.mainSidebar.classList.add('max-lg:flex'); }); }
if(ui.btnCloseMobileChat) { ui.btnCloseMobileChat.addEventListener('click', () => { ui.mainSidebar.classList.add('max-lg:hidden'); ui.mainSidebar.classList.remove('max-lg:flex'); }); }
ui.btnShowPeers.addEventListener('click', () => { ui.tabChat.classList.add('hidden'); ui.tabChat.classList.remove('flex'); ui.tabPeers.classList.remove('hidden'); ui.tabPeers.classList.add('flex'); });
ui.btnBackChat.addEventListener('click', () => { ui.tabPeers.classList.add('hidden'); ui.tabPeers.classList.remove('flex'); ui.tabChat.classList.remove('hidden'); ui.tabChat.classList.add('flex'); });

// Mobile bottom nav
const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
mobileNavBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        mobileNavBtns.forEach(b => { b.classList.remove('text-pink-500', 'active'); b.classList.add('text-slate-500'); b.querySelector('.material-symbols-rounded').classList.remove('icon-fill'); });
        e.currentTarget.classList.add('text-pink-500', 'active'); e.currentTarget.classList.remove('text-slate-500'); e.currentTarget.querySelector('.material-symbols-rounded').classList.add('icon-fill');
        document.body.classList.remove('mobile-tab-home', 'mobile-tab-queue', 'mobile-tab-chat'); document.body.classList.add(`mobile-tab-${tab}`);

        if (!isPlayerCollapsed) {
            togglePlayerExpand();
        }

        setTimeout(adjustMobileLayout, 50);
    });
});

// ---------------------------------------------------------
// INITIALIZATION FLOW
// ---------------------------------------------------------
function initFlow() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        AppState.isHost = false; AppState.myRole = ROLES.MEMBER; AppState.roomId = hash;
        ui.modalSubtitle.textContent = `Joining Room: ${hash}`; ui.setupBtn.innerHTML = `<span>Join Room</span> <span class="material-symbols-rounded icon-fill text-[16px]">play_circle</span>`;
    } else {
        AppState.isHost = true; AppState.myRole = ROLES.OWNER;
        ui.hostSetupFields.classList.remove('hidden'); ui.modalSubtitle.textContent = "Create a New Room";
    }

    const savedName = localStorage.getItem('bloom_name');
    if (savedName) ui.setupName.value = savedName;
    ui.setupBtn.addEventListener('click', handleSetupComplete);
}

function handleSetupComplete() {
    const name = ui.setupName.value.trim();
    if (!name) return showToast('Please enter a display name', 'error');

    AppState.displayName = name; localStorage.setItem('bloom_name', name);

    if (AppState.isHost) {
        let room = ui.setupRoom.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
        if (!room) room = 'room-' + Math.random().toString(36).substring(2, 8);
        AppState.roomId = `bloom-${room}`; window.location.hash = AppState.roomId; document.getElementById('room-id-display').textContent = AppState.roomId;
    } else { document.getElementById('room-id-display').textContent = AppState.roomId; }

    ui.modal.style.opacity = '0'; setTimeout(() => ui.modal.classList.add('hidden'), 300);
    initializeWebRTC();
}

function startSyncLoop() {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(() => {
        if (!isPlayerReady || !ytPlayer || !ytPlayer.getPlayerState) return;
        const state = ytPlayer.getPlayerState();
        if (state === 1 || state === 2) broadcast({ type: 'SYNC_STATE', state: state, time: ytPlayer.getCurrentTime() });
    }, 3000);
}

window.addEventListener('DOMContentLoaded', initFlow);