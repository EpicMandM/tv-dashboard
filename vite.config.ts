import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { SEED_DASHBOARD } from './src/lib/cache';

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

      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      if (req.method === 'GET' && isTv) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(SEED_DASHBOARD));
        return;
      }

      if (req.method === 'POST' && isAction) {
        res.statusCode = 204;
        res.end();
        return;
      }

      next();
    });
  };

  return {
    name: 'mock-tv-api',
    configureServer: handle,
    configurePreviewServer: handle
  };
}

function stripWhereSelectors(): Plugin {
  const rewrite = (css: string) => css.replace(/:where\(([^)]+)\)/g, '$1');

  return {
    name: 'strip-where-selectors',
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type === 'asset' && item.fileName.endsWith('.css')) {
          item.source = rewrite(String(item.source));
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
        if (withoutScript.indexOf('</body>') === -1) {
          return withoutScript + classic;
        }
        return withoutScript.replace('</body>', classic + '  </body>');
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
  esbuild: {
    target: 'chrome69'
  },
  server: {
    host: true,
    port: 5173
  },
  preview: {
    host: true,
    port: 4173
  }
});
