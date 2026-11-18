import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En local: `npm run dev:api` (puerto 3001) + `npm run dev` (Vite proxy /api).
// En Vercel, /api/* son funciones serverless; no hace falta nada más.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
});
