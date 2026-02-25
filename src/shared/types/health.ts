import type { RecordingGateMode } from './config'

export type HealthState = 'ok' | 'warn' | 'error' | 'unknown'

export type HealthIssueCode =
  | 'audio-blackhole-missing'
  | 'audio-chain-unavailable'
  | 'asr-not-configured'
  | 'asr-not-running'
  | 'asr-error'
  | 'llm-not-configured'
  | 'llm-error'
  | 'heartbeat-stale'
  | 'recording-error'

export interface HealthLatency {
  latencyMs: number | null
  updatedAt: number | null
}

export interface HealthCheck {
  state: HealthState
  message: string
  issueCode?: HealthIssueCode
  latencyMs: number | null
  updatedAt: number | null
}

export interface HealthGate {
  mode: RecordingGateMode
  blocked: boolean
  reasons: string[]
}

export interface HealthHeartbeat {
  lastEventAt: number | null
  secondsSinceEvent: number | null
}

export interface HealthSnapshot {
  timestamp: number
  recording: boolean
  checks: {
    audio: HealthCheck
    asr: HealthCheck
    llm: HealthCheck
  }
  gate: HealthGate
  heartbeat: HealthHeartbeat
}
