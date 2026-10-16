import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const root = resolve(__dirname, 'cad-app')
const dist = resolve(__dirname, 'dist/cad')

export default defineConfig({
  root,
  base: './',
  build: {
    outDir: dist,
    emptyOutDir: true,
    modulePreload: false,
    target: 'es2020',
    sourcemap: false,
    minify: 'esbuild',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
})
