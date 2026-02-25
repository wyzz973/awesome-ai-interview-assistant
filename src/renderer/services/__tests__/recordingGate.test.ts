import { describe, it, expect } from 'vitest'
import { shouldBlockInterviewStart } from '../recordingGate'
import type { HealthSnapshot } from '@shared/types/health'

function createSnapshot(overrides?: Partial<HealthSnapshot>): HealthSnapshot {
  return {
    timestamp: Date.now(),
    recording: false,
    checks: {
      audio: { state: 'ok', message: 'ok', latencyMs: null, updatedAt: null },
      asr: { state: 'ok', message: 'ok', latencyMs: null, updatedAt: null },
      llm: { state: 'ok', message: 'ok', latencyMs: null, updatedAt: null },
    },
    gate: { mode: 'strict', blocked: false, reasons: [] },
    heartbeat: { lastEventAt: null, secondsSinceEvent: null },
    ...overrides,
  }
}

describe('shouldBlockInterviewStart', () => {
  it('blocks when strict mode reports blocked gate', () => {
    const snapshot = createSnapshot({
      gate: {
        mode: 'strict',
        blocked: true,
        reasons: ['LLM 未配置'],
      },
    })

    const result = shouldBlockInterviewStart(snapshot)
    expect(result.blocked).toBe(true)
    expect(result.reason).toContain('LLM 未配置')
  })

  it('does not block when lenient mode', () => {
    const snapshot = createSnapshot({
      gate: {
        mode: 'lenient',
        blocked: false,
        reasons: ['LLM 未配置'],
      },
    })

    const result = shouldBlockInterviewStart(snapshot)
    expect(result.blocked).toBe(false)
  })

  it('does not block without snapshot', () => {
    const result = shouldBlockInterviewStart(null)
    expect(result.blocked).toBe(false)
  })
})
