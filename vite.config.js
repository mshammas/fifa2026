import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Use Vite's bundled default minifier (oxc in this rolldown-vite build).
    // Avoids requiring a separate terser/esbuild dependency.
    minify: true,
  },
})
