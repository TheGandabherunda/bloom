import ytsr from 'youtube-sr';

export const handler = async function (event, context) {
  const query = event.queryStringParameters.q;
  
  if (!query) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing query parameter 'q'" }) };
  }

  try {
    const results = await ytsr.default.search(query, { limit: 1, type: 'video' });
    if (results && results.length > 0) {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ videoId: results[0].id })
      };
    }
    
    return {
      statusCode: 404,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: "No video found for query" })
    };
  } catch (error) {
    console.error("Resolve error:", error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: "Resolution failed" })
    };
  }
};
