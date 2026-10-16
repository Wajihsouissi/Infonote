import { readFile, writeFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

// The public research story ships complete HTML, independent of app auth/storage.
// QA mode prevents the rendering process from loading local account credentials.
const server = await createServer({ mode: 'qa', cacheDir: 'node_modules/.vite-research-prerender', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { Website3TestPage } = await server.ssrLoadModule('/src/The-website/website3test/Website3TestPage.tsx');
  const htmlPath = new URL('../dist/website3test/index.html', import.meta.url);
  const template = await readFile(htmlPath, 'utf8');
  if (!template.includes('<!--research-root-->')) throw new Error('Research page prerender marker is missing.');
  const markup = renderToString(createElement(Website3TestPage));
  await writeFile(htmlPath, template.replace('<!--research-root-->', markup));
  console.log(`Research Cut: prerendered ${markup.length.toLocaleString()} characters of readable HTML.`);
} finally {
  await server.close();
}
