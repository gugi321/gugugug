import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const entry = resolve(__dirname, 'node_modules/@mlightcad/mtext-renderer/lib/worker/mtextWorker.js')
const outDir = resolve(__dirname, 'dist/cad/assets')

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir,
    target: 'es2020',
    sourcemap: false,
    minify: 'esbuild',
    lib: {
      entry,
      formats: ['es'],
      fileName: () => 'mtext-renderer-worker.js'
    },
    rollupOptions: {
      external: [],
      output: {
        inlineDynamicImports: true
      }
    }
  }
})
