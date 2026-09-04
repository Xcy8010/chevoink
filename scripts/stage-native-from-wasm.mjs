// Extract only exact, previously verified Emscripten data ranges; no network or web-tree writes.
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { readFile, stat, rename, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageSpeechLicenses } from './stage-speech-licenses.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/stage-native-from-wasm.mjs <absolute validated .data path>');
const destinationRoot = join(projectRoot, 'release/voice/native-sensevoice-1.13.7');
const manifest = JSON.parse(await readFile(join(destinationRoot, 'manifest.json'), 'utf8'));
await stageSpeechLicenses();
const ranges = {
  'model.int8.onnx': [0, 239233841],
  'silero_vad.onnx': [239233841, 239877695],
  'tokens.txt': [239877695, 240193589],
};
async function sha(path) {
  const hash = createHash('sha256');
  for await (const block of createReadStream(path)) hash.update(block);
  return hash.digest('hex');
}
if ((await stat(source)).size !== 240193589 ||
    await sha(source) !== '4c063aa4af215b02b6c127f3b7be8ae8405ff1285a18117e746f4abe53e5b3be') {
  throw new Error('Source WASM data size/hash mismatch; nothing extracted.');
}
for (const entry of manifest.files) {
  const [start, end] = ranges[entry.name];
  if (end - start !== entry.bytes) throw new Error(`Range mismatch: ${entry.name}`);
  const destination = join(destinationRoot, entry.name);
  if (!existsSync(destination)) {
    const partial = `${destination}.part`;
    if (existsSync(partial)) throw new Error(`Existing partial retained: ${partial}`);
    try {
      await pipeline(createReadStream(source, {start, end: end - 1}), createWriteStream(partial, {flags: 'wx'}));
      if (await sha(partial) !== entry.sha256) throw new Error(`Extracted checksum mismatch: ${entry.name}`);
      await rename(partial, destination);
    } finally {
      if (existsSync(partial)) await unlink(partial);
    }
  }
  if ((await stat(destination)).size !== entry.bytes || await sha(destination) !== entry.sha256) {
    throw new Error(`Staged checksum mismatch (retained): ${entry.name}`);
  }
  console.log(`Verified ${entry.name}: ${entry.bytes} bytes, SHA256 ${entry.sha256}`);
}
console.log(`Staged locally, NOT deployed: ${destinationRoot}`);
