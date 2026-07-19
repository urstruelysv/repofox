/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path')
const isProduction = process.env.NODE_ENV === 'production'

/** @type {import('webpack').Configuration[]} */
const configs = [
  {
    name: 'extension',
    target: 'node',
    mode: isProduction ? 'production' : 'development',
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
    mode: isProduction ? 'production' : 'development',
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
          use: { loader: 'ts-loader', options: { transpileOnly: true } },
        },
      ],
    },
    devtool: 'nosources-source-map',
  },
]

module.exports = configs
