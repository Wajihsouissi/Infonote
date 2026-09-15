// Deliberately discard inherited application credentials before loading Vite.
for (const name of Object.keys(process.env)) {
  if (/^(VITE_|SUPABASE_|RESEND_|INVITE_|GEMINI_|GOOGLE_|AI_|SUPADATA_|NOTION_)/.test(name)) delete process.env[name];
}
process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'qa-only-publishable-key';
const { createServer } = await import('vite');
const server = await createServer({ mode: 'qa', server: { host: '127.0.0.1', port: 5187, strictPort: true } });
await server.listen();
server.printUrls();
