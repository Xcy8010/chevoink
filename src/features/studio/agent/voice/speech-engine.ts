import { VOICE_MODEL_DOWNLOAD_BYTES } from './voice-manifest';
export { VOICE_MODEL_DOWNLOAD_BYTES };
import { cancelNativeSpeech, getNativeSpeech, nativeOperation, prepareNativeSpeech, transcribeNativeSpeech } from './native-speech';

type Reply = { id: number; value?: unknown; progress?: number; error?: string; name?: string };
type Pending = { resolve: (value: unknown) => void; reject: (reason: unknown) => void; progress?: (value: number) => void; cleanup: () => void };
let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, Pending>();
let deleting: Promise<void> | undefined;

function abortError() { return new DOMException('语音操作已取消', 'AbortError'); }

/** Terminates synchronous WASM inference too; cache is retained. Aborts ALL pending calls. */
export function disposeVoiceEngine(): void {
  cancelNativeSpeech();
  worker?.terminate();
  worker = undefined;
  for (const request of pending.values()) { request.cleanup(); request.reject(abortError()); }
  pending.clear();
}

function getWorker(): Worker {
  if (!globalThis.isSecureContext || !globalThis.Worker || !globalThis.caches || !globalThis.crypto?.subtle) {
    throw new Error('离线语音需要 HTTPS、Web Worker 和浏览器本地缓存支持');
  }
  if (!worker) {
    // Vite emits an IIFE classic worker: official Emscripten glue uses importScripts.
    worker = new Worker(new URL('./voice-worker.js', import.meta.url));
    worker.onmessage = ({ data }: MessageEvent<Reply>) => {
      const request = pending.get(data.id);
      if (!request) return;
      if (data.progress !== undefined) { try { request.progress?.(data.progress); } catch { /* UI callbacks must not break RPC. */ } return; }
      pending.delete(data.id);
      request.cleanup();
      if (data.error) request.reject(new DOMException(data.error, data.name || 'OperationError'));
      else request.resolve(data.value);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || '离线语音 Worker 启动失败，请检查 CSP 和 WASM 支持');
      for (const request of pending.values()) { request.cleanup(); request.reject(error); }
      pending.clear();
      worker?.terminate();
      worker = undefined;
    };
  }
  return worker;
}

async function call<T>(operation: string, payload: Record<string, unknown> = {}, signal?: AbortSignal, progress?: (value: number) => void): Promise<T> {
  if (signal?.aborted) throw abortError();
  if (deleting && operation !== 'delete') await deleting;
  if (signal?.aborted) throw abortError();
  const target = getWorker();
  const id = ++nextId;
  return new Promise<T>((resolve, reject) => {
    const abort = () => disposeVoiceEngine();
    const timeout = setTimeout(() => {
      pending.delete(id);
      cleanup();
      reject(new DOMException('离线语音操作超时，请缩短录音或重试', 'TimeoutError'));
      // A status probe can queue behind synchronous inference. Its timeout must
      // not terminate another composer's download/transcription.
      if (operation !== 'status') disposeVoiceEngine();
    }, operation === 'prepare' ? 15 * 60_000 : operation === 'transcribe' ? 180_000 : operation === 'status' ? 3000 : 30_000);
    const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); };
    pending.set(id, { resolve: value => resolve(value as T), reject, progress, cleanup });
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const samples = payload.samples as Float32Array | undefined;
      target.postMessage({ id, operation, ...payload }, samples ? [samples.buffer] : []);
    } catch (error) { pending.delete(id); cleanup(); reject(error); }
  });
}

/** Checks verified commit marker + cached response sizes; no model read or WASM initialization. */
export async function getVoiceModelStatus(): Promise<boolean> {
  try {
    const native = await getNativeSpeech();
    if (native) { const state = await nativeOperation(native, () => native.status(), undefined, 3000, false); return state.ready && state.sdkReady && !state.checking; }
    return await call<boolean>('status');
  } catch { return false; }
}

/** Explicit same-origin download. Progress is 0..1, reaching 1 only after verified cache commit. */
export async function prepareVoiceModel(onProgress: (progress: number) => void, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError();
  const native = await getNativeSpeech();
  if (native) return prepareNativeSpeech(native, onProgress, signal);
  await call<void>('prepare', {}, signal, onProgress);
}

/** Actual selected backend's download estimate; UI may use the exported WASM constant as an upper bound. */
export async function getVoiceDownloadBytes(): Promise<number> {
  const native = await getNativeSpeech();
  if (native) return (await nativeOperation(native, () => native.status())).downloadBytes;
  return VOICE_MODEL_DOWNLOAD_BYTES;
}

/** Actual input sample rate is required. PCM stays on-device and caller's buffer is never detached. */
export async function transcribeAudio(samples: Float32Array, sampleRate: number, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw abortError();
  if (!(samples instanceof Float32Array) || !Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || samples.length > sampleRate * 120) {
    throw new Error('无效语音格式或录音超过 120 秒');
  }
  if (!samples.length) return '';
  const native = await getNativeSpeech();
  if (native) {
    const pcm = await call<{ pcmBase64: string; sampleRate: number }>('prepare-native', { samples: samples.slice(), sampleRate }, signal);
    return transcribeNativeSpeech(native, pcm, signal);
  }
  return call<string>('transcribe', { samples: samples.slice(), sampleRate }, signal);
}

/** Stops in-flight work before removing only this application's voice caches. */
export async function deleteVoiceModel(): Promise<void> {
  if (deleting) return deleting;
  disposeVoiceEngine();
  deleting = (async () => {
    const native = await getNativeSpeech();
    if (native) await nativeOperation(native, () => native.deleteModel());
    // The WASM cache may remain from an older APK. Clear both, without downloading either.
    if (globalThis.caches) for (const name of await caches.keys()) if (name.startsWith('chevoink-voice-')) await caches.delete(name);
  })();
  try { await deleting; } finally { deleting = undefined; disposeVoiceEngine(); }
}
