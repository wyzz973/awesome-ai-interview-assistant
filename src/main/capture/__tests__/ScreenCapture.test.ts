import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Display, NativeImage } from 'electron'
import type { StealthWindow } from '@main/window/StealthWindow'

const electronMocks = vi.hoisted(() => ({
  getSources: vi.fn(),
  getCursorScreenPoint: vi.fn(),
  getDisplayNearestPoint: vi.fn(),
}))

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}))

vi.mock('electron', () => ({
  desktopCapturer: {
    getSources: electronMocks.getSources,
  },
  screen: {
    getCursorScreenPoint: electronMocks.getCursorScreenPoint,
    getDisplayNearestPoint: electronMocks.getDisplayNearestPoint,
  },
}))

vi.mock('../../logger', () => ({
  getLogger: () => loggerMocks,
}))

import { ScreenCapture } from '../ScreenCapture'

function makeDisplay(overrides: Partial<Display> = {}): Display {
  return {
    id: 2,
    scaleFactor: 2,
    size: { width: 1512, height: 982 },
    ...overrides,
  } as Display
}

function makeImage(buffer: Buffer): NativeImage {
  return {
    toPNG: vi.fn(() => buffer),
    isEmpty: vi.fn(() => false),
  } as unknown as NativeImage
}

function makeStealthWindow(visible: boolean): {
  stealthWindow: StealthWindow
  hide: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
} {
  const hide = vi.fn()
  const show = vi.fn()
  const getWindow = vi.fn(() => ({ isVisible: () => visible }))

  return {
    stealthWindow: {
      hide,
      show,
      getWindow,
    } as unknown as StealthWindow,
    hide,
    show,
  }
}

describe('ScreenCapture', () => {
  beforeEach(() => {
    electronMocks.getSources.mockReset()
    electronMocks.getCursorScreenPoint.mockReset()
    electronMocks.getDisplayNearestPoint.mockReset()
    loggerMocks.debug.mockReset()
    loggerMocks.warn.mockReset()
    loggerMocks.info.mockReset()
    loggerMocks.error.mockReset()
  })

  it('captures current display nearest cursor and returns base64 image', async () => {
    const { stealthWindow, hide, show } = makeStealthWindow(true)
    const display = makeDisplay({ id: 7, scaleFactor: 2, size: { width: 1920, height: 1080 } })
    const pngBuffer = Buffer.from('png-data')

    electronMocks.getCursorScreenPoint.mockReturnValue({ x: 100, y: 80 })
    electronMocks.getDisplayNearestPoint.mockReturnValue(display)
    electronMocks.getSources.mockResolvedValue([
      {
        id: 'screen:7:0',
        display_id: '7',
        thumbnail: makeImage(pngBuffer),
      },
    ])

    const capture = new ScreenCapture(stealthWindow)
    const result = await capture.captureRegion()

    expect(hide).toHaveBeenCalledTimes(1)
    expect(show).toHaveBeenCalledTimes(1)
    expect(electronMocks.getSources).toHaveBeenCalledWith({
      types: ['screen'],
      thumbnailSize: { width: 3840, height: 2160 },
    })
    expect(result).toEqual({
      image: pngBuffer,
      imageBase64: pngBuffer.toString('base64'),
      region: { x: 0, y: 0, width: 1920, height: 1080 },
    })
  })

  it('falls back to first source when no matching display source exists', async () => {
    const { stealthWindow } = makeStealthWindow(true)
    const display = makeDisplay({ id: 999 })
    const first = Buffer.from('first')
    const second = Buffer.from('second')

    electronMocks.getCursorScreenPoint.mockReturnValue({ x: 10, y: 10 })
    electronMocks.getDisplayNearestPoint.mockReturnValue(display)
    electronMocks.getSources.mockResolvedValue([
      {
        id: 'screen:1:0',
        display_id: '1',
        thumbnail: makeImage(first),
      },
      {
        id: 'screen:2:0',
        display_id: '2',
        thumbnail: makeImage(second),
      },
    ])

    const capture = new ScreenCapture(stealthWindow)
    const result = await capture.captureRegion()

    expect(result?.imageBase64).toBe(first.toString('base64'))
    expect(loggerMocks.warn).toHaveBeenCalledTimes(1)
  })

  it('does not force show/hide when stealth window was already hidden', async () => {
    const { stealthWindow, hide, show } = makeStealthWindow(false)
    const display = makeDisplay()
    const png = Buffer.from('image')

    electronMocks.getCursorScreenPoint.mockReturnValue({ x: 0, y: 0 })
    electronMocks.getDisplayNearestPoint.mockReturnValue(display)
    electronMocks.getSources.mockResolvedValue([
      {
        id: 'screen:2:0',
        display_id: '2',
        thumbnail: makeImage(png),
      },
    ])

    const capture = new ScreenCapture(stealthWindow)
    await capture.captureRegion()

    expect(hide).not.toHaveBeenCalled()
    expect(show).not.toHaveBeenCalled()
  })

  it('throws when no screen source is available', async () => {
    const { stealthWindow, show } = makeStealthWindow(true)
    const display = makeDisplay({ id: 5 })

    electronMocks.getCursorScreenPoint.mockReturnValue({ x: 0, y: 0 })
    electronMocks.getDisplayNearestPoint.mockReturnValue(display)
    electronMocks.getSources.mockResolvedValue([])

    const capture = new ScreenCapture(stealthWindow)
    await expect(capture.captureRegion()).rejects.toThrow('No screen source available')
    expect(show).toHaveBeenCalledTimes(1)
  })
})
