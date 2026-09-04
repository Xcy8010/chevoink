import * as engine from '/engine.mjs';
globalThis.voiceEngine = engine;
globalThis.voiceSmoke = { progress: [], isolated: crossOriginIsolated };
const report = () => { document.querySelector('#result').textContent = JSON.stringify(globalThis.voiceSmoke, null, 2); };
globalThis.prepareSmoke = async () => {
  const started = performance.now();
  await engine.prepareVoiceModel(value => { voiceSmoke.progress.push(value); });
  voiceSmoke.prepareMs = performance.now() - started;
  voiceSmoke.ready = await engine.getVoiceModelStatus();
  report();
};
globalThis.loadFixtures = async () => {
  globalThis.voiceFixtures = {};
  for (const language of ['zh', 'en']) {
    const response = await fetch(`/fixtures/${language}.wav`);
    const buffer = await response.arrayBuffer();
    const view = new DataView(buffer);
    const sampleRate = view.getUint32(24, true);
    let offset = 12;
    while (offset + 8 < buffer.byteLength) {
      const size = view.getUint32(offset + 4, true);
      if (String.fromCharCode(...new Uint8Array(buffer, offset, 4)) === 'data') {
        const samples = new Float32Array(size / 2);
        for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(offset + 8 + i * 2, true) / 32768;
        voiceFixtures[language] = { samples, sampleRate }; break;
      }
      offset += 8 + size + (size % 2);
    }
  }
};
globalThis.recognizeSmoke = async () => {
  for (const language of ['zh', 'en']) {
    const { samples, sampleRate } = voiceFixtures[language];
    const started = performance.now();
    voiceSmoke[language] = await engine.transcribeAudio(samples, sampleRate);
    voiceSmoke[`${language}Ms`] = performance.now() - started;
    report();
  }
  voiceSmoke.silence = await engine.transcribeAudio(new Float32Array(48000), 48000);
  report();
};
report();
