// ---------------------------------------------------------
// URL AND TEXT EXTRACTION HELPERS
// ---------------------------------------------------------
function extractVideoID(url) { const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i); return (match && match[1].length === 11) ? match[1] : null; }
function extractPlaylistID(url) { const match = url.match(/[?&]list=([^#\&\?]+)/); return match ? match[1] : null; }

function extractJSONFromHTML(html, variableNames = ['ytInitialData', 'initialData', 'ytInitialPlayerResponse']) {
    let parsedData = null;
    function tryParse(str) {
        try {
            let unescaped = str;
            if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
                try { unescaped = new Function(`return ${str}`)(); }
                catch (e) {
                    unescaped = str.slice(1, -1).replace(/\\\\/g, '\\').replace(/\\'/g, "'").replace(/\\"/g, '"')
                        .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
                        .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                        .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
                }
            }
            const parsed = JSON.parse(unescaped);
            if (parsed && (parsed.contents || parsed.videoDetails || parsed.onResponseReceivedCommands || parsed.onResponseReceivedActions)) return parsed;
            if (parsed && parsed.data && typeof parsed.data === 'string') {
                const inner = JSON.parse(parsed.data);
                if (inner && (inner.contents || inner.videoDetails || inner.onResponseReceivedCommands || inner.onResponseReceivedActions)) return inner;
            }
        } catch(e) {} return null;
    }

    for (const varName of variableNames) {
        const markers = [`window['${varName}'] =`, `window["${varName}"] =`, `window.${varName} =`, `var ${varName} =`, `${varName} =`, `"${varName}":`, `'${varName}':`];
        for (const marker of markers) {
            let startIndex = 0;
            while ((startIndex = html.indexOf(marker, startIndex)) !== -1) {
                let ptr = startIndex + marker.length; while (ptr < html.length && /\s/.test(html[ptr])) ptr++;
                if (html.startsWith('JSON.parse(', ptr)) {
                    const quoteIndex = ptr + 11; const quote = html[quoteIndex];
                    if (quote === "'" || quote === '"') {
                        let end = -1, escapeNext = false;
                        for (let i = quoteIndex + 1; i < html.length; i++) {
                            if (escapeNext) { escapeNext = false; continue; } if (html[i] === '\\') { escapeNext = true; continue; } if (html[i] === quote) { end = i; break; }
                        }
                        if (end !== -1) { parsedData = tryParse(html.substring(quoteIndex, end + 1)); if (parsedData) return parsedData; }
                    }
                } else if (html[ptr] === '{') {
                    let braceCount = 0, inString = false, stringChar = '', escapeNext = false, jsonEnd = -1;
                    for (let i = ptr; i < html.length; i++) {
                        const c = html[i];
                        if (escapeNext) { escapeNext = false; continue; } if (c === '\\') { escapeNext = true; continue; }
                        if (inString) { if (c === stringChar) inString = false; continue; } if (c === '"' || c === "'") { inString = true; stringChar = c; continue; }
                        if (c === '{') braceCount++; else if (c === '}') { braceCount--; if (braceCount === 0) { jsonEnd = i + 1; break; } }
                    }
                    if (jsonEnd !== -1) { parsedData = tryParse(html.substring(ptr, jsonEnd)); if (parsedData) return parsedData; }
                } else if (html[ptr] === '"' || html[ptr] === "'") {
                    const quote = html[ptr]; let end = -1, escapeNext = false;
                    for (let i = ptr + 1; i < html.length; i++) {
                        if (escapeNext) { escapeNext = false; continue; } if (html[i] === '\\') { escapeNext = true; continue; } if (html[i] === quote) { end = i; break; }
                    }
                    if (end !== -1) { parsedData = tryParse(html.substring(ptr, end + 1)); if (parsedData) return parsedData; }
                }
                startIndex += marker.length;
            }
        }
    }
    return null;
}

function parseYearFromText(text) {
    if (!text) return ''; const lower = text.toLowerCase(); const yearMatch = lower.match(/(\d+)\s*year/);
    if (yearMatch) return (new Date().getFullYear() - parseInt(yearMatch[1])).toString();
    if (/(month|week|day|hour|minute|second)/.test(lower)) return new Date().getFullYear().toString(); return '';
}

function validateText(text) { if (typeof text !== 'string') return null; const t = text.trim(); if (!t || t.toLowerCase() === 'undefined' || t.toLowerCase() === 'null') return null; return t; }

function getYTText(txtObj) {
    if (!txtObj) return null; if (typeof txtObj === 'string') return validateText(txtObj);
    if (typeof txtObj.simpleText === 'string') return validateText(txtObj.simpleText);
    if (Array.isArray(txtObj.runs)) return validateText(txtObj.runs.map(r => r.text || '').join(''));
    if (typeof txtObj.content === 'string') return validateText(txtObj.content);
    if (typeof txtObj.text === 'string') return validateText(txtObj.text);
    if (txtObj.text && typeof txtObj.text === 'object') return getYTText(txtObj.text);
    if (typeof txtObj.accessibility?.accessibilityData?.label === 'string') return validateText(txtObj.accessibility.accessibilityData.label);
    return null;
}

function findAuthorName(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const priorityPaths = [ obj.shortBylineText, obj.longBylineText, obj.ownerText, obj.byline, obj.secondaryText, obj.videoOwnerText, obj.authorText, obj.creatorText, obj.metadata?.lockupMetadataViewModel?.creatorText, obj.metadata?.lockupMetadataViewModel?.ownerText, obj.metadata?.lockupMetadataViewModel?.secondaryText ];
    if (obj.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows) {
        const rows = obj.metadata.lockupMetadataViewModel.metadata.contentMetadataViewModel.metadataRows;
        for (let row of rows) { if (Array.isArray(row.metadataParts)) for (let part of row.metadataParts) priorityPaths.push(part); }
    }
    for (let path of priorityPaths) {
        let rawText = getYTText(path);
        if (rawText) {
            let candidate = rawText.split('•')[0].split('\n')[0].trim();
            if (candidate && !candidate.match(/^[\d,.]+\s*(view|subscriber|video|ago|hour|minute|day|month|year|k|m|b)s?/i) && candidate.toLowerCase() !== 'playlist' && candidate.toLowerCase() !== 'mix') return candidate;
        }
    }
    let deepAuthor = null;
    function findBrowse(o) {
        if (deepAuthor) return; if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { o.forEach(findBrowse); return; }
        if (o.runs && Array.isArray(o.runs)) {
            for (let r of o.runs) {
                if (r.navigationEndpoint && (r.navigationEndpoint.browseEndpoint?.browseId?.startsWith('UC') || r.navigationEndpoint.canonicalBaseUrl?.startsWith('/@'))) {
                    let text = validateText(r.text); if (text) { deepAuthor = text; return; }
                }
            }
        }
        for (let key in o) { if (['title', 'descriptionSnippet', 'descriptionText', 'description'].includes(key)) continue; if (typeof o[key] === 'object') findBrowse(o[key]); }
    }
    findBrowse(obj); return deepAuthor || null;
}

function extractValidThumbnails(obj) {
    const urls = []; if (!obj) return urls; const str = JSON.stringify(obj); const regex = /"url":"([^"]+)"/g; let match;
    while ((match = regex.exec(str)) !== null) {
        let url = match[1]; if (url.startsWith('//')) url = 'https:' + url;
        if (url.includes('ytimg.com') || url.includes('ggpht.com')) urls.push(url);
    }
    const uniqueUrls = []; const seenBases = new Set();
    urls.reverse().forEach(u => { const base = u.split('?')[0]; if (!seenBases.has(base)) { seenBases.add(base); uniqueUrls.push(u); } });
    return uniqueUrls.reverse();
}

// ---------------------------------------------------------
// STRICT CATEGORY CLASSIFIER
// Music  = audio-only tracks (Topic channels, official audio, lyrics)
// Videos = everything else including music videos, live, etc.
// ---------------------------------------------------------
function classifyItem(title, author, forceCategory) {
    const t = (title || '').toLowerCase();
    const a = (author || '').toLowerCase();

    const strongMusicSignals = [
        a.endsWith(' - topic'),
        t.includes('official audio'),
        t.includes('(audio)'),
        t.includes('[audio]'),
        t.includes('audio only'),
        t.includes('lyric video'),
        t.includes('lyrics video'),
        t.includes(' lyrics'),
        t.includes('(lyrics)'),
        t.includes('[lyrics]'),
        t.endsWith(' lyrics'),
    ];

    const videoSignals = [
        t.includes('official video'),
        t.includes('official mv'),
        t.includes('official music video'),
        t.includes('music video'),
        t.includes('(mv)'),
        t.includes('[mv]'),
        t.includes('video clip'),
        t.includes('live at'),
        t.includes('live from'),
        t.includes('live performance'),
        t.includes('concert'),
        t.includes('(live)'),
        t.includes('[live]'),
        t.includes('live version'),
        t.includes('reaction'),
        t.includes('behind the scenes'),
        t.includes('vlog'),
        t.includes('podcast'),
        t.includes('interview'),
        t.includes('episode'),
        t.includes('trailer'),
    ];

    const hasStrongMusic = strongMusicSignals.some(Boolean);
    const hasVideoSignal = videoSignals.some(Boolean);

    if (forceCategory === 'music') {
        if (hasVideoSignal && !hasStrongMusic) return 'video';
        return 'music';
    }
    if (forceCategory === 'video') {
        if (hasStrongMusic && !hasVideoSignal) return 'music';
        return 'video';
    }
    return 'video';
}

// ---------------------------------------------------------
// API INSTANCES
// NOTE: Only instances that reliably allow CORS from browser origins are kept.
// Invidious instances that send proper Access-Control-Allow-Origin headers.
// Piped instances have inconsistent CORS — we try them but expect failures.
// The HTML proxy scraper is the PRIMARY reliable path.
// ---------------------------------------------------------
var INVIDIOUS_INSTANCES = [
    'https://inv.tux.pizza',
    'https://inv.nadeko.net',
    'https://invidious.privacydns.top',
    'https://iv.melmac.space',
    'https://invidious.nerdvpn.de'
];

var PIPED_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.projectsegfau.lt',
    'https://pipedapi.us.projectsegfau.lt'
];

// Proxy list for HTML scraping — allorigins is the most reliable
var PROXY_LIST = [
    (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
];

// ---------------------------------------------------------
// FETCH HELPERS
// ---------------------------------------------------------
async function fetchWithTimeout(url, signal, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abortHandler = () => controller.abort();
    if (signal) signal.addEventListener('abort', abortHandler, { once: true });

    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.error) throw new Error(`API Error: ${data.error}`);
        return data;
    } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', abortHandler);
    }
}

async function fetchFastest(endpoints, timeoutMs = 5000, globalSignal) {
    if (!endpoints || endpoints.length === 0) throw new Error('No endpoints provided');
    const promises = endpoints.map(url => fetchWithTimeout(url, globalSignal, timeoutMs).then(data => {
        if (!data) throw new Error('Empty response');
        return data;
    }));
    try {
        return await Promise.any(promises);
    } catch (err) {
        if (globalSignal && globalSignal.aborted) throw new Error("Search Aborted");
        throw new Error("All API endpoints failed.");
    }
}

function normalizeApiResult(data, forcedCategory) {
    let items = []; let isPiped = false;
    if (Array.isArray(data)) items = data;
    else if (data && data.items && Array.isArray(data.items)) { items = data.items; isPiped = true; }
    else return [];
    return items.map(item => isPiped ? mapPipedItem(item, forcedCategory) : mapInvidiousItem(item, forcedCategory)).filter(Boolean);
}

function mapInvidiousItem(item, forcedCategory) {
    let type = (item.type || 'video');
    let id = type === 'playlist' ? item.playlistId : item.videoId;
    if (!id) return null;
    if (id.startsWith('PL') || id.startsWith('RD') || id.startsWith('OL')) type = 'playlist';
    if (type !== 'video' && type !== 'playlist') return null;

    const title = item.title || 'Unknown Title';
    const author = item.author || 'Unknown Author';
    const duration = item.lengthSeconds || 0;
    const year = item.publishedText ? parseYearFromText(item.publishedText) : '';

    if (type === 'playlist') {
        let thumbnail = '';
        if (item.playlistThumbnail && !item.playlistThumbnail.includes('/vi/PL')) {
            thumbnail = item.playlistThumbnail.startsWith('//') ? 'https:' + item.playlistThumbnail : item.playlistThumbnail;
        }
        return { originalIndex: 0, type: 'playlist', id, title, author, thumbnail, duration: 0, isMusic: true, isPlaylist: true, isSong: false, isVideo: false, year };
    }

    let thumbnail = '';
    if (item.videoThumbnails) {
        const thumbs = extractValidThumbnails(item.videoThumbnails);
        thumbnail = thumbs.length > 0 ? thumbs[0] : '';
    }
    const detectedCategory = classifyItem(title, author, forcedCategory);
    return { originalIndex: 0, type: 'video', id, title, author, thumbnail, duration, year, isSong: detectedCategory === 'music', isVideo: detectedCategory === 'video', isPlaylist: false, isMusic: detectedCategory === 'music', _detectedCategory: detectedCategory };
}

function mapPipedItem(item, forcedCategory) {
    let id = ''; let type = 'video';
    if (item.type === 'stream') { id = item.url ? (item.url.split('?v=')[1] || item.url.replace('/watch?v=', '')) : ''; type = 'video'; }
    else if (item.type === 'playlist') { id = item.url ? (item.url.split('?list=')[1] || item.url.replace('/playlist?list=', '')) : ''; type = 'playlist'; }
    else return null;
    if (!id) return null;
    if (id.startsWith('PL') || id.startsWith('RD') || id.startsWith('OL')) type = 'playlist';

    if (type === 'playlist') {
        let thumbnail = item.thumbnail || '';
        if (thumbnail.includes('/vi/PL') || thumbnail.includes('/vi/RD') || thumbnail.includes('/vi/OL')) thumbnail = '';
        return { originalIndex: 0, type: 'playlist', id, title: item.name || item.title || 'Unknown', author: item.uploaderName || 'Unknown', thumbnail, duration: 0, isMusic: true, isPlaylist: true, isSong: false, isVideo: false, year: '' };
    }

    let year = '';
    if (item.uploadedDate) {
        const yearMatch = item.uploadedDate.match(/(\d+)\s*year/);
        if (yearMatch) year = (new Date().getFullYear() - parseInt(yearMatch[1])).toString();
        else if (/(month|week|day|hour|minute|second)/i.test(item.uploadedDate)) year = new Date().getFullYear().toString();
    }
    const title = item.title || 'Unknown'; const author = item.uploaderName || 'Unknown';
    let thumbnail = item.thumbnail || '';
    if (thumbnail.includes('/vi/PL') || thumbnail.includes('/vi/RD') || thumbnail.includes('/vi/OL')) thumbnail = '';
    const detectedCategory = classifyItem(title, author, forcedCategory);
    return { originalIndex: 0, type: 'video', id, title, author, thumbnail, duration: item.duration || 0, year, isSong: detectedCategory === 'music', isVideo: detectedCategory === 'video', isPlaylist: false, isMusic: detectedCategory === 'music', _detectedCategory: detectedCategory };
}

// ---------------------------------------------------------
// HTML PROXY SCRAPER — primary search path
// Uses multiple proxies with race; allorigins is most reliable
// ---------------------------------------------------------
async function proxyScrapeRace(url, timeoutMs = 9000, globalSignal) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const abortHandler = () => controller.abort();
    if (globalSignal) globalSignal.addEventListener('abort', abortHandler, { once: true });

    const proxies = shuffleArray([...PROXY_LIST]);

    const promises = proxies.map(async (makeUrl) => {
        const proxyUrl = makeUrl(url);
        const res = await fetch(proxyUrl, { signal: controller.signal });
        if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);

        let text = '';
        if (proxyUrl.includes('allorigins.win/get')) {
            const data = await res.json();
            text = data.contents || '';
        } else {
            text = await res.text();
        }

        if (!text || (!text.includes('ytInitialData') && !text.includes('initialData'))) throw new Error('No YT data in response');
        return text;
    });

    try {
        const result = await Promise.any(promises);
        controller.abort(); clearTimeout(timeoutId);
        if (globalSignal) globalSignal.removeEventListener('abort', abortHandler);
        return result;
    } catch (e) {
        clearTimeout(timeoutId);
        if (globalSignal) globalSignal.removeEventListener('abort', abortHandler);
        if (e.name === 'AbortError' || (globalSignal && globalSignal.aborted)) throw new Error("Search Aborted");
        throw new Error("All proxy endpoints failed");
    }
}

async function searchYouTubeHTML(query, category, globalSignal) {
    // Build the correct YouTube search URL for each category
    let searchQuery = query;
    let filterParam = '';

    if (category === 'music') {
        // EgIQAQ%3D%3D = YouTube music/audio filter
        searchQuery = query + ' audio';
        filterParam = '&sp=EgIQAQ%3D%3D';
    } else if (category === 'playlist') {
        // EgIQAw%3D%3D = playlist filter
        filterParam = '&sp=EgIQAw%3D%3D';
    }
    // For 'video': no filter — YouTube returns everything, we classify after

    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}&gl=US&hl=en${filterParam}`;
    const html = await proxyScrapeRace(url, 9000, globalSignal);
    const ytData = extractJSONFromHTML(html, ['ytInitialData', 'initialData']);
    if (!ytData) throw new Error('Failed to parse JSON from YouTube HTML');

    const parsedItems = []; const uniqueIds = new Set();
    let targeted = null;
    try { targeted = ytData.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents; } catch(e) {}

    function extractVideo(obj) {
        if (parsedItems.length >= 60) return;
        if (!obj || typeof obj !== 'object') return;

        const v = obj.videoRenderer || obj.compactVideoRenderer || obj.gridVideoRenderer || obj.playlistRenderer || obj.playlistVideoRenderer || obj.radioRenderer;
        const l = obj.lockupViewModel;

        if (l && l.contentId && !uniqueIds.has(l.contentId)) {
            const isPlay = l.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST' || l.contentType === 'LOCKUP_CONTENT_TYPE_ALBUM' || l.contentId.startsWith('PL') || l.contentId.startsWith('RD') || l.contentId.startsWith('OL');
            const isVid = !isPlay;
            if (isVid || isPlay) {
                uniqueIds.add(l.contentId);
                const thumbs = extractValidThumbnails(l.image || l.thumbnail);
                let finalThumb = thumbs.length > 0 ? thumbs[0] : '';
                if (finalThumb.includes('/vi/PL') || finalThumb.includes('/vi/RD')) finalThumb = '';
                const itemTitle = getYTText(l.metadata?.lockupMetadataViewModel?.title) || "Unknown";
                const itemAuthor = findAuthorName(l) || "Unknown";
                if (isPlay) {
                    parsedItems.push({ type: 'playlist', id: l.contentId, title: itemTitle, author: itemAuthor, thumbnail: finalThumb, duration: 0, isSong: false, isVideo: false, isPlaylist: true, isMusic: true, year: '', _detectedCategory: 'playlist' });
                } else {
                    const dc = classifyItem(itemTitle, itemAuthor, category);
                    parsedItems.push({ type: 'video', id: l.contentId, title: itemTitle, author: itemAuthor, thumbnail: finalThumb, duration: 0, isSong: dc === 'music', isVideo: dc === 'video', isPlaylist: false, isMusic: dc === 'music', year: '', _detectedCategory: dc });
                }
            }
        } else if (v) {
            let id = v.videoId || v.playlistId; let type = v.playlistId ? 'playlist' : 'video';
            if (id && (id.startsWith('PL') || id.startsWith('RD') || id.startsWith('OL'))) type = 'playlist';
            if (id && !uniqueIds.has(id)) {
                uniqueIds.add(id);
                let durSeconds = 0; let lengthText = getYTText(v.lengthText);
                if (!lengthText && v.thumbnailOverlays) { const overlay = v.thumbnailOverlays.find(o => o.thumbnailOverlayTimeStatusRenderer); lengthText = getYTText(overlay?.thumbnailOverlayTimeStatusRenderer?.text); }
                if (lengthText) { const parts = lengthText.split(':').reverse(); durSeconds += parseInt(parts[0] || 0); durSeconds += parseInt(parts[1] || 0) * 60; if (parts[2]) durSeconds += parseInt(parts[2]) * 3600; }
                const titleText = getYTText(v.title) || "Unknown"; const authorText = findAuthorName(v) || 'Unknown';
                const thumbs = extractValidThumbnails(v.thumbnail || v.thumbnails);
                let finalThumb = thumbs.length > 0 ? thumbs[0] : '';
                if (finalThumb.includes('/vi/PL') || finalThumb.includes('/vi/RD')) finalThumb = '';
                const year = v.publishedTimeText ? parseYearFromText(getYTText(v.publishedTimeText)) : '';
                if (type === 'playlist') {
                    parsedItems.push({ type: 'playlist', id, title: titleText, author: authorText, thumbnail: finalThumb, duration: durSeconds, isSong: false, isVideo: false, isPlaylist: true, isMusic: true, year, _detectedCategory: 'playlist' });
                } else {
                    const dc = classifyItem(titleText, authorText, category);
                    parsedItems.push({ type: 'video', id, title: titleText, author: authorText, thumbnail: finalThumb, duration: durSeconds, isSong: dc === 'music', isVideo: dc === 'video', isPlaylist: false, isMusic: dc === 'music', year, _detectedCategory: dc });
                }
            }
        }
        if (Array.isArray(obj)) { for (let i = 0; i < obj.length; i++) extractVideo(obj[i]); }
        else { for (const key in obj) { if (key !== 'responseContext' && key !== 'trackingParams' && obj[key] && typeof obj[key] === 'object') extractVideo(obj[key]); } }
    }

    if (targeted && Array.isArray(targeted)) extractVideo(targeted); else extractVideo(ytData);

    return parsedItems.filter(item => {
        if (category === 'playlist') return item.type === 'playlist';
        if (category === 'music') return item._detectedCategory === 'music' && item.type !== 'playlist';
        if (category === 'video') return item._detectedCategory === 'video' && item.type !== 'playlist';
        return true;
    });
}

// ---------------------------------------------------------
// MAIN SEARCH CATEGORY FUNCTION
// Strategy: HTML scraper runs immediately as primary path.
// Direct API calls run concurrently — if they win AND aren't CORS-blocked,
// we use them. Otherwise HTML result is used. Both are merged + deduped.
// ---------------------------------------------------------
async function searchCategory(query, category, globalSignal) {
    const shuffledInv = shuffleArray([...INVIDIOUS_INSTANCES]);
    const shuffledPiped = shuffleArray([...PIPED_INSTANCES]);

    let invEndpoints = [];
    let pipedEndpoints = [];

    if (category === 'video') {
        invEndpoints = shuffledInv.map(b => `${b}/api/v1/search?q=${encodeURIComponent(query)}&type=video`);
        pipedEndpoints = shuffledPiped.map(b => `${b}/search?q=${encodeURIComponent(query)}&filter=videos`);
    } else if (category === 'playlist') {
        invEndpoints = shuffledInv.map(b => `${b}/api/v1/search?q=${encodeURIComponent(query)}&type=playlist`);
        pipedEndpoints = shuffledPiped.map(b => `${b}/search?q=${encodeURIComponent(query)}&filter=playlists`);
    } else if (category === 'music') {
        invEndpoints = shuffledInv.map(b => `${b}/api/v1/search?q=${encodeURIComponent(query + ' audio')}&type=video`);
        pipedEndpoints = shuffledPiped.map(b => `${b}/search?q=${encodeURIComponent(query)}&filter=music_songs`);
    }

    // Wrap each source — return [] on failure (CORS, network, parse error)
    const safeWrap = (promise) => promise.catch(err => {
        if (err.message === 'Search Aborted') throw err;
        return [];
    });

    const invPromise = safeWrap(
        fetchFastest(invEndpoints, 5000, globalSignal).then(d => normalizeApiResult(d, category)).then(r => r.length ? r : [])
    );
    const pipedPromise = safeWrap(
        fetchFastest(pipedEndpoints, 5000, globalSignal).then(d => normalizeApiResult(d, category)).then(r => r.length ? r : [])
    );
    const htmlPromise = safeWrap(searchYouTubeHTML(query, category, globalSignal));

    // 11s hard timeout — returns empty if nothing resolves in time
    const hardTimeout = new Promise(resolve => {
        const id = setTimeout(() => resolve([]), 11000);
        if (globalSignal) globalSignal.addEventListener('abort', () => { clearTimeout(id); resolve([]); }, { once: true });
    });

    try {
        const [invResult, pipedResult, htmlResult] = await Promise.all([
            Promise.race([invPromise, hardTimeout]),
            Promise.race([pipedPromise, hardTimeout]),
            Promise.race([htmlPromise, hardTimeout])
        ]);

        if (globalSignal && globalSignal.aborted) return [];

        // Merge all sources, deduplicate by ID
        const seen = new Set();
        const merged = [];
        // HTML first — it's always the freshest and most reliable source
        for (const item of [...htmlResult, ...invResult, ...pipedResult]) {
            if (item && item.id && !seen.has(item.id)) {
                seen.add(item.id);
                merged.push(item);
            }
        }
        return merged;
    } catch (err) {
        if (err.message === 'Search Aborted') return [];
        return [];
    }
}

async function fetchPlaylistItems(playlistId, isMusicMode = false, knownPlaylistAuthor = null) {
    const endpoints = [
        ...shuffleArray([...INVIDIOUS_INSTANCES]).map(base => `${base}/api/v1/playlists/${playlistId}`),
        ...shuffleArray([...PIPED_INSTANCES]).map(base => `${base}/playlists/${playlistId}`)
    ];

    const promises = [
        fetchFastest(endpoints, 6000).then(data => {
            if (data.videos) {
                return data.videos.map(v => ({ id: v.videoId, title: v.title, author: v.author || knownPlaylistAuthor || data.author || 'Unknown', thumbnail: `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`, duration: v.lengthSeconds || 0, isMusic: isMusicMode, year: '' }));
            } else if (data.relatedStreams) {
                return data.relatedStreams.map(v => ({ id: v.url.split('?v=')[1] || v.url.replace('/watch?v=', ''), title: v.title, author: v.uploaderName || knownPlaylistAuthor || data.uploader || 'Unknown', thumbnail: v.thumbnail, duration: v.duration || 0, isMusic: isMusicMode, year: '' }));
            }
            throw new Error('Invalid API data');
        }),
        proxyScrapeRace(`https://www.youtube.com/playlist?list=${playlistId}&gl=US&hl=en`, 7000).then(html => {
            const ytData = extractJSONFromHTML(html, ['ytInitialData', 'initialData']);
            if (!ytData) throw new Error("Could not parse playlist JSON.");
            let globalAuthor = validateText(knownPlaylistAuthor) || "Unknown";
            const items = []; const uniqueIds = new Set();
            function extractPlaylistRecursive(obj) {
                if (!obj || typeof obj !== 'object') return;
                const v = obj.playlistVideoRenderer || obj.playlistItemVideoRenderer || obj.videoRenderer || obj.compactVideoRenderer || obj.gridVideoRenderer;
                if (v && v.videoId && v.isPlayable !== false && !uniqueIds.has(v.videoId)) {
                    uniqueIds.add(v.videoId);
                    let durSeconds = 0; let lengthText = getYTText(v.lengthText);
                    if (lengthText) { const parts = lengthText.split(':').reverse(); durSeconds += parseInt(parts[0] || 0); durSeconds += parseInt(parts[1] || 0) * 60; if (parts[2]) durSeconds += parseInt(parts[2]) * 3600; }
                    const thumbs = extractValidThumbnails(v.thumbnail);
                    const finalThumb = thumbs.length > 0 ? thumbs[0] : `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;
                    items.push({ id: v.videoId, title: getYTText(v.title) || "Unknown Title", author: findAuthorName(v) || globalAuthor, thumbnail: finalThumb, duration: durSeconds, isMusic: isMusicMode, year: v.publishedTimeText ? parseYearFromText(getYTText(v.publishedTimeText)) : '' });
                }
                if (Array.isArray(obj)) { for (let i = 0; i < obj.length; i++) extractPlaylistRecursive(obj[i]); }
                else { for (const key in obj) { if (key !== 'responseContext' && key !== 'trackingParams' && obj[key] && typeof obj[key] === 'object') extractPlaylistRecursive(obj[key]); } }
            }
            extractPlaylistRecursive(ytData);
            if (items.length === 0) throw new Error("Empty scrape");
            return items;
        })
    ];

    const strictTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout fetching playlist")), 13000));
    try {
        return await Promise.race([Promise.any(promises), strictTimeout]);
    } catch(e) {
        throw new Error("Could not fetch playlist. All sources failed or timed out.");
    }
}

async function fetchVideoMeta(id) {
    const endpoints = [
        ...shuffleArray([...INVIDIOUS_INSTANCES]).map(base => `${base}/api/v1/videos/${id}`),
        ...shuffleArray([...PIPED_INSTANCES]).map(base => `${base}/streams/${id}`)
    ];

    const promises = [
        fetchFastest(endpoints, 5000).then(data => {
            if (data.title) {
                return { id, title: data.title, author: data.author || data.uploader || 'Unknown', thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, isMusic: false, duration: data.lengthSeconds || data.duration || 0, year: data.publishedText ? parseYearFromText(data.publishedText) : (data.uploadDate ? data.uploadDate.split('-')[0] : '') };
            }
            throw new Error("Invalid format");
        }),
        proxyScrapeRace(`https://www.youtube.com/watch?v=${id}&gl=US&hl=en`, 6000).then(html => {
            const data = extractJSONFromHTML(html, ['ytInitialPlayerResponse']);
            if (data) {
                const details = data.videoDetails || {};
                const microformat = data.microformat?.playerMicroformatRenderer || {};
                let year = microformat.publishDate ? microformat.publishDate.split('-')[0] : (microformat.uploadDate ? microformat.uploadDate.split('-')[0] : '');
                return { id, title: details.title || 'Unknown', author: details.author || 'Unknown', thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, isMusic: false, duration: parseInt(details.lengthSeconds || 0), year };
            }
            throw new Error("Invalid HTML");
        })
    ];

    const strictTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout fetching metadata")), 11000));
    try {
        return await Promise.race([Promise.any(promises), strictTimeout]);
    } catch(err) {
        try {
            const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
            const data = await res.json();
            return { id, title: data.title, author: validateText(data.author_name) || 'Unknown', thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, isMusic: false, duration: 0, year: '' };
        } catch(e) {}
    }
    return { id, title: `Video ID: ${id}`, author: 'Unknown', thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`, isMusic: false, duration: 0, year: '' };
}

// ---------------------------------------------------------
// SEARCH UI RENDERING
// ---------------------------------------------------------

function renderSearchGrids(filter) {
    if (ui.secSearchPlaceholder) ui.secSearchPlaceholder.classList.add('hidden');

    const renderCard = (item) => {
        const thumbArray = Array.isArray(item.thumbnail) ? item.thumbnail : [item.thumbnail];
        let thumb = thumbArray.find(t => typeof t === 'string' && t && !t.includes('/vi/PL') && !t.includes('/vi/RD') && !t.includes('/vi/OL'));
        const colors = [['#ff758c','#ff7eb3'],['#a18cd1','#fbc2eb'],['#fa709a','#fee140'],['#84fab0','#8fd3f4'],['#a1c4fd','#c2e9fb'],['#fccb90','#d57eeb'],['#e0c3fc','#8ec5fc'],['#4facfe','#00f2fe']];
        let hash = 0; for (let i = 0; i < item.title.length; i++) hash = item.title.charCodeAt(i) + ((hash << 5) - hash);
        const pair = colors[Math.abs(hash) % colors.length];
        const durationStr = item.duration ? formatTime(item.duration) : (item.type === 'playlist' ? 'Playlist' : '');
        const badge = durationStr ? `<div class="absolute bottom-1 right-1 z-20 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded shadow">${durationStr}</div>` : '';
        return `
        <div class="flex flex-col gap-2 group relative">
            <div class="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-800 border border-slate-700/50 shadow-md">
                <div class="absolute inset-0 z-0 flex items-center justify-center p-3 text-center" style="background: linear-gradient(135deg, ${pair[0]}, ${pair[1]});">
                    <span class="text-white font-bold text-[13px] md:text-sm drop-shadow-md leading-tight line-clamp-3">${item.title.replace(/"/g, '&quot;')}</span>
                </div>
                ${thumb ? `<img src="${thumb}" onerror="this.style.display='none';" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 z-10 bg-slate-800">` : ''}
                ${badge}
                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-sm z-30">
                    <button class="bg-white hover:bg-slate-200 text-slate-900 p-2 rounded-full transform hover:scale-110 transition-all shadow-lg flex items-center justify-center" onclick='handleSearchResultClick(${item.originalIndex}, true)' title="Play Now">
                        <span class="material-symbols-rounded icon-fill text-[24px]">play_arrow</span>
                    </button>
                    <button class="bg-slate-800 hover:bg-slate-700 text-white border border-slate-500 p-2 rounded-full transform hover:scale-110 transition-all shadow-lg flex items-center justify-center" onclick='handleSearchResultClick(${item.originalIndex}, false)' title="Add to Queue">
                        <span class="material-symbols-rounded text-[24px]">add</span>
                    </button>
                </div>
            </div>
            <div class="min-w-0 px-0.5">
                <p class="text-xs font-semibold text-slate-200 line-clamp-2 leading-tight" title="${item.title.replace(/"/g, '&quot;')}">${item.title}</p>
                <p class="text-[10px] text-slate-500 truncate mt-1">${item.author || 'Unknown'}${item.year ? ' • ' + item.year : ''}</p>
            </div>
        </div>`;
    };

    ui.secMusic.classList.add('hidden'); ui.secVideos.classList.add('hidden'); ui.secPlaylists.classList.add('hidden');
    if (filter === 'all' || filter === 'music') {
        ui.secMusic.classList.remove('hidden');
        if (currentCategorizedResults.music.length > 0) ui.gridMusic.innerHTML = currentCategorizedResults.music.map(renderCard).join('');
        else if (filter === 'music') ui.gridMusic.innerHTML = `<div class="col-span-full text-center text-slate-500 text-sm py-8">No audio tracks found.</div>`;
        else ui.secMusic.classList.add('hidden');
    }
    if (filter === 'all' || filter === 'videos') {
        ui.secVideos.classList.remove('hidden');
        if (currentCategorizedResults.videos.length > 0) ui.gridVideos.innerHTML = currentCategorizedResults.videos.map(renderCard).join('');
        else if (filter === 'videos') ui.gridVideos.innerHTML = `<div class="col-span-full text-center text-slate-500 text-sm py-8">No videos found.</div>`;
        else ui.secVideos.classList.add('hidden');
    }
    if (filter === 'all' || filter === 'playlists') {
        ui.secPlaylists.classList.remove('hidden');
        if (currentCategorizedResults.playlists.length > 0) ui.gridPlaylists.innerHTML = currentCategorizedResults.playlists.map(renderCard).join('');
        else if (filter === 'playlists') ui.gridPlaylists.innerHTML = `<div class="col-span-full text-center text-slate-500 text-sm py-8">No playlists found.</div>`;
        else ui.secPlaylists.classList.add('hidden');
    }
    const totalItems = currentCategorizedResults.music.length + currentCategorizedResults.videos.length + currentCategorizedResults.playlists.length;
    if (filter === 'all' && totalItems === 0) {
        ui.secVideos.classList.remove('hidden');
        ui.gridVideos.innerHTML = `<div class="col-span-full text-center text-slate-500 text-sm py-8">No results found for "${currentSearchQuery}"</div>`;
    }
}

function sortResultsByRelevance(items, query) {
    const q = query.toLowerCase().trim(); const qWords = q.split(/\s+/).filter(w => w.length > 1);
    items.forEach((item, idx) => {
        let score = 1000 - idx;
        const t = (item.title || '').toLowerCase(); const a = (item.author || '').toLowerCase();
        if (t === q) score += 5000; else if (t.startsWith(q)) score += 3000; else if (t.includes(q)) score += 1000;
        if (a === q || a.startsWith(q)) score += 2000; else if (a.includes(q)) score += 500;
        let wordMatches = 0; qWords.forEach(w => { if (t.includes(w) || a.includes(w)) wordMatches++; });
        if (qWords.length > 0 && wordMatches === qWords.length) score += 800;
        item._sortScore = score;
    });
    return items.sort((a, b) => b._sortScore - a._sortScore);
}

function showSearchSkeletons() {
    if (ui.gridVideos.querySelector('.animate-pulse')) return;
    if (ui.secSearchPlaceholder) ui.secSearchPlaceholder.classList.add('hidden');

    ui.searchOverlay.classList.remove('hidden');
    if (!isPlayerCollapsed) togglePlayerExpand();
    document.querySelectorAll('.filter-chip').forEach(c => { c.classList.remove('bg-slate-700', 'text-white'); c.classList.add('bg-slate-800/80', 'text-slate-400'); });
    const chips = document.querySelectorAll('.filter-chip');
    if(chips.length > 0) { chips[0].classList.remove('bg-slate-800/80', 'text-slate-400'); chips[0].classList.add('bg-slate-700', 'text-white'); }
    ui.secMusic.classList.remove('hidden'); ui.secVideos.classList.remove('hidden'); ui.secPlaylists.classList.remove('hidden');
    const skeletonHTML = Array(4).fill(`
        <div class="flex flex-col gap-2 animate-pulse">
            <div class="w-full aspect-video rounded-xl bg-slate-800 border border-slate-700/50 shadow-md"></div>
            <div class="min-w-0 px-0.5 pt-1">
                <div class="h-3 bg-slate-700 rounded w-3/4 mb-2 mt-1"></div>
                <div class="h-2 bg-slate-800 rounded w-1/2"></div>
            </div>
        </div>
    `).join('');
    ui.gridMusic.innerHTML = skeletonHTML; ui.gridVideos.innerHTML = skeletonHTML; ui.gridPlaylists.innerHTML = skeletonHTML;
}

async function performSearch(force = false) {
    const rawQuery = ui.searchInput.value.trim();
    if (!rawQuery) {
        return;
    }

    if (!force && rawQuery === currentSearchQuery && !ui.searchOverlay.classList.contains('hidden') && !isSearching) return;

    if (SearchCache.has(rawQuery.toLowerCase())) {
        showSearchSkeletons();
        const cached = SearchCache.get(rawQuery.toLowerCase());
        setTimeout(() => {
            AppState.lastSearchResults = cached.raw;
            currentCategorizedResults = cached.categorized;
            renderSearchGrids('all');
            ui.loaderSearch.classList.add('hidden');
            isSearching = false;
            currentSearchQuery = rawQuery;
        }, 300);
        return;
    }

    if (globalSearchController) globalSearchController.abort();
    globalSearchController = new AbortController();
    const currentSignal = globalSearchController.signal;
    const searchId = ++currentSearchId;
    currentSearchQuery = rawQuery;
    isSearching = true;

    showSearchSkeletons();
    ui.searchOverlay.classList.remove('hidden'); ui.loaderSearch.classList.remove('hidden');
    if (!isPlayerCollapsed) togglePlayerExpand();

    try {
        console.log(`\n[Search] 🚀 Searching for: "${rawQuery}"`);

        const [musicItems, videoItems, playlistItems] = await Promise.all([
            searchCategory(rawQuery, 'music', currentSignal),
            searchCategory(rawQuery, 'video', currentSignal),
            searchCategory(rawQuery, 'playlist', currentSignal)
        ]);

        if (searchId !== currentSearchId || currentSignal.aborted) return;

        // Strict post-filter
        const strictMusic = musicItems.filter(i => i.type !== 'playlist' && (i.isSong || i._detectedCategory === 'music'));
        const strictVideos = videoItems.filter(i => i.type !== 'playlist' && !i.isSong && i._detectedCategory !== 'music');
        const strictPlaylists = playlistItems.filter(i => i.type === 'playlist' || i.isPlaylist);

        // Cross-bucket dedup: music IDs take priority over videos
        const musicIds = new Set(strictMusic.map(i => i.id));
        const playlistIds = new Set(strictPlaylists.map(i => i.id));
        const dedupedVideos = strictVideos.filter(i => !musicIds.has(i.id) && !playlistIds.has(i.id));
        const dedupedPlaylists = strictPlaylists.filter(i => !musicIds.has(i.id));

        const sortedMusic = sortResultsByRelevance(strictMusic, rawQuery);
        const sortedVideos = sortResultsByRelevance(dedupedVideos, rawQuery);
        const sortedPlaylists = sortResultsByRelevance(dedupedPlaylists, rawQuery);

        currentCategorizedResults.music = sortedMusic;
        currentCategorizedResults.videos = sortedVideos;
        currentCategorizedResults.playlists = sortedPlaylists;

        // Build flat combined list with correct originalIndex for click handlers
        let combinedResults = [];
        sortedMusic.forEach((item, i) => { item.originalIndex = i; combinedResults.push(item); });
        const videoOffset = sortedMusic.length;
        sortedVideos.forEach((item, i) => { item.originalIndex = videoOffset + i; combinedResults.push(item); });
        const playlistOffset = videoOffset + sortedVideos.length;
        sortedPlaylists.forEach((item, i) => { item.originalIndex = playlistOffset + i; combinedResults.push(item); });

        AppState.lastSearchResults = combinedResults;

        if (combinedResults.length > 0) {
            SearchCache.set(rawQuery.toLowerCase(), {
                raw: combinedResults,
                categorized: { music: sortedMusic, videos: sortedVideos, playlists: sortedPlaylists }
            });
        }

        console.log(`[Search] ✅ Music: ${sortedMusic.length}, Videos: ${sortedVideos.length}, Playlists: ${sortedPlaylists.length}`);
        renderSearchGrids('all');

    } catch (err) {
        if (searchId === currentSearchId && !currentSignal.aborted) {
            ui.secVideos.classList.remove('hidden'); ui.secMusic.classList.add('hidden'); ui.secPlaylists.classList.add('hidden');
            ui.gridVideos.innerHTML = `<div class="col-span-full text-center text-red-400 text-sm mt-8">Search error. ${err.message}</div>`;
        }
    } finally {
        if (searchId === currentSearchId) { ui.loaderSearch.classList.add('hidden'); isSearching = false; }
    }
}

var debouncedSearch = debounce(() => performSearch(false), 1000);

ui.searchForm.addEventListener('submit', (e) => { e.preventDefault(); debouncedSearch.cancel(); performSearch(true); });

ui.searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val) {
        ui.btnClearSearch.classList.remove('hidden');
        if (val !== currentSearchQuery) showSearchSkeletons();
        debouncedSearch();
    } else {
        ui.btnClearSearch.classList.add('hidden');
        ui.loaderSearch.classList.add('hidden'); isSearching = false;
        if (globalSearchController) globalSearchController.abort();
        debouncedSearch.cancel();
    }
});

let isSearchFocused = false;

ui.searchInput.addEventListener('focus', (e) => {
    isSearchFocused = true;

    const val = e.target.value.trim();
    if (val && AppState.lastSearchResults.length > 0) {
        ui.searchOverlay.classList.remove('hidden');
        if (!isPlayerCollapsed) togglePlayerExpand();
    }
});

ui.searchInput.addEventListener('blur', () => { isSearchFocused = false; });

// Close search overlay if clicking completely outside the search bar and overlay
document.addEventListener('mousedown', (e) => {
    if (!ui.searchOverlay.classList.contains('hidden') &&
        !ui.searchForm.contains(e.target) &&
        !ui.searchOverlay.contains(e.target)) {
        ui.searchOverlay.classList.add('hidden');
        isSearchFocused = false;
        ui.searchInput.blur();
    }
});

ui.btnClearSearch.addEventListener('click', () => {
    ui.searchInput.value = ''; ui.btnClearSearch.classList.add('hidden');
    ui.loaderSearch.classList.add('hidden'); isSearching = false;
    if (globalSearchController) globalSearchController.abort();
    debouncedSearch.cancel();
    ui.searchOverlay.classList.add('hidden');
});
ui.btnCloseSearch.addEventListener('click', () => { ui.searchOverlay.classList.add('hidden'); });

document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach(c => { c.classList.remove('bg-slate-700', 'text-white'); c.classList.add('bg-slate-800/80', 'text-slate-400'); });
        const target = e.currentTarget; target.classList.remove('bg-slate-800/80', 'text-slate-400'); target.classList.add('bg-slate-700', 'text-white');
        renderSearchGrids(target.dataset.filter);
    });
});

window.handleSearchResultClick = async (index, playNow) => {
    if (AppState.myRole === ROLES.MEMBER) return showToast('Only Admins can manage the queue.', 'error');
    const itemObj = AppState.lastSearchResults[index];
    if (!itemObj) return showToast('Result not found. Please search again.', 'error');
    showToast(`Loading ${itemObj.title.substring(0, 20)}...`, 'info');
    try {
        if (itemObj.type === 'playlist') {
            const items = await fetchPlaylistItems(itemObj.id, itemObj.isMusic, itemObj.author);
            if (items.length === 0) return showToast("Empty playlist.", "error");
            if (playNow) executeCommand('REPLACE_QUEUE', { items, playIndex: 0 });
            else executeCommand('ADD_TO_QUEUE', { items, playNow: false });
        } else {
            const mappedItem = { id: itemObj.id, title: itemObj.title, author: itemObj.author, thumbnail: itemObj.thumbnail, duration: itemObj.duration, isMusic: itemObj.isMusic, year: itemObj.year };
            if (playNow) executeCommand('PLAY_DIRECT', { video: mappedItem });
            else executeCommand('ADD_TO_QUEUE', { items: [mappedItem], playNow: false });
        }
        if (playNow && !itemObj.isMusic && isPlayerCollapsed) togglePlayerExpand();
        else if (!playNow) showToast("Added to queue", "success");
    } catch (err) { showToast(`Error: ${err.message}`, 'error'); }
};

// URL Add Logic
ui.btnAddLink.addEventListener('click', async () => {
    const url = ui.videoInput.value.trim();
    if (!url) return;
    const playlistId = extractPlaylistID(url);
    const videoId = extractVideoID(url);
    if (!playlistId && !videoId) return showToast('Invalid YouTube URL', 'error');
    ui.videoInput.value = 'Loading...'; ui.videoInput.disabled = true; ui.btnAddLink.disabled = true;
    try {
        const isMusic = document.querySelector('input[name="search-type"]:checked')?.value === 'music' || true;
        if (playlistId) {
            const items = await fetchPlaylistItems(playlistId, isMusic);
            if (items.length === 0) throw new Error("Playlist is empty or private.");
            executeCommand('ADD_TO_QUEUE', { items, playNow: false });
        } else {
            const meta = await fetchVideoMeta(videoId);
            meta.isMusic = isMusic;
            executeCommand('ADD_TO_QUEUE', { items: [meta], playNow: false });
        }
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        ui.videoInput.value = ''; ui.videoInput.disabled = false; ui.btnAddLink.disabled = false;
    }
});