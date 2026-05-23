import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Pin the dev server to port 5173 so the URL matches what we registered in
// Supabase Dashboard → Authentication → URL Configuration. strictPort makes
// Vite fail loudly if 5173 is already taken instead of silently moving to
// 5174/5175 — that drift is what causes "chrome-error://chromewebdata/" after
// an OAuth redirect (Supabase sends the browser to :5173 but nothing answers
// there because Vite jumped to a different port).
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
})
