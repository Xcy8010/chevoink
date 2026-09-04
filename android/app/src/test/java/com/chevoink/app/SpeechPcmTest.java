package com.chevoink.app;

import org.junit.Test;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import static org.junit.Assert.*;

public class SpeechPcmTest {
    private byte[] pcm(float... values) {
        ByteBuffer buffer = ByteBuffer.allocate(values.length * 4).order(ByteOrder.LITTLE_ENDIAN);
        for (float value : values) buffer.putFloat(value);
        return buffer.array();
    }

    @Test public void acceptsLittleEndianMono() {
        assertArrayEquals(new float[]{-1f, -0.25f, 0f, 0.5f, 1f},
                SpeechPcm.decodeBytes(pcm(-1f, -0.25f, 0f, 0.5f, 1f), 16000), 0f);
    }
    @Test public void acceptsExactlySixtySeconds() {
        assertEquals(960000, SpeechPcm.decodeBytes(new byte[3840000], 16000).length);
        assertEquals(5120000, SpeechPcm.MAX_BASE64_CHARS);
    }
    @Test(expected = IllegalArgumentException.class) public void rejectsWrongRate() {
        SpeechPcm.decodeBytes(pcm(0), 48000);
    }
    @Test(expected = IllegalArgumentException.class) public void rejectsPartialFloat() {
        SpeechPcm.decodeBytes(new byte[3], 16000);
    }
    @Test(expected = IllegalArgumentException.class) public void rejectsEmpty() {
        SpeechPcm.decodeBytes(new byte[0], 16000);
    }
    @Test(expected = IllegalArgumentException.class) public void rejectsNull() {
        SpeechPcm.decodeBytes(null, 16000);
    }
    @Test(expected = IllegalArgumentException.class) public void rejectsTooLong() {
        SpeechPcm.decodeBytes(new byte[3840004], 16000);
    }
    @Test(expected = IllegalArgumentException.class) public void rejectsNan() {
        SpeechPcm.decodeBytes(pcm(Float.NaN), 16000);
    }
    @Test(expected = IllegalArgumentException.class) public void rejectsInfinity() {
        SpeechPcm.decodeBytes(pcm(Float.POSITIVE_INFINITY), 16000);
    }
    @Test(expected = IllegalArgumentException.class) public void rejectsOutOfRange() {
        SpeechPcm.decodeBytes(pcm(1.01f), 16000);
    }
    @Test(expected = IllegalArgumentException.class) public void rejectsWavHeader() {
        SpeechPcm.decodeBytes(new byte[]{'R','I','F','F'}, 16000);
    }
    @Test public void segmentsNeverExceedTwentySecondsAndNeverDropSamples() {
        for (int length : new int[]{1, 319999, 320000, 320001, 960000}) {
            int total = 0;
            for (int start = 0; start < length;) {
                int end = SpeechPcm.segmentEnd(start, length);
                assertTrue(end > start);
                assertTrue(end - start <= 320000);
                total += end - start;
                start = end;
            }
            assertEquals(length, total);
        }
    }
}
