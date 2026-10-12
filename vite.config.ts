import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // The repo is served from https://sylwia-lask.github.io/practical-browser-ai/
  // so every asset URL must be prefixed with the repo name on GitHub Pages.
  // Locally (dev / preview) we keep "/" so nothing changes during development.
  base: process.env.GITHUB_PAGES ? '/practical-browser-ai/' : '/',
  plugins: [react(), tailwindcss()],
})
