import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const entry = resolve(__dirname, 'node_modules/@mlightcad/libredwg-converter/lib/AcDbLibreDwgParserWorker.js')
const outDir = resolve(__dirname, 'dist/cad/assets')

export default defineConfig({
  base: './',
  build: {
    emptyOutDir: false,
    outDir,
    target: 'es2020',
    sourcemap: false,
    minify: 'esbuild',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: entry,
      external: [],
      output: {
        format: 'es',
        entryFileNames: 'libredwg-parser-worker.js',
        assetFileNames: '[name][extname]',
        inlineDynamicImports: true,
        compact: true
      }
    }
  }
})
