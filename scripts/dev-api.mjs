// Servidor local mínimo para /api/country (alternativa a `vercel dev`).
// Uso: node --env-file=.env scripts/dev-api.mjs   (Node 20+)  ó  npm run dev:api
import http from 'node:http';
import handler from '../api/country.js';

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/api/country') {
      res.writeHead(404).end();
      return;
    }
    const shim = {
      status(code) { res.statusCode = code; return shim; },
      setHeader: (k, v) => res.setHeader(k, v),
      json(obj) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); },
    };
    await handler({ url: req.url, query: Object.fromEntries(url.searchParams) }, shim);
  })
  .listen(3001, () => console.log('API local en http://localhost:3001/api/country?c=br'));
