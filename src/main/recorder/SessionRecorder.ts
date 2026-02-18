import { Worker } from 'worker_threads'
import { join } from 'path'
import type { WorkerMessage, WorkerResponse } from '../../workers/sessionWorker'

export class SessionRecorder {
  private worker: Worker | null = null
  private sessionId: string | null = null
  private recording = false
  private dbPath: string

  constructor(dbPath: string) {
    this.dbPath = dbPath
  }

  /** 开始录制会话 */
  async startSession(company = '', position = ''): Promise<string> {
    if (this.recording) {
      throw new Error('A session is already being recorded')
    }

    const workerPath = join(__dirname, '../../workers/sessionWorker.js')

    this.worker = new Worker(workerPath)

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker start timeout'))
      }, 10000)

      this.worker!.on('message', (response: WorkerResponse) => {
        if (response.type === 'started' && response.sessionId) {
          clearTimeout(timeout)
          this.sessionId = response.sessionId
          this.recording = true
          resolve(response.sessionId)
        } else if (response.type === 'error') {
          clearTimeout(timeout)
          reject(new Error(response.error ?? 'Unknown worker error'))
        }
      })

      this.worker!.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })

      this.postMessage({
        type: 'start',
        dbPath: this.dbPath,
        company,
        position
      })
    })
  }

  /** 记录转写条目 */
  recordTranscript(
    speaker: 'interviewer' | 'me',
    text: string,
    timestamp: number,
    isFinal: boolean
  ): void {
    if (!this.recording) return

    this.postMessage({
      type: 'transcript',
      speaker,
      text,
      timestamp,
      isFinal
    })
  }

  /** 记录截屏问答 */
  recordScreenshotQA(data: {
    timestamp: number
    imagePath: string
    question: string
    answer: string
    model: string
  }): void {
    if (!this.recording) return

    this.postMessage({
      type: 'screenshotQA',
      ...data
    })
  }

  /** 停止录制会话 */
  async stopSession(): Promise<string | null> {
    if (!this.recording || !this.worker) {
      return null
    }

    return new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => {
        this.cleanup()
        resolve(this.sessionId)
      }, 10000)

      this.worker!.on('message', (response: WorkerResponse) => {
        if (response.type === 'stopped' || response.type === 'error') {
          clearTimeout(timeout)
          const id = response.sessionId ?? this.sessionId
          this.cleanup()
          resolve(id)
        }
      })

      this.postMessage({ type: 'stop' })
    })
  }

  /** 当前是否正在录制 */
  isRecording(): boolean {
    return this.recording
  }

  /** 获取当前会话 ID */
  getSessionId(): string | null {
    return this.sessionId
  }

  private postMessage(msg: WorkerMessage): void {
    if (this.worker) {
      this.worker.postMessage(msg)
    }
  }

  private cleanup(): void {
    this.recording = false
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }
}
