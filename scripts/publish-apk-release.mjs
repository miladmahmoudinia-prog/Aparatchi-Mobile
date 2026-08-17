import fs from 'node:fs';
import path from 'node:path';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;
const tag = process.env.RELEASE_TAG || 'android-latest';
const version = process.env.APP_VERSION || 'unknown';
const apkPath = path.resolve(process.env.APK_PATH || 'Aparatchi-Android-Release.apk');

if (!token) throw new Error('GITHUB_TOKEN is missing.');
if (!repository || !repository.includes('/')) throw new Error('GITHUB_REPOSITORY is invalid.');
if (!fs.existsSync(apkPath)) throw new Error(`APK not found at ${apkPath}`);

const [owner, repo] = repository.split('/');
const apkName = path.basename(apkPath);
const releaseName = `Aparatchi Android v${version}`;
const releaseBody = `Latest Android APK for Aparatchi v${version}.`;
const apiBase = 'https://api.github.com';

const commonHeaders = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'aparatchi-self-hosted-runner',
};

async function request(url, options = {}, allowed = []) {
  const response = await fetch(url, {
    ...options,
    headers: { ...commonHeaders, ...(options.headers || {}) },
  });

  if (!response.ok && !allowed.includes(response.status)) {
    const body = await response.text();
    throw new Error(`${options.method || 'GET'} ${url} failed: ${response.status} ${body}`);
  }

  return response;
}

let release;
const byTag = await request(
  `${apiBase}/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
  {},
  [404],
);

if (byTag.status === 404) {
  const created = await request(`${apiBase}/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: sha || 'main',
      name: releaseName,
      body: releaseBody,
      draft: false,
      prerelease: false,
      make_latest: 'true',
    }),
  });
  release = await created.json();
} else {
  release = await byTag.json();
  const updated = await request(`${apiBase}/repos/${owner}/${repo}/releases/${release.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: releaseName,
      body: releaseBody,
      draft: false,
      prerelease: false,
      make_latest: 'true',
    }),
  });
  release = await updated.json();
}

const assetsResponse = await request(
  `${apiBase}/repos/${owner}/${repo}/releases/${release.id}/assets?per_page=100`,
);
const assets = await assetsResponse.json();
for (const asset of assets) {
  if (asset.name === apkName) {
    await request(`${apiBase}/repos/${owner}/${repo}/releases/assets/${asset.id}`, {
      method: 'DELETE',
    });
  }
}

const apk = fs.readFileSync(apkPath);
const uploadUrl = `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(apkName)}`;
const uploaded = await request(uploadUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Length': String(apk.length),
  },
  body: apk,
});
const asset = await uploaded.json();

console.log(`Published ${asset.name} to release ${tag}: ${asset.browser_download_url}`);
