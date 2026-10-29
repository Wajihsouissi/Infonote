import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);
const licenseTexts = new Map<string, Promise<string>>();
function bundledNotices(inputs: string[]): Promise<string> {
    const packages = new Set(inputs.map(file => /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(file.replace(/\\/g, '/'))?.[1]).filter((name): name is string => Boolean(name)));
    return Promise.all([...packages].map(name => {
        let text = licenseTexts.get(name);
        if (!text) {
            text = (async () => {
                for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', ...(name === 'gsap' ? ['README.md'] : [])]) {
                    try { return `/* ${name}\n${(await readFile(resolve('node_modules', name, file), 'utf8')).replace(/\*\//g, '* /')}\n*/`; } catch { /* try this package's next license filename */ }
                }
                throw new Error(`Missing redistribution notice for ${name}`);
            })();
            licenseTexts.set(name, text);
        }
        return text;
    })).then(texts => texts.join('\n'));
}
const entries = {
    three: { entry: resolve(dirname(require.resolve('three')), 'three.module.js'), global: 'THREE', alias: '' },
    d3: { entry: require.resolve('d3'), global: 'd3', alias: '' },
    'chart.js': { entry: require.resolve('chart.js/auto'), global: 'ChartJS', alias: 'window.Chart=ChartJS.default??ChartJS;' },
    gsap: { entry: require.resolve('gsap'), global: 'GSAP', alias: 'window.gsap=GSAP.gsap;' },
    leaflet: { entry: require.resolve('leaflet'), global: 'Leaflet', alias: 'window.L=Leaflet.default??Leaflet;' },
} as const;

/** Separate public assets: no visualization engine rides in the canvas bundle. */
export function intelligentUILibraries(): Plugin {
    const cache = new Map<string, Promise<string>>();
    const asset = (name: string): Promise<string> => {
        if (cache.has(name)) return cache.get(name)!;
        const pending = (async () => {
            if (name === 'leaflet.css') return readFile(require.resolve('leaflet/dist/leaflet.css'), 'utf8');
            const entry = entries[name.replace(/\.js$/, '') as keyof typeof entries];
            if (!entry) throw new Error('Unknown visualization library');
            const result = await build({ entryPoints: [entry.entry], bundle: true,
                format: 'iife', globalName: entry.global, minify: true, write: false,
                platform: 'browser', target: 'es2022', legalComments: 'inline', metafile: true, define: { 'process.env.NODE_ENV': '"production"' } });
            return await bundledNotices(Object.keys(result.metafile.inputs)) + '\n' + result.outputFiles[0].text + '\n' + entry.alias;
        })();
        cache.set(name, pending);
        return pending;
    };
    const names = [...Object.keys(entries).map(name => `${name}.js`), 'leaflet.css'];
    return {
        name: 'chnk-intelligent-ui-libraries',
        configureServer(server) {
            server.middlewares.use('/intelligent-ui-libs/', (req, res, next) => {
                const name = req.url?.split('?')[0].slice(1) ?? '';
                if (!names.includes(name)) return next();
                void asset(name).then(source => {
                    res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : 'text/javascript');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.end(source);
                }).catch(error => { res.statusCode = 500; res.end(String(error)); });
            });
        },
        async generateBundle() {
            for (const name of names) this.emitFile({ type: 'asset', fileName: `intelligent-ui-libs/${name}`, source: await asset(name) });
        },
    };
}
