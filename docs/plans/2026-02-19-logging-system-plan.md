# Logging System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 基于 electron-log v5 为 AI 面试助手搭建标准化日志系统，替换所有 console 调用，并在关键业务路径添加日志埋点。

**Architecture:** 主进程使用 electron-log 直接写入按日期命名的日志文件，渲染器进程通过 electron-log/renderer 走 IPC 转发到主进程统一记录。通过 scope 区分模块来源，通过 `resolvePathFn` 实现按日期轮转。

**Tech Stack:** electron-log v5, TypeScript, Electron IPC

---

### Task 1: 创建主进程 Logger 模块

**Files:**
- Create: `src/main/logger/index.ts`
- Create: `src/main/logger/transports.ts`

**Step 1: 创建 transports.ts — 日期轮转和旧日志清理**

```typescript
// src/main/logger/transports.ts
import { app } from 'electron'
import { join } from 'path'
import { readdirSync, statSync, unlinkSync } from 'fs'

/**
 * 生成按日期命名的日志文件路径
 * 格式: userData/logs/2026-02-19.log
 */
export function resolveLogPath(): string {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const fileName = `${yyyy}-${mm}-${dd}.log`
  return join(app.getPath('userData'), 'logs', fileName)
}

/**
 * 清理超过指定天数的旧日志文件
 */
export function cleanOldLogs(maxAgeDays: number = 7): void {
  const logsDir = join(app.getPath('userData'), 'logs')
  try {
    const files = readdirSync(logsDir)
    const now = Date.now()
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000

    for (const file of files) {
      if (!file.endsWith('.log')) continue
      const filePath = join(logsDir, file)
      const stat = statSync(filePath)
      if (now - stat.mtimeMs > maxAge) {
        unlinkSync(filePath)
      }
    }
  } catch {
    // logs 目录不存在时忽略
  }
}
```

**Step 2: 创建 index.ts — Logger 初始化和导出**

```typescript
// src/main/logger/index.ts
import log from 'electron-log/main'
import { app } from 'electron'
import { resolveLogPath, cleanOldLogs } from './transports'

let initialized = false

/**
 * 初始化日志系统（应在 app.whenReady 后调用一次）
 */
export function initializeLogger(): void {
  if (initialized) return

  const isDev = !app.isPackaged

  // 文件 transport 配置
  log.transports.file.resolvePathFn = resolveLogPath
  log.transports.file.level = isDev ? 'debug' : 'info'
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {scope} {text}'
  log.transports.file.maxSize = 0 // 禁用按大小轮转，使用按日期

  // 控制台 transport 配置
  log.transports.console.level = isDev ? 'debug' : 'warn'

  // 清理旧日志
  cleanOldLogs(7)

  // 初始化渲染器进程日志接收
  log.initialize()

  initialized = true
}

/**
 * 获取带 scope 的 logger 实例
 */
export function getLogger(scope: string): log.Logger {
  return log.scope(scope)
}

export default log
```

**Step 3: 验证构建**

Run: `cd /Users/sd3/project && npx electron-vite build 2>&1 | head -20`
Expected: 编译成功，无 TypeScript 错误

**Step 4: Commit**

```bash
git add src/main/logger/
git commit -m "feat: 创建主进程 Logger 模块（electron-log 封装）"
```

---

### Task 2: 创建渲染器进程 Logger 模块

**Files:**
- Create: `src/renderer/utils/logger.ts`

**Step 1: 创建渲染器端 logger**

```typescript
// src/renderer/utils/logger.ts
import log from 'electron-log/renderer'

/**
 * 获取渲染器进程的带 scope logger
 * 日志通过 IPC 自动转发到主进程写入文件
 */
export function getLogger(scope: string) {
  return log.scope(scope)
}

export default log
```

**Step 2: 验证构建**

Run: `cd /Users/sd3/project && npx electron-vite build 2>&1 | head -20`
Expected: 编译成功

**Step 3: Commit**

```bash
git add src/renderer/utils/logger.ts
git commit -m "feat: 创建渲染器进程 Logger 模块"
```

---

### Task 3: 在主进程入口初始化 Logger

**Files:**
- Modify: `src/main/index.ts`

**Step 1: 在 index.ts 导入区域添加 logger 导入**

在现有 import 语句之后添加：
```typescript
import { initializeLogger, getLogger } from './logger'
```

**Step 2: 在 App 类初始化方法最开头调用 initializeLogger()**

在 `initialize()` 方法体的第一行添加：
```typescript
initializeLogger()
const log = getLogger('App')
log.info('应用启动', { version: app.getVersion(), packaged: app.isPackaged })
```

**Step 3: 在 shutdown 方法添加退出日志**

```typescript
const log = getLogger('App')
log.info('应用退出')
```

**Step 4: 在 createWindow 方法添加窗口创建日志**

```typescript
const log = getLogger('App')
log.info('主窗口创建完成')
```

**Step 5: 替换 index.ts 中的 4 处 console 调用**

将每处 `console.error` / `console.warn` 替换为对应的 `log.error` / `log.warn`，使用 `getLogger('App')` scope。

- 行 211: `console.error('Screenshot failed:', err)` → `log.error('截屏失败', err)`
- 行 235: `console.warn('ASR start failed...', e)` → `log.warn('ASR 启动失败（将不带转写继续录制）', e)`
- 行 241: `console.warn('Audio capture start failed:', e)` → `log.warn('音频捕获启动失败', e)`
- 行 249: `console.error('Toggle recording failed:', err)` → `log.error('录制切换失败', err)`

**Step 6: 验证构建**

Run: `cd /Users/sd3/project && npx electron-vite build 2>&1 | head -20`
Expected: 编译成功

**Step 7: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: 在主入口初始化 Logger 并替换 console 调用"
```

---

### Task 4: 替换 AudioCapture 中的 console 调用 + 添加埋点

**Files:**
- Modify: `src/main/capture/AudioCapture.ts`

**Step 1: 添加 logger 导入，替换 console 调用，添加新埋点**

在文件顶部导入 logger：
```typescript
import { getLogger } from '../logger'
const log = getLogger('AudioCapture')
```

替换 2 处 console.error：
- 行 169: `console.error('AudioCapture: mic capture failed:', err)` → `log.error('麦克风捕获失败', err)`
- 行 191: `console.error('AudioCapture: system audio capture failed:', err)` → `log.error('系统音频捕获失败', err)`

在关键位置添加新日志：
- `start()` 方法开头: `log.info('开始音频捕获')`
- `stop()` 方法开头: `log.info('停止音频捕获')`
- `start()` 方法成功完成时: `log.info('音频捕获已启动')`

**Step 2: 验证构建**

Run: `cd /Users/sd3/project && npx electron-vite build 2>&1 | head -20`

**Step 3: Commit**

```bash
git add src/main/capture/AudioCapture.ts
git commit -m "feat: AudioCapture 添加日志"
```

---

### Task 5: 替换 HotkeyManager 中的 console 调用 + 添加埋点

**Files:**
- Modify: `src/main/hotkey/HotkeyManager.ts`

**Step 1: 添加 logger 导入，替换 console 调用，添加新埋点**

```typescript
import { getLogger } from '../logger'
const log = getLogger('HotkeyManager')
```

替换 1 处 console.warn：
- 行 101: → `log.warn('快捷键注册失败', { accelerator, action })`

添加新日志：
- `registerAll()`: `log.debug('注册所有快捷键', { count })`
- `unregisterAll()`: `log.debug('注销所有快捷键')`
- `reload()`: `log.debug('重载快捷键配置')`
- `registerOne()` 成功时: `log.debug('快捷键已注册', { action, accelerator })`

**Step 2: 验证构建 → Commit**

```bash
git add src/main/hotkey/HotkeyManager.ts
git commit -m "feat: HotkeyManager 添加日志"
```

---

### Task 6: 替换 ConfigManager 中的 console 调用 + 添加埋点

**Files:**
- Modify: `src/main/config/ConfigManager.ts`

**Step 1: 添加 logger 导入，替换 console 调用，添加新埋点**

```typescript
import { getLogger } from '../logger'
const log = getLogger('ConfigManager')
```

替换 1 处 console.error：
- 行 115: → `log.error('配置监听回调执行异常', { key, error: err })`

添加新日志：
- `set()` 方法: `log.debug('配置更新', { key })`
- `importConfig()`: `log.info('导入配置')`
- `resetToDefaults()`: `log.info('重置为默认配置')`

**Step 2: 验证构建 → Commit**

```bash
git add src/main/config/ConfigManager.ts
git commit -m "feat: ConfigManager 添加日志"
```

---

### Task 7: LLMService 添加日志埋点

**Files:**
- Modify: `src/main/services/LLMService.ts`

**Step 1: 添加 logger 和关键业务日志**

```typescript
import { getLogger } from '../logger'
const log = getLogger('LLMService')
```

添加日志：
- `updateConfig()`: `log.info('LLM 配置更新', { provider })`
- `chat()` 开始: `log.info('开始 LLM 聊天')`
- `analyzeScreenshot()` 开始: `log.info('开始截屏分析')`
- `generateReview()` 开始: `log.info('开始生成复盘报告')`
- `testConnection()` 开始: `log.info('测试 LLM 连接')`
- `fetchModels()` 开始: `log.debug('获取模型列表')`
- `streamRequest()` 失败: `log.error('LLM 请求失败', err)`

**Step 2: 验证构建 → Commit**

```bash
git add src/main/services/LLMService.ts
git commit -m "feat: LLMService 添加日志"
```

---

### Task 8: ASRService 添加日志埋点

**Files:**
- Modify: `src/main/services/ASRService.ts`

**Step 1: 添加 logger 和关键业务日志**

```typescript
import { getLogger } from '../logger'
const log = getLogger('ASRService')
```

添加日志：
- `startStream()`: `log.info('开始 ASR 双通道识别')`
- `stopStream()`: `log.info('停止 ASR 识别')`
- `startStream()` 失败: `log.error('ASR 启动失败', err)`
- `testConnection()`: `log.info('测试 ASR 连接')`
- `setSystemProvider()` / `setMicProvider()`: `log.debug('设置 ASR Provider', { name })`

**Step 2: 验证构建 → Commit**

```bash
git add src/main/services/ASRService.ts
git commit -m "feat: ASRService 添加日志"
```

---

### Task 9: 其余主进程模块添加日志埋点

**Files:**
- Modify: `src/main/capture/ScreenCapture.ts`
- Modify: `src/main/recorder/SessionRecorder.ts`
- Modify: `src/main/window/StealthWindow.ts`
- Modify: `src/main/tray/TrayManager.ts`
- Modify: `src/main/ipc/handlers.ts`

**Step 1: ScreenCapture 添加日志**

```typescript
import { getLogger } from '../logger'
const log = getLogger('ScreenCapture')
```
- `captureRegion()` 开始: `log.debug('开始截屏选区')`
- `captureRegion()` 完成: `log.debug('截屏完成')`
- 失败时: `log.error('截屏失败', err)`

**Step 2: SessionRecorder 添加日志**

```typescript
import { getLogger } from '../logger'
const log = getLogger('SessionRecorder')
```
- `startSession()`: `log.info('开始录制会话', { sessionId })`
- `stopSession()`: `log.info('停止录制会话', { sessionId })`
- Worker 错误: `log.error('Worker 错误', err)`

**Step 3: StealthWindow 添加日志**

```typescript
import { getLogger } from '../logger'
const log = getLogger('StealthWindow')
```
- `create()`: `log.debug('创建隐身窗口')`
- `toggle()`: `log.debug('切换窗口可见性')`

**Step 4: TrayManager 添加日志**

```typescript
import { getLogger } from '../logger'
const log = getLogger('TrayManager')
```
- `create()`: `log.debug('创建托盘图标')`

**Step 5: IPC handlers 添加日志**

```typescript
import { getLogger } from '../logger'
const log = getLogger('IPC')
```
- 在 `registerIPCHandlers` 函数开头: `log.debug('注册 IPC 处理器')`
- LLM 流式请求开始/结束: `log.debug('LLM 流式请求开始/结束')`
- ASR 启动/停止: `log.debug('ASR IPC 启动/停止')`

**Step 6: 验证构建**

Run: `cd /Users/sd3/project && npx electron-vite build 2>&1 | head -20`

**Step 7: Commit**

```bash
git add src/main/capture/ScreenCapture.ts src/main/recorder/SessionRecorder.ts src/main/window/StealthWindow.ts src/main/tray/TrayManager.ts src/main/ipc/handlers.ts
git commit -m "feat: 其余主进程模块添加日志埋点"
```

---

### Task 10: 渲染器进程替换 console 调用 + 添加埋点

**Files:**
- Modify: `src/renderer/stores/settingsStore.ts`
- Modify: `src/renderer/stores/chatStore.ts`
- Modify: `src/renderer/components/Common/ErrorBoundary.tsx`

**Step 1: settingsStore.ts 替换 console.warn**

```typescript
import { getLogger } from '../utils/logger'
const log = getLogger('settingsStore')
```
- 行 46: `console.warn('[settingsStore] IPC not available')` → `log.warn('IPC 不可用')`

**Step 2: chatStore.ts 替换 console.error**

```typescript
import { getLogger } from '../utils/logger'
const log = getLogger('chatStore')
```
- 替换所有 console.error 为对应的 log.error

**Step 3: ErrorBoundary.tsx 替换 console.error**

```typescript
import { getLogger } from '../../utils/logger'
const log = getLogger('ErrorBoundary')
```
- `componentDidCatch()`: `log.error('UI 渲染错误', error, errorInfo)`

**Step 4: 验证构建**

Run: `cd /Users/sd3/project && npx electron-vite build 2>&1 | head -20`

**Step 5: Commit**

```bash
git add src/renderer/stores/settingsStore.ts src/renderer/stores/chatStore.ts src/renderer/components/Common/ErrorBoundary.tsx
git commit -m "feat: 渲染器进程替换 console 调用并添加日志"
```

---

### Task 11: 最终验证和清理

**Step 1: 确认无残留 console 调用**

Run: `grep -rn "console\.\(log\|warn\|error\|debug\|info\)" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".d.ts"`
Expected: 无输出（或仅有不需要替换的特殊场景）

**Step 2: 完整构建验证**

Run: `cd /Users/sd3/project && npx electron-vite build`
Expected: 编译成功，无错误

**Step 3: 更新设计文档中的实际 console 数量（从 9 处更正为 13 处）**

在设计文档中补充 chatStore.ts（3 处）和 ErrorBoundary.tsx（1 处）。

**Step 4: Final Commit**

```bash
git add -A
git commit -m "chore: 日志系统最终验证和文档更新"
```
