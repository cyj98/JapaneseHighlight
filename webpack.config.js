const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const ExtensionReloader = require('webpack-extension-reloader');

module.exports = (_, argv) => {
  const entryList = ['background', 'black_white', 'content_script', 'import', 'options', 'popup'];
  const entry = {};
  entryList.forEach((entryItem) => {
    entry[entryItem] = `./scripts/${entryItem}.js`;
  });

  const config = {
    mode: argv.mode ? argv.mode : 'development',
    context: path.resolve(__dirname, 'src'),
    entry,
    output: {
      filename: './scripts/[name].js',
      path: path.resolve(__dirname, 'dist-chrome'),
    },
    module: {
      rules: [
        {
          test: /\.css$/,
          use: ['css-loader'],
        },
      ],
    },
    plugins: [
      new CopyPlugin([
        '_locales/**/*',
        'data/*',
        'html/*',
        'images/*.png',
        'styles/*',
        'manifest.json',
      ]),
      new ExtensionReloader({
        port: 9092,
        reloadPage: true,
        entries: {
          contentScript: 'content_script',
          background: 'background',
          extensionPage: 'popup',
        },
      }),
    ],
  };
  if (config.mode === 'production') {
    config.optimization = {
      minimize: true,
      minimizer: [new TerserPlugin()],
    };
  }
  return config;
};
