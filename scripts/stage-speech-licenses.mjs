// Checked-in licenses are authoritative. No fetching latest license text during a build.
import { createHash } from 'node:crypto';
import { readFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(projectRoot, 'third-party/speech');
const outputRoot = join(projectRoot, 'release/voice/native-sensevoice-1.13.7/licenses');
const hash = data => createHash('sha256').update(data).digest('hex');

export async function stageSpeechLicenses(checkOnly = false) {
  const manifestBytes = await readFile(join(sourceRoot, 'SOURCES.json'));
  const manifest = JSON.parse(manifestBytes);
  const entries = [];
  for (const file of manifest.files) {
    if (!/^[A-Za-z0-9_.-]+$/.test(file.name)) throw new Error('Invalid license filename.');
    const data = await readFile(join(sourceRoot, file.name));
    if (hash(data) !== file.sha256) throw new Error(`Source license checksum mismatch: ${file.name}`);
    entries.push({name: file.name, sha256: file.sha256});
  }
  if (checkOnly) return entries;
  entries.push({name: 'SOURCES.json', sha256: hash(manifestBytes)});
  await mkdir(outputRoot, {recursive: true});
  for (const file of entries) {
    const destination = join(outputRoot, file.name);
    try {
      await stat(destination);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await copyFile(join(sourceRoot, file.name), destination, constants.COPYFILE_EXCL);
    }
    if (hash(await readFile(destination)) !== file.sha256) {
      throw new Error(`Staged license differs (retained, not overwritten): ${file.name}`);
    }
  }
  return entries;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const entries = await stageSpeechLicenses(process.argv.includes('--check'));
  console.log(`Verified ${entries.length} license/attribution files${process.argv.includes('--check') ? '' : `; staged at ${outputRoot}`}.`);
}
