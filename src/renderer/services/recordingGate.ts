import type { HealthSnapshot } from '@shared/types/health'

export interface RecordingGateDecision {
  blocked: boolean
  reason: string
}

export function shouldBlockInterviewStart(snapshot: HealthSnapshot | null): RecordingGateDecision {
  if (!snapshot) {
    return { blocked: false, reason: '' }
  }
  if (snapshot.gate.mode !== 'strict') {
    return { blocked: false, reason: '' }
  }
  if (!snapshot.gate.blocked) {
    return { blocked: false, reason: '' }
  }
  return {
    blocked: true,
    reason: snapshot.gate.reasons[0] || '链路健康检查未通过',
  }
}
