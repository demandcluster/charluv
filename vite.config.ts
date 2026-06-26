import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tsconfigPaths from 'vite-tsconfig-paths'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

// Web bundler (replaces Parcel). The Node server still builds via tsc.
export default defineConfig(({ mode }) => ({
  root: resolve(__dirname, 'web'),
  publicDir: resolve(__dirname, 'web', 'asset'),
  plugins: [
    tsconfigPaths(),
    solid(),
    // Several browser deps (libsodium, png-chunks, tokenizers, pdf) expect Node
    // globals/builtins that Parcel polyfilled automatically.
    nodePolyfills({
      include: ['buffer', 'process', 'events', 'stream', 'util', 'crypto', 'path'],
      globals: { Buffer: true, process: true, global: true },
    }),
    // PWA: generate a real same-origin service worker (the old `new URL('*.ts')`
    // approach inlined a data: URL that browsers reject). Reuses the existing
    // hand-written web/asset/site.webmanifest (manifest: false → don't generate
    // or inject one). Registration is auto-injected into index.html.
    VitePWA({
      // 'prompt': the new SW waits instead of activating itself, so the in-app
      // "update available" banner (web/pwa.ts + UpdatePrompt.tsx) can let the user
      // reload on their terms. injectRegister: false — we register manually in
      // web/pwa.ts to hook onNeedRefresh.
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      // Don't run the SW in dev — avoids stale-cache confusion while developing.
      devOptions: { enabled: false },
      workbox: {
        // Precache the app shell + small static assets. The heavy ML/PDF chunks
        // (onnxruntime, transformers, pdfjs — many MB, minify is off) blow past
        // the size cap and are runtime-cached on first use instead of bloating
        // the install.
        globPatterns: ['**/*.{css,html,ico,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // SPA: serve the cached app shell for client-side routes when offline,
        // but never for the API, user-asset uploads, or well-known files.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/assets\//, /^\/\.well-known\//],
        runtimeCaching: [
          {
            // App JS/CSS chunks (incl. lazy ones too big to precache) — cache on
            // first fetch so subsequent loads work offline; revalidate in bg.
            urlPattern: ({ request, sameOrigin }) =>
              sameOrigin && (request.destination === 'script' || request.destination === 'style'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'charluv-app-assets',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    // The repo checks in compiled .js next to every .ts. Prefer the .ts source
    // so Rollup doesn't resolve to a stale CJS .js (which breaks named imports).
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
    // Leading-slash imports (/common, /srv, /web) collide with Vite's
    // root-relative resolution, so map them explicitly. Order matters: most
    // specific first.
    alias: [
      { find: /^\/common\//, replacement: resolve(__dirname, 'common') + '/' },
      { find: /^\/srv\//, replacement: resolve(__dirname, 'srv') + '/' },
      { find: /^\/web\//, replacement: resolve(__dirname, 'web') + '/' },
      { find: /^common\//, replacement: resolve(__dirname, 'common') + '/' },
      { find: /^srv\//, replacement: resolve(__dirname, 'srv') + '/' },
    ],
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
    // The process polyfill spoofs versions.node as a string, which makes
    // node-detecting deps (onnxruntime-web/transformers in the embeddings
    // worker) take the Node path and call require(). Force the browser path.
    'process.versions.node': 'undefined',
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'es2020',
    // This box is RAM-constrained; minify (terser) + sourcemaps blow the heap on
    // the heavy deps (onnxruntime-web, transformers, pdfjs). Parcel also built
    // with --no-optimize. Re-enable on a larger build host.
    minify: false,
    sourcemap: false,
    // web/pkg holds vendored CommonJS shims; Rollup's CJS transform only covers
    // node_modules by default, so include it for default-import interop.
    commonjsOptions: { include: [/node_modules/, /web\/pkg/] },
  },
  server: {
    port: 1234,
    // Proxy API + websocket to the Node server during dev.
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true, ws: true },
    },
  },
}))
