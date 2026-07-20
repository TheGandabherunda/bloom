import { XMLParser } from 'fast-xml-parser';
import spotifyUrlInfo from 'spotify-url-info';
import { Innertube } from 'youtubei.js';

const spotify = spotifyUrlInfo(fetch);

// Extract track title and author from youtubei.js LockupView item
function parseYoutubeItem(item) {
  const title = item.metadata?.title?.text || 'Unknown Title';
  const author =
    item.metadata?.metadata?.metadata_rows?.[0]?.metadata_parts?.[0]?.text?.text ||
    'Unknown Artist';
  return { title, author };
}

export const handler = async (event) => {
  const playlistUrl = event.queryStringParameters?.url;

  if (!playlistUrl) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing playlist url' }) };
  }

  try {
    // --- Spotify Playlist Support ---
    if (playlistUrl.includes('spotify.com/playlist/')) {
      try {
        const spotifyTracks = await spotify.getTracks(playlistUrl);
        if (!spotifyTracks || spotifyTracks.length === 0) {
          return { statusCode: 404, body: JSON.stringify({ error: 'Spotify playlist not found or empty' }) };
        }
        const tracks = spotifyTracks.map(item => ({
          title: item.name || 'Unknown Title',
          author: item.artist || 'Unknown Artist',
        })).filter(t => t.title !== 'Unknown Title');

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tracks),
        };
      } catch (err) {
        console.error('[Spotify Proxy Error]', err);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse Spotify playlist' }) };
      }
    }

    // --- YouTube Playlist Support via youtubei.js (full playlist, no API key) ---
    const match = playlistUrl.match(/[?&]list=([^&]+)/);
    if (!match || !match[1]) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid YouTube playlist URL' }) };
    }
    const playlistId = match[1];

    try {
      const yt = await Innertube.create({ generate_session_locally: true });
      const playlist = await yt.getPlaylist(playlistId);

      let allVideos = [...(playlist.videos || [])];

      // Page through all continuations to get full playlist
      let current = playlist;
      while (current.has_continuation) {
        current = await current.getContinuation();
        allVideos = allVideos.concat(current.videos || []);
      }

      const tracks = allVideos
        .map(parseYoutubeItem)
        .filter(t => t.title !== 'Unknown Title');

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tracks),
      };
    } catch (ytErr) {
      console.warn('[youtubei.js failed, falling back to RSS]', ytErr.message);

      // --- RSS Fallback (limited to 15 items) ---
      const ytFeedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
      const rssRes = await fetch(ytFeedUrl);

      if (!rssRes.ok) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Playlist not found or empty' }) };
      }

      const xmlData = await rssRes.text();
      const parser = new XMLParser();
      const jObj = parser.parse(xmlData);

      if (!jObj?.feed?.entry) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Playlist not found or empty' }) };
      }

      const entries = Array.isArray(jObj.feed.entry) ? jObj.feed.entry : [jObj.feed.entry];
      const tracks = entries
        .map(item => ({ title: item.title || 'Unknown Title', author: item.author?.name || 'Unknown Artist' }))
        .filter(t => t.title !== 'Unknown Title');

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tracks),
      };
    }
  } catch (error) {
    console.error('[yt-playlist] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
