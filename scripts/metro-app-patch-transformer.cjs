'use strict';

const path = require('node:path');
const expoRoot = path.dirname(require.resolve('expo/package.json'));
const upstreamTransformerPath = require.resolve('@expo/metro-config/babel-transformer', {
  paths: [expoRoot],
});
const upstreamTransformer = require(upstreamTransformerPath);
const { applyMobileSourcePatches } = require('./mobile-source-patches.cjs');

module.exports.transform = async ({ src, filename, options }) => {
  const nextSource = path.basename(filename) === 'App.tsx'
    ? applyMobileSourcePatches(src)
    : src;

  return upstreamTransformer.transform({
    src: nextSource,
    filename,
    options,
  });
};