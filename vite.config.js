import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base => built asset URLs are relative to index.html.
  // Works both at a GitHub Pages project subpath (/fifa2026/) and at a
  // root custom domain (fifa.shammas.in). Safe here because the app has
  // no client-side routing.
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Use Vite's bundled default minifier (oxc in this rolldown-vite build).
    // Avoids requiring a separate terser/esbuild dependency.
    minify: true,
  },
})
