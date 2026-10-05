import path from 'node:path';
import { defineConfig, type UserConfigExport } from '@tarojs/cli';
import devConfig from './dev';
import prodConfig from './prod';

const baseConfig: UserConfigExport<'webpack5'> = {
  projectName: 'BellFive',
  date: '2026-10-06',
  designWidth: 750,
  deviceRatio: {
    640: 2.34,
    750: 1,
    828: 1.81,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: ['@tarojs/plugin-framework-react'],
  framework: 'react',
  compiler: 'webpack5',
  cache: { enable: false },
  defineConstants: {
    BELLFIVE_MINI_AUTH_URL: JSON.stringify(process.env.BELLFIVE_MINI_AUTH_URL ?? ''),
    BELLFIVE_MINI_WS_URL: JSON.stringify(process.env.BELLFIVE_MINI_WS_URL ?? ''),
  },
  mini: {
    compile: {
      include: [path.resolve(__dirname, '../../src')],
    },
    webpackChain(chain) {
      chain.resolve.alias
        .set('react', path.resolve(__dirname, '../node_modules/react'))
        .set('react-dom', path.resolve(__dirname, '../node_modules/react-dom'))
        .set('zustand', path.resolve(__dirname, '../node_modules/zustand'));
    },
    postcss: {
      pxtransform: { enable: true },
      url: { enable: true, config: { limit: 1024 } },
      cssModules: { enable: false },
    },
  },
};

export default defineConfig<'webpack5'>(async (merge, { mode }) =>
  merge({}, baseConfig, mode === 'development' ? devConfig : prodConfig),
);
