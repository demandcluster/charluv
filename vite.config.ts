import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tsconfigPaths from 'vite-tsconfig-paths'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
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
