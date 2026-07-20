// The backend proxy now handles all high-res streams natively via Jiosaavn CDN.
// External monochrome mirrors are permanently stripped.

const API_BASE = 'https://jiosaavn-api-one-rho.vercel.app/api';

export const searchTracks = async (query) => {
  try {
    const q = query.replace(/\baudio\b/ig, '').trim();
    const url = `${API_BASE}/search/songs?query=${encodeURIComponent(q)}`;
    
    const response = await fetch(url);
    const data = await response.json();
    if (!data.success || !data.data || !data.data.results || data.data.results.length === 0) return [];
    
    return data.data.results.map(song => {
      // Find highest quality image
      const thumbnail = song.image.find(img => img.quality === '500x500')?.url 
                     || song.image[song.image.length - 1]?.url;
                     
      // Find highest quality audio
      const downloadUrl = song.downloadUrl?.find(d => d.quality === '320kbps')?.url 
                       || song.downloadUrl?.[song.downloadUrl.length - 1]?.url;

      // Unescape HTML entities in title
      const title = decodeHtmlEntities(song.name);
      
      const author = song.artists?.primary?.map(a => a.name).join(', ') || 'Unknown Artist';

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
    const url = `${API_BASE}/songs/${track.id}/suggestions`;
    const response = await fetch(url);
    const data = await response.json();
    if (!data.success || !data.data || data.data.length === 0) return [];
    
    return data.data.map(song => {
      const thumbnail = song.image.find(img => img.quality === '500x500')?.url 
                     || song.image[song.image.length - 1]?.url;
      const downloadUrl = song.downloadUrl?.find(d => d.quality === '320kbps')?.url 
                       || song.downloadUrl?.[song.downloadUrl.length - 1]?.url;
                       
      const title = decodeHtmlEntities(song.name);
      const author = song.artists?.primary?.map(a => a.name).join(', ') || 'Unknown Artist';

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

function decodeHtmlEntities(text) {
  const textArea = document.createElement('textarea');
  textArea.innerHTML = text;
  return textArea.value;
}
