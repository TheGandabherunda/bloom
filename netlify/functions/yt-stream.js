import CryptoJS from 'crypto-js';

function decryptUrl(encryptedUrl, forceHQ = false) {
  try {
    const key = CryptoJS.enc.Utf8.parse('38346591');
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encryptedUrl) },
      key,
      { mode: CryptoJS.mode.ECB }
    ).toString(CryptoJS.enc.Utf8);

    if (forceHQ) {
      return decrypted.replace(/_\d+\.mp4$/, '_320.mp4');
    } else {
      return decrypted.replace(/_\d+\.mp4$/, '_160.mp4');
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

export const handler = async (event) => {
  // videoId comes via path: /api/yt/stream/:id → rewired to ?id= in netlify.toml
  const videoId = event.queryStringParameters?.id || event.path?.split('/').pop();

  if (!videoId) {
    return { statusCode: 400, body: 'Missing videoId' };
  }

  try {
    const response = await fetch(
      `https://www.jiosaavn.com/api.php?_format=json&_marker=0&api_version=4&ctx=web6dot0&__call=song.getDetails&pids=${videoId}`,
      { headers: jioSaavnHeaders }
    );
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { statusCode: 500, body: 'Invalid JSON from JioSaavn' };
    }

    let song = null;
    if (data.songs && data.songs.length > 0) {
      song = data.songs[0];
    } else if (data[videoId]) {
      song = data[videoId];
    }

    if (!song || !song.more_info || !song.more_info.encrypted_media_url) {
      return { statusCode: 404, body: 'Audio format not found' };
    }

    // Always force 320kbps HD audio regardless of API metadata flags
    const mediaUrl = decryptUrl(song.more_info.encrypted_media_url, true);

    if (!mediaUrl) {
      return { statusCode: 500, body: 'Decryption failed' };
    }

    // Redirect client to the CDN audio URL
    return {
      statusCode: 302,
      headers: { Location: mediaUrl },
      body: '',
    };
  } catch (error) {
    console.error('[yt-stream] Error:', error);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
};
