/* eslint-disable no-empty, no-unused-vars */  
// The backend proxy now handles all high-res streams natively via Jiosaavn CDN.
// External monochrome mirrors are permanently stripped.

// Decode HTML entities robustly
export const decodeHtml = (str) => {
  if (!str || typeof str !== 'string') return str || '';
  let decoded = str;
  if (typeof document !== 'undefined') {
    try {
      const txt = document.createElement('textarea');
      txt.innerHTML = str;
      decoded = txt.value;
      if (decoded.includes('&')) {
        txt.innerHTML = decoded;
        decoded = txt.value;
      }
      return decoded;
    } catch (e) {}
  }

  return decoded
    .replace(/&quot;/g, '"')
    .replace(/&#034;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&#60;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#62;/g, '>');
};

const fetchJSONP = (url) => new Promise((resolve, reject) => {
  const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
  window[callbackName] = (data) => {
    delete window[callbackName];
    document.body.removeChild(script);
    resolve(data);
  };
  const script = document.createElement('script');
  script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + callbackName;
  script.onerror = () => {
    delete window[callbackName];
    document.body.removeChild(script);
    reject(new Error('JSONP failed'));
  };
  document.body.appendChild(script);
});

export const findBestMirror = async () => {
  return "proxy"; 
};

export const getApiBase = () => "proxy";
export const getMirrorStatus = () => ({ "proxy": "healthy" });

const JIOSAAVN_INSTANCES = [
  'https://jiosaavn-api-one-rho.vercel.app',
  'https://bloom-music-api-eta.vercel.app'
];

const fetchWithSaavnFallback = async (endpointPath) => {
  let lastError;
  for (const baseUrl of JIOSAAVN_INSTANCES) {
    try {
      const res = await fetch(`${baseUrl}${endpointPath}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.success) return data;
    } catch (e) {
      console.warn(`Saavn instance ${baseUrl} failed, trying next...`);
      lastError = e;
    }
  }
  throw lastError || new Error('All JioSaavn instances failed');
};

export const searchTracks = async (query) => {
  try {
    let q = query.replace(/\baudio\b/ig, '').trim();

    // Check if the query is a direct JioSaavn link
    if (q.includes('jiosaavn.com/song/')) {
      try {
        const res = await fetchWithSaavnFallback(`/api/songs?link=${encodeURIComponent(q)}`);
        if (res && res.data) {
          const songs = Array.isArray(res.data) ? res.data : [res.data];
          return songs.map(song => {
            const thumbnail = song.image?.find(img => img.quality === '500x500')?.url || song.image?.[song.image?.length - 1]?.url;
            const downloadUrl = song.downloadUrl?.find(d => d.quality === '320kbps')?.url || song.downloadUrl?.[song.downloadUrl?.length - 1]?.url;
            const author = song.artists?.primary?.map(a => a.name).join(', ') || 'Unknown Artist';
            return {
              id: song.id,
              title: decodeHtml(song.name || song.title),
              author: decodeHtml(author),
              thumbnail: thumbnail,
              duration: parseInt(song.duration || 0),
              isMusic: true,
              audioQuality: 'HD',
              downloadUrl: downloadUrl
            };
          });
        }
      } catch (e) {
        console.warn('Failed to fetch direct JioSaavn link:', e);
      }
      return [];
    }

    // Check if the query contains a YouTube link
    const ytMatch = q.match(/(?:https?:\/\/)?(?:www\.|music\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    
    if (ytMatch && ytMatch[1]) {
      try {
        const videoId = ytMatch[1];
        const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.title) {
            // Clean up title (remove bracketed text like "Official Video", "Lyrics", etc.)
            let title = data.title.replace(/\[.*?\]|\(.*?\)|\{.*?\}/g, '').trim();
            // Append author for better JioSaavn matching, removing common suffixes
            let author = data.author_name ? data.author_name.replace(/VEVO| - Topic/ig, '').trim() : '';
            q = `${title} ${author}`.trim();
          }
        }
      } catch (e) {
        console.warn('Failed to resolve YouTube link via noembed:', e);
      }
    }

    const data = await fetchWithSaavnFallback(`/api/search/songs?query=${encodeURIComponent(q)}&limit=40`);
    if (!data.data || !data.data.results || data.data.results.length === 0) return [];
    
    return data.data.results.map(song => {
      const thumbnail = song.image.find(img => img.quality === '500x500')?.url || song.image[song.image.length - 1]?.url;
      const downloadUrl = song.downloadUrl?.find(d => d.quality === '320kbps')?.url || song.downloadUrl?.[song.downloadUrl.length - 1]?.url;
      const author = song.artists?.primary?.map(a => a.name).join(', ') || 'Unknown Artist';
      
      const title = decodeHtml(song.name);

      return {
        id: song.id,
        title: title,
        author: decodeHtml(author),
        thumbnail: thumbnail,
        duration: parseInt(song.duration || 0),
        isMusic: true,
        audioQuality: 'HD',
        downloadUrl: downloadUrl
      };
    });
  } catch (e) {
    console.error('Search failed:', e);
    return [];
  }
};

// Cache recommendations per track ID — avoid re-fetching on re-selection
const recsCache = new Map();

export const getRecommendations = async (track) => {
  if (!track || !track.id) return [];
  if (recsCache.has(track.id)) return recsCache.get(track.id);
  try {
    const data = await fetchWithSaavnFallback(`/api/songs/${track.id}/suggestions?limit=40`);
    if (!data.data || data.data.length === 0) return [];
    
    const results = data.data.map(song => {
      const thumbnail = song.image.find(img => img.quality === '500x500')?.url || song.image[song.image.length - 1]?.url;
      const downloadUrl = song.downloadUrl?.find(d => d.quality === '320kbps')?.url || song.downloadUrl?.[song.downloadUrl.length - 1]?.url;
      const author = song.artists?.primary?.map(a => a.name).join(', ') || 'Unknown Artist';
      
      const title = decodeHtml(song.name);

      return {
        id: song.id,
        title: title,
        author: decodeHtml(author),
        thumbnail: thumbnail,
        duration: parseInt(song.duration || 0),
        isMusic: true,
        audioQuality: 'HD',
        downloadUrl: downloadUrl
      };
    });
    if (recsCache.size >= 50) {
      const firstKey = recsCache.keys().next().value;
      recsCache.delete(firstKey);
    }
    recsCache.set(track.id, results);
    return results;
  } catch (e) {
    console.error('Recommendations failed:', e);
    return [];
  }
};

export const resolveTrackStream = async (trackId) => {
  if (!trackId) return null;
  try {
    const data = await fetchWithSaavnFallback(`/api/songs/${trackId}`);
    if (data && data.data && data.data[0]) {
      const song = data.data[0];
      return song.downloadUrl?.find(d => d.quality === '320kbps')?.url || song.downloadUrl?.[song.downloadUrl.length - 1]?.url;
    }
  } catch (e) {
    console.error(`Failed to resolve fresh stream URL for track ${trackId}:`, e);
  }
  return null;
};

export const getMix = async () => {
  return searchTracks("top hits today");
};

export const getTopVideos = async () => {
  return searchTracks("top music");
};

export const getTrendingByLocation = async () => {
  try {
    const res = await fetch('https://ipwho.is/');
    const locationData = res.ok ? await res.json() : {};
    const country = locationData.country || 'Global';
    const isIndia = country === 'India';

    const normalizeSong = (song, forceLanguage = null) => {
      const rawAuthor = song.primaryArtists || (song.artists && song.artists.primary && song.artists.primary[0]?.name) || 'Unknown Artist';
      return {
        id: song.id,
        title: decodeHtml(song.name || song.title || ''),
        author: decodeHtml(rawAuthor),
        thumbnail: song.image?.[song.image?.length - 1]?.url || song.image?.[0]?.url || '/placeholder.png',
        duration: song.duration,
        downloadUrl: song.downloadUrl?.[song.downloadUrl.length - 1]?.url || '',
        language: forceLanguage || song.language || 'unknown'
      };
    };

    let arraysToInterleave = [];

    if (isIndia) {
      // 1. India specific logic (hardcoded diverse regional hits)
      const playlistIds = [
        '1081991857', // Weekly Top Songs English
        '1134543272', // India Superhits Top 50 (Hindi)
        '1170578779', // Top Hits Tamil
        '1266643840', // Trending Telugu Songs
        '592722547',  // Malayalam Viral Hits
        '85728084'    // Kannada Viral Hits
      ];
      const fetches = playlistIds.map(id => fetchWithSaavnFallback(`/api/playlists?id=${id}&limit=15`).catch(() => null));
      const results = await Promise.all(fetches);
      
      arraysToInterleave = results.filter(r => r && r.data?.songs).map(r => r.data.songs.map(s => normalizeSong(s)));
    } else {
      // 2. Global/International logic
      // Always include top English hits as base
      const engRes = await fetchWithSaavnFallback(`/api/playlists?id=1081991857&limit=20`).catch(() => null);
      if (engRes && engRes.data?.songs) {
        arraysToInterleave.push(engRes.data.songs.map(s => normalizeSong(s)));
      }

      // Fallback: search tracks directly for `top hits {country}` to get local flavor
      if (country !== 'Global' && country !== 'United States') {
        try {
          const localSearch = await searchTracks(`top hits ${country} trending`);
          if (localSearch && localSearch.length > 0) {
            // Assign the country name as the 'language' so it shows up beautifully in the chips! e.g., "Spain"
            const localNormalized = localSearch.map(t => ({ 
              ...t, 
              language: country.toLowerCase() 
            }));
            arraysToInterleave.push(localNormalized);
          }
        } catch (e) {}
      }
    }

    // Interleave them to create a diverse mix
    const interleaved = [];
    const maxLength = Math.max(...arraysToInterleave.map(arr => arr.length), 0);
    const seenIds = new Set();
    
    for (let i = 0; i < maxLength; i++) {
      for (const songArray of arraysToInterleave) {
        const song = songArray[i];
        if (song && !seenIds.has(song.id)) {
          interleaved.push(song);
          seenIds.add(song.id);
        }
      }
    }

    if (interleaved.length > 0) {
      return interleaved;
    }
    
    return await searchTracks("global top hits trending");
  } catch (e) {
    console.warn('Could not fetch curated trending playlists, falling back to basic search:', e);
    return await searchTracks("global top hits trending");
  }
};

const GIPHY_API_KEY = 'Gc7131jiJuvI7IdN0HZ1D7nh0ow5BU6g';
export const getTenorGifs = async (query = 'trending') => {
  try {
    const endpoint = query === 'trending'
      ? `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=pg`
      : `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=24&rating=pg`;
    const res = await fetch(endpoint);
    const data = await res.json();
    return (data.data || []).map(gif => ({ 
      id: gif.id, 
      preview: gif.images?.fixed_width_small?.url || '', 
      url: gif.images?.original?.url || '' 
    })).filter(g => g.url);
  } catch (err) { return []; }
};

export const importPlaylist = async (url) => {
  try {
    // JioSaavn Playlist Support (Unlimited songs natively via Vercel API)
    if (url.includes('jiosaavn.com/')) {
      const data = await fetchWithSaavnFallback(`/api/playlists?link=${encodeURIComponent(url)}`);
      if (!data.data || !data.data.songs) return [];
      
      return data.data.songs.map(song => ({
        title: song.name,
        author: song.artists?.primary?.map(a => a.name).join(', ') || 'Unknown Artist'
      }));
    }

    // YouTube Playlist Support (via Public APIs, no backend required)
    const match = url.match(/[?&]list=([^&]+)/);
    if (match && match[1]) {
      const playlistId = match[1];
      const instances = [
        'vid.puffyan.us',
        'inv.nadeko.net',
        'invidious.nerdvpn.de',
        'invidious.slipfox.xyz'
      ];
      
      for (const instance of instances) {
        try {
          let allTracks = [];
          let page = 1;
          let hasMore = true;

          while (hasMore) {
            const res = await fetch(`https://${instance}/api/v1/playlists/${playlistId}?page=${page}`);
            if (!res.ok) throw new Error('Bad response');
            
            const data = await res.json();
            if (data && data.videos && data.videos.length > 0) {
              const tracks = data.videos.map(song => ({
                title: decodeHtml(song.title || 'Unknown Title'),
                author: decodeHtml(song.author || 'Unknown Artist')
              }));
              allTracks = allTracks.concat(tracks);
              
              // Invidious typically returns 100 items per page
              if (data.videos.length < 100) {
                hasMore = false;
              } else {
                page++;
              }
            } else {
              hasMore = false; // No videos on this page
            }
          }
          
          if (allTracks.length > 0) {
            return allTracks;
          }
        } catch (e) {
          console.warn(`Invidious instance ${instance} failed, trying next...`);
        }
      }
      
      throw new Error('Failed to fetch YouTube playlist from all public APIs');
    }

    throw new Error('Unsupported playlist URL format');
  } catch (e) {
    console.error('[importPlaylist Error]', e);
    return [];
  }
};

export const getLyrics = async (track, artist, duration) => {
  try {
    const query = new URLSearchParams({ track_name: track });
    if (artist) {
      // Get primary artist only for better match
      const primaryArtist = artist.split(',')[0].trim();
      query.append('artist_name', primaryArtist);
    }
    
    // 1. Try exact match using duration if available
    if (duration) {
      const getQuery = new URLSearchParams(query);
      getQuery.append('duration', duration.toString());
      try {
        const getRes = await fetch(`https://lrclib.net/api/get?${getQuery.toString()}`);
        if (getRes.ok) {
          const getData = await getRes.json();
          if (getData && (getData.syncedLyrics || getData.plainLyrics)) {
            return {
              lyrics: getData.syncedLyrics || getData.plainLyrics,
              isSynced: !!getData.syncedLyrics
            };
          }
        }
      } catch (e) {
        console.warn('Exact lyric match failed, falling back to search');
      }
    }

    // 2. Fallback to fuzzy search
    const response = await fetch(`https://lrclib.net/api/search?${query.toString()}`);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      let bestMatch = data[0];
      
      // Find best match by duration (within 5 seconds) if available
      if (duration) {
        const matchingDuration = data.find(item => item.duration && Math.abs(item.duration - duration) <= 5);
        if (matchingDuration) {
          bestMatch = matchingDuration;
        }
      }
      
      if (bestMatch.syncedLyrics) {
        return { lyrics: bestMatch.syncedLyrics, isSynced: true };
      } else if (bestMatch.plainLyrics) {
        return { lyrics: bestMatch.plainLyrics, isSynced: false };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Failed to fetch lyrics:', error);
    return null;
  }
};
