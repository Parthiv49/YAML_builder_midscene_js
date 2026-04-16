import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'xpath-receiver',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/xpath' && req.method === 'POST') {
            // Set CORS headers for the bookmarklet to work on any site
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                // Send event to connected clients via Vite's WebSocket
                server.ws.send({
                  type: 'custom',
                  event: 'xpath:received',
                  data: data
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok' }));
              } catch(e) {
                res.writeHead(400);
                res.end('Bad Request');
              }
            });
          } else if (req.url === '/api/xpath' && req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.writeHead(200);
            res.end();
          } else {
            next();
          }
        });
      }
    }
  ]
})
