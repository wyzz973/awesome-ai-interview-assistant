import { describe, it, expect, vi } from 'vitest'
import { HealthMonitorService } from '../HealthMonitorService'

function createService(overrides?: Partial<ConstructorParameters<typeof HealthMonitorService>[0]>) {
  return new HealthMonitorService({
    getRecordingStatus: () => ({ isRecording: false, sessionId: null, asrRunning: false }),
    getRecordingGateMode: () => 'strict',
    checkBlackHole: async () => true,
    checkLLMReady: async () => true,
    checkASRReady: async () => true,
    ...overrides,
  })
}

describe('HealthMonitorService', () => {
  it('blocks start when strict mode has critical chain failure', async () => {
    const service = createService({
      checkLLMReady: async () => false,
      checkASRReady: async () => false,
    })

    const snapshot = await service.getSnapshot()

    expect(snapshot.gate.mode).toBe('strict')
    expect(snapshot.gate.blocked).toBe(true)
    expect(snapshot.gate.reasons.length).toBeGreaterThan(0)
  })

  it('does not block start when lenient mode has critical failure', async () => {
    const service = createService({
      getRecordingGateMode: () => 'lenient',
      checkLLMReady: async () => false,
      checkASRReady: async () => false,
    })

    const snapshot = await service.getSnapshot()

    expect(snapshot.gate.mode).toBe('lenient')
    expect(snapshot.gate.blocked).toBe(false)
  })

  it('records llm latency and marks warning on failure', async () => {
    const service = createService()
    service.recordLLMCall({ ok: false, latencyMs: 680, error: 'gateway timeout' })

    const snapshot = await service.getSnapshot()

    expect(snapshot.checks.llm.state).toBe('warn')
    expect(snapshot.checks.llm.latencyMs).toBe(680)
    expect(snapshot.checks.llm.message).toContain('gateway timeout')
  })

  it('records asr debug latency on response event', async () => {
    const service = createService()
    service.recordASRDebug({ stage: 'response', latencyMs: 210, status: 200 })

    const snapshot = await service.getSnapshot()

    expect(snapshot.checks.asr.latencyMs).toBe(210)
    expect(snapshot.checks.asr.state).toBe('ok')
  })

  it('updates heartbeat seconds from last activity', async () => {
    const service = createService()

    const now = Date.now()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    service.recordHeartbeat()
    vi.setSystemTime(now + 3000)

    const snapshot = await service.getSnapshot()

    expect(snapshot.heartbeat.secondsSinceEvent).toBe(3)
    vi.useRealTimers()
  })
})
