// The backend proxy now handles all high-res streams natively via Jiosaavn CDN.
// External monochrome mirrors are permanently stripped.

export const findBestMirror = async () => {
  return "proxy"; 
};

export const getApiBase = () => "proxy";
export const getMirrorStatus = () => ({ "proxy": "healthy" });

export const searchTracks = async (query) => {
  try {
    const res = await fetch(`/api/yt/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    return data.map(track => ({
      id: track.id,
      title: track.title,
      author: track.channel?.name || 'Unknown Artist',
      thumbnail: track.thumbnail?.url || '',
      duration: track.duration || 0,
      isMusic: true,
      audioQuality: track.hasHighRes ? 'HD' : 'SD'
    }));
  } catch (e) {
    console.error(e);
    return [];
  }
};

export const getRecommendations = async (track) => {
  if (!track || !track.id) return [];
  
  try {
    const res = await fetch(`/api/yt/recommend?id=${track.id}`);
    if (!res.ok) throw new Error('Reco failed');
    const data = await res.json();
    return data.map(song => ({
      id: song.id,
      title: song.title,
      author: song.channel?.name || 'Unknown Artist',
      thumbnail: song.thumbnail?.url || '',
      duration: song.duration || 0,
      isMusic: true,
      audioQuality: song.hasHighRes ? 'HD' : 'SD'
    }));
  } catch (e) {
    console.error(e);
    // Fallback to searching if reco fails
    const q = track?.author || track?.title || "popular";
    return searchTracks(`${q} top songs`);
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
