/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path')

/** @type {import('webpack').Configuration[]} */
const configs = [
  {
    name: 'extension',
    target: 'node',
    mode: 'none',
    entry: './src/extension.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'extension.js',
      libraryTarget: 'commonjs2',
      devtoolModuleFilenameTemplate: '../[resource-path]',
    },
    externals: {
      vscode: 'commonjs vscode',
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: 'ts-loader',
        },
      ],
    },
    devtool: 'nosources-source-map',
  },
  {
    name: 'webview',
    target: 'web',
    mode: 'none',
    entry: './src/webview/index.tsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'webview.js',
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          // transpileOnly: extension-only files (e.g. SidebarProvider) are in the project
          // tsconfig but not in the webview bundle — type-checking them here against the
          // browser lib causes false errors. The extension bundle and `pnpm typecheck` both
          // catch real type errors; skip type-checking in this bundle to avoid false positives.
          use: { loader: 'ts-loader', options: { transpileOnly: true } },
        },
      ],
    },
    devtool: 'nosources-source-map',
  },
]

module.exports = configs
