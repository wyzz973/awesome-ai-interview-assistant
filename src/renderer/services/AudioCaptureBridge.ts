import { getLogger } from '../utils/logger'
import { pickSystemAudioInputDevice, type AudioInputDeviceLike } from './audioDeviceSelection'

const log = getLogger('AudioCaptureBridge')
const PCM_CHUNK_SIZE = 4096
const TARGET_SAMPLE_RATE = 16000

export interface AudioCaptureStartResult {
  systemAudioEnabled: boolean
  warnings: string[]
}

interface PCMNodeChain {
  stream: MediaStream
  source: MediaStreamAudioSourceNode
  processor: ScriptProcessorNode
  muteGain: GainNode
}

export class AudioCaptureBridge {
  private audioContext: AudioContext | null = null
  private micChain: PCMNodeChain | null = null
  private systemChain: PCMNodeChain | null = null
  private running = false

  async start(): Promise<AudioCaptureStartResult> {
    if (this.running) {
      return { systemAudioEnabled: !!this.systemChain, warnings: [] }
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      throw new Error('当前环境不支持 getUserMedia')
    }
    if (typeof AudioContext === 'undefined') throw new Error('当前环境不支持 AudioContext')
    if (typeof window.AudioContext.prototype.createScriptProcessor !== 'function') {
      throw new Error('当前环境不支持 ScriptProcessorNode')
    }

    const warnings: string[] = []
    this.audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
    await this.audioContext.resume()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.micChain = this.createPCMChain(stream, (chunk) => {
        window.api.asrPushMicAudio(chunk)
      })
    } catch (err) {
      this.stop()
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`麦克风采集失败：${msg}`)
    }

    let systemAudioEnabled = false
    try {
      const blackHoleInstalled = await this.isBlackHoleInstalled()
      const systemInput = await this.findSystemAudioInputDevice(blackHoleInstalled)
      if (!systemInput) {
        if (blackHoleInstalled) {
          warnings.push('检测到 BlackHole 已安装，但未找到可用系统音频输入设备（请在系统里把输出路由到 BlackHole/多输出设备）')
        } else {
          warnings.push('未检测到 BlackHole，当前仅采集麦克风')
        }
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: systemInput.deviceId },
          },
        })
        this.systemChain = this.createPCMChain(stream, (chunk) => {
          window.api.asrPushSystemAudio(chunk)
        })
        systemAudioEnabled = true
        log.info('已启用系统音频输入设备', {
          deviceId: systemInput.deviceId,
          label: systemInput.label || '(hidden)',
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      warnings.push(`系统音频采集失败：${msg}，当前仅采集麦克风`)
      this.destroyPCMChain(this.systemChain)
      this.systemChain = null
    }

    this.running = true
    log.info('renderer 音频采集已启动', {
      systemAudioEnabled,
      sampleRate: this.audioContext.sampleRate,
    })
    return { systemAudioEnabled, warnings }
  }

  stop(): void {
    if (!this.running && !this.micChain && !this.systemChain && !this.audioContext) return

    this.destroyPCMChain(this.micChain)
    this.destroyPCMChain(this.systemChain)
    this.micChain = null
    this.systemChain = null

    const ctx = this.audioContext
    this.audioContext = null
    if (ctx) {
      void ctx.close().catch(() => {})
    }

    this.running = false
    log.info('renderer 音频采集已停止')
  }

  private createPCMChain(
    stream: MediaStream,
    onChunk: (chunk: Uint8Array) => void,
  ): PCMNodeChain {
    if (!this.audioContext) throw new Error('audio context not initialized')

    const source = this.audioContext.createMediaStreamSource(stream)
    const processor = this.audioContext.createScriptProcessor(PCM_CHUNK_SIZE, 1, 1)
    const muteGain = this.audioContext.createGain()
    muteGain.gain.value = 0

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0)
      if (!input || input.length === 0) return

      const maybeResampled = this.audioContext?.sampleRate === TARGET_SAMPLE_RATE
        ? input
        : resampleLinear(input, this.audioContext?.sampleRate ?? TARGET_SAMPLE_RATE, TARGET_SAMPLE_RATE)
      const pcmChunk = float32ToPCM16(maybeResampled)
      if (pcmChunk.byteLength > 0) onChunk(pcmChunk)
    }

    source.connect(processor)
    processor.connect(muteGain)
    muteGain.connect(this.audioContext.destination)

    return { stream, source, processor, muteGain }
  }

  private async findSystemAudioInputDevice(blackHoleInstalled: boolean): Promise<AudioInputDeviceLike | null> {
    if (typeof navigator.mediaDevices.enumerateDevices !== 'function') {
      return null
    }

    const devices = await navigator.mediaDevices.enumerateDevices()
    const inputs = devices.filter((device) => device.kind === 'audioinput')
    log.debug('枚举到音频输入设备', {
      count: inputs.length,
      devices: inputs.map((d) => ({
        id: d.deviceId,
        label: d.label || '(hidden)',
      })),
    })

    return pickSystemAudioInputDevice(devices, { blackHoleInstalled })
  }

  private async isBlackHoleInstalled(): Promise<boolean> {
    try {
      const result = await window.api.audioCheckBlackhole()
      return !!result?.available
    } catch {
      return false
    }
  }

  private destroyPCMChain(chain: PCMNodeChain | null): void {
    if (!chain) return

    chain.processor.onaudioprocess = null
    chain.source.disconnect()
    chain.processor.disconnect()
    chain.muteGain.disconnect()
    for (const track of chain.stream.getTracks()) {
      track.stop()
    }
  }
}

function float32ToPCM16(input: Float32Array): Uint8Array {
  const output = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return new Uint8Array(output.buffer)
}

function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate <= 0 || toRate <= 0 || input.length === 0 || fromRate === toRate) {
    return input
  }

  const ratio = fromRate / toRate
  const newLength = Math.max(1, Math.round(input.length / ratio))
  const output = new Float32Array(newLength)

  for (let i = 0; i < newLength; i++) {
    const sourceIndex = i * ratio
    const index0 = Math.floor(sourceIndex)
    const index1 = Math.min(index0 + 1, input.length - 1)
    const frac = sourceIndex - index0
    output[i] = input[index0] * (1 - frac) + input[index1] * frac
  }

  return output
}
