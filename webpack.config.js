const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const outputDir = path.resolve(__dirname, 'dist');

  const entry = {
    background: './src/js/background.js',
    'bulk-history': './src/js/bulk-history.js',
    extension: './src/js/extension.js',
    inject: './src/js/inject.js',
    options: './src/js/options.js',
    options_listener_inject: './src/js/options_listener_inject.js',
  };

  return {
    entry,
    output: {
      path: outputDir,
      filename: 'js/[name].js',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env'],
            },
          },
        },
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'ts-loader',
            },
          ],
        },
        {
          test: /\.css$/,
          use: [
            isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
            'css-loader',
            'sass-loader',
          ],
        },
        {
          test: /\.scss$/,
          use: [
            isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
            'css-loader',
            'sass-loader',
          ],
        },
      ],
    },
    resolve: {
      extensions: ['.js', '.ts', '.json'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: 'manifest.json', to: 'manifest.json' },
          { from: 'options.html', to: 'options.html' },
          { from: 'icons', to: 'icons' },
          { from: 'src/css/extension.css', to: 'css/extension.css' },
          { from: 'src/css/options.css', to: 'css/options.css' },
        ],
      }),
      new MiniCssExtractPlugin({
        filename: 'css/[name].css',
      }),
    ],
    devtool: isProduction ? 'source-map' : 'inline-source-map',
    optimization: {
      minimize: isProduction,
    },
    performance: {
      maxAssetSize: 400 * 1024,
      maxEntrypointSize: 400 * 1024,
    },
    watchOptions: {
      ignored: /node_modules/,
    },
  };
};
