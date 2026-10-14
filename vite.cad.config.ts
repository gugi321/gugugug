import { resolve } from 'node:path'
import { defineConfig, normalizePath } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const root = resolve(__dirname, 'cad-app')
const dist = resolve(__dirname, 'dist/cad')
const pkg = (...parts: string[]) => normalizePath(resolve(__dirname, 'node_modules', ...parts))

export default defineConfig({
  root,
  base: './',
  build: {
    outDir: dist,
    emptyOutDir: true,
    modulePreload: false,
    target: 'es2020'
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: pkg('@mlightcad/cad-simple-viewer/dist/mtext-renderer-worker.js'),
          dest: 'assets'
        },
        {
          src: pkg('@mlightcad/libredwg-converter/dist/libredwg-parser-worker.js'),
          dest: 'assets'
        },
        {
          src: pkg('@mlightcad/libredwg-converter/dist/libredwg-web.wasm'),
          dest: 'assets'
        }
      ]
    })
  ]
})
