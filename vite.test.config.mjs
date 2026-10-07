import { ember, extensions } from '@embroider/vite';
import { babel } from '@rollup/plugin-babel';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    minify: false,
    rollupOptions: {
      input: {
        tests: 'tests/index.html',
      },
    },
    sourcemap: true,
  },
  plugins: [
    ember(),
    babel({
      babelHelpers: 'inline',
      extensions,
    }),
  ],
});
