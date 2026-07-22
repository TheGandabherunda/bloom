import CryptoJS from 'crypto-js';
import { XMLParser } from 'fast-xml-parser';
import spotifyUrlInfo from 'spotify-url-info';
import { execFile } from 'child_process';
import path from 'path';
const spotify = spotifyUrlInfo(fetch);

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

export function audioProxyPlugin() {
  return {
    name: 'vite-plugin-yt-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // API Route for Searching
        if (req.url.startsWith('/api/audio/search?')) {
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
        else if (req.url.startsWith('/api/audio/recommend?')) {
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
        else if (req.url.startsWith('/api/audio/stream/')) {
          const videoId = req.url.split('/api/audio/stream/')[1].split('?')[0];
          
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
        else if (req.url.startsWith('/api/audio/image?')) {
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

        // API Route for YouTube Playlist Import
        else if (req.url.startsWith('/api/audio/playlist?')) {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const playlistUrl = url.searchParams.get('url');
          
          if (!playlistUrl) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: 'Missing playlist url' }));
          }

          try {
            // --- Spotify Playlist Support ---
            if (playlistUrl.includes('spotify.com/playlist/')) {
              try {
                const spotifyTracks = await spotify.getTracks(playlistUrl);
                if (!spotifyTracks || spotifyTracks.length === 0) {
                  res.statusCode = 404;
                  return res.end(JSON.stringify({ error: 'Spotify playlist not found or empty' }));
                }
                const tracks = spotifyTracks.map(item => {
                  const title = item.name || 'Unknown Title';
                  const author = item.artists && item.artists[0] ? item.artists[0].name : 'Unknown Artist';
                  return { title, author };
                }).filter(t => t.title !== 'Unknown Title');
                
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify(tracks));
              } catch (err) {
                console.error('[Spotify Proxy Error]', err);
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: 'Failed to parse Spotify playlist' }));
              }
            }

              // Extract Playlist ID from URL
              const match = playlistUrl.match(/[?&]list=([^&]+)/);
              if (!match || !match[1]) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: 'Invalid YouTube playlist URL' }));
              }
              const playlistId = match[1];
  
              // --- YouTube Playlist Support (yt-dlp for full playlist) ---
              try {
                const ytDlpPath = path.resolve(process.cwd(), 'yt-dlp.exe');
                const tracks = await new Promise((resolve, reject) => {
                  execFile(ytDlpPath, ['-J', '--flat-playlist', playlistUrl], { maxBuffer: 1024 * 1024 * 50 }, (error, stdout) => {
                    if (error) return reject(error);
                    try {
                      let cleanStdout = stdout;
                      if (cleanStdout.charCodeAt(0) === 0xFEFF) {
                        cleanStdout = cleanStdout.slice(1);
                      }
                      const data = JSON.parse(cleanStdout);
                      if (!data.entries) return reject(new Error('No entries'));
                      const results = data.entries.map(item => ({
                        title: item.title || 'Unknown Title',
                        author: item.uploader || 'Unknown Artist'
                      })).filter(t => t.title !== 'Unknown Title');
                      resolve(results);
                    } catch (e) {
                      reject(e);
                    }
                  });
                });
                
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify(tracks));
              } catch (ytDlpError) {
                console.log('[yt-dlp failed, falling back to RSS]', ytDlpError.message);
                
                // Fallback to RSS (limited to 15 items)
                const ytFeedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
                const rssRes = await fetch(ytFeedUrl);
                if (!rssRes.ok) {
                  res.statusCode = 404;
                  return res.end(JSON.stringify({ error: 'Playlist not found or empty' }));
                }
                const xmlData = await rssRes.text();
                
                const parser = new XMLParser();
                const jObj = parser.parse(xmlData);
                
                if (!jObj || !jObj.feed || !jObj.feed.entry) {
                  res.statusCode = 404;
                  return res.end(JSON.stringify({ error: 'Playlist not found or empty' }));
                }
                
                const entries = Array.isArray(jObj.feed.entry) ? jObj.feed.entry : [jObj.feed.entry];
    
                const tracks = entries.map(item => {
                  const title = item.title || 'Unknown Title';
                  const author = item.author?.name || 'Unknown Artist';
                  return { title, author };
                }).filter(t => t.title !== 'Unknown Title');
    
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(tracks));
              }
          } catch (error) {
            console.error('[JioSaavn Proxy Playlist Error]', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        }
        else if (req.url.startsWith('/api/lyrics')) {
          const urlObj = new URL(req.url, `http://${req.headers.host}`);
          const track = urlObj.searchParams.get('track');
          const artist = urlObj.searchParams.get('artist');
          
          if (!track) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: 'Missing track parameter' }));
          }

          try {
            const query = new URLSearchParams({ track_name: track });
            if (artist) query.append('artist_name', artist);
            
            const lrcUrl = `https://lrclib.net/api/search?${query.toString()}`;
            const lrcRes = await fetch(lrcUrl);
            
            if (!lrcRes.ok) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'Lyrics not found' }));
            }
            
            const data = await lrcRes.json();
            if (data && data.length > 0) {
              // Prefer synced lyrics, fallback to plain
              const lyrics = data[0].syncedLyrics || data[0].plainLyrics || null;
              if (lyrics) {
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ lyrics, isSynced: !!data[0].syncedLyrics }));
              }
            }
            
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Lyrics not found' }));
          } catch (error) {
            console.error('[Lyrics Proxy Error]', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Failed to fetch lyrics' }));
          }
        }
        else {
          next();
        }
      });
    }
  };
}
