/** Mono normalized PCM. Windowed-sinc low-pass prevents aliasing at 44.1/48 kHz. */
export function resampleVoicePcm(samples: Float32Array, sampleRate: number): Float32Array {
  if (!(samples instanceof Float32Array) || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw new Error('语音必须为 8–192 kHz 单声道 Float32 PCM');
  }
  if (samples.length > sampleRate * 120) throw new Error('单次语音最多 120 秒，请分段录制');
  for (const value of samples) if (!Number.isFinite(value)) throw new Error('语音包含无效 PCM 数值');
  if (sampleRate === 16000) return samples.map(value => Math.max(-1, Math.min(1, value)));
  const ratio = sampleRate / 16000;
  const output = new Float32Array(Math.floor(samples.length / ratio));
  const cutoff = Math.min(1, 1 / ratio) * 0.94;
  const radius = Math.ceil(24 / cutoff);
  for (let i = 0; i < output.length; i++) {
    const center = i * ratio;
    let sum = 0;
    let weightSum = 0;
    for (let j = Math.max(0, Math.ceil(center - radius)); j <= Math.min(samples.length - 1, Math.floor(center + radius)); j++) {
      const distance = j - center;
      const x = Math.PI * distance * cutoff;
      const weight = (Math.abs(x) < 1e-8 ? 1 : Math.sin(x) / x) * (0.5 + 0.5 * Math.cos(Math.PI * distance / radius));
      sum += samples[j] * weight;
      weightSum += weight;
    }
    output[i] = Math.max(-1, Math.min(1, sum / (weightSum || 1)));
  }
  return output;
}
