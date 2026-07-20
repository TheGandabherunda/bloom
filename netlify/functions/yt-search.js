import CryptoJS from 'crypto-js';

const jioSaavnHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.jiosaavn.com/',
  'Origin': 'https://www.jiosaavn.com'
};

export const handler = async (event) => {
  let query = event.queryStringParameters?.q;

  if (!query) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing query' }) };
  }

  query = query.replace(/\baudio\b/ig, '').trim();

  try {
    const response = await fetch(
      `https://www.jiosaavn.com/api.php?_format=json&_marker=0&api_version=4&ctx=web6dot0&__call=search.getResults&q=${encodeURIComponent(query)}`,
      { headers: jioSaavnHeaders }
    );
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Invalid JSON from JioSaavn' }) };
    }

    if (!data.results || data.results.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No results found' }) };
    }

    const results = data.results.map(song => {
      const decode = (str) => (str || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      const primaryArtists = song.more_info?.artistMap?.primary_artists?.map(a => a.name).join(', ') || 'Unknown Artist';
      return {
        id: song.id,
        title: decode(song.title),
        author: primaryArtists,
        thumbnail: song.image.replace('150x150', '500x500'),
        duration: parseInt(song.more_info?.duration || 0) * 1000,
        url: `https://jiosaavn.com/song/${song.id}`,
        hasHighRes: song.more_info?.['320kbps'] === 'true' || song.more_info?.['320kbps'] === true,
      };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(results),
    };
  } catch (error) {
    console.error('[yt-search] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};
