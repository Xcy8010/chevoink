# 设备端离线语音第三方声明

本项目的设备端识别使用 **SenseVoiceSmall**（FunAudioLLM / Alibaba Group），经 **k2-fsa / sherpa-onnx** 转换并以单线程 SIMD WebAssembly 运行。录音只在用户设备处理，不发送给上述模型作者、HuggingFace 或云识别服务。

## 固定来源

- 官方预构建：[sherpa-onnx v1.12.26 release](https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.12.26)，`sherpa-onnx-wasm-simd-1.12.26-vad-asr-zh_en_ja_ko_cantonese-sense_voice_small.tar.bz2`，165753553 bytes，SHA-256 `d7b05ed73a1c26cafc35d6ac956968b1662e08af24342a1608ed6b5ef7c1f440`。包内原始 JS/WASM/data 未修改；项目 worker 是独立适配层。
- 转换模型：[k2-fsa 维护者 csukuangfj 的固定模型 revision](https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/tree/2365baeacb507f821a0c8120fcee3d484dba7a07)。模型名称保留为 `SenseVoiceSmall / sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17`。
- [官方 SenseVoiceSmall 模型](https://huggingface.co/FunAudioLLM/SenseVoiceSmall)；代码许可不等同于模型权重许可。

## 许可副本与作者信息

- **sherpa-onnx**：k2-fsa contributors，Apache-2.0。[固定源码许可](https://github.com/k2-fsa/sherpa-onnx/blob/174f8684fa9a0e188ba9b9f3ac04b17cfd44379b/LICENSE)。同源完整副本：[/voice/sensevoice-1.12.26/licenses/SHERPA_ONNX_LICENSE](/voice/sensevoice-1.12.26/licenses/SHERPA_ONNX_LICENSE)。SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`。
- **SenseVoiceSmall 权重**：Alibaba Group / FunAudioLLM；附 **FunASR Model Open Source License Agreement v1.1**，固定 revision `58830eca4012644aac0c3218c3ccc7d98f003fda`。[完整源文](https://github.com/modelscope/FunASR/blob/58830eca4012644aac0c3218c3ccc7d98f003fda/MODEL_LICENSE)，同源副本：[/voice/sensevoice-1.12.26/licenses/MODEL_LICENSE](/voice/sensevoice-1.12.26/licenses/MODEL_LICENSE)。SHA-256 `7dba975a2069691db4992b0592d70828b330d2f8a30a71450f4e152a554e84f8`。分发时保留模型名称、作者和许可全文；不要把权重标注为 Apache-2.0。
- **转换模型原始 LICENSE**：71-byte 上游转引文件一并保留：[/voice/sensevoice-1.12.26/licenses/CONVERSION_LICENSE](/voice/sensevoice-1.12.26/licenses/CONVERSION_LICENSE)，SHA-256 `221c6df10b0931a5629adad671ea48fb7747e034c414b6d2bfa275bc3dd4ea17`。
- **Silero VAD**：Silero Team，MIT；用于本地语音活动检测。许可固定于上游 v5.1 commit `84768cefdf5a3852400e9d8237f7315d14b64a08`（此处固定许可来源，不以此推断包内模型版本）。[完整源文](https://github.com/snakers4/silero-vad/blob/84768cefdf5a3852400e9d8237f7315d14b64a08/LICENSE)，同源全文：[/voice/sensevoice-1.12.26/licenses/SILERO_VAD_LICENSE](/voice/sensevoice-1.12.26/licenses/SILERO_VAD_LICENSE)，1075 bytes，SHA-256 `2e63e9a38b6e8fc0c7bc37ce174caca1862870856c6daf5697cfb785e925520b`。
- **ONNX Runtime 1.17.1**：Microsoft Corporation，MIT。[该 sherpa-onnx 构建的固定 WASM 依赖配置](https://github.com/k2-fsa/sherpa-onnx/blob/174f8684fa9a0e188ba9b9f3ac04b17cfd44379b/cmake/onnxruntime-wasm-simd.cmake)指定 `onnxruntime-wasm-static_lib-simd-1.17.1.zip`，归档 SHA-256 `8f07778e4233cf5a61a9d0795d90c5497177fbe8a46b701fda2d8d4e2b11cef8`。许可证固定于 ONNX Runtime v1.17.1 commit `8f5c79cb63f09ef1302e85081093a3fe4da1bc7d`：[完整源文](https://github.com/microsoft/onnxruntime/blob/8f5c79cb63f09ef1302e85081093a3fe4da1bc7d/LICENSE)，同源全文：[/voice/sensevoice-1.12.26/licenses/ONNXRUNTIME_LICENSE](/voice/sensevoice-1.12.26/licenses/ONNXRUNTIME_LICENSE)，1073 bytes，SHA-256 `2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c`。

完整文件来源、长度及 SHA-256 固定于 `src/features/studio/agent/voice/voice-manifest.ts`。`node scripts/prepare-voice-assets.mjs --public` 校验下载后生成同源 `licenses/` 目录与 `manifest.json`；部署时必须与二进制一起复制，不要只复制 `.data/.wasm`。

五份许可全文均列入运行时 `files` 清单，因此自动参与下载、完整校验和 readiness fingerprint；旧缓存标记不会被当作包含许可的完整缓存。只补齐小型许可文件，不需要重新下载已通过校验的模型。模型/runtime 252043452 bytes，加许可18883 bytes，总下载量 **252062335 bytes**。原始 JS/WASM/data hashes 与识别逻辑不变。

测试使用固定模型仓库公开 `test_wavs/zh.wav`、`test_wavs/en.wav`；测试 WAV 不纳入产品下载包。本文是分发归属与来源记录，不替代各上游许可全文。
