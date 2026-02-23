import { getLogger } from '../utils/logger'
import { pickSystemAudioInputDevice, type AudioInputDeviceLike } from './audioDeviceSelection'

const log = getLogger('recordingPreflight')

export interface RecordingPreflightReport {
  blackHoleInstalled: boolean
  systemInputLabel: string | null
  inputDeviceCount: number
  dualChannelReady: boolean
  blockingReason: string | null
  warnings: string[]
}

function toInputLike(device: MediaDeviceInfo): AudioInputDeviceLike {
  return {
    deviceId: device.deviceId,
    kind: device.kind,
    label: device.label,
  }
}

async function ensureAudioLabelAccess(): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return '当前环境不支持麦克风访问'
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    for (const track of stream.getTracks()) {
      track.stop()
    }
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

export async function runRecordingPreflight(): Promise<RecordingPreflightReport> {
  let blackHoleInstalled = false
  const warnings: string[] = []

  try {
    const result = await window.api?.audioCheckBlackhole?.()
    blackHoleInstalled = !!result?.available
  } catch (err) {
    log.warn('检查 BlackHole 状态失败', err)
  }

  const permissionError = await ensureAudioLabelAccess()
  if (permissionError) {
    warnings.push(`麦克风权限检查失败：${permissionError}`)
  }

  let devices: MediaDeviceInfo[] = []
  try {
    devices = (await navigator.mediaDevices?.enumerateDevices?.()) ?? []
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    warnings.push(`音频设备枚举失败：${msg}`)
  }

  const inputs = devices.filter((device) => device.kind === 'audioinput')
  const systemInput = pickSystemAudioInputDevice(
    devices.map(toInputLike),
    { blackHoleInstalled },
  )

  if (!blackHoleInstalled) {
    warnings.push('未检测到 BlackHole 驱动，系统音频通常无法被采集')
  }
  if (blackHoleInstalled && !systemInput) {
    warnings.push('检测到 BlackHole 已安装，但未找到可用系统音频输入设备（请确认系统输出已路由到 BlackHole 或多输出设备）')
  }

  const blockingReason = !blackHoleInstalled
    ? '未检测到 BlackHole，无法稳定采集面试官声道'
    : !systemInput
      ? '未找到可用系统音频输入设备，无法区分“我”和“面试官”'
      : null

  return {
    blackHoleInstalled,
    systemInputLabel: systemInput?.label || null,
    inputDeviceCount: inputs.length,
    dualChannelReady: !blockingReason,
    blockingReason,
    warnings,
  }
}

export function confirmRecordingWithPreflight(report: RecordingPreflightReport): boolean {
  if (!report.dualChannelReady) {
    const lines = [
      '录音前自检未通过（会议模式必须双声道）：',
      `• BlackHole: ${report.blackHoleInstalled ? '已检测到' : '未检测到'}`,
      `• 系统音频输入: ${report.systemInputLabel || '未找到'}`,
      `• 可见输入设备数量: ${report.inputDeviceCount}`,
      '',
      `原因：${report.blockingReason ?? '系统音频链路不可用'}`,
      '',
      '请先完成系统音频路由后再开始面试。',
    ]
    window.alert(lines.join('\n'))
    return false
  }
  if (report.warnings.length === 0) return true

  const lines = [
    '录音前自检结果：',
    `• BlackHole: ${report.blackHoleInstalled ? '已检测到' : '未检测到'}`,
    `• 系统音频输入: ${report.systemInputLabel || '未找到'}`,
    `• 可见输入设备数量: ${report.inputDeviceCount}`,
    '',
    ...report.warnings.map((warning) => `• ${warning}`),
    '',
    '继续录音可能只能识别“自己”声道。是否继续？',
  ]
  return window.confirm(lines.join('\n'))
}
