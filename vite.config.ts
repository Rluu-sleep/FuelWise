import { defineConfig, loadEnv, type Plugin, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Dev-only plugin that serves the Vercel serverless function at /api/find-fuel
 * during `vite dev`, so the app is fully runnable locally without the Vercel CLI
 * or a Vercel login. The same api/find-fuel.ts deploys unchanged to Vercel in prod.
 *
 * Server-side secrets (FUELCHECK_*, ORS_API_KEY) are loaded from .env.local via
 * Vite's loadEnv and injected into process.env so the handler can read them.
 * They are NEVER exposed to the client bundle — only VITE_-prefixed vars are.
 */
function devApiPlugin(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['FUELCHECK_API_KEY', 'FUELCHECK_API_SECRET', 'ORS_API_KEY']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }
  return {
    name: 'dev-api',
    configureServer(server) {
      const mount = (route: string, modulePath: string) => {
        server.middlewares.use(
          route,
          async (req: Connect.IncomingMessage, res: ServerResponse) => {
            try {
              const { default: handler } = await server.ssrLoadModule(modulePath);
              await handler(req as IncomingMessage, res);
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  ok: false,
                  error: 'Dev server error: ' + (err instanceof Error ? err.message : String(err)),
                }),
              );
            }
          },
        );
      };
      mount('/api/find-fuel', '/api/find-fuel.ts');
      mount('/api/geocode-suggest', '/api/geocode-suggest.ts');
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), devApiPlugin(mode)],
  server: { port: 5173 },
}));
