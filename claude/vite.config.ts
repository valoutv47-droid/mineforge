import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves from /mineforge/; Vercel serves from the domain root.
  base: process.env.GITHUB_ACTIONS === 'true' ? '/mineforge/' : '/',
});
