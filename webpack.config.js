const path = require('path');
const webpack = require('webpack');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

module.exports = {
  // NOTE: ./src/index.js is the original Webpack entry point but is NOT present
  // in this repo — only the compiled bundle.js was committed. `npm run build`
  // will fail until the viewer source is restored (see DEVELOPMENT.md).
  entry: './src/index.js',
  output: {
    // Output to dist/ so a build never clobbers the only working copy of the
    // compiled viewer at the repo root. Copy dist/bundle.js -> ./bundle.js only
    // after verifying a build.
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env': JSON.stringify(process.env),
    }),
  ],
  optimization: {
    minimize: true,
  },
};
