// Pinned official release; scripts/prepare-voice-assets.mjs parses this JSON literal.
export const VOICE_MANIFEST = {
  "version": "sensevoice-1.12.26",
  "baseUrl": "/voice/sensevoice-1.12.26/",
  "archiveUrl": "https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.26/sherpa-onnx-wasm-simd-1.12.26-vad-asr-zh_en_ja_ko_cantonese-sense_voice_small.tar.bz2",
  "archiveBytes": 165753553,
  "archiveSha256": "d7b05ed73a1c26cafc35d6ac956968b1662e08af24342a1608ed6b5ef7c1f440",
  "archiveRoot": "sherpa-onnx-wasm-simd-1.12.26-vad-asr-zh_en_ja_ko_cantonese-sense_voice_small",
  "licenses": [
    { "name": "SHERPA_ONNX_LICENSE", "bytes": 11358, "sha256": "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30", "url": "https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/174f8684fa9a0e188ba9b9f3ac04b17cfd44379b/LICENSE" },
    { "name": "MODEL_LICENSE", "bytes": 5306, "sha256": "7dba975a2069691db4992b0592d70828b330d2f8a30a71450f4e152a554e84f8", "url": "https://raw.githubusercontent.com/modelscope/FunASR/58830eca4012644aac0c3218c3ccc7d98f003fda/MODEL_LICENSE" },
    { "name": "CONVERSION_LICENSE", "bytes": 71, "sha256": "221c6df10b0931a5629adad671ea48fb7747e034c414b6d2bfa275bc3dd4ea17", "url": "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/2365baeacb507f821a0c8120fcee3d484dba7a07/LICENSE" },
    { "name": "SILERO_VAD_LICENSE", "bytes": 1075, "sha256": "2e63e9a38b6e8fc0c7bc37ce174caca1862870856c6daf5697cfb785e925520b", "url": "https://raw.githubusercontent.com/snakers4/silero-vad/84768cefdf5a3852400e9d8237f7315d14b64a08/LICENSE" },
    { "name": "ONNXRUNTIME_LICENSE", "bytes": 1073, "sha256": "2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c", "url": "https://raw.githubusercontent.com/microsoft/onnxruntime/8f5c79cb63f09ef1302e85081093a3fe4da1bc7d/LICENSE" }
  ],
  "files": [
    { "name": "licenses/SHERPA_ONNX_LICENSE", "bytes": 11358, "sha256": "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30", "type": "text/plain" },
    { "name": "licenses/MODEL_LICENSE", "bytes": 5306, "sha256": "7dba975a2069691db4992b0592d70828b330d2f8a30a71450f4e152a554e84f8", "type": "text/plain" },
    { "name": "licenses/CONVERSION_LICENSE", "bytes": 71, "sha256": "221c6df10b0931a5629adad671ea48fb7747e034c414b6d2bfa275bc3dd4ea17", "type": "text/plain" },
    { "name": "licenses/SILERO_VAD_LICENSE", "bytes": 1075, "sha256": "2e63e9a38b6e8fc0c7bc37ce174caca1862870856c6daf5697cfb785e925520b", "type": "text/plain" },
    { "name": "licenses/ONNXRUNTIME_LICENSE", "bytes": 1073, "sha256": "2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c", "type": "text/plain" },
    { "name": "sherpa-onnx-vad.js", "bytes": 7764, "sha256": "ca2b0844d1cfd375cbb7faba206e456c5140561578b67f5fc6e7510d09e75510", "type": "text/javascript" },
    { "name": "sherpa-onnx-asr.js", "bytes": 46198, "sha256": "411aab2cf1bff663e7d8693940d220f43cb3817b966a94ebebe9cb5e3d9d4fb6", "type": "text/javascript" },
    { "name": "sherpa-onnx-wasm-main-vad-asr.js", "bytes": 95318, "sha256": "8fb0b8834280b16697a08eaf5aef99becb84cd3b64ee0585e9485d01bfcb925a", "type": "text/javascript" },
    { "name": "sherpa-onnx-wasm-main-vad-asr.wasm", "bytes": 11700583, "sha256": "4e360528bb5be1f7f553ee29e7a2d7e1e09250f38f964b831cd14de3891e546e", "type": "application/wasm" },
    { "name": "sherpa-onnx-wasm-main-vad-asr.data", "bytes": 240193589, "sha256": "4c063aa4af215b02b6c127f3b7be8ae8405ff1285a18117e746f4abe53e5b3be", "type": "application/octet-stream" }
  ]
} as const;

export const VOICE_MODEL_DOWNLOAD_BYTES = VOICE_MANIFEST.files.reduce((sum, file) => sum + file.bytes, 0);
export const VOICE_CACHE_NAME = `chevoink-voice-${VOICE_MANIFEST.version}`;
