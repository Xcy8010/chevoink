# Native speech assets — handoff only, no deployment performed

Deploy `native-sensevoice-1.13.7/` to `/var/www/chevoink/voice/native-sensevoice-1.13.7/`.
The URL prefix is `https://chevoink.chevolink.com/voice/native-sensevoice-1.13.7/`.
Deploy the complete `licenses/` subdirectory alongside the raw model files, not
only the ONNX/tokens. It contains full upstream model/runtime licenses and attribution;
SHA256SUMS validates all three binary resources and all six attribution files.
This folder MUST stay outside `/opt/chevoink/app/current` and `/var/www/chevoink/current`.
Do not run the repository's generic `deploy:prod` to publish Android or model files.

The supplied manifest and SHA256SUMS pin all three files (ASR model, tokens, Silero VAD). Use
`scripts/stage-native-speech-model.ps1 -ModelDirectory <existing verified model directory>`
to stage binaries without downloading or modifying originals. All three files are now
staged and verified locally, extracted from the engine agent's pinned WASM data package.
They are NOT deployed. `download()` needs the public URLs to be populated by main.

Main's existing TLS nginx server needs an independent prefix location similar to:

```nginx
location ^~ /voice/ {
    alias /var/www/chevoink/voice/;
    autoindex off;
    add_header X-Content-Type-Options nosniff always;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

This is a review snippet, not an executed command. Do not route missing assets to the
SPA index.html. No cookies, authorization, redirects, or CORS relaxation are needed
by the native downloader. Preserve Content-Length and serve the exact verified bytes.
Keep all released versioned model directories available to installed APKs.

Before releasing the APK, main should verify HTTP 200, byte lengths and SHA-256 for
all three public URLs, plus `sha256sum -c SHA256SUMS` in the deployed model directory.
Then test a user-initiated phone download, cancellation, retry, airplane-mode
recognition, deletion and re-download. Model distribution terms must be reviewed
separately from the Apache-2.0 sherpa-onnx SDK license.

Native and WASM caches are separate. Prefer the native engine on Android and do not
download both models automatically. Folder 1.13.7 refers to the native SDK version;
the immutable model itself is SenseVoice 2024-07-17.
