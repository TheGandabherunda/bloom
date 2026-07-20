import play from 'play-dl';

export const handler = async (event) => {
  const videoId = event.queryStringParameters?.id || event.path?.split('/').pop();

  if (!videoId) {
    return { statusCode: 400, body: 'Missing videoId' };
  }

  try {
    const info = await play.video_info(videoId);
    // Find the highest quality audio format (usually itag 140 or 251)
    const audioFormats = info.format.filter(f => f.mimeType?.startsWith('audio/'));
    
    // Prefer audio/mp4 (itag 140) for better browser compatibility in <audio> tag
    const format = audioFormats.find(f => f.itag === 140) || audioFormats[0];

    if (!format || !format.url) {
      return { statusCode: 404, body: 'Audio stream not found for this video' };
    }

    // Redirect the browser directly to the Google Video URL
    // This uses zero Netlify bandwidth and bypasses CORS for the <audio> element
    return {
      statusCode: 302,
      headers: {
        'Location': format.url,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      }
    };
  } catch (error) {
    console.error('Stream error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: "Failed to fetch audio stream" })
    };
  }
};
