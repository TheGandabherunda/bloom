// --- Application Roles & State ---
var ROLES = {
    OWNER: 'Owner',
    ADMIN: 'Admin',
    MEMBER: 'Member'
};

var AppState = {
    isHost: false,
    myRole: '',
    roomId: '',
    displayName: '',
    peerId: '',
    peers: new Map(),
    hostConnection: null,
    members: [],

    queue: [],
    originalQueue: [],
    currentIndex: -1,
    currentVideo: null,
    isAudioMode: false,
    isPlaying: false,
    isShuffled: false,
    lastSearchResults: [],

    currentLyrics: [],
    lastFetchedLyricsId: null,
    activeLyricIndex: -1,

    peerConfig: {
        debug: 2,
        config: {
            iceServers: [
                // Google STUN (most reliable globally)
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                // Cloudflare & Twilio STUN
                { urls: 'stun:stun.cloudflare.com:3478' },
                { urls: 'stun:global.stun.twilio.com:3478' },
                // Open Relay TURN — all ports + transports for strict NATs
                // TCP variants are critical: UDP is often blocked on mobile/corporate networks
                { urls: 'turn:openrelay.metered.ca:80',                username: 'openrelayproject', credential: 'openrelayproject' },
                { urls: 'turn:openrelay.metered.ca:80?transport=tcp',  username: 'openrelayproject', credential: 'openrelayproject' },
                { urls: 'turn:openrelay.metered.ca:443',               username: 'openrelayproject', credential: 'openrelayproject' },
                { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
                // FreeTURN — independent public TURN server
                { urls: 'turn:freeturn.net:3478', username: 'free', credential: 'free' },
                { urls: 'turn:freeturn.net:5349', username: 'free', credential: 'free' },
                // Anyfirewall — extra relay for double-NAT / carrier-grade NAT networks
                { urls: 'turn:turn.anyfirewall.com:443?transport=tcp', username: 'webrtc', credential: 'webrtc' }
            ]
        }
    }
};

// --- Globals ---
var peer = null;
var ytPlayer = null;
var isPlayerReady = false;
var syncInterval = null;
var progressInterval = null;
var isProgrammaticAction = false;
var pendingChatImage = null;
var currentPlayerMode = 'video';
var isLyricsMode = false;
var isPlayerCollapsed = true;

// Search Cache & Network Abort Controller
var SearchCache = new Map();
var currentSearchId = 0;
var currentSearchQuery = '';
var currentCategorizedResults = { music: [], videos: [], playlists: [] };
var isSearching = false;
var globalSearchController = null;

// --- DOM References ---
var ui = {
    modal: document.getElementById('setup-modal'),
    modalSubtitle: document.getElementById('modal-subtitle'),
    setupName: document.getElementById('setup-name'),
    setupRoom: document.getElementById('setup-room'),
    setupBtn: document.getElementById('setup-btn'),
    hostSetupFields: document.getElementById('host-setup-fields'),
    roleBadge: document.getElementById('role-badge'),

    ambientLayer: document.getElementById('ambient-layer'),

    videoWrapper: document.getElementById('video-wrapper'),
    videoContainer: document.getElementById('video-container'),
    mediaPlaybackArea: document.getElementById('media-playback-area'),
    emptyState: document.getElementById('empty-state'),
    emptyStateText: document.getElementById('empty-state-text'),
    overlayPlay: document.getElementById('overlay-play'),
    overlayPause: document.getElementById('overlay-pause'),
    audioCover: document.getElementById('audio-cover'),
    audioThumbnail: document.getElementById('audio-thumbnail'),
    audioPlaceholder: document.getElementById('audio-placeholder'),
    audioTitle: document.getElementById('audio-title'),

    btnCollapseMobile: document.getElementById('btn-collapse-mobile'),

    searchForm: document.getElementById('search-form'),
    searchInput: document.getElementById('search-input'),
    loaderSearch: document.getElementById('loader-search'),
    btnClearSearch: document.getElementById('btn-clear-search'),
    searchOverlay: document.getElementById('search-overlay'),
    btnCloseSearch: document.getElementById('btn-close-search'),
    secSearchPlaceholder: document.getElementById('sec-search-placeholder'),

    secMusic: document.getElementById('sec-music'),
    gridMusic: document.getElementById('grid-music'),
    secVideos: document.getElementById('sec-videos'),
    gridVideos: document.getElementById('grid-videos'),
    secPlaylists: document.getElementById('sec-playlists'),
    gridPlaylists: document.getElementById('grid-playlists'),

    btnTogglePlayer: document.getElementById('btn-toggle-player'),
    playerToggleIcon: document.getElementById('player-toggle-icon'),
    playerControls: document.getElementById('player-controls'),

    progressBar: document.getElementById('progress-bar'),
    timeCurrent: document.getElementById('time-current'),
    timeTotal: document.getElementById('time-total'),
    btnPlayPause: document.getElementById('btn-play-pause'),
    iconPlay: document.getElementById('wrapper-play'),
    iconPause: document.getElementById('wrapper-pause'),
    guestIconPlay: document.getElementById('guest-wrapper-play'),
    guestIconPause: document.getElementById('guest-wrapper-pause'),
    btnMainShuffle: document.getElementById('btn-main-shuffle'),
    btnPrev: document.getElementById('btn-prev'),
    btnNext: document.getElementById('btn-next'),
    btnMute: document.getElementById('btn-mute'),
    iconVolHigh: document.getElementById('icon-vol-high'),
    iconVolLow: document.getElementById('icon-vol-low'),
    iconVolMute: document.getElementById('icon-vol-mute'),
    volumeBar: document.getElementById('volume-bar'),

    btnModeVideo: document.getElementById('btn-mode-video'),
    btnModeAudio: document.getElementById('btn-mode-audio'),
    btnMobileModeVideo: document.getElementById('btn-mobile-mode-video'),
    btnMobileModeAudio: document.getElementById('btn-mobile-mode-audio'),
    btnModeLyrics: document.getElementById('btn-mode-lyrics'),
    btnFullscreen: document.getElementById('btn-fullscreen'),
    btnToggleFsQueue: document.getElementById('btn-toggle-fs-queue'),

    nowPlayingCover: document.getElementById('now-playing-cover'),
    nowPlayingTitle: document.getElementById('now-playing-title'),
    nowPlayingAuthor: document.getElementById('now-playing-author'),

    mainSidebar: document.getElementById('main-sidebar'),
    btnMobileChatToggle: document.getElementById('btn-mobile-chat-toggle'),
    btnCloseMobileChat: document.getElementById('btn-close-mobile-chat'),
    btnShowPeers: document.getElementById('btn-show-peers'),
    btnBackChat: document.getElementById('btn-back-chat'),
    tabChat: document.getElementById('tab-chat'),
    tabPeers: document.getElementById('tab-peers'),

    queuePanel: document.getElementById('queue-panel'),
    queueList: document.getElementById('queue-list'),
    queueCount: document.getElementById('queue-count'),
    queueEmptyMsg: document.getElementById('queue-empty-msg'),
    queueTitleText: document.getElementById('queue-title-text'),
    queueTitleIcon: document.getElementById('queue-title-icon'),
    queueCountContainer: document.getElementById('queue-count-container'),
    queueActions: document.getElementById('queue-actions'),
    lyricsContainer: document.getElementById('lyrics-container'),
    btnLyricsBack: document.getElementById('btn-lyrics-back'),

    btnShuffle: document.getElementById('btn-shuffle'),
    btnClearQueue: document.getElementById('btn-clear-queue'),
    videoInput: document.getElementById('video-input'),
    btnAddLink: document.getElementById('btn-add-link'),

    membersList: document.getElementById('members-list'),
    peerCount: document.getElementById('peer-count'),

    chatMessages: document.getElementById('chat-messages'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    btnChatAttach: document.getElementById('btn-chat-attach'),
    btnChatGif: document.getElementById('btn-chat-gif'),
    chatFileInput: document.getElementById('chat-file-input'),
    chatImagePreviewContainer: document.getElementById('chat-image-preview-container'),
    chatImagePreview: document.getElementById('chat-image-preview'),
    btnRemoveImage: document.getElementById('btn-remove-image'),

    gifPopup: document.getElementById('gif-popup'),
    gifSearchInput: document.getElementById('gif-search-input'),
    gifResults: document.getElementById('gif-results'),
    btnCloseGif: document.getElementById('btn-close-gif'),

    btnCopyLink: document.getElementById('btn-copy-link'),
};

// --- Utilities ---
function debounce(func, wait) {
    let timeout;
    const debounced = function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
    debounced.cancel = () => clearTimeout(timeout);
    return debounced;
}

function shuffleArray(array) {
    let curId = array.length;
    while (0 !== curId) {
        let randId = Math.floor(Math.random() * curId);
        curId -= 1;
        let tmp = array[curId];
        array[curId] = array[randId];
        array[randId] = tmp;
    }
    return array;
}

function getUserColor(name) {
    const colors = ['#ff0000', '#ffd300', '#deff0a', '#a1ff0a', '#0aff99', '#0aefff', '#147df5', '#580aff'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00"; const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function sysLog(type, message, data = null) {
    if(data) console.log(`[${type}] ${message}`, data);
    else console.log(`[${type}] ${message}`);
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const colors = {
        info: 'bg-slate-800 border-slate-700',
        error: 'bg-red-900/90 border-red-700',
        success: 'bg-emerald-900/90 border-emerald-700'
    };
    toast.className = `px-4 py-3 rounded-lg border text-white text-sm shadow-xl transform transition-all duration-300 translate-y-full opacity-0 pointer-events-auto ${colors[type]}`;
    toast.textContent = message;
    document.getElementById('toast-container').appendChild(toast);

    requestAnimationFrame(() => toast.classList.remove('translate-y-full', 'opacity-0'));

    setTimeout(() => {
        toast.classList.add('translate-y-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function updateStatus(status, color) {
    console.log(`[Status: ${color}] ${status}`);
}

async function updateAmbientColors(thumbnailUrl) {
    if (!thumbnailUrl || thumbnailUrl.startsWith('data:image')) { applyColors(['transparent', 'transparent', 'transparent', 'transparent']); return; }

    const extract = (src) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
                    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 2, 2);
                    const data = ctx.getImageData(0, 0, 2, 2).data; const extractedColors = [];
                    for(let i = 0; i < 4; i++) extractedColors.push(`rgb(${data[i*4]}, ${data[i*4+1]}, ${data[i*4+2]})`);
                    resolve(extractedColors);
                } catch(e) { reject(e); }
            };
            img.onerror = reject; img.src = src;
        });
    };

    try {
        const colors = await extract(thumbnailUrl);
        applyColors(colors);
    } catch (e) {
        applyColors(['#be0aff', '#ff8700', '#147df5', '#0aff99']);
    }

    function applyColors(colors) {
        if (!ui.ambientLayer) return;
        ui.ambientLayer.style.setProperty('--color-1', colors[0]); ui.ambientLayer.style.setProperty('--color-2', colors[1]);
        ui.ambientLayer.style.setProperty('--color-3', colors[2]); ui.ambientLayer.style.setProperty('--color-4', colors[3]);
        document.documentElement.style.setProperty('--color-1', colors[0]); document.documentElement.style.setProperty('--color-2', colors[1]);
        document.documentElement.style.setProperty('--color-3', colors[2]); document.documentElement.style.setProperty('--color-4', colors[3]);
    }
}

function adjustMobileLayout() {
    const header = document.querySelector('header');
    if (header) {
        document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
    }
}
window.addEventListener('resize', adjustMobileLayout);
window.addEventListener('DOMContentLoaded', adjustMobileLayout);
setTimeout(adjustMobileLayout, 500);