import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

type Packet = { type: string; samples?: Float32Array }
type Processor = {
  port: { onmessage: (event: { data: { type: string } }) => void }
  process: (inputs: Float32Array[][]) => boolean
}

function worklet(sampleRate = 48000) {
  const packets: Packet[] = []
  let ProcessorClass!: new () => Processor
  class Base {
    port = { postMessage: (packet: Packet) => packets.push(packet), onmessage: null }
  }
  runInNewContext(readFileSync(resolve('public/voice-capture-worklet.js'), 'utf8'), {
    AudioWorkletProcessor: Base, sampleRate, Float32Array,
    registerProcessor: (name: string, value: typeof ProcessorClass) => {
      expect(name).toBe('voice-capture')
      ProcessorClass = value
    },
  })
  return { processor: new ProcessorClass(), packets }
}

describe('voice capture AudioWorklet', () => {
  it('downmixes actual input and flushes a partial block before stop acknowledgment', () => {
    const { processor, packets } = worklet()
    processor.process([[new Float32Array([1, 0.4]), new Float32Array([-1, 0.2])]])
    expect(packets).toHaveLength(0)
    processor.port.onmessage({ data: { type: 'stop' } })
    expect(packets.map((packet) => packet.type)).toEqual(['pcm', 'stopped'])
    expect(packets[0].samples![0]).toBe(0)
    expect(packets[0].samples![1]).toBeCloseTo(0.3)
    expect(processor.process([])).toBe(false)
  })

  it('caps exact audio duration at sixty seconds even if main thread timers are throttled', () => {
    const { processor, packets } = worklet(100)
    processor.process([[new Float32Array(6500).fill(0.5)]])
    expect(packets.filter((packet) => packet.type === 'pcm').reduce((length, packet) => length + packet.samples!.length, 0)).toBe(6000)
    expect(packets.at(-1)?.type).toBe('stopped')
    processor.port.onmessage({ data: { type: 'stop' } })
    expect(packets.filter((packet) => packet.type === 'stopped')).toHaveLength(1)
  })
})
