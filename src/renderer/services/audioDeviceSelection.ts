export interface AudioInputDeviceLike {
  deviceId: string
  kind: string
  label: string
}

export interface PickSystemAudioOptions {
  blackHoleInstalled?: boolean
}

const LOOPBACK_PATTERN = /(blackhole|loopback|soundflower|vb[-_\s]?cable|virtual\s*audio|todesk|iShowU)/i
const MIC_PATTERN = /(mic|microphone|麦克风|内建麦克风|built[-\s]?in\s*microphone|headset)/i

function isSpecialDeviceId(id: string): boolean {
  return id === 'default' || id === 'communications'
}

function scoreInputDevice(device: AudioInputDeviceLike): number {
  let score = 0
  const label = device.label ?? ''

  if (LOOPBACK_PATTERN.test(label)) score += 120
  if (/(aggregate|聚合|多输出|multi-output)/i.test(label)) score += 30
  if (MIC_PATTERN.test(label)) score -= 80
  if (isSpecialDeviceId(device.deviceId)) score -= 60
  if (!label.trim()) score -= 10

  return score
}

export function pickSystemAudioInputDevice(
  devices: AudioInputDeviceLike[],
  options?: PickSystemAudioOptions,
): AudioInputDeviceLike | null {
  const inputs = devices.filter((d) => d.kind === 'audioinput')
  if (inputs.length === 0) return null

  const scored = inputs
    .map((device) => ({ device, score: scoreInputDevice(device) }))
    .sort((a, b) => b.score - a.score)

  if (scored[0] && scored[0].score > 0) {
    return scored[0].device
  }

  // 兜底：若已检测到 BlackHole 已安装，但浏览器 label 被隐藏，
  // 尝试选择唯一的非 default/communications 输入设备。
  if (options?.blackHoleInstalled) {
    const nonSpecial = inputs.filter((d) => !isSpecialDeviceId(d.deviceId))
    if (nonSpecial.length === 1) {
      return nonSpecial[0]
    }
  }

  return null
}

