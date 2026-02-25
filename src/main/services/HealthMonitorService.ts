import type { HealthCheck, HealthIssueCode, HealthSnapshot } from '@shared/types/health'
import type { RecordingGateMode } from '@shared/types/config'

interface RecordingStatusLike {
  isRecording: boolean
  sessionId: string | null
  asrRunning: boolean
}

export interface HealthMonitorDeps {
  getRecordingStatus: () => RecordingStatusLike
  getRecordingGateMode: () => RecordingGateMode
  checkBlackHole: () => Promise<boolean>
  checkLLMReady: () => Promise<boolean>
  checkASRReady: () => Promise<boolean>
}

interface RuntimeSignal {
  llmLatencyMs: number | null
  llmError: string | null
  llmUpdatedAt: number | null
  asrLatencyMs: number | null
  asrError: string | null
  asrUpdatedAt: number | null
  lastHeartbeatAt: number | null
  recordingError: { message: string; code?: string } | null
}

export class HealthMonitorService {
  private deps: HealthMonitorDeps
  private runtime: RuntimeSignal = {
    llmLatencyMs: null,
    llmError: null,
    llmUpdatedAt: null,
    asrLatencyMs: null,
    asrError: null,
    asrUpdatedAt: null,
    lastHeartbeatAt: null,
    recordingError: null,
  }

  constructor(deps: HealthMonitorDeps) {
    this.deps = deps
  }

  recordLLMCall(result: { ok: boolean; latencyMs: number; error?: string }): void {
    this.runtime.llmLatencyMs = Number.isFinite(result.latencyMs) ? Math.max(0, Math.round(result.latencyMs)) : null
    this.runtime.llmUpdatedAt = Date.now()
    this.runtime.llmError = result.ok ? null : (result.error?.trim() || 'LLM 请求失败')
    this.touchHeartbeat()
  }

  recordASRDebug(event: {
    stage: 'state' | 'decision' | 'request' | 'response' | 'error'
    latencyMs?: number
    status?: number
    message?: string
  }): void {
    if (Number.isFinite(event.latencyMs)) {
      this.runtime.asrLatencyMs = Math.max(0, Math.round(event.latencyMs ?? 0))
      this.runtime.asrUpdatedAt = Date.now()
    }
    if (event.stage === 'error') {
      this.runtime.asrError = event.message?.trim() || 'ASR 错误'
      this.runtime.asrUpdatedAt = Date.now()
    }
    if (event.stage === 'response' && (event.status ?? 200) < 400) {
      this.runtime.asrError = null
      this.runtime.asrUpdatedAt = Date.now()
    }
    this.touchHeartbeat()
  }

  recordRecordingIssue(issue: { message: string; code?: string }): void {
    this.runtime.recordingError = {
      message: issue.message,
      code: issue.code,
    }
    this.touchHeartbeat()
  }

  clearRecordingIssue(): void {
    this.runtime.recordingError = null
  }

  recordHeartbeat(): void {
    this.touchHeartbeat()
  }

  async getSnapshot(): Promise<HealthSnapshot> {
    const timestamp = Date.now()
    const recordingStatus = this.deps.getRecordingStatus()
    const gateMode = this.deps.getRecordingGateMode()

    const [blackHoleInstalled, llmReady, asrReady] = await Promise.all([
      this.deps.checkBlackHole(),
      this.deps.checkLLMReady(),
      this.deps.checkASRReady(),
    ])

    const audioCheck = this.buildAudioCheck(recordingStatus.isRecording, blackHoleInstalled)
    const asrCheck = this.buildASRCheck(recordingStatus, asrReady)
    const llmCheck = this.buildLLMCheck(recordingStatus.isRecording, llmReady)

    const checks = {
      audio: audioCheck,
      asr: asrCheck,
      llm: llmCheck,
    }

    const blockingChecks = [audioCheck, asrCheck, llmCheck]
      .filter((check) => this.isBlockingIssue(check.issueCode))
    const reasons = blockingChecks.map((check) => check.message)

    const heartbeatSeconds = this.runtime.lastHeartbeatAt
      ? Math.max(0, Math.floor((timestamp - this.runtime.lastHeartbeatAt) / 1000))
      : null

    return {
      timestamp,
      recording: recordingStatus.isRecording,
      checks,
      gate: {
        mode: gateMode,
        blocked: gateMode === 'strict' && blockingChecks.length > 0,
        reasons,
      },
      heartbeat: {
        lastEventAt: this.runtime.lastHeartbeatAt,
        secondsSinceEvent: heartbeatSeconds,
      },
    }
  }

  private buildAudioCheck(recording: boolean, blackHoleInstalled: boolean): HealthCheck {
    if (blackHoleInstalled) {
      return this.makeCheck('ok', '音频链路正常', undefined, null, null)
    }
    return recording
      ? this.makeCheck('error', '未检测到 BlackHole，双声道不可用', 'audio-blackhole-missing', null, null)
      : this.makeCheck('warn', '未检测到 BlackHole', 'audio-blackhole-missing', null, null)
  }

  private buildASRCheck(recordingStatus: RecordingStatusLike, asrReady: boolean): HealthCheck {
    if (!asrReady) {
      return recordingStatus.isRecording
        ? this.makeCheck('error', 'ASR 未配置', 'asr-not-configured', this.runtime.asrLatencyMs, this.runtime.asrUpdatedAt)
        : this.makeCheck('warn', 'ASR 待配置', 'asr-not-configured', this.runtime.asrLatencyMs, this.runtime.asrUpdatedAt)
    }

    if (recordingStatus.isRecording && !recordingStatus.asrRunning) {
      return this.makeCheck('error', 'ASR 未运行', 'asr-not-running', this.runtime.asrLatencyMs, this.runtime.asrUpdatedAt)
    }

    if (this.runtime.asrError) {
      return this.makeCheck('warn', `ASR 异常：${this.runtime.asrError}`, 'asr-error', this.runtime.asrLatencyMs, this.runtime.asrUpdatedAt)
    }

    return this.makeCheck('ok', 'ASR 正常', undefined, this.runtime.asrLatencyMs, this.runtime.asrUpdatedAt)
  }

  private buildLLMCheck(recording: boolean, llmReady: boolean): HealthCheck {
    if (!llmReady) {
      return recording
        ? this.makeCheck('error', 'LLM 未配置', 'llm-not-configured', this.runtime.llmLatencyMs, this.runtime.llmUpdatedAt)
        : this.makeCheck('warn', 'LLM 待配置', 'llm-not-configured', this.runtime.llmLatencyMs, this.runtime.llmUpdatedAt)
    }

    if (this.runtime.llmError) {
      return this.makeCheck('warn', `LLM 异常：${this.runtime.llmError}`, 'llm-error', this.runtime.llmLatencyMs, this.runtime.llmUpdatedAt)
    }

    return this.makeCheck('ok', 'LLM 正常', undefined, this.runtime.llmLatencyMs, this.runtime.llmUpdatedAt)
  }

  private makeCheck(
    state: HealthCheck['state'],
    message: string,
    issueCode: HealthIssueCode | undefined,
    latencyMs: number | null,
    updatedAt: number | null,
  ): HealthCheck {
    return {
      state,
      message,
      issueCode,
      latencyMs,
      updatedAt,
    }
  }

  private isBlockingIssue(issueCode: HealthIssueCode | undefined): boolean {
    if (!issueCode) return false
    return (
      issueCode === 'audio-blackhole-missing' ||
      issueCode === 'audio-chain-unavailable' ||
      issueCode === 'asr-not-configured' ||
      issueCode === 'asr-not-running' ||
      issueCode === 'llm-not-configured'
    )
  }

  private touchHeartbeat(): void {
    this.runtime.lastHeartbeatAt = Date.now()
  }
}
