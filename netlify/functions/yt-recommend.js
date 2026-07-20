const jioSaavnHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.jiosaavn.com/',
  'Origin': 'https://www.jiosaavn.com'
};

export const handler = async (event) => {
  const songId = event.queryStringParameters?.id;

  if (!songId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing song id' }) };
  }

  try {
    const response = await fetch(
      `https://www.jiosaavn.com/api.php?_format=json&_marker=0&api_version=4&ctx=web6dot0&__call=reco.getreco&pid=${songId}`,
      { headers: jioSaavnHeaders }
    );
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Invalid JSON from JioSaavn' }) };
    }

    const songs = Array.isArray(data) ? data : [];

    if (songs.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'No recommendations found' }) };
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

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(results),
    };
  } catch (error) {
    console.error('[yt-recommend] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};
