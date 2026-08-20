// TV artifact: IIFE app.js, classic <script>, base: './', target chrome69.
// Never type=module in dist, never rollupOptions, :where() stripped.
import { defineConfig } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDashboard, SEED } from './src/lib/tv.js';

const SNAPSHOT_FILE = resolve(fileURLToPath(new URL('./data/tv.json', import.meta.url)));
const PROGRESS = {
  'plan-tomorrow': 'Готовлю план на завтра. Обычно около минуты.',
  'what-missed': 'Смотрю, что могло ускользнуть. Обычно около минуты.'
};

let live = null;
let jobTimer;

function readSnapshot() {
  if (!existsSync(SNAPSHOT_FILE)) return { dashboard: SEED, views: {} };
  try {
    const data = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8'));
    const views =
      data && typeof data === 'object' && data.views && typeof data.views === 'object' ? data.views : {};
    if (isDashboard(data)) return { dashboard: data, views };
  } catch {}
  return { dashboard: SEED, views: {} };
}

function current() {
  return live || readSnapshot().dashboard;
}

function hasAction(data, id) {
  for (let i = 0; i < data.actions.length; i += 1) {
    const action = data.actions[i];
    if (action && action.id === id) return true;
  }
  return false;
}

function fromView(id, view) {
  if (!view || typeof view !== 'object') return null;
  const summary = typeof view.summary === 'string' && view.summary ? view.summary : '';
  const candidate = {
    summary: summary || (id === 'home' ? readSnapshot().dashboard.summary : 'Готово.'),
    actions:
      id === 'home'
        ? readSnapshot().dashboard.actions
        : [
            { id: 'home', title: 'Назад' },
            { id, title: 'Обновить' }
          ],
    status: 'ready',
    columns: Array.isArray(view.columns) ? view.columns : undefined
  };
  return isDashboard(candidate) ? candidate : null;
}

function startJob(id) {
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

function mockTvApi() {
  const handle = (server) => {
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

function stripWhereSelectors() {
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

function quotedAttr(tag, name) {
  const key = name + '="';
  const at = tag.toLowerCase().indexOf(key);
  if (at === -1) return null;
  const start = at + key.length;
  const end = tag.indexOf('"', start);
  return end === -1 ? null : tag.slice(start, end);
}

function toClassicScripts(html) {
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
  const classic = '<script src="' + (src || './app.js') + '"></script>';
  const body = out.indexOf('</body>');
  const assembled =
    body === -1
      ? out + classic
      : out.slice(0, body) + classic + '</body>' + out.slice(body + '</body>'.length);
  return assembled.replace(/>\s+</g, '><').trim();
}

function tizenHtml() {
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
  plugins: [mockTvApi(), stripWhereSelectors(), tizenHtml()],
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
        entryFileNames: 'app.js',
        assetFileNames: 'app[extname]',
        minify: {
          compress: { target: 'chrome69', dropConsole: true },
          mangle: { toplevel: true },
          codegen: { legalComments: 'none', removeWhitespace: true }
        }
      }
    }
  },
  oxc: { target: 'chrome69' },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 }
});
