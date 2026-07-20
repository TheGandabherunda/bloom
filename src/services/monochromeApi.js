// The backend proxy now handles all high-res streams natively via Jiosaavn CDN.
// External monochrome mirrors are permanently stripped.

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
    // iTunes Search API is robust, fast, and supports JSONP properly without nosniff headers blocking it.
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&country=in&limit=20`;
    
    const data = await fetchJSONP(url);
    if (!data.results || data.results.length === 0) return [];
    
    return data.results.map(song => {
      // iTunes provides a 100x100 image, we replace it with 600x600 for high quality
      const highResImage = (song.artworkUrl100 || '').replace('100x100bb', '600x600bb');
      return {
        id: song.trackId.toString(),
        title: song.trackName,
        author: song.artistName,
        thumbnail: highResImage,
        duration: parseInt(song.trackTimeMillis || 0),
        isMusic: true,
        audioQuality: 'HD',
        _resolveQuery: `${song.trackName} ${song.artistName} song audio` // Used later for YT audio resolution
      };
    });
  } catch (e) {
    console.error('Search failed:', e);
    return [];
  }
};

export const getRecommendations = async (track) => {
  if (!track || !track.title) return [];
  try {
    // iTunes doesn't have a direct recommendation API, but we can search for the artist's top tracks
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(track.author || track.title)}&entity=song&country=in&limit=15`;
    const data = await fetchJSONP(url);
    if (!data.results || data.results.length === 0) throw new Error('No reco');
    
    return data.results
      .filter(song => song.trackId.toString() !== track.id) // Filter out the current track
      .map(song => {
        const highResImage = (song.artworkUrl100 || '').replace('100x100bb', '600x600bb');
        return {
          id: song.trackId.toString(),
          title: song.trackName,
          author: song.artistName,
          thumbnail: highResImage,
          duration: parseInt(song.trackTimeMillis || 0),
          isMusic: true,
          audioQuality: 'HD',
          _resolveQuery: `${song.trackName} ${song.artistName} song audio`
        };
      });
  } catch (e) {
    console.error('Reco failed:', e);
    return [];
  }
};

export const getMix = async () => {
  return searchTracks("top hits today");
};

export const getTopVideos = async () => {
  return searchTracks("top music");
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
    const res = await fetch(`/api/yt/playlist?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('Failed to import playlist');
    const tracks = await res.json();
    return tracks;
  } catch (e) {
    console.error(e);
    return [];
  }
};

export const getLyrics = async (track, artist) => {
  try {
    const query = new URLSearchParams({ track });
    if (artist) query.append('artist', artist);
    
    // Call the local vite proxy
    const response = await fetch(`/api/lyrics?${query.toString()}`);
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json(); // { lyrics, isSynced }
  } catch (error) {
    console.error('Failed to fetch lyrics:', error);
    return null;
  }
};
