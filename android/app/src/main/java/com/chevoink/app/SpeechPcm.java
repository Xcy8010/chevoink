package com.chevoink.app;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/** Bridge contract: raw mono float32LE at 16 kHz, no WAV header, at most 60 seconds. */
final class SpeechPcm {
    static final int SAMPLE_RATE = 16000;
    static final int MAX_SAMPLES = SAMPLE_RATE * 60;
    static final int MAX_SEGMENT_SAMPLES = SAMPLE_RATE * 20;
    static final int MAX_BASE64_CHARS = ((MAX_SAMPLES * 4 + 2) / 3) * 4;

    private SpeechPcm() {}

    static float[] decodeBytes(byte[] bytes, int sampleRate) {
        if (sampleRate != SAMPLE_RATE) {
            throw new IllegalArgumentException("sampleRate must be 16000; resample to mono float32LE before calling.");
        }
        if (bytes == null || bytes.length == 0 || bytes.length % 4 != 0 || bytes.length > MAX_SAMPLES * 4) {
            throw new IllegalArgumentException("PCM byte length must be a nonzero multiple of four, at most 3840000.");
        }
        float[] samples = new float[bytes.length / 4];
        ByteBuffer buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        for (int i = 0; i < samples.length; i++) {
            float value = buffer.getFloat();
            if (Float.isNaN(value) || Float.isInfinite(value) || value < -1f || value > 1f) {
                throw new IllegalArgumentException("PCM samples must be finite floats in [-1, 1].");
            }
            samples[i] = value;
        }
        return samples;
    }

    static int segmentEnd(int start, int length) {
        if (start < 0 || start >= length) throw new IllegalArgumentException("Invalid segment start.");
        return start + Math.min(MAX_SEGMENT_SAMPLES, length - start);
    }
}
