import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// The demo imports the package straight from ../src, so it always shows the
// current code. `base: './'` keeps the build working under any path
// (GitHub Pages serves it from /<repo>/).
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: [vue()],
  server: {
    // ../src lives outside the demo folder
    fs: { allow: ['..'] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
