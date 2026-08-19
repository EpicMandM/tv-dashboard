// TV artifact: IIFE app.js, classic <script>, base: './', target chrome69.
// Never type=module in dist, never rollupOptions, :where() stripped.
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDashboard, SEED, type Dashboard, type DigestColumn } from './src/lib/tv.ts';

const SNAPSHOT_FILE = resolve(fileURLToPath(new URL('./data/tv.json', import.meta.url)));
const PROGRESS: Record<string, string> = {
  'plan-tomorrow': "Preparing tomorrow's plan. Usually about a minute.",
  'what-missed': 'Checking what might have slipped through. Usually about a minute.'
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
  for (let i = 0; i < data.actions.length; i += 1) {
    const action = data.actions[i];
    if (action && action.id === id) return true;
  }
  return false;
}

function fromView(id: string, view: unknown): Dashboard | null {
  if (!view || typeof view !== 'object') return null;
  const raw = view as { summary?: unknown; columns?: unknown };
  const summary = typeof raw.summary === 'string' && raw.summary ? raw.summary : '';
  const candidate: Dashboard = {
    summary: summary || (id === 'home' ? readSnapshot().dashboard.summary : 'Done.'),
    actions:
      id === 'home'
        ? readSnapshot().dashboard.actions
        : [
            { id: 'home', title: 'Back' },
            { id, title: 'Refresh' }
          ],
    status: 'ready',
    columns: Array.isArray(raw.columns) ? (raw.columns as DigestColumn[]) : undefined
  };
  return isDashboard(candidate) ? candidate : null;
}

function startJob(id: string) {
  live = {
    summary: PROGRESS[id] || 'Preparing.',
    actions: [{ id: 'home', title: 'Back' }],
    status: 'running',
    action: id
  };
  if (jobTimer) clearTimeout(jobTimer);
  jobTimer = setTimeout(() => {
    live = fromView(id, readSnapshot().views[id]) || {
      summary:
        id === 'what-missed'
          ? 'Caught up on what passed. Nothing left open.'
          : 'Tomorrow has no urgent slots. Morning can be planned at ease.',
      actions: [
        { id: 'home', title: 'Back' },
        { id, title: 'Refresh' }
      ],
      status: 'ready'
    };
  }, 1600);
}

function mockTvApi(): Plugin {
  const handle = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, res, next) => {
      const path = (req.url || '').split('?')[0] || '';
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

function quotedAttr(tag: string, name: string): string | null {
  const key = name + '="';
  const at = tag.toLowerCase().indexOf(key);
  if (at === -1) return null;
  const start = at + key.length;
  const end = tag.indexOf('"', start);
  return end === -1 ? null : tag.slice(start, end);
}

function toClassicScripts(html: string): string {
  const lower = html.toLowerCase();
  let src = '';
  let out = '';
  let i = 0;
  while (i < html.length) {
    const start = lower.indexOf('<script', i);
    if (start === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, start);
    const openEnd = html.indexOf('>', start);
    const closeStart = openEnd === -1 ? -1 : lower.indexOf('</script', openEnd + 1);
    const closeEnd = closeStart === -1 ? -1 : html.indexOf('>', closeStart);
    if (openEnd === -1 || closeEnd === -1) {
      out += html.slice(start);
      break;
    }
    const value = quotedAttr(html.slice(start, openEnd + 1), 'src');
    const empty = html.slice(openEnd + 1, closeStart).trim() === '';
    if (value && empty) {
      if (!src) src = value;
      i = closeEnd + 1;
      while (i < html.length && (html[i] === ' ' || html[i] === '\t' || html[i] === '\n' || html[i] === '\r')) i += 1;
      continue;
    }
    out += html.slice(start, closeEnd + 1);
    i = closeEnd + 1;
  }
  const classic = '    <script src="' + (src || './app.js') + '"></script>\n';
  const body = out.indexOf('</body>');
  return body === -1
    ? out + classic
    : out.slice(0, body) + classic + '  </body>' + out.slice(body + '</body>'.length);
}

function tizenHtml(): Plugin {
  return {
    name: 'tizen-html',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return toClassicScripts(html.replace(/\s+crossorigin(?:="[^"]*")?/g, ''));
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
    minify: 'oxc',
    assetsInlineLimit: 4096,
    rolldownOptions: {
      output: {
        format: 'iife',
        name: 'TvDashboard',
        entryFileNames: 'app.js',
        assetFileNames: 'app[extname]',
        banner: 'if(typeof globalThis==="undefined"){window.globalThis=window;}'
      }
    }
  },
  oxc: { target: 'chrome69' },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 }
});
