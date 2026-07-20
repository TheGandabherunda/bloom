import spotifyUrlInfo from 'spotify-url-info';

const spotify = spotifyUrlInfo(fetch);
const testUrl = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';

const tracks = await spotify.getTracks(testUrl);
console.log('Track keys:', Object.keys(tracks[0]));
console.log('First track raw:', JSON.stringify(tracks[0], null, 2).slice(0, 600));
