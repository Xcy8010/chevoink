/* global AudioWorkletProcessor, registerProcessor, sampleRate */
// Same-origin AudioWorklet: raw mono PCM only; no encoder, network, or audible output.
class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(2048)
    this.offset = 0
    this.frames = 0
    this.stopped = false
    this.port.onmessage = (event) => {
      if (event.data?.type === 'stop') this.finish()
    }
  }

  flush() {
    if (!this.offset) return
    const samples = this.buffer.slice(0, this.offset)
    this.port.postMessage({ type: 'pcm', samples }, [samples.buffer])
    this.offset = 0
  }

  finish() {
    if (this.stopped) return
    this.stopped = true
    this.flush()
    this.port.postMessage({ type: 'stopped' })
  }

  process(inputs) {
    if (this.stopped) return false
    const channels = inputs[0]
    if (!channels?.length) return true
    for (let frame = 0; frame < channels[0].length; frame += 1) {
      let value = 0
      for (const channel of channels) value += channel[frame] || 0
      this.buffer[this.offset++] = value / channels.length
      this.frames += 1
      if (this.offset === this.buffer.length) this.flush()
      if (this.frames >= Math.floor(sampleRate * 60)) { this.finish(); return false }
    }
    return true
  }
}

registerProcessor('voice-capture', VoiceCaptureProcessor)
