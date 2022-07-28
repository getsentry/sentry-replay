import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';

import pkg from '../package.json';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const config = defineConfig({
  input: './src/index.ts',
  output: [
    {
      dir: '../dist',
      format: 'cjs',
      sourcemap: true,
    },
    {
      dir: '../dist',
      format: 'esm',
    },
  ],
  external: [...Object.keys(pkg.dependencies || {})],
  plugins: [
    typescript({
      tsconfig: IS_PRODUCTION
        ? './config/tsconfig.core.json'
        : './tsconfig.json',
    }),
    replace({
      // __SENTRY_DEBUG__ should be save to replace in any case, so no checks for assignments necessary
      preventAssignment: false,
      values: {
        // @ts-expect-error not gonna deal with types here
        __SENTRY_DEBUG__: !IS_PRODUCTION,
      },
    }),
  ],
});

export default config;
