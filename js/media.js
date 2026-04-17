// --- Initialize YouTube IFrame API Dynamically ---
(function injectYTApi() {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    if (firstScriptTag) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    } else {
        document.head.appendChild(tag);
    }
})();

window.onYouTubeIframeAPIReady = function() {
    ytPlayer = new YT.Player('player', {
        height: '100%', width: '100%',
        playerVars: {
            'autoplay': 1,
            'controls': 0,
            'disablekb': 1,
            'rel': 0,
            'modestbranding': 1,
            'playsinline': 1
        },
        events: {
            'onReady': () => { isPlayerReady = true; setupProgressLoop(); },
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
};

function onPlayerError(event) {
    const errorCodes = {
        2: 'Invalid parameter',
        5: 'HTML5 player error',
        100: 'Video not found or removed',
        101: 'Embedding disabled by copyright owner',
        150: 'Embedding disabled by copyright owner'
    };

    const msg = errorCodes[event.data] || 'Unknown playback error';
    sysLog('ERROR', `Youtubeer Error: Code ${event.data} (${msg})`);

    if (AppState.myRole === ROLES.OWNER || AppState.myRole === ROLES.ADMIN) {
        showToast(`Playback error: ${msg}. Skipping...`, 'error');
        setTimeout(() => playNextInQueue(), 2000);
    }
}

function onPlayerStateChange(event) {
    const state = event.data; const time = ytPlayer.getCurrentTime();
    if (state === 1) {
        AppState.isPlaying = true;
        ui.iconPlay.classList.add('hidden'); ui.iconPause.classList.remove('hidden');
        ui.guestIconPlay.classList.add('hidden'); ui.guestIconPause.classList.remove('hidden');
        ui.videoWrapper.classList.add('playing');
        if (ui.ambientLayer) ui.ambientLayer.classList.add('ambient-playing');
        renderQueue();
    } else if (state === 2 || state === 0 || state === 5) {
        AppState.isPlaying = false;
        ui.iconPlay.classList.remove('hidden'); ui.iconPause.classList.add('hidden');
        ui.guestIconPlay.classList.remove('hidden'); ui.guestIconPause.classList.add('hidden');
        ui.videoWrapper.classList.remove('playing');
        if (ui.ambientLayer) ui.ambientLayer.classList.remove('ambient-playing');
        renderQueue();
    }

    if (AppState.isHost) {
        if (!isProgrammaticAction) broadcast({ type: 'SYNC_STATE', state: state, time: time });
        if (state === 0) {
            if (AppState.currentIndex < AppState.queue.length - 1) {
                playNextInQueue();
            } else {
                isProgrammaticAction = true; ytPlayer.seekTo(0, true); ytPlayer.pauseVideo();
                broadcast({ type: 'SYNC_STATE', state: 2, time: 0 }); setTimeout(() => isProgrammaticAction = false, 300);
            }
        }
    }
}

function setupProgressLoop() {
    if (progressInterval) clearInterval(progressInterval);
    progressInterval = setInterval(() => {
        if (!isPlayerReady || !ytPlayer || !ytPlayer.getCurrentTime) return;
        const current = ytPlayer.getCurrentTime() || 0; const total = ytPlayer.getDuration() || 0;
        ui.timeCurrent.textContent = formatTime(current); ui.timeTotal.textContent = formatTime(total);

        if (total > 0 && document.activeElement !== ui.progressBar) {
            const percent = (current / total) * 100;
            ui.progressBar.value = percent; ui.progressBar.style.setProperty('--range-progress', `${percent}%`);
        }

        if (isLyricsMode && AppState.currentLyrics && AppState.currentLyrics.length > 0) {
            let activeIndex = -1;
            for (let i = 0; i < AppState.currentLyrics.length; i++) {
                if (current >= AppState.currentLyrics[i].time - 0.25) activeIndex = i; else break;
            }

            if (activeIndex !== -1 && activeIndex !== AppState.activeLyricIndex) {
                if (AppState.activeLyricIndex !== -1) {
                    const oldEl = document.getElementById(`lyric-${AppState.activeLyricIndex}`);
                    if (oldEl) { oldEl.classList.remove('lyric-active'); oldEl.classList.add('text-slate-400'); }
                }
                const newEl = document.getElementById(`lyric-${activeIndex}`);
                if (newEl) {
                    newEl.classList.add('lyric-active'); newEl.classList.remove('text-slate-400');
                    ui.lyricsContainer.scrollTo({ top: newEl.offsetTop - (ui.lyricsContainer.clientHeight / 2) + (newEl.clientHeight / 2), behavior: 'smooth' });
                }
                AppState.activeLyricIndex = activeIndex;
            }
        }
    }, 200);
}

// ---------------------------------------------------------
// PLAYER CONTROLS & LOAD LOGIC
// ---------------------------------------------------------
ui.btnPlayPause.addEventListener('click', () => executeCommand('TOGGLE_PLAY'));
ui.mediaPlaybackArea.addEventListener('click', () => {
    if (isPlayerCollapsed) togglePlayerExpand();
    else executeCommand('TOGGLE_PLAY');
});

ui.progressBar.addEventListener('change', (e) => {
    const percent = parseFloat(e.target.value);
    ui.progressBar.style.setProperty('--range-progress', `${percent}%`);
    executeCommand('SEEK', { time: (percent / 100) * ytPlayer.getDuration() });
});
ui.progressBar.addEventListener('input', (e) => { ui.progressBar.style.setProperty('--range-progress', `${parseFloat(e.target.value)}%`); });

ui.btnPrev.addEventListener('click', () => executeCommand('PREV'));
ui.btnNext.addEventListener('click', () => executeCommand('NEXT'));

function updateVolumeUI(vol) {
    ui.iconVolHigh.classList.add('hidden'); ui.iconVolLow.classList.add('hidden'); ui.iconVolMute.classList.add('hidden');
    if (vol == 0) ui.iconVolMute.classList.remove('hidden');
    else if (vol < 50) ui.iconVolLow.classList.remove('hidden');
    else ui.iconVolHigh.classList.remove('hidden');
}

ui.volumeBar.addEventListener('input', (e) => {
    if (!isPlayerReady) return;
    const vol = e.target.value; ui.volumeBar.style.setProperty('--range-progress', `${vol}%`);
    ytPlayer.setVolume(vol); updateVolumeUI(vol);
});

ui.btnMute.addEventListener('click', () => {
    if (!isPlayerReady) return;
    if (ytPlayer.isMuted() || ytPlayer.getVolume() == 0) {
        ytPlayer.unMute(); let vol = ytPlayer.getVolume(); if (vol == 0) vol = 100;
        ytPlayer.setVolume(vol); ui.volumeBar.value = vol; ui.volumeBar.style.setProperty('--range-progress', `${vol}%`);
        updateVolumeUI(vol);
    } else {
        ytPlayer.mute(); ui.volumeBar.value = 0; ui.volumeBar.style.setProperty('--range-progress', `0%`);
        updateVolumeUI(0);
    }
});

ui.btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) { ui.videoWrapper.requestFullscreen().catch(err => console.error(err)); } else { document.exitFullscreen(); }
});

document.addEventListener('fullscreenchange', () => {
    const icon = ui.btnFullscreen.querySelector('.material-symbols-rounded');
    if (document.fullscreenElement) {
        icon.textContent = 'fullscreen_exit';
        if (isPlayerCollapsed) {
            isPlayerCollapsed = false;
            ui.videoWrapper.classList.remove('is-collapsed');
            ui.playerToggleIcon.textContent = 'expand_more';
            document.body.classList.add('player-expanded');
        }
    } else { icon.textContent = 'fullscreen'; }
});

function loadVideoInternal(videoObj, startSeconds = 0, targetState = 1) {
    if (!isPlayerReady || typeof ytPlayer?.loadVideoById !== 'function') {
        setTimeout(() => loadVideoInternal(videoObj, startSeconds, targetState), 500);
        return;
    }

    AppState.currentVideo = videoObj;
    ui.emptyState.classList.add('opacity-0', 'pointer-events-none');
    ui.videoWrapper.classList.add('video-loaded');

    ui.audioTitle.style.display = 'none';
    ui.nowPlayingTitle.textContent = videoObj.title;
    ui.nowPlayingAuthor.textContent = `${videoObj.author || 'Unknown'}${videoObj.year ? ` • ${videoObj.year}` : ''}`;
    ui.audioTitle.textContent = videoObj.title;

    ui.audioThumbnail.className = 'w-[80%] sm:w-[360px] lg:w-[460px] aspect-square rounded-2xl object-cover shadow-2xl transition-all duration-300';
    ui.audioPlaceholder.className = 'w-[80%] sm:w-[360px] lg:w-[460px] aspect-square rounded-2xl bg-slate-800/80 backdrop-blur-md flex items-center justify-center shadow-2xl border border-slate-700/50';

    const finalCover = Array.isArray(videoObj.thumbnail) ? videoObj.thumbnail[0] : videoObj.thumbnail;

    if (finalCover && finalCover !== 'undefined') {
        ui.audioThumbnail.src = finalCover; ui.audioThumbnail.style.display = 'block'; ui.audioPlaceholder.style.display = 'none';
        ui.nowPlayingCover.src = finalCover; ui.nowPlayingCover.classList.remove('hidden');
        updateAmbientColors(finalCover);
    } else {
        ui.audioThumbnail.style.display = 'none'; ui.audioPlaceholder.style.display = 'flex';
        ui.nowPlayingCover.classList.add('hidden'); updateAmbientColors(null);
    }

    AppState.lastFetchedLyricsId = null;

    if (videoObj.isMusic && currentPlayerMode === 'video') setPlayerMode('audio');
    else if (!videoObj.isMusic && currentPlayerMode === 'audio') setPlayerMode('video');

    if (isLyricsMode) fetchAndRenderLyrics();

    isProgrammaticAction = true;
    if (targetState === 1 || targetState === 3) ytPlayer.loadVideoById(videoObj.id, startSeconds); else ytPlayer.cueVideoById(videoObj.id, startSeconds);
    setTimeout(() => isProgrammaticAction = false, 1000);

    if (targetState === 1 || targetState === 3) {
        setTimeout(() => {
            if (ytPlayer && typeof ytPlayer.getPlayerState === 'function') {
                const state = ytPlayer.getPlayerState();
                if (state === -1 || state === 5) {
                    ytPlayer.playVideo();
                }
            }
        }, 2500);
    }
}

function hostPlayItem(videoObj) {
    sysLog('APP', `Playing: ${videoObj.title}`);
    loadVideoInternal(videoObj, 0, 1);
    broadcast({ type: 'LOAD_VIDEO', video: videoObj });
}

function enforceHostState(data) {
    if (!isPlayerReady || !ytPlayer || !ytPlayer.getPlayerState) return;
    const hostState = data.state; const hostTime = data.time; const guestState = ytPlayer.getPlayerState(); const guestTime = ytPlayer.getCurrentTime();
    isProgrammaticAction = true;
    if (Math.abs(guestTime - hostTime) > 2) ytPlayer.seekTo(hostTime, true);
    if (hostState === 1 && guestState !== 1 && guestState !== 3) ytPlayer.playVideo(); else if (hostState === 2 && guestState !== 2) ytPlayer.pauseVideo();
    setTimeout(() => isProgrammaticAction = false, 300);
}

// ---------------------------------------------------------
// LYRICS ENGINE
// ---------------------------------------------------------
function cleanTitleForLyrics(title) {
    return title
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/【.*?】/g, '')
        .replace(/ft\..*/i, '')
        .replace(/feat\..*/i, '')
        .replace(/official( music)? video/i, '')
        .replace(/lyric(s)?( video)?/i, '')
        .replace(/audio/i, '')
        .replace(/\|.*/, '')
        .replace(/- topic/i, '')
        .replace(/MV/i, '')
        .replace(/"/g, '')
        .trim();
}

async function fetchAndRenderLyrics() {
    if (!AppState.currentVideo) return;
    AppState.lastFetchedLyricsId = AppState.currentVideo.id;
    AppState.currentLyrics = [];
    AppState.activeLyricIndex = -1;
    ui.lyricsContainer.innerHTML = `<div class="text-slate-500 text-sm mt-16 flex flex-col items-center gap-2 animate-pulse"><span class="material-symbols-rounded text-[32px] animate-spin">sync</span><span>Searching for lyrics...</span></div>`;

    let rawTitle = AppState.currentVideo.title || '';
    let rawAuthor = AppState.currentVideo.author || '';

    let parsedTitle = rawTitle;
    let parsedAuthor = rawAuthor;

    if (rawTitle.includes(' - ')) {
        const parts = rawTitle.split(' - ');
        if (parts.length >= 2) {
            parsedAuthor = parts[0].trim();
            parsedTitle = parts.slice(1).join(' - ').trim();
        }
    }

    const cleanTitle = cleanTitleForLyrics(parsedTitle);
    const cleanAuthor = parsedAuthor.replace(/ - topic/i, '').replace(/vevo/i, '').replace(/official/i, '').trim();

    if (!cleanTitle) {
        ui.lyricsContainer.innerHTML = `<div class="text-slate-500 text-sm mt-16 flex flex-col items-center gap-2"><span class="material-symbols-rounded text-[32px]">music_off</span><span>No lyrics found.</span></div>`;
        return;
    }

    try {
        let query = encodeURIComponent(`${cleanTitle} ${cleanAuthor}`.trim());
        let res = await fetch(`https://lrclib.net/api/search?q=${query}`);
        let data = await res.json();

        const findBestMatch = (results) => {
            if (!results || !results.length) return null;
            let best = null;
            let highestScore = -999;
            const qTitle = cleanTitle.toLowerCase();
            const qAuthor = cleanAuthor.toLowerCase();

            for (const r of results) {
                if (!r.syncedLyrics) continue;
                let score = 0;
                const rTitle = (r.trackName || '').toLowerCase();
                const rArtist = (r.artistName || '').toLowerCase();

                if (rTitle === qTitle) score += 50;
                else if (qTitle.includes(rTitle) || rTitle.includes(qTitle)) score += 20;

                if (rArtist === qAuthor) score += 50;
                else if (qAuthor.includes(rArtist) || rArtist.includes(qAuthor)) score += 20;
                else {
                    const qAuthorWords = qAuthor.split(' ');
                    let matchCount = 0;
                    qAuthorWords.forEach(w => { if(w.length > 2 && rArtist.includes(w)) matchCount++; });
                    if (matchCount > 0) score += 10 * matchCount;
                }

                if (!qTitle.includes(rTitle) && !rTitle.includes(qTitle) && score < 40) {
                   score -= 50;
                }

                if (score > highestScore) {
                    highestScore = score;
                    best = r;
                }
            }
            return highestScore >= 0 ? best : null;
        };

        let bestMatch = findBestMatch(data);

        if (!bestMatch) {
            res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`);
            data = await res.json();
            bestMatch = findBestMatch(data);
        }

        if (bestMatch && bestMatch.syncedLyrics) {
            AppState.currentLyrics = parseLRC(bestMatch.syncedLyrics);
            renderLyricsLines();
        } else {
            ui.lyricsContainer.innerHTML = `<div class="text-slate-500 text-sm mt-16 flex flex-col items-center gap-2"><span class="material-symbols-rounded text-[32px]">music_off</span><span>No synchronized lyrics found.</span></div>`;
        }
    } catch (err) {
        ui.lyricsContainer.innerHTML = `<div class="text-slate-500 text-sm mt-16 flex flex-col items-center gap-2"><span class="material-symbols-rounded text-[32px]">error</span><span>Failed to retrieve lyrics.</span></div>`;
    }
}

function parseLRC(lrcText) {
    const lines = lrcText.split('\n'); const result = []; const regex = /\[(\d{2}):(\d{2}(\.\d{2,3})?)\](.*)/;
    for (let line of lines) {
        const match = line.match(regex);
        if (match) {
            const m = parseInt(match[1], 10);
            const s = parseFloat(match[2]);
            const text = match[4].trim();
            if (text || result.length > 0) result.push({ time: m * 60 + s, text: text || '🎵' });
        }
    }
    return result;
}

function renderLyricsLines() {
    ui.lyricsContainer.innerHTML = '<div class="h-[40%] w-full shrink-0 pointer-events-none"></div>';
    AppState.currentLyrics.forEach((line, index) => {
        const div = document.createElement('div'); div.className = 'lyric-line font-medium text-slate-400 text-sm hover:text-slate-300 cursor-pointer py-2 px-4 rounded-xl hover:bg-white/5 max-w-[90%] mx-auto leading-relaxed';
        div.textContent = line.text; div.id = `lyric-${index}`;
        if (AppState.myRole === ROLES.OWNER || AppState.myRole === ROLES.ADMIN) { div.onclick = () => executeCommand('SEEK', { time: line.time }); }
        ui.lyricsContainer.appendChild(div);
    });
    ui.lyricsContainer.innerHTML += '<div class="h-[60%] w-full shrink-0 pointer-events-none"></div>';
    AppState.activeLyricIndex = -1;
}

// ---------------------------------------------------------
// QUEUE LOGIC
// ---------------------------------------------------------
function updateQueueState() {
    renderQueue();
    broadcast({ type: 'SYNC_QUEUE', queue: AppState.queue, currentIndex: AppState.currentIndex, isShuffled: AppState.isShuffled });
}

function toggleShuffle() {
    if (AppState.queue.length <= 1) return;

    if (AppState.isShuffled) {
        const currentItem = AppState.currentIndex >= 0 ? AppState.queue[AppState.currentIndex] : null;
        AppState.queue = [...AppState.originalQueue];
        AppState.isShuffled = false;
        AppState.currentIndex = currentItem ? AppState.queue.indexOf(currentItem) : -1;
        sysLog('APP', 'Queue unshuffled');
    } else {
        AppState.originalQueue = [...AppState.queue];
        if (AppState.currentIndex >= 0 && AppState.currentIndex < AppState.queue.length) {
            const currentItem = AppState.queue[AppState.currentIndex];
            const q = [...AppState.queue];
            q.splice(AppState.currentIndex, 1);

            for (let i = q.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [q[i], q[j]] = [q[j], q[i]];
            }
            AppState.queue = [currentItem, ...q];
            AppState.currentIndex = 0;
        } else {
            const q = [...AppState.queue];
            for (let i = q.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [q[i], q[j]] = [q[j], q[i]];
            }
            AppState.queue = q;
        }
        AppState.isShuffled = true;
        sysLog('APP', 'Queue shuffled');
    }

    updateQueueState();
}

function renderQueue() {
    const queue = AppState.queue;
    const isController = AppState.myRole === ROLES.OWNER || AppState.myRole === ROLES.ADMIN;

    if (AppState.isShuffled) {
        ui.btnShuffle.classList.add('text-white', 'bg-slate-700'); ui.btnShuffle.classList.remove('text-slate-400', 'bg-slate-800');
        if (ui.btnMainShuffle) { ui.btnMainShuffle.classList.add('text-white'); ui.btnMainShuffle.classList.remove('text-slate-400'); }
    } else {
        ui.btnShuffle.classList.remove('text-white', 'bg-slate-700'); ui.btnShuffle.classList.add('text-slate-400', 'bg-slate-800');
        if (ui.btnMainShuffle) { ui.btnMainShuffle.classList.remove('text-white'); ui.btnMainShuffle.classList.add('text-slate-400'); }
    }

    ui.queueList.innerHTML = ''; ui.queueCount.textContent = queue.length;
    if (queue.length === 0) { ui.queueEmptyMsg.classList.remove('hidden'); return; }
    ui.queueEmptyMsg.classList.add('hidden');

    queue.forEach((item, index) => {
        const li = document.createElement('li');
        const isPlaying = index === AppState.currentIndex && index !== -1;
        const isActuallyPlaying = isPlaying && AppState.isPlaying;

        li.className = `flex items-center gap-2 p-2 rounded-lg border transition-all group ${isPlaying ? 'queue-item-active' : 'border-slate-700/50 bg-slate-900/50 hover:bg-slate-800'} ${isController ? 'cursor-pointer' : ''}`;

        if (isController) {
            li.onclick = (e) => {
                if (e.target.closest('.queue-action-btn')) return;
                if (isPlaying) executeCommand('TOGGLE_PLAY'); else executeCommand('PLAY_FROM_QUEUE', {index: index});
            };

            li.draggable = true;
            li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', index); e.dataTransfer.effectAllowed = 'move'; li.classList.add('opacity-50'); });
            li.addEventListener('dragend', () => { li.classList.remove('opacity-50'); document.querySelectorAll('#queue-list li').forEach(el => el.classList.remove('border-t-2', 'border-pink-500')); });
            li.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; li.classList.add('border-t-2', 'border-pink-500'); });
            li.addEventListener('dragleave', () => { li.classList.remove('border-t-2', 'border-pink-500'); });
            li.addEventListener('drop', (e) => { e.preventDefault(); li.classList.remove('border-t-2', 'border-pink-500'); const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!isNaN(fromIndex) && fromIndex !== index) executeCommand('REORDER_QUEUE', { fromIndex, toIndex: index }); });
        }

        const thumbArray = Array.isArray(item.thumbnail) ? item.thumbnail : [item.thumbnail];
        let thumbImg = thumbArray.find(t => typeof t === 'string' && t !== 'undefined') || `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`;
        const playPauseIcon = isActuallyPlaying ? 'pause' : 'play_arrow';

        li.innerHTML = `
            ${isController ? `<div class="queue-action-btn cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 flex-shrink-0" title="Drag to reorder"><span class="material-symbols-rounded text-[16px]">drag_indicator</span></div>` : ''}
            <div class="relative w-16 h-10 flex-shrink-0 rounded overflow-hidden bg-slate-800 border border-slate-700/50">
                <img src="${thumbImg}" class="w-full h-full object-cover">
                ${item.isMusic ? '<div class="absolute inset-0 bg-black/40 flex items-center justify-center"><span class="material-symbols-rounded text-[14px] text-white">music_note</span></div>' : ''}
                ${isPlaying ? '<div class="absolute inset-0 bg-black/50 flex items-center justify-center"><span class="material-symbols-rounded text-[16px] text-white">equalizer</span></div>' : ''}
            </div>
            <div class="flex-1 min-w-0 flex flex-col justify-center">
                <p class="text-xs font-medium ${isPlaying ? 'text-white' : 'text-slate-200'} truncate">${item.title}</p>
                <div class="flex justify-between items-center mt-0.5">
                    <p class="text-[10px] text-slate-500 truncate">${item.author || 'Unknown'}${item.year ? ' • ' + item.year : ''}</p>
                    ${item.duration ? `<p class="text-[10px] text-slate-400 font-mono ml-2">${formatTime(item.duration)}</p>` : ''}
                </div>
            </div>
            ${isController ? `
            <div class="flex flex-col -space-y-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mr-1 queue-action-btn">
                <button class="text-slate-500 hover:text-white disabled:opacity-30 p-1" onclick="executeCommand('REORDER_QUEUE', {fromIndex: ${index}, toIndex: ${index - 1}})" ${index === 0 ? 'disabled' : ''} title="Move Up"><span class="material-symbols-rounded text-[12px]">expand_less</span></button>
                <button class="text-slate-500 hover:text-white disabled:opacity-30 p-1" onclick="executeCommand('REORDER_QUEUE', {fromIndex: ${index}, toIndex: ${index + 1}})" ${index === queue.length - 1 ? 'disabled' : ''} title="Move Down"><span class="material-symbols-rounded text-[12px]">expand_more</span></button>
            </div>
            <button class="queue-action-btn text-slate-500 hover:text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onclick="if(${isPlaying}){executeCommand('TOGGLE_PLAY');}else{executeCommand('PLAY_FROM_QUEUE', {index: ${index}});}" title="${isPlaying ? 'Play/Pause' : 'Play Now'}"><span class="material-symbols-rounded icon-fill text-[16px]">${playPauseIcon}</span></button>
            <button class="queue-action-btn text-slate-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onclick="executeCommand('REMOVE_FROM_QUEUE', {index: ${index}})" title="Remove"><span class="material-symbols-rounded text-[16px]">close</span></button>
            ` : ''}`;
        ui.queueList.appendChild(li);
    });
}

function playNextInQueue() {
    if (AppState.queue.length === 0) return;

    if (AppState.currentIndex < AppState.queue.length - 1) {
        AppState.currentIndex++;
        hostPlayItem(AppState.queue[AppState.currentIndex]);
        updateQueueState();
    }
}

// UI Bindings
ui.btnShuffle.addEventListener('click', () => executeCommand('SHUFFLE'));
if (ui.btnMainShuffle) ui.btnMainShuffle.addEventListener('click', () => executeCommand('SHUFFLE'));
ui.btnClearQueue.addEventListener('click', () => executeCommand('CLEAR_QUEUE'));