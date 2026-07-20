export const handler = async (event) => {
  const track = event.queryStringParameters?.track;
  const artist = event.queryStringParameters?.artist;

  if (!track) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing track parameter' }) };
  }

  try {
    const query = new URLSearchParams({ track_name: track });
    if (artist) query.append('artist_name', artist);

    const lrcUrl = `https://lrclib.net/api/search?${query.toString()}`;
    const lrcRes = await fetch(lrcUrl);

    if (!lrcRes.ok) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Lyrics not found' }) };
    }

    const data = await lrcRes.json();
    if (data && data.length > 0) {
      const lyrics = data[0].syncedLyrics || data[0].plainLyrics || null;
      if (lyrics) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lyrics, isSynced: !!data[0].syncedLyrics }),
        };
      }
    }

    return { statusCode: 404, body: JSON.stringify({ error: 'Lyrics not found' }) };
  } catch (error) {
    console.error('[lyrics] Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch lyrics' }) };
  }
};
