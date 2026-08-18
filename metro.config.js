const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.transformer.babelTransformerPath = path.resolve(
  __dirname,
  'scripts/metro-app-patch-transformer.cjs',
);

module.exports = config;
