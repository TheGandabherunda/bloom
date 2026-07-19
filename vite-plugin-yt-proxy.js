import CryptoJS from 'crypto-js';

function decryptUrl(encryptedUrl, forceHQ = false) {
  try {
    const key = CryptoJS.enc.Utf8.parse('38346591');
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encryptedUrl) },
      key,
      { mode: CryptoJS.mode.ECB }
    ).toString(CryptoJS.enc.Utf8);
    
    // Replace any bitrate suffix with the best available quality
    if (forceHQ) {
      return decrypted.replace(/_\d+\.mp4$/, '_320.mp4');
    } else {
      return decrypted.replace(/_\d+\.mp4$/, '_160.mp4'); // default standard quality
    }
  } catch (e) {
    return null;
  }
}

const jioSaavnHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.jiosaavn.com/',
  'Origin': 'https://www.jiosaavn.com'
};

export function ytProxyPlugin() {
  return {
    name: 'vite-plugin-yt-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // API Route for Searching
        if (req.url.startsWith('/api/yt/search?')) {
          const url = new URL(req.url, `http://${req.headers.host}`);
          let query = url.searchParams.get('q');
          
          if (!query) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: 'Missing query' }));
          }

          query = query.replace(/\baudio\b/ig, '').trim(); // Remove "audio" keyword from YT query

          try {
            const response = await fetch(`https://www.jiosaavn.com/api.php?_format=json&_marker=0&api_version=4&ctx=web6dot0&__call=search.getResults&q=${encodeURIComponent(query)}`, {
              headers: jioSaavnHeaders
            });
            const text = await response.text();
            let data;
            try {
               data = JSON.parse(text);
            } catch (e) {
               console.error('[JioSaavn Proxy Search] Invalid JSON response:', text.substring(0, 100));
               throw new Error('Invalid JSON from JioSaavn');
            }
            
            if (!data.results || data.results.length === 0) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'No results found' }));
            }

            const results = data.results.map(song => {
              // Decode HTML entities
              const decode = (str) => str.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
              
              const primaryArtists = song.more_info?.artistMap?.primary_artists?.map(a => a.name).join(', ') || 'Unknown Artist';
              
              return {
                id: song.id,
                title: decode(song.title),
                channel: { name: primaryArtists },
                thumbnail: { url: song.image.replace('150x150', '500x500') },
                duration: parseInt(song.more_info?.duration || 0) * 1000,
                url: `https://jiosaavn.com/song/${song.id}`,
                hasHighRes: song.more_info?.['320kbps'] === 'true' || song.more_info?.['320kbps'] === true,
              };
            });

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(results));
          } catch (error) {
            console.error('[JioSaavn Proxy Search Error]', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
          }
          return;
        }

        // API Route for Recommendations
        if (req.url.startsWith('/api/yt/recommend?')) {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const songId = url.searchParams.get('id');
          
          if (!songId) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: 'Missing song id' }));
          }

          try {
            const response = await fetch(`https://www.jiosaavn.com/api.php?_format=json&_marker=0&api_version=4&ctx=web6dot0&__call=reco.getreco&pid=${songId}`, {
              headers: jioSaavnHeaders
            });
            const text = await response.text();
            let data;
            try {
               data = JSON.parse(text);
            } catch (e) {
               console.error('[JioSaavn Proxy Reco] Invalid JSON response:', text.substring(0, 100));
               throw new Error('Invalid JSON from JioSaavn');
            }
            
            // The API returns an array directly, or an empty array
            const songs = Array.isArray(data) ? data : [];

            if (songs.length === 0) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'No recommendations found' }));
            }

            const results = songs.map(song => {
              const decode = (str) => (str || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
              const primaryArtists = song.more_info?.artistMap?.primary_artists?.map(a => a.name).join(', ') || 'Unknown Artist';
              
              return {
                id: song.id,
                title: decode(song.title),
                channel: { name: primaryArtists },
                thumbnail: { url: (song.image || '').replace('150x150', '500x500') },
                duration: parseInt(song.more_info?.duration || 0) * 1000,
                url: `https://jiosaavn.com/song/${song.id}`,
                hasHighRes: song.more_info?.['320kbps'] === 'true' || song.more_info?.['320kbps'] === true,
              };
            });

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(results));
          } catch (error) {
            console.error('[JioSaavn Proxy Reco Error]', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
          }
          return;
        }

        // API Route for Streaming Audio
        if (req.url.startsWith('/api/yt/stream/')) {
          const videoId = req.url.split('/api/yt/stream/')[1].split('?')[0];
          
          if (!videoId) {
            res.statusCode = 400;
            return res.end('Missing videoId');
          }

          try {
            const response = await fetch(`https://www.jiosaavn.com/api.php?_format=json&_marker=0&api_version=4&ctx=web6dot0&__call=song.getDetails&pids=${videoId}`, {
              headers: jioSaavnHeaders
            });
            const text = await response.text();
            let data;
            try {
               data = JSON.parse(text);
            } catch (e) {
               console.error('[JioSaavn Proxy Stream] Invalid JSON response:', text.substring(0, 100));
               throw new Error('Invalid JSON from JioSaavn');
            }
            
            let song = null;
            if (data.songs && data.songs.length > 0) {
              song = data.songs[0];
            } else if (data[videoId]) {
              song = data[videoId];
            }

            if (!song || !song.more_info || !song.more_info.encrypted_media_url) {
              res.statusCode = 404;
              return res.end('Audio format not found');
            }

            const hasHighRes = song.more_info?.['320kbps'] === 'true' || song.more_info?.['320kbps'] === true;
            const mediaUrl = decryptUrl(song.more_info.encrypted_media_url, hasHighRes);
            
            if (!mediaUrl) {
              res.statusCode = 500;
              return res.end('Decryption failed');
            }

            // Redirect the client to the high-res audio stream!
            // JioSaavn CDNs support CORS natively for media elements and fetches.
            res.statusCode = 302;
            res.setHeader('Location', mediaUrl);
            res.end();
          } catch (error) {
            console.error('[JioSaavn Proxy Stream Error]', error);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end('Internal Server Error');
            }
          }
          return;
        }

        // API Route for Image Proxy (CORS bypass for Color Extraction)
        if (req.url.startsWith('/api/yt/image?')) {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const targetUrl = url.searchParams.get('url');
          if (!targetUrl) {
            res.statusCode = 400;
            return res.end('Missing url');
          }
          try {
            const response = await fetch(targetUrl);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.end(buffer);
          } catch (e) {
            console.error('[Image Proxy Error]', e);
            res.statusCode = 500;
            res.end('Error proxying image');
          }
          return;
        }

        // Pass to the next middleware if not an API route
        next();
      });
    }
  };
}
