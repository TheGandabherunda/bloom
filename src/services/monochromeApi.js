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
    const url = `https://jiosaavn-api-one-rho.vercel.app/api/search/songs?query=${encodeURIComponent(q)}`;
    
    const response = await fetch(url);
    const data = await response.json();
    if (!data.success || !data.data || !data.data.results || data.data.results.length === 0) return [];
    
    return data.data.results.map(song => {
      const thumbnail = song.image.find(img => img.quality === '500x500')?.url || song.image[song.image.length - 1]?.url;
      const downloadUrl = song.downloadUrl?.find(d => d.quality === '320kbps')?.url || song.downloadUrl?.[song.downloadUrl.length - 1]?.url;
      const author = song.artists?.primary?.map(a => a.name).join(', ') || 'Unknown Artist';
      
      const textArea = document.createElement('textarea');
      textArea.innerHTML = song.name;
      const title = textArea.value;

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

export const getRecommendations = async (track) => {
  if (!track || !track.id) return [];
  try {
    const url = `https://jiosaavn-api-one-rho.vercel.app/api/songs/${track.id}/suggestions`;
    const response = await fetch(url);
    const data = await response.json();
    if (!data.success || !data.data || data.data.length === 0) return [];
    
    return data.data.map(song => {
      const thumbnail = song.image.find(img => img.quality === '500x500')?.url || song.image[song.image.length - 1]?.url;
      const downloadUrl = song.downloadUrl?.find(d => d.quality === '320kbps')?.url || song.downloadUrl?.[song.downloadUrl.length - 1]?.url;
      const author = song.artists?.primary?.map(a => a.name).join(', ') || 'Unknown Artist';
      
      const textArea = document.createElement('textarea');
      textArea.innerHTML = song.name;
      const title = textArea.value;

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
