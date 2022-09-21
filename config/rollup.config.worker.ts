// inspired by https://justinribeiro.com/chronicle/2020/07/17/building-module-web-workers-for-cross-browser-compatibility-with-rollup/

import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';
import { terser } from 'rollup-plugin-terser';

const config = defineConfig({
  input: ['./worker/src/worker.ts'],
  output: {
    dir: './src/worker/',
    format: 'esm',
  },
  plugins: [
    nodeResolve(),
    typescript({ tsconfig: './config/tsconfig.worker.json' }),
    terser({
      mangle: {
        module: true,
      },
    }),
    {
      name: 'worker-to-string',
      renderChunk(code) {
        return `export default \`${code}\`;`;
      },
    },
  ],
});

export default config;
