import { describe, expect, it } from 'vitest'
import { pickSystemAudioInputDevice, type AudioInputDeviceLike } from '../audioDeviceSelection'

function input(deviceId: string, label: string): AudioInputDeviceLike {
  return { deviceId, kind: 'audioinput', label }
}

describe('pickSystemAudioInputDevice', () => {
  it('prefers blackhole-like devices', () => {
    const devices = [
      input('default', 'MacBook Pro Microphone'),
      input('abc', 'BlackHole 2ch'),
    ]
    const picked = pickSystemAudioInputDevice(devices)
    expect(picked?.deviceId).toBe('abc')
  })

  it('does not choose mic-only set', () => {
    const devices = [
      input('default', 'MacBook Pro Microphone'),
      input('xyz', '外接麦克风'),
    ]
    const picked = pickSystemAudioInputDevice(devices)
    expect(picked).toBeNull()
  })

  it('falls back to a single non-special input when blackhole is installed', () => {
    const devices = [
      input('default', ''),
      input('abcd', ''),
    ]
    const picked = pickSystemAudioInputDevice(devices, { blackHoleInstalled: true })
    expect(picked?.deviceId).toBe('abcd')
  })
})

