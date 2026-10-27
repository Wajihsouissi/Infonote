import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { intelligentUILibraries } from './scripts/intelligent-ui-libraries'

// The beta runs beside the full app: the full app keeps 5173, the beta owns
// 5174. strictPort makes a clash an error instead of a silent port hop, so
// "localhost:5174" always means the beta.
const PORT = 5174

const SOLAR_BODIES = resolve(__dirname, 'src/features/card/solar/solarBodies.json')

/** A standalone SVG for one card icon; the client reads the body back out. */
const solarSvg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`

/**
 * One file per card icon at /icons/solar/<name>.svg.
 *
 * A card fetches only the icon it shows (see src/features/card/solar/index.ts),
 * so the ~1,250 icon drawings never ride in the app's scripts. The files are
 * derived from solarBodies.json rather than committed: one source, no second
 * copy to drift. The build writes them next to the bundle; the dev server
 * answers the same URLs from the same data.
 */
function solarIconFiles(): Plugin {
  let bodies: Record<string, string> | null = null
  const load = (): Record<string, string> => (bodies ??= JSON.parse(readFileSync(SOLAR_BODIES, 'utf8')))
  return {
    name: 'chnk-it-solar-icon-files',
    configureServer(server) {
      server.middlewares.use('/icons/solar/', (req, res, next) => {
        const name = /^\/([a-z0-9-]+)\.svg$/.exec(req.url ?? '')?.[1]
        const body = name ? load()[name] : undefined
        if (!body) return next()
        res.setHeader('Content-Type', 'image/svg+xml')
        res.end(solarSvg(body))
      })
    },
    generateBundle() {
      for (const [name, body] of Object.entries(load())) {
        this.emitFile({ type: 'asset', fileName: `icons/solar/${name}.svg`, source: solarSvg(body) })
      }
    },
  }
}

/** What `requireAiAccess` returns, without importing the JS module for a type. */
type AiAccess =
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string; retryAfter?: number }

/**
 * Serves /api/ai/* in development by running the deployed handlers themselves.
 *
 * There is deliberately no dev "twin" of the routes here. The full app keeps a
 * second implementation of the whole AI pipeline in its Vite config, every
 * piece of it carrying a comment asking the next person to keep the two in
 * step; they drifted anyway, and prompts that worked locally vanished in
 * production. Importing api/ai/*.js means localhost runs the same bytes Vercel
 * does, and this file stays a router.
 *
 * The only thing dev decides for itself is who may call: with
 * VITE_AI_ALLOW_ANONYMOUS the request is let through without a session for
 * local provider testing. That decision is made HERE and passed
 * to the handler — api/_lib/aiGuard.js never learns the flag exists, so the
 * rule protecting the deployed endpoint has exactly one form.
 */
function aiDevRoutes(env: Record<string, string>): Plugin {
  const allowAnonymous = /^(1|true|yes)$/i.test(env.VITE_AI_ALLOW_ANONYMOUS ?? '')

  return {
    name: 'beta-ai-dev-routes',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const path = (req.url ?? '').split('?')[0]
        if (path !== '/api/ai/text' && path !== '/api/ai/stream') {
          next()
          return
        }

        try {
          // Loaded per request so editing a route or the guard takes effect
          // without restarting the dev server.
          const guard = await server.ssrLoadModule('/api/_lib/aiGuard.js')
          const access: AiAccess = allowAnonymous
            ? guard.allowWithinLimits(req, 'dev-anonymous')
            : await guard.requireAiAccess(req)

          if (path === '/api/ai/text') {
            const route = await server.ssrLoadModule('/api/ai/text.js')
            await route.handleText(req, res, access)
          } else {
            const route = await server.ssrLoadModule('/api/ai/stream.js')
            await route.handleStream(req, res, access)
          }
        } catch (error) {
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
          } else {
            res.end()
          }
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  /* The provider key and the anonymous-dev flag come from .env files, the way
     Vercel supplies project settings. The repo root is read first so the key
     you already have for the full app works here too and is not copied into a
     second file; beta/.env.local wins where both define something. Nothing
     here reaches the browser: only this Node-side plugin reads it, and the
     client sees only what Vite exposes under VITE_. In production these come
     from the beta's own Vercel project — see beta/.env.example. */
  const env = {
    ...loadEnv(mode, resolve(process.cwd(), '..'), ''),
    ...loadEnv(mode, process.cwd(), ''),
  }
  Object.assign(process.env, env)

  return {
    // The beta inherits root .env files on the server. Expose ONLY this public
    // switch explicitly too, so client and API agree even when beta/.env has
    // no copy of the root development flag. Provider credentials stay server-side.
    define: {
      'import.meta.env.VITE_AI_ALLOW_ANONYMOUS': JSON.stringify(
        /^(1|true|yes)$/i.test(env.VITE_AI_ALLOW_ANONYMOUS ?? '') ? 'true' : 'false',
      ),
    },
    plugins: [react(), aiDevRoutes(env), solarIconFiles(), intelligentUILibraries()],
    // Beta uses plain CSS and must not inherit the full app's parent PostCSS config.
    css: { postcss: { plugins: [] } },
    esbuild: {
      // Debug logging never ships. console.error/warn stay: the error boundary
      // and storage failure paths use them deliberately.
      drop: mode === 'production' ? ['debugger'] : [],
      pure: mode === 'production' ? ['console.log', 'console.debug', 'console.trace'] : [],
    },
    build: {
      // The budget from plan-Beta.md §8: no chunk over 500 kB. The lazily
      // loaded icon catalogue is the one deliberate exception.
      chunkSizeWarningLimit: 500,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return
            if (id.includes('@xyflow')) return 'vendor-xyflow'
            if (id.includes('lucide-react')) return 'vendor-icons'
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('/scheduler/')) return 'vendor-react'
          },
        },
      },
    },
    server: {
      host: 'localhost', port: PORT, strictPort: true,
      // Compile the canvas entry before the browser discovers its deep import
      // chain. Cold Chromium was still waiting for modules after 30 seconds,
      // even though local workspace hydration had already completed.
      warmup: { clientFiles: ['./src/app/App.tsx', './src/features/canvas/board/CanvasBoard.tsx'] },
      // Test reports and audit output are not application modules. Their HTML
      // writes must not reload every open development canvas.
      watch: { ignored: ['**/output/**', '**/playwright-report/**', '**/test-results/**', '**/qa/**'] },
    },
    preview: { host: 'localhost', port: PORT, strictPort: true },
  }
})
