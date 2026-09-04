package com.chevoink.app;

import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.k2fsa.sherpa.onnx.OfflineModelConfig;
import com.k2fsa.sherpa.onnx.OfflineRecognizer;
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig;
import com.k2fsa.sherpa.onnx.OfflineSenseVoiceModelConfig;
import com.k2fsa.sherpa.onnx.OfflineStream;
import com.k2fsa.sherpa.onnx.SileroVadModelConfig;
import com.k2fsa.sherpa.onnx.Vad;
import com.k2fsa.sherpa.onnx.VadModelConfig;
import java.util.Arrays;
import java.io.IOException;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Offline ASR only: no Android SpeechRecognizer, no audio uploads, no server fallback. */
@CapacitorPlugin(name = "ChevoinkSpeech")
public class ChevoinkSpeechPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Object lock = new Object();
    private SpeechModelStore store;
    private OfflineRecognizer recognizer; // Accessed only on worker, never released during JNI decode.
    private volatile boolean sdkReady;
    private volatile boolean ready;
    private volatile boolean checking = true;
    private volatile boolean destroyed;
    private volatile boolean deleting;
    private Operation active;
    private final SpeechModelStore.Cancellation startup = new SpeechModelStore.Cancellation();

    private static final class Operation {
        final PluginCall call;
        final SpeechModelStore.Cancellation cancellation = new SpeechModelStore.Cancellation();
        final AtomicBoolean settled = new AtomicBoolean();
        Operation(PluginCall call) { this.call = call; }
        void resolve(JSObject result) { if (settled.compareAndSet(false, true)) call.resolve(result); }
        void reject(String message, String code) { if (settled.compareAndSet(false, true)) call.reject(message, code); }
        void cancel() {
            cancellation.cancel();
            reject("Speech operation cancelled.", "CANCELLED");
        }
    }

    @Override public void load() {
        store = new SpeechModelStore(getContext().getNoBackupFilesDir());
        worker.execute(() -> {
            try {
                System.loadLibrary("sherpa-onnx-jni");
                sdkReady = true;
                ready = store.verified(startup);
            } catch (IOException | RuntimeException | LinkageError e) {
                ready = false;
            } finally {
                checking = false;
            }
        });
    }

    static boolean trustedOrigin(String value) {
        if (value == null) return false;
        Uri uri = Uri.parse(value);
        return "https".equals(uri.getScheme()) && "chevoink.chevolink.com".equals(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }

    private void trusted(PluginCall call, Runnable action) {
        getActivity().runOnUiThread(() -> {
            if (destroyed) { call.reject("Speech plugin has been destroyed.", "UNAVAILABLE"); return; }
            if (!trustedOrigin(getBridge().getWebView().getUrl())) {
                call.reject("Speech is available only to the trusted Chevoink HTTPS origin.", "UNTRUSTED_ORIGIN");
                return;
            }
            action.run();
        });
    }

    @PluginMethod public void status(PluginCall call) {
        trusted(call, () -> {
            JSObject result = new JSObject();
            result.put("ready", sdkReady && ready && !deleting);
            result.put("checking", checking);
            result.put("sdkReady", sdkReady);
            result.put("modelId", SpeechModelStore.MODEL_ID);
            result.put("downloadBytes", SpeechModelStore.TOTAL_BYTES);
            result.put("pcmFormat", "float32le");
            result.put("sampleRate", SpeechPcm.SAMPLE_RATE);
            result.put("maxSeconds", 60);
            result.put("maxSegmentSeconds", 20);
            synchronized (lock) { result.put("busy", active != null || deleting); }
            call.resolve(result);
        });
    }

    @PluginMethod public void download(PluginCall call) {
        trusted(call, () -> {
            Operation operation = begin(call);
            if (operation == null) return;
            worker.execute(() -> {
                try {
                    requireSdk();
                    if (!ready) {
                        releaseRecognizer();
                        store.download(operation.cancellation, progress -> {
                            if (!operation.cancellation.cancelled.get() && !destroyed) {
                                JSObject event = new JSObject();
                                event.put("progress", Math.min(0.999, progress));
                                notifyListeners("progress", event);
                            }
                        });
                    }
                    operation.cancellation.check();
                    ready = true;
                    JSObject event = new JSObject();
                    event.put("progress", 1.0);
                    if (!destroyed) notifyListeners("progress", event);
                    JSObject result = new JSObject();
                    result.put("ready", true);
                    finish(operation);
                    operation.resolve(result);
                } catch (IOException | RuntimeException | LinkageError | OutOfMemoryError e) {
                    fail(operation, e, "DOWNLOAD_FAILED");
                } finally { finish(operation); }
            });
        });
    }

    @PluginMethod public void transcribe(PluginCall call) {
        trusted(call, () -> {
            Integer sampleRate = call.getInt("sampleRate");
            String encoded = call.getString("pcmBase64");
            if (sampleRate == null || sampleRate != SpeechPcm.SAMPLE_RATE || encoded == null
                    || encoded.isEmpty() || encoded.length() > SpeechPcm.MAX_BASE64_CHARS) {
                call.reject("Use mono float32LE PCM at 16000 Hz, at most 60 seconds, encoded as standard base64.", "INVALID_PCM");
                return;
            }
            Operation operation = begin(call);
            if (operation == null) return;
            worker.execute(() -> {
                Vad vad = null;
                try {
                    operation.cancellation.check();
                    requireSdk();
                    if (!ready) {
                        operation.reject("Download the offline model first.", "MODEL_NOT_READY");
                        return;
                    }
                    float[] samples;
                    try {
                        // Reject whitespace, URL-safe base64, data URLs, and other non-contract input.
                        if (!encoded.matches("[A-Za-z0-9+/]*={0,2}")) throw new IllegalArgumentException();
                        samples = SpeechPcm.decodeBytes(Base64.decode(encoded, Base64.NO_WRAP), sampleRate);
                    } catch (IllegalArgumentException e) {
                        operation.reject("Invalid PCM: expected finite mono float32LE samples in [-1,1].", "INVALID_PCM");
                        return;
                    }
                    operation.cancellation.check();
                    vad = createVad();
                    StringBuilder transcript = new StringBuilder();
                    // Feed fixed Silero windows and drain segments immediately, never queue 60s
                    // of features or run concurrent recognizers. Silence never reaches ASR.
                    for (int offset = 0; offset < samples.length; offset += 512) {
                        operation.cancellation.check();
                        // copyOfRange zero-pads the final partial window for Silero.
                        vad.acceptWaveform(Arrays.copyOfRange(samples, offset, offset + 512));
                        drainSegments(vad, transcript, operation.cancellation);
                    }
                    vad.flush();
                    drainSegments(vad, transcript, operation.cancellation);
                    operation.cancellation.check();
                    JSObject result = new JSObject();
                    result.put("text", transcript.toString());
                    vad.release();
                    vad = null;
                    finish(operation);
                    operation.resolve(result);
                } catch (RuntimeException | LinkageError | OutOfMemoryError e) {
                    fail(operation, e, "TRANSCRIBE_FAILED");
                } finally {
                    if (vad != null) vad.release();
                    finish(operation);
                }
            });
        });
    }

    @PluginMethod public void cancel(PluginCall call) {
        trusted(call, () -> {
            synchronized (lock) { if (active != null) active.cancel(); }
            call.resolve();
        });
    }

    @PluginMethod public void deleteModel(PluginCall call) {
        trusted(call, () -> {
            synchronized (lock) {
                if (deleting) { call.reject("Model deletion already in progress.", "BUSY"); return; }
                deleting = true;
                ready = false;
                if (active != null) active.cancel();
            }
            worker.execute(() -> {
                try {
                    releaseRecognizer();
                    store.delete();
                    ready = false;
                    deleting = false;
                    JSObject result = new JSObject();
                    result.put("ready", false);
                    call.resolve(result);
                } catch (IOException | RuntimeException | LinkageError e) {
                    ready = false;
                    call.reject("Could not remove the offline model; retry deletion.", "DELETE_FAILED");
                } finally { deleting = false; }
            });
        });
    }

    private Operation begin(PluginCall call) {
        synchronized (lock) {
            if (active != null || deleting) {
                call.reject("Speech is busy; wait for the current operation to finish.", "BUSY");
                return null;
            }
            Operation operation = new Operation(call);
            active = operation;
            return operation;
        }
    }

    private void finish(Operation operation) {
        synchronized (lock) { if (active == operation) active = null; }
    }

    private void requireSdk() {
        if (!sdkReady) throw new IllegalStateException("Native offline speech SDK is unavailable on this device.");
    }

    private void ensureRecognizer() {
        if (recognizer != null) return;
        OfflineSenseVoiceModelConfig sense = new OfflineSenseVoiceModelConfig();
        sense.setModel(store.modelFile().getAbsolutePath());
        sense.setLanguage("auto");
        sense.setUseInverseTextNormalization(true);
        OfflineModelConfig model = new OfflineModelConfig();
        model.setSenseVoice(sense);
        model.setTokens(store.tokensFile().getAbsolutePath());
        model.setNumThreads(2);
        model.setProvider("cpu");
        model.setDebug(false);
        OfflineRecognizerConfig config = new OfflineRecognizerConfig();
        config.setModelConfig(model);
        recognizer = new OfflineRecognizer(null, config);
    }

    private Vad createVad() {
        SileroVadModelConfig silero = new SileroVadModelConfig();
        silero.setModel(store.vadFile().getAbsolutePath());
        silero.setThreshold(0.5f);
        silero.setMinSilenceDuration(0.5f);
        silero.setMinSpeechDuration(0.15f);
        silero.setWindowSize(512);
        silero.setMaxSpeechDuration(19.5f); // Margin for padding; hard 20s guard below.
        VadModelConfig config = new VadModelConfig();
        config.setSileroVadModelConfig(silero);
        config.setSampleRate(SpeechPcm.SAMPLE_RATE);
        config.setNumThreads(1);
        config.setProvider("cpu");
        config.setDebug(false);
        return new Vad(null, config);
    }

    private void drainSegments(Vad vad, StringBuilder transcript, SpeechModelStore.Cancellation cancellation) {
        while (!vad.empty()) {
            cancellation.check();
            float[] speech = vad.front().getSamples();
            vad.pop();
            for (int start = 0; start < speech.length;) {
                cancellation.check();
                int end = SpeechPcm.segmentEnd(start, speech.length);
                ensureRecognizer();
                cancellation.check();
                OfflineStream stream = recognizer.createStream();
                try {
                    stream.acceptWaveform(Arrays.copyOfRange(speech, start, end), SpeechPcm.SAMPLE_RATE);
                    recognizer.decode(stream);
                    cancellation.check();
                    String text = recognizer.getResult(stream).getText().trim();
                    if (!text.isEmpty()) {
                        if (transcript.length() > 0) transcript.append('\n');
                        transcript.append(text); // Never deduplicate: repeated speech is meaningful.
                    }
                } finally { stream.release(); }
                start = end;
            }
        }
    }

    private void releaseRecognizer() {
        if (recognizer != null) { recognizer.release(); recognizer = null; }
    }

    private void fail(Operation operation, Throwable error, String code) {
        if (operation.cancellation.cancelled.get() || error instanceof CancellationException) {
            operation.reject("Speech operation cancelled.", "CANCELLED");
        } else if (error instanceof OutOfMemoryError) {
            operation.reject("Not enough device memory for offline speech.", "OUT_OF_MEMORY");
        } else if (!sdkReady || error instanceof LinkageError) {
            operation.reject("Native offline speech SDK is unavailable on this device.", "SDK_UNAVAILABLE");
        } else {
            // Do not surface native dumps, paths, audio, or network redirect URLs to logs/UI.
            operation.reject("DOWNLOAD_FAILED".equals(code)
                    ? "Model download/verification failed. Check connectivity and free storage, then retry."
                    : "Offline recognition failed. Try a shorter recording or reinstall the model.", code);
        }
    }

    @Override protected void handleOnDestroy() {
        destroyed = true;
        startup.cancel();
        synchronized (lock) { if (active != null) active.cancel(); }
        // Never interrupt/free the recognizer while its synchronous JNI decode is executing.
        worker.execute(this::releaseRecognizer);
        worker.shutdown();
    }
}
