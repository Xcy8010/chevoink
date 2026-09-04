#!/usr/bin/env node
// Node >=20, system tar. No npm packages, compilation or audio uploads.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = await readFile(path.join(root, 'src/features/studio/agent/voice/voice-manifest.ts'), 'utf8');
const manifest = JSON.parse(source.slice(source.indexOf('= {') + 2, source.indexOf(' as const;')));
const output = path.join(root, 'output/voice-assets');
const archive = path.join(output, 'sensevoice-1.12.26.tar.bz2');
const destination = path.join(output, manifest.version);
const hashFile = async file => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};
async function matches(file, bytes, hash) {
  try { return (await stat(file)).size === bytes && await hashFile(file) === hash; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
await mkdir(output, { recursive: true });
if (!await matches(archive, manifest.archiveBytes, manifest.archiveSha256)) {
  console.log(`Downloading pinned official archive (${manifest.archiveBytes} bytes)`);
  const response = await fetch(manifest.archiveUrl, { signal: AbortSignal.timeout(15 * 60_000) });
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(`${archive}.part`));
  if (!await matches(`${archive}.part`, manifest.archiveBytes, manifest.archiveSha256)) throw new Error('Archive size/SHA-256 mismatch; nothing published');
  await rename(`${archive}.part`, archive);
}
// License texts are fetched from their pinned upstream sources, not from the binary archive.
const archiveFiles = manifest.files.filter(file => !file.name.startsWith('licenses/'));
const allReady = (await Promise.all(archiveFiles.map(file => matches(path.join(destination, file.name), file.bytes, file.sha256)))).every(Boolean);
if (!allReady) {
  const unpack = path.join(output, 'upstream');
  await mkdir(unpack, { recursive: true });
  // Extraction is allowed only after checking the pinned archive hash above.
  execFileSync('tar', ['-xjf', archive, '-C', unpack], { stdio: 'inherit' });
  await mkdir(destination, { recursive: true });
  for (const file of archiveFiles) {
    const original = path.join(unpack, manifest.archiveRoot, file.name);
    if (!await matches(original, file.bytes, file.sha256)) throw new Error(`Extracted asset mismatch: ${file.name}`);
    await copyFile(original, path.join(destination, file.name));
  }
}
await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await mkdir(path.join(destination, 'licenses'), { recursive: true });
for (const license of manifest.licenses) {
  const target = path.join(destination, 'licenses', license.name);
  if (!await matches(target, license.bytes, license.sha256)) {
    const response = await fetch(license.url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`License download failed: ${license.name}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== license.bytes || createHash('sha256').update(bytes).digest('hex') !== license.sha256) throw new Error(`License hash mismatch: ${license.name}`);
    await writeFile(target, bytes);
  }
}
await copyFile(path.join(root, 'docs/licenses/VOICE.md'), path.join(destination, 'licenses/VOICE.md'));
if (process.argv.includes('--public')) {
  const publicDir = path.join(root, 'public/voice', manifest.version);
  await mkdir(publicDir, { recursive: true });
  await mkdir(path.join(publicDir, 'licenses'), { recursive: true });
  for (const name of [...manifest.files.map(file => file.name), 'manifest.json']) {
    await copyFile(path.join(destination, name), path.join(publicDir, name));
  }
  await mkdir(path.join(publicDir, 'licenses'), { recursive: true });
  for (const name of [...manifest.licenses.map(license => license.name), 'VOICE.md']) await copyFile(path.join(destination, 'licenses', name), path.join(publicDir, 'licenses', name));
  console.log(`Same-origin Vite assets ready: ${publicDir}`);
}
console.log(`Verified deployment directory: ${destination}`);
console.log(`Deploy contents to /var/www/chevoink/voice/${manifest.version}/ => ${manifest.baseUrl}`);
console.log(`Browser download: ${manifest.files.reduce((sum, file) => sum + file.bytes, 0)} bytes; no COOP/COEP needed.`);
