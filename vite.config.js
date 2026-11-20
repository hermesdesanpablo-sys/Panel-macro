import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En local: `npm run dev:api` (puerto 3001) + `npm run dev` (Vite proxy /api).
// En Vercel, /api/* son funciones serverless; no hace falta nada más.
export default defineConfig({
  plugins: [react()],
  // Solo el endpoint: la UI importa módulos de api/_lib (p.ej. calendar.js) que Vite tiene que servir, no el proxy.
  server: { proxy: { '/api/country': 'http://localhost:3001' } },
});
