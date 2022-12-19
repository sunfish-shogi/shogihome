const TerserPlugin = require("terser-webpack-plugin");

const optimization = {
  minimize: true,
  minimizer: [
    new TerserPlugin({
      terserOptions: {
        format: {
          comments: false,
        },
      },
      extractComments: false,
    }),
  ],
};

module.exports = [{
  mode: 'production',
  entry:'./dist/src/background.js',
  target: 'node',
  output: {
    filename: 'background.js',
    path: __dirname + '/dist/packed',
    libraryTarget: 'commonjs2',
  },
  externals: ['electron'],
  optimization,
}, {
  mode: 'production',
  entry: './dist/src/ipc/preload.js',
  output: {
    filename: 'preload.js',
    path: __dirname + '/dist/packed',
    libraryTarget: 'commonjs',
  },
  externals: ['electron'],
  optimization,
}];