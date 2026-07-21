import ytdl from '@distube/ytdl-core';

export const handler = async (event) => {
  const videoId = event.queryStringParameters?.id || event.path?.split('/').pop();

  if (!videoId) {
    return { statusCode: 400, body: 'Missing videoId' };
  }

  try {
    const info = await ytdl.getInfo(videoId);
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    
    // Sort by highest bitrate to ensure HD audio
    audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
    
    // Prefer audio/mp4 for better browser compatibility in <audio> tag, 
    // it will now naturally pick the highest bitrate MP4 available.
    const format = audioFormats.find(f => f.container === 'mp4') || audioFormats[0];

    if (!format || !format.url) {
      return { statusCode: 404, body: 'Audio stream not found for this video' };
    }

    // Redirect the browser directly to the Google Video URL
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
