# Android 1.0.6 / code 9 — local release candidate

Source commit/push is authorized ONLY to `codex/android-offline-voice-1.0.6`.
No web source edit or server/Release deployment was performed. Wait for main's Web/CI gates.

## Authoritative prior release

- Live JSON rechecked: https://chevoink.chevolink.com/download/version.json
  declares `latestVersionName=1.0.5.1`, `latestVersionCode=8`, `mandatory=false`.
- GitHub release: https://github.com/Xcy8010/chevoink/releases/tag/v1.05.1
- Published asset `chevoink-v1.05.1.apk`: 9,909,002 bytes;
  SHA256 `9b2f2f8505c330dca2ea1801bed359843b75ba60895e03ab9c95d1926bbfc1fc`.
  Local baseline matched the GitHub API asset digest exactly. Website APK HEAD also
  returned 200 and the same byte length, last modified 2026-08-04 09:17:06 UTC.
  The website APK body was not downloaded independently.
- Old APK manifest: `com.chevoink.app`, `1.0.5.1`, code `8`; v2 signature verified.
- Prior and new signer SHA256:
  `558a98608deab1e68ee26c9188821766516b4aee59186a9beb371212787fb21d`.
- The old APK is preserved at `artifacts/android/previous-chevoink-v1.0.5.1.apk`.

## Candidate to hand to main

- `artifacts/android/chevoink-v1.0.6-61026b3c6974.apk`
- SHA256 `61026b3c697436766a8a49bb462579495506645e2caed83bdd073907edfdf285`
- Size: 136,763,408 bytes (four ABI universal APK; offline model not embedded).
- This candidate includes the complete licenses and a reproducibly rebuilt shell snapshot.
  It supersedes the previous `d4b4c651c248` candidate, which did not embed these licenses.
- Manifest: `com.chevoink.app`, `versionName=1.0.6`, `versionCode=9`.
- Source UA AND packaged assets config: `ChevoinkApp/1.0.6`.
- Do NOT use `artifacts/android/chevoink-v1.0.6.apk`: that retained intermediate
  build has the obsolete 30-second contract. Use the hash-qualified candidate above.
- Do not change live version.json or upload this APK until main's Web gates pass.

## Native bridge contract

Use `registerPlugin('ChevoinkSpeech')` from `@capacitor/core`; do not assume
`window.Capacitor.Plugins`. Native plugin is explicitly registered before Activity
`super.onCreate`, and recording permissions are restricted to the Chevoink HTTPS origin.

| Method/event | Contract |
| --- | --- |
| `status()` | `{ready,checking,sdkReady,busy,modelId,downloadBytes:240193589,pcmFormat:'float32le',sampleRate:16000,maxSeconds:60,maxSegmentSeconds:20}` |
| `download()` | Explicit user-initiated same-origin download, resolves `{ready:true}` only after pinned file SHA256/size verification |
| `progress` event | `{progress:0..1}`; listen before download, 1 means committed verified files |
| `transcribe({pcmBase64,sampleRate})` | Standard base64 of raw mono float32LE, finite samples [-1,1], 16000Hz only, max60s (960000 samples / 3840000 bytes / 5120000 base64 chars), resolves `{text}` |
| `cancel()` | Rejects active request `CANCELLED`; discards late result. Native JNI call cannot be interrupted mid-decode; busy remains until current <=20s segment finishes |
| `deleteModel()` | Cancels active op, waits for native return, releases model, deletes only six known model/partial files, resolves `{ready:false}` |

Actual Silero neural VAD uses 512-sample windows and maxSpeechDuration19.5s, with
an additional hard <=320000-sample guard on every ASR stream. Segments are decoded
serially on one worker, then joined with newlines, without text deduplication.
Silence produces empty text. No cloud recognition, audio upload or PCM persistence.
Status checks installed model hashes asynchronously on plugin load (`checking=true`
until done). `ready` means SDK loaded and model files verified, not proof of a
successful prior inference; recognizer is loaded lazily on the first speech segment.

Errors: `INVALID_PCM`, `BUSY`, `MODEL_NOT_READY`, `CANCELLED`, `SDK_UNAVAILABLE`,
`DOWNLOAD_FAILED`, `TRANSCRIBE_FAILED`, `OUT_OF_MEMORY`, `DELETE_FAILED`,
`UNTRUSTED_ORIGIN`, `UNAVAILABLE`.

## Model assets / release gates

- Full assets + manifest + SHA256SUMS: `release/voice/native-sensevoice-1.13.7/`.
- All three files verified, total240193589bytes, extracted from the existing
  WASM .data (source SHA2564c063aa4af215b02b6c127f3b7be8ae8405ff1285a18117e746f4abe53e5b3be).
- Full MODEL_LICENSE, SHERPA-ONNX-LICENSE, SILERO-LICENSE, ONNXRUNTIME-LICENSE,
  NOTICE.md and pinned SOURCES.json are in the raw resource `licenses/` directory
  and APK `assets/speech/`. All9 model/attribution checksums pass; all6 packaged
  attribution files were verified byte-for-byte against checked-in source.
- Deploy independently to `/var/www/chevoink/voice/native-sensevoice-1.13.7/`.
  Native URLs are `https://chevoink.chevolink.com/voice/native-sensevoice-1.13.7/`.
- Native downloader rejects cross-origin redirects, validates HTTPS+size+SHA256,
  stages in no-backup app-private storage, and never downloads automatically.
- Native and WASM caches are distinct; prefer native on Android to avoid double download.
- Model license is NOT automatically Apache2 because sherpa-onnx is Apache2.
  SenseVoiceSmall model card identifies the separate FunASR model license:
  https://huggingface.co/FunAudioLLM/SenseVoiceSmall
  https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE
  Main must review terms and preserve model/source/author attribution before distribution.

## Verification completed and not completed

Passed: Java debug/release compilation, 18 JVM unit tests (17 feature tests + 1
existing), release assembly, APK signature verification and old cert comparison,
APK manifest and packaged UA check, zipalign `-c -P 16 4`, all8 arm64/x86_64 AAR
native shared libraries' ELF PT_LOAD alignment >=16KB, `git diff --check`.

Not tested: real Android JNI model initialization/recognition accuracy, microphone
permission UX, device memory/latency, actual download/cancel/delete/retry on device,
60-second utterance continuity, airplane-mode recording, background lifecycle,
upgrade installation from1.0.5.1. No adb device is connected. These remain release
acceptance gates; build+unit tests are not a substitute for a device test.

## Repository and safe local build

Initial `git status --short --branch`: clean `master`, HEAD781af66 (1.0.3/code4).
Remote fetch/push `git@github.com:Xcy8010/chevoink.git`. After authorized `git fetch
origin`, `origin/android-shell` is c16f3ac (published1.0.5.1/code8), matching the
local published baseline. The authorized branch is directly based on c16f3ac,
not on old master's unrelated history. No main/android-shell remote write is authorized.

To avoid regressing the published offline error overlay, MainActivity, strings.xml,
layout_offline.xml and ic_offline.xml were restored through apply_patch from that
local published-version baseline, then native registration/security was added.
Initial user-dirty was absent; no unrelated files were read or changed. No web
source was changed. The final source-preparation script rebuilt the unchanged
shell web snapshot and ran Capacitor sync, regenerating ignored Android assets
and validating reproducibility. Source and regenerated packaged UA both match.

The COMPLETE master-to-published delta consists of exactly six files: build.gradle,
MainActivity.java, ic_offline.xml, layout_offline.xml, strings.xml, capacitor.config.ts.
All six are retained: three resource contents are identical to published (only the
layout/vector terminal newline differs); MainActivity only adds speech registration
and guarded capture; version/signing changes are intentional. No published files
are deleted and no web/API/prisma source appears in the staged delta.

Signing configuration `android/keystore.properties` and its resolved
`android/chevoink-release.keystore` exist, fields non-empty, ignored/untracked.
Passwords/private key were never printed. Release no longer falls back to debug.
Release preflight verifies signing configuration, SDK hash, source/packaged UA,
and versionCode > published8. `libs/sherpa-onnx-1.13.7.aar` is pinned to upstream
SHA256c4ef49e309f24fcee5c106b8a279481aaecaabb078cd37b2cd6e9a62cc8a73c8.

Environment: JDK21.0.10; AGP8.13.0; Gradle8.14.3; compileSdk36/minSdk24/targetSdk35;
SDK build-tools35.0.0,36.0.0,36.1.0; NDK28.2.13676358; CMake3.22.1; Node24.12.0.
adb is installed under ANDROID_HOME/platform-tools but not on PATH. sdkmanager
command-line-tools is absent; it was not needed for the cached build.

Local-only commands (PowerShell, run from this repository):

```powershell
./scripts/prepare-android-source.ps1 -InstallDependencies # clean checkout; npm ci, AAR/license checks, build+sync
./scripts/build-android-release.ps1 -GradleCommand "$env:USERPROFILE/.gradle/wrapper/dists/gradle-8.14.3-all/cbf6zifq8xavouihta8md72jo/gradle-8.14.3/bin/gradle.bat"
```

For model staging use `node scripts/stage-native-from-wasm.mjs <absolute .data path>`
or `scripts/stage-native-speech-model.ps1 -ModelDirectory <existing verified files>`.
Both validate pinned model hashes and stage complete checked-in licenses without
network, credentials or writes to the web project. Run `node scripts/stage-speech-licenses.mjs
--check` for a non-mutating license integrity check. The AAR preparer fetches only
the pinned ~49MB build dependency if absent, and verifies SHA256 before use.

Script defaults to `--offline`, preserves old APK, tests, builds, checks signature,
version and ZIP alignment, then copies a hash-qualified handoff APK. It neither
deploys nor pushes. Using the already cached Gradle avoids downloading the configured
Tencent `gradle-8.14.3-all.zip` wrapper distribution.

Existing `scripts/deploy-production.ps1` and `deploy/deploy-production.sh` deploy
the web app, include remote deletion and migrations, and are NOT Android release
scripts. `scripts/push-to-github.ps1` stages all files and defaults to main; do not
run it for this handoff. Neither script was executed.
