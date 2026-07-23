// The backend proxy now handles all high-res streams natively via Jiosaavn CDN.
// External monochrome mirrors are permanently stripped.

// Decode HTML entities without DOM mutations (no textarea/DOMParser overhead)
const decodeHtml = (str) => str
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#039;/g, "'")
  .replace(/&apos;/g, "'");

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

export const searchTracks = async (query) => {
  try {
    const q = query.replace(/\baudio\b/ig, '').trim();
    const url = `https://jiosaavn-api-one-rho.vercel.app/api/search/songs?query=${encodeURIComponent(q)}&limit=40`;
    
    const response = await fetch(url);
    const data = await response.json();
    if (!data.success || !data.data || !data.data.results || data.data.results.length === 0) return [];
    
    return data.data.results.map(song => {
      const thumbnail = song.image.find(img => img.quality === '500x500')?.url || song.image[song.image.length - 1]?.url;
      const downloadUrl = song.downloadUrl?.find(d => d.quality === '320kbps')?.url || song.downloadUrl?.[song.downloadUrl.length - 1]?.url;
      const author = song.artists?.primary?.map(a => a.name).join(', ') || 'Unknown Artist';
      
      const title = decodeHtml(song.name);

      return {
        id: song.id,
        title: title,
        author: author,
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
    const url = `https://jiosaavn-api-one-rho.vercel.app/api/songs/${track.id}/suggestions?limit=40`;
    const response = await fetch(url);
    const data = await response.json();
    if (!data.success || !data.data || data.data.length === 0) return [];
    
    const results = data.data.map(song => {
      const thumbnail = song.image.find(img => img.quality === '500x500')?.url || song.image[song.image.length - 1]?.url;
      const downloadUrl = song.downloadUrl?.find(d => d.quality === '320kbps')?.url || song.downloadUrl?.[song.downloadUrl.length - 1]?.url;
      const author = song.artists?.primary?.map(a => a.name).join(', ') || 'Unknown Artist';
      
      const title = decodeHtml(song.name);

      return {
        id: song.id,
        title: title,
        author: author,
        thumbnail: thumbnail,
        duration: parseInt(song.duration || 0),
        isMusic: true,
        audioQuality: 'HD',
        downloadUrl: downloadUrl
      };
    });
    recsCache.set(track.id, results);
    return results;
  } catch (e) {
    console.error('Recommendations failed:', e);
    return [];
  }
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

    const normalizeSong = (song, forceLanguage = null) => ({
      id: song.id,
      title: song.name || song.title,
      author: song.primaryArtists || (song.artists && song.artists.primary && song.artists.primary[0]?.name) || 'Unknown Artist',
      thumbnail: song.image?.[song.image?.length - 1]?.url || song.image?.[0]?.url || '/placeholder.png',
      duration: song.duration,
      downloadUrl: song.downloadUrl?.[song.downloadUrl.length - 1]?.url || '',
      language: forceLanguage || song.language || 'unknown'
    });

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
      const fetches = playlistIds.map(id => fetch(`https://jiosaavn-api-one-rho.vercel.app/api/playlists?id=${id}&limit=15`).then(r => r.json()).catch(() => null));
      const results = await Promise.all(fetches);
      
      arraysToInterleave = results.filter(r => r?.success && r.data?.songs).map(r => r.data.songs.map(s => normalizeSong(s)));
    } else {
      // 2. Global/International logic
      // Always include top English hits as base
      const engRes = await fetch(`https://jiosaavn-api-one-rho.vercel.app/api/playlists?id=1081991857&limit=20`).then(r => r.json()).catch(() => null);
      if (engRes?.success && engRes.data?.songs) {
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
      const res = await fetch(`https://jiosaavn-api-one-rho.vercel.app/api/playlists?link=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error('Failed to fetch JioSaavn playlist');
      const data = await res.json();
      if (!data.success || !data.data || !data.data.songs) return [];
      
      return data.data.songs.map(song => ({
        title: song.name,
        author: song.artists?.primary?.map(a => a.name).join(', ') || 'Unknown Artist'
      }));
    }

    // YouTube Playlist Support (Full playlists via Netlify Serverless Proxy)
    const match = url.match(/[?&]list=([^&]+)/);
    if (match && match[1]) {
      // Call the Netlify backend directly to scrape the full YouTube playlist (bypasses CORS)
      const res = await fetch(`https://bloom-music-player.netlify.app/api/audio/playlist?url=${encodeURIComponent(url)}`);
      
      if (!res.ok) throw new Error('Failed to fetch YouTube playlist from backend');
      const tracks = await res.json();
      return tracks;
    }

    throw new Error('Unsupported playlist URL format');
  } catch (e) {
    console.error('[importPlaylist Error]', e);
    return [];
  }
};

export const getLyrics = async (track, artist) => {
  try {
    const query = new URLSearchParams({ track_name: track });
    if (artist) {
      // Get primary artist only for better match
      const primaryArtist = artist.split(',')[0].trim();
      query.append('artist_name', primaryArtist);
    }
    
    // Use search instead of get for fuzzy matching (essential for titles with (From "Movie"))
    const response = await fetch(`https://lrclib.net/api/search?${query.toString()}`);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      const bestMatch = data[0];
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
