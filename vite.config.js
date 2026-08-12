import { defineConfig } from 'vite';

export default defineConfig({
  base: '/virtual-grand-piano/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
