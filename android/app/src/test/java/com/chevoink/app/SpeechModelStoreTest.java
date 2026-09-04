package com.chevoink.app;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import java.io.File;
import java.nio.file.Files;
import java.util.concurrent.CancellationException;
import static org.junit.Assert.*;

public class SpeechModelStoreTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    private static final String ABC_SHA = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    @Test public void validatesLengthAndHash() throws Exception {
        File file = temporary.newFile();
        Files.write(file.toPath(), new byte[]{'a', 'b', 'c'});
        assertTrue(SpeechModelStore.valid(file, 3, ABC_SHA, new SpeechModelStore.Cancellation()));
        assertFalse(SpeechModelStore.valid(file, 4, ABC_SHA, new SpeechModelStore.Cancellation()));
        assertFalse(SpeechModelStore.valid(file, 3, "invalid", new SpeechModelStore.Cancellation()));
    }
    @Test public void missingAndPartialModelNeverReady() throws Exception {
        SpeechModelStore store = new SpeechModelStore(temporary.getRoot());
        assertFalse(store.verified(new SpeechModelStore.Cancellation()));
        assertTrue(store.modelFile().getParentFile().mkdirs());
        Files.write(store.modelFile().toPath(), new byte[]{1, 2, 3});
        assertFalse(store.verified(new SpeechModelStore.Cancellation()));
    }
    @Test(expected = CancellationException.class) public void cancelledValidationStops() throws Exception {
        SpeechModelStore.Cancellation cancellation = new SpeechModelStore.Cancellation();
        cancellation.cancel();
        SpeechModelStore.valid(temporary.newFile(), 0, ABC_SHA, cancellation);
    }
    @Test public void deleteOnlyFeatureFilesAndIsIdempotent() throws Exception {
        SpeechModelStore store = new SpeechModelStore(temporary.getRoot());
        assertTrue(store.modelFile().getParentFile().mkdirs());
        File unrelated = new File(store.modelFile().getParentFile(), "keep.txt");
        Files.write(unrelated.toPath(), new byte[]{42});
        Files.write(store.modelFile().toPath(), new byte[]{1});
        Files.write(store.tokensFile().toPath(), new byte[]{2});
        File partial = new File(store.modelFile().getParentFile(), "model.int8.onnx.part");
        Files.write(partial.toPath(), new byte[]{3});
        store.delete();
        store.delete();
        assertTrue(unrelated.exists());
        assertFalse(store.modelFile().exists());
        assertFalse(store.tokensFile().exists());
        assertFalse(partial.exists());
    }
    @Test public void pinsSameOriginAndExpectedDownloadSize() {
        assertEquals("https://chevoink.chevolink.com/voice/native-sensevoice-1.13.7/", SpeechModelStore.BASE_URL);
        assertEquals(240193589L, SpeechModelStore.TOTAL_BYTES);
    }
}
