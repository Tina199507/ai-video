import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { existsSync } from 'fs'

/**
 * Resolve a hoisted dependency to the same physical path that `import`
 * would pick.  After the direction A-2 monorepo move, `react` and
 * `react-dom` are hoisted into the repo root `node_modules/` instead
 * of `apps/ui-shell/node_modules/`, so the previous hard-coded
 * `apps/ui-shell/node_modules/react` alias breaks both the dev server
 * and the vitest jsdom project.  Try the local copy first so a
 * standalone `npm install` inside `apps/ui-shell/` still works for
 * vendored dev workflows.
 */
function resolveHoisted(pkg: string): string {
  const local = resolve(__dirname, 'node_modules', pkg)
  if (existsSync(local)) return local
  return resolve(__dirname, '../../node_modules', pkg)
}

/** Some clients still request `/favicon.ico`; serve the SVG so the console stays clean. */
function faviconIcoFallback(): Plugin {
  return {
    name: 'favicon-ico-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/favicon.ico' || req.url?.startsWith('/favicon.ico?')) {
          res.statusCode = 302
          res.setHeader('Location', '/favicon.svg')
          res.end()
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), faviconIcoFallback()],
  resolve: {
    alias: [
      {
        find: /^@ai-video\/shared\/(.*)$/,
        replacement: resolve(__dirname, '../../packages/shared/src/$1'),
      },
      {
        find: '@ai-video/shared',
        replacement: resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    ],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3220',
        changeOrigin: true,
      },
    },
  },
  test: {
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    css: false,
    alias: {
      // Pin a single React instance (hoisted at repo root after the
      // A-2 monorepo move) to avoid "Invalid hook call" errors.
      'react': resolveHoisted('react'),
      'react-dom': resolveHoisted('react-dom'),
    },
  },
})
