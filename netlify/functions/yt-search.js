const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    let query = event.queryStringParameters?.q || '';
    if (!query) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing query' }) };
    }
    
    let isDebug = false;
    if (query.startsWith('DEBUG_')) {
       isDebug = true;
       query = query.replace('DEBUG_', '');
    }

    query = query.replace(/\baudio\b/ig, '').trim();

    // YouTube Music Innertube API (Zero dependencies, perfectly stable, purely music results)
    const res = await fetch('https://music.youtube.com/youtubei/v1/search?key=', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://music.youtube.com'
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB_REMIX",
            clientVersion: "1.20230522.01.00"
          }
        },
        query: query
      })
    });

    if (!res.ok) {
      return { statusCode: res.status, headers: corsHeaders, body: JSON.stringify({ error: 'YouTube API Error' }) };
    }

    const data = await res.json();
    
    if (isDebug) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };
    }

    const sections = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    
    let songs = [];
    for (const section of sections) {
      const items = section.musicShelfRenderer?.contents || [];
      for (const item of items) {
        const song = item.musicResponsiveListItemRenderer;
        if (song) {
          const titleObj = song.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0];
          const detailsRuns = song.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
          
          const title = titleObj?.text || 'Unknown';
          const videoId = song.playlistItemData?.videoId || titleObj?.navigationEndpoint?.watchEndpoint?.videoId;
          
          let author = 'Unknown Artist';
          let duration = '0:00';
          
          const texts = detailsRuns.map(r => r.text).filter(t => t !== ' • ');
          if (texts.length >= 1) {
            if (texts[0] === 'Song' || texts[0] === 'Video') {
               author = texts[1] || author;
               duration = texts[texts.length - 1];
            } else {
               author = texts[0] || author;
               duration = texts[texts.length - 1];
            }
          }

          const thumbnails = song.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
          const thumbnail = thumbnails.sort((a,b) => b.width - a.width)[0]?.url || '';

          if (videoId) {
            // Convert duration to ms
            let durationMs = 0;
            if (duration) {
              const parts = duration.split(':').map(Number);
              if (parts.length === 3) durationMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
              else if (parts.length === 2) durationMs = (parts[0] * 60 + parts[1]) * 1000;
            }

            songs.push({
              id: videoId,
              title,
              author,
              thumbnail,
              duration: durationMs,
              isMusic: true,
              audioQuality: 'HD'
            });
          }
        }
      }
    }

    if (songs.length === 0) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'No results found' }) };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(songs.slice(0, 15))
    };
  } catch (error) {
    console.error('[yt-search] Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};
