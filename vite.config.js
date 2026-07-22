import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import https from 'https'
import { audioProxyPlugin } from './vite-plugin-audio-proxy.js'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    audioProxyPlugin(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    {
      name: 'tidal-proxy',
      configureServer(server) {
        server.middlewares.use('/tidal-media', (req, res) => {
          const parts = req.url.split('/');
          if (parts.length > 1) {
            const host = parts[1];
            const path = '/' + parts.slice(2).join('/');
            const targetUrl = `https://${host}${path}`;

            // Forward headers, but override Host to match the target
            const headers = { ...req.headers, host: host };
            
            // Remove headers that cause Tidal to return 403 Forbidden
            delete headers['origin'];
            delete headers['referer'];
            delete headers['accept-encoding']; // Let Node.js handle encoding
            delete headers['connection'];
            
            // Remove browser security/fetch headers
            Object.keys(headers).forEach(key => {
              if (key.startsWith('sec-')) delete headers[key];
            });

            // Handle preflight OPTIONS requests for CORS
            if (req.method === 'OPTIONS') {
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Range, Accept, Origin, Content-Type');
              res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
              res.statusCode = 204;
              res.end();
              return;
            }

            https.get(targetUrl, { headers }, (proxyRes) => {
              if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
                try {
                  const redirectUrl = new URL(proxyRes.headers.location);
                  res.setHeader('Location', `/tidal-media/${redirectUrl.host}${redirectUrl.pathname}${redirectUrl.search}`);
                } catch (e) {
                  // Fallback if location is relative
                  res.setHeader('Location', proxyRes.headers.location);
                }
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.statusCode = proxyRes.statusCode;
                res.end();
                return;
              }

              Object.keys(proxyRes.headers).forEach((key) => {
                res.setHeader(key, proxyRes.headers[key]);
              });
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
              res.statusCode = proxyRes.statusCode;
              proxyRes.pipe(res);
            }).on('error', (err) => {
              res.statusCode = 500;
              res.end(err.message);
            });
          } else {
            res.statusCode = 404;
            res.end();
          }
        });
      }
    }
  ],
  resolve: {
    alias: {
      // Some P2P libs might need specific aliases
    },
  }
})
