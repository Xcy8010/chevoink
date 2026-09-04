package com.chevoink.app;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.concurrent.CancellationException;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.HttpsURLConnection;

/** Pinned, checksummed downloads into app-private, no-backup storage. No audio ever leaves the device. */
final class SpeechModelStore {
    static final String MODEL_ID = "sensevoice-small-int8-2024-07-17";
    static final String REVISION = "2365baeacb507f821a0c8120fcee3d484dba7a07";
    // Served independently of app/current so normal web releases cannot delete model assets.
    static final String BASE_URL = "https://chevoink.chevolink.com/voice/native-sensevoice-1.13.7/";
    static final long MODEL_BYTES = 239233841L;
    static final long TOKENS_BYTES = 315894L;
    static final long VAD_BYTES = 643854L;
    static final long TOTAL_BYTES = MODEL_BYTES + TOKENS_BYTES + VAD_BYTES;
    static final String MODEL_SHA = "c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51";
    static final String TOKENS_SHA = "f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc";
    static final String VAD_SHA = "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6";

    interface Progress { void update(double progress); }

    static final class Cancellation {
        final AtomicBoolean cancelled = new AtomicBoolean();
        volatile HttpsURLConnection connection;

        void cancel() {
            cancelled.set(true);
            HttpsURLConnection current = connection;
            if (current != null) current.disconnect();
        }

        void check() {
            if (cancelled.get()) throw new CancellationException("Speech operation cancelled.");
        }
    }

    private final File directory;
    SpeechModelStore(File noBackupDirectory) {
        directory = new File(noBackupDirectory, "chevoink-speech/" + MODEL_ID);
    }

    File modelFile() { return new File(directory, "model.int8.onnx"); }
    File tokensFile() { return new File(directory, "tokens.txt"); }
    File vadFile() { return new File(directory, "silero_vad.onnx"); }

    boolean verified(Cancellation cancellation) throws IOException {
        return valid(modelFile(), MODEL_BYTES, MODEL_SHA, cancellation)
                && valid(tokensFile(), TOKENS_BYTES, TOKENS_SHA, cancellation)
                && valid(vadFile(), VAD_BYTES, VAD_SHA, cancellation);
    }

    void download(Cancellation cancellation, Progress progress) throws IOException {
        cancellation.check();
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create private model directory.");
        File[] files = {modelFile(), tokensFile(), vadFile()};
        long[] sizes = {MODEL_BYTES, TOKENS_BYTES, VAD_BYTES};
        String[] hashes = {MODEL_SHA, TOKENS_SHA, VAD_SHA};
        boolean[] valid = new boolean[files.length];
        long existing = 0;
        for (int i = 0; i < files.length; i++) {
            valid[i] = valid(files[i], sizes[i], hashes[i], cancellation);
            if (valid[i]) existing += sizes[i];
        }
        long remaining = TOTAL_BYTES - existing;
        if (directory.getUsableSpace() < remaining + 32L * 1024 * 1024) {
            throw new IOException("Insufficient free storage for the offline model (about 240 MB plus 32 MB reserve).");
        }
        progress.update((double) existing / TOTAL_BYTES);
        for (int i = 0; i < files.length; i++) {
            if (!valid[i]) {
                fetch(files[i], sizes[i], hashes[i], existing, cancellation, progress);
                existing += sizes[i];
            }
        }
        cancellation.check();
    }

    private void fetch(File target, long expectedSize, String expectedSha, long completed,
                       Cancellation cancellation, Progress progress) throws IOException {
        File partial = new File(directory, target.getName() + ".part");
        HttpsURLConnection connection = null;
        try {
            connection = connect(new URL(BASE_URL + target.getName()), cancellation);
            long advertisedSize = connection.getContentLengthLong();
            if (advertisedSize >= 0 && advertisedSize != expectedSize) throw new IOException("Model download size mismatch.");
            MessageDigest digest = sha256();
            long received = 0;
            long lastEvent = 0;
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(partial)) {
                byte[] buffer = new byte[65536];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    cancellation.check();
                    received += count;
                    if (received > expectedSize) throw new IOException("Model download exceeded pinned size.");
                    output.write(buffer, 0, count);
                    digest.update(buffer, 0, count);
                    long now = System.nanoTime();
                    if (now - lastEvent > 100_000_000L) {
                        // 1.0 means validated and committed, not merely all bytes received.
                        progress.update(Math.min(0.999, (double) (completed + received) / TOTAL_BYTES));
                        lastEvent = now;
                    }
                }
                output.getFD().sync();
            }
            cancellation.check();
            if (received != expectedSize || !hex(digest.digest()).equals(expectedSha)) {
                throw new IOException("Model integrity check failed (SHA-256/size).");
            }
            // Same-directory rename is atomic on Android's filesystem. No archive extraction.
            if (!partial.renameTo(target)) throw new IOException("Cannot commit verified model file.");
        } finally {
            if (connection != null) connection.disconnect();
            cancellation.connection = null;
            if (partial.exists() && !partial.delete()) partial.deleteOnExit();
        }
    }

    private HttpsURLConnection connect(URL url, Cancellation cancellation) throws IOException {
        for (int redirects = 0; redirects <= 5; redirects++) {
            cancellation.check();
            String host = url.getHost();
            if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null
                    || !host.equals("chevoink.chevolink.com") || (url.getPort() != -1 && url.getPort() != 443)
                    || !url.getPath().startsWith("/voice/")) {
                throw new IOException("Refusing untrusted model download redirect.");
            }
            HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
            cancellation.connection = connection;
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(15000);
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("User-Agent", "ChevoinkSpeech/1.0.6");
            try {
                int code = connection.getResponseCode();
                if (code == 200) { cancellation.check(); return connection; }
                if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IOException("Model download redirect is missing its destination.");
                    url = new URL(url, location);
                } else {
                    throw new IOException("Model download failed with HTTP " + code + ".");
                }
            } catch (IOException | RuntimeException e) {
                connection.disconnect();
                throw e;
            }
            connection.disconnect();
            cancellation.connection = null;
        }
        throw new IOException("Too many model download redirects.");
    }

    static boolean valid(File file, long size, String hash, Cancellation cancellation) throws IOException {
        cancellation.check();
        if (!file.isFile() || file.length() != size) return false;
        MessageDigest digest = sha256();
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[65536];
            int count;
            while ((count = input.read(buffer)) != -1) {
                cancellation.check();
                digest.update(buffer, 0, count);
            }
        }
        return hex(digest.digest()).equals(hash);
    }

    /** Only delete this feature's six fixed files. Never traverse or recursively delete storage. */
    void delete() throws IOException {
        for (String name : new String[]{"model.int8.onnx", "tokens.txt", "silero_vad.onnx",
                "model.int8.onnx.part", "tokens.txt.part", "silero_vad.onnx.part"}) {
            File file = new File(directory, name);
            if (file.exists() && !file.delete()) throw new IOException("Cannot delete offline model file.");
        }
    }

    private static MessageDigest sha256() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return result.toString();
    }
}
