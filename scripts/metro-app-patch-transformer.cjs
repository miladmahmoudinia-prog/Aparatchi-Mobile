'use strict';

const path = require('node:path');
const upstreamTransformer = require('@expo/metro-config/babel-transformer');
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
