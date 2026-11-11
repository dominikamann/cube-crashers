import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { lanRelayPlugin } from './dev/lan-relay';

/** Dev only: the game posts a run log after each run; it is written to logs/ (git-ignored). */
function runLogPlugin(): Plugin {
  return {
    name: 'cube-crashers-run-log',
    configureServer(server) {
      server.middlewares.use('/__runlog', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        const origin = req.headers.origin;
        if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          res.statusCode = 403;
          res.end();
          return;
        }
        let body = '';
        req.on('data', chunk => {
          body += chunk;
          if (body.length > 1_000_000) req.destroy();
        });
        req.on('end', () => {
          try {
            JSON.parse(body);
            const dir = join(server.config.root, 'logs');
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, `run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), body);
            res.statusCode = 204;
          } catch {
            res.statusCode = 400;
          }
          res.end();
        });
      });
    },
  };
}

// base './' so the built index.html loads from file:// inside Electron
export default defineConfig({
  base: './',
  plugins: [runLogPlugin(), lanRelayPlugin()],
});
