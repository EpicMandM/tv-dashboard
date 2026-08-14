import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDashboard, SEED, type Dashboard, type DigestColumn } from './src/lib/tv';

const SNAPSHOT_FILE = resolve(fileURLToPath(new URL('./data/tv.json', import.meta.url)));
const PROGRESS: Record<string, string> = {
  'plan-tomorrow': 'Готовлю план на завтра. Обычно около минуты.',
  'what-missed': 'Смотрю, что могло ускользнуть. Обычно около минуты.'
};

let live: Dashboard | null = null;
let jobTimer: ReturnType<typeof setTimeout> | undefined;

function readSnapshot(): { dashboard: Dashboard; views: Record<string, unknown> } {
  if (!existsSync(SNAPSHOT_FILE)) return { dashboard: SEED, views: {} };
  try {
    const data: unknown = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8'));
    const views =
      data && typeof data === 'object' && (data as { views?: unknown }).views &&
      typeof (data as { views: unknown }).views === 'object'
        ? (data as { views: Record<string, unknown> }).views
        : {};
    if (isDashboard(data)) return { dashboard: data, views };
  } catch {}
  return { dashboard: SEED, views: {} };
}

function current(): Dashboard {
  return live || readSnapshot().dashboard;
}

function hasAction(data: Dashboard, id: string) {
  for (let i = 0; i < data.actions.length; i += 1) if (data.actions[i].id === id) return true;
  return false;
}

function fromView(id: string, view: unknown): Dashboard | null {
  if (!view || typeof view !== 'object') return null;
  const raw = view as { summary?: unknown; columns?: unknown };
  const summary = typeof raw.summary === 'string' && raw.summary ? raw.summary : '';
  const candidate: Dashboard = {
    summary: summary || (id === 'home' ? readSnapshot().dashboard.summary : 'Готово.'),
    actions:
      id === 'home'
        ? readSnapshot().dashboard.actions
        : [
            { id: 'home', title: 'Назад' },
            { id, title: 'Обновить' }
          ],
    status: 'ready',
    columns: Array.isArray(raw.columns) ? (raw.columns as DigestColumn[]) : undefined
  };
  return isDashboard(candidate) ? candidate : null;
}

function startJob(id: string) {
  live = {
    summary: PROGRESS[id] || 'Готовлю.',
    actions: [{ id: 'home', title: 'Назад' }],
    status: 'running',
    action: id
  };
  if (jobTimer) clearTimeout(jobTimer);
  jobTimer = setTimeout(() => {
    live = fromView(id, readSnapshot().views[id]) || {
      summary:
        id === 'what-missed'
          ? 'Проверил прошедшее. Открытых хвостов нет.'
          : 'Завтра без срочных слотов. Можно спокойно спланировать утро.',
      actions: [
        { id: 'home', title: 'Назад' },
        { id, title: 'Обновить' }
      ],
      status: 'ready'
    };
  }, 1600);
}

function mockTvApi(): Plugin {
  const handle = (server: ViteDevServer) => {
    server.middlewares.use((req, res, next) => {
      const path = (req.url || '').split('?')[0];
      const isTv = path === '/tv';
      const isAction = path.indexOf('/actions/') === 0 && path.length > 9;
      if (!isTv && !isAction) {
        next();
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }
      if (req.method === 'GET' && isTv) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(current()));
        return;
      }
      if (req.method === 'POST' && isAction) {
        let id = '';
        try {
          id = decodeURIComponent(path.slice('/actions/'.length));
        } catch {
          res.statusCode = 400;
          res.end();
          return;
        }
        if (id === 'home') {
          if (jobTimer) clearTimeout(jobTimer);
          live = null;
          res.statusCode = 204;
          res.end();
          return;
        }
        const now = current();
        const refreshing = hasAction(now, 'home') && hasAction(now, id);
        const cached = fromView(id, readSnapshot().views[id]);
        if (cached && !refreshing) {
          if (jobTimer) clearTimeout(jobTimer);
          live = cached;
        } else if (refreshing || PROGRESS[id] || cached) {
          startJob(id);
        } else {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.statusCode = 204;
        res.end();
        return;
      }
      next();
    });
  };
  return { name: 'mock-tv-api', configureServer: handle, configurePreviewServer: handle };
}

function stripWhereSelectors(): Plugin {
  return {
    name: 'strip-where-selectors',
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type === 'asset' && item.fileName.endsWith('.css')) {
          item.source = String(item.source).replace(/:where\(([^)]+)\)/g, '$1');
        }
      }
    }
  };
}

function tizenHtml(): Plugin {
  return {
    name: 'tizen-html',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        html = html.replace(/\s+crossorigin(?:="[^"]*")?/g, '');
        const match = html.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/);
        const src = match ? match[1] : './app.js';
        const withoutScript = html.replace(/<script[^>]*src="[^"]+"[^>]*><\/script>\s*/g, '');
        const classic = '    <script src="' + src + '"></script>\n';
        return withoutScript.indexOf('</body>') === -1
          ? withoutScript + classic
          : withoutScript.replace('</body>', classic + '  </body>');
      }
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [svelte(), mockTvApi(), stripWhereSelectors(), tizenHtml()],
  build: {
    target: 'chrome69',
    cssTarget: 'chrome69',
    cssCodeSplit: false,
    modulePreload: false,
    sourcemap: false,
    minify: 'esbuild',
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'TvDashboard',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app[extname]',
        banner: 'if(typeof globalThis==="undefined"){window.globalThis=window;}'
      }
    }
  },
  esbuild: { target: 'chrome69' },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 }
});
