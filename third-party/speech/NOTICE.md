# Offline speech attribution

These complete license snapshots accompany both the native APK (`assets/speech/`)
and raw model distribution (`licenses/` beside the models). Retain the whole
directory when redistributing the resources. The application does not claim
authorship of any third-party model or runtime. Model names are preserved here
and in manifest.json even where runtime file names differ.

## SenseVoiceSmall / FunASR model weights

Authors: FunAudioLLM / Alibaba Group; copyright as stated in MODEL_LICENSE.
Model: SenseVoiceSmall, converted ONNX SenseVoice zh-en-ja-ko-yue 2024-07-17,
`model.int8.onnx` with `tokens.txt`. Upstream conversion by csukuangfj / sherpa-onnx.

- Original: https://huggingface.co/FunAudioLLM/SenseVoiceSmall
- Project: https://github.com/FunAudioLLM/SenseVoice
- Converted files: https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/tree/2365baeacb507f821a0c8120fcee3d484dba7a07
- Complete license: MODEL_LICENSE (FunASR Model Open Source License Agreement1.1)
- License source: https://github.com/modelscope/FunASR/blob/04a6970746e4f117413aa8972adc359dff8f4d31/MODEL_LICENSE

Chevoink extracts the same ONNX/tokens bytes from the upstream Emscripten data
package without changing weights. SHA256 is recorded in the resource manifest.
The upstream WASM data filename `sense-voice.onnx` is distributed as
`model.int8.onnx` for the native wrapper. No model retraining is performed.

## sherpa-onnx 1.13.7

Authors: sherpa-onnx contributors, including Xiaomi Corporation.
Project: https://github.com/k2-fsa/sherpa-onnx/tree/v1.13.7
Official Android AAR is redistributed unchanged, checksum pinned in build.gradle.
Complete license: SHERPA-ONNX-LICENSE (Apache License2.0).

## Silero VAD

Copyright (c)2020-present Silero Team.
Project: https://github.com/snakers4/silero-vad
Model: Silero VAD, `silero_vad.onnx` (643854bytes, pinned SHA256 in manifest.json).
Extracted from the same upstream Emscripten package without altering model bytes.
Complete license: SILERO-LICENSE (MIT).
License source: https://github.com/snakers4/silero-vad/blob/867c2aa692646a1f1de3e94a15c9dd9f614c0acb/LICENSE

## ONNX Runtime 1.27.1

Copyright (c)Microsoft Corporation.
Project: https://github.com/microsoft/onnxruntime/tree/v1.27.1
Runtime supplied by the official sherpa-onnx Android AAR; the embedded version
string is1.27.1 in its four libonnxruntime.so ABI variants.
Complete license: ONNXRUNTIME-LICENSE (MIT).

The license bodies are complete upstream copies with LF line endings and a
normalized trailing newline, not paraphrases or replacements. SOURCES.json
records source URLs and the canonical checked-in SHA256 for reproducible staging.
These notices do not override the licenses or imply upstream endorsement.
