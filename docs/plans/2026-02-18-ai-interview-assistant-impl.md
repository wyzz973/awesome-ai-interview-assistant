# AI 面试助手 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建一个 macOS 桌面端 AI 面试助手，具备隐身窗口、截屏 AI 分析、实时语音转写、面试记录与复盘功能。

**Architecture:** Electron 主进程处理原生能力（窗口管理、截屏、音频捕获、快捷键），React 渲染进程构建 UI。Worker Thread 独立运行面试记录器。外部依赖 OpenAI 兼容 LLM API 和云端 ASR 服务。

**Tech Stack:** Electron 33+, React 19, TypeScript, Vite, Zustand, Tailwind CSS, Radix UI, better-sqlite3, electron-store, keytar, react-markdown, electron-builder

**Design Doc:** `docs/plans/2026-02-18-ai-interview-assistant-design.md`

---

## Phase 1: 项目基础搭建

### Task 1: 初始化 Electron + React + Vite 项目

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `electron-builder.yml`
- Create: `src/main/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`

**Step 1: 创建项目并安装依赖**

```bash
cd /Users/sd3/project
npm init -y
npm install electron electron-builder --save-dev
npm install react react-dom
npm install -D @types/react @types/react-dom typescript vite @vitejs/plugin-react
npm install -D electron-vite
```

**Step 2: 配置 TypeScript**

创建 `tsconfig.json`：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: 配置 electron-vite**

创建 `electron.vite.config.ts`：
```typescript
import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer')
      }
    },
    plugins: [react()]
  }
});
```

**Step 4: 创建 Electron 主进程入口**

创建 `src/main/index.ts`，包含最基本的 BrowserWindow 创建逻辑，加载渲染进程页面。

**Step 5: 创建 React 渲染进程入口**

创建 `src/renderer/index.html`、`src/renderer/main.tsx`、`src/renderer/App.tsx`，显示 "AI 面试助手" 标题文本。

**Step 6: 创建 preload 脚本**

创建 `src/preload/index.ts`，通过 contextBridge 暴露安全的 IPC 调用接口。

**Step 7: 运行验证**

```bash
npx electron-vite dev
```

Expected: Electron 窗口打开，显示 "AI 面试助手" 文本。

**Step 8: Commit**

```bash
git init
echo "node_modules/\ndist/\nout/\n.DS_Store" > .gitignore
git add .
git commit -m "feat: initialize Electron + React + Vite project scaffold"
```

---

### Task 2: 安装核心依赖并配置 Tailwind CSS

**Files:**
- Modify: `package.json`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `src/renderer/styles/globals.css`

**Step 1: 安装 UI 相关依赖**

```bash
npm install zustand
npm install tailwindcss @tailwindcss/typography postcss autoprefixer -D
npm install @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-select @radix-ui/react-slider @radix-ui/react-switch @radix-ui/react-tooltip
npm install react-markdown rehype-highlight remark-gfm
npm install lucide-react
```

**Step 2: 配置 Tailwind**

创建 `tailwind.config.js`，content 指向 `src/renderer/**/*.{ts,tsx}`。
创建 `postcss.config.js`。
创建 `src/renderer/styles/globals.css`，包含 Tailwind 指令 `@tailwind base/components/utilities`。

**Step 3: 安装主进程依赖**

```bash
npm install better-sqlite3 electron-store electron-log keytar
npm install -D @types/better-sqlite3
```

**Step 4: 验证 Tailwind 生效**

在 `App.tsx` 中添加一个带 Tailwind class 的元素，运行 `npx electron-vite dev`，确认样式生效。

**Step 5: Commit**

```bash
git add .
git commit -m "feat: add core dependencies and configure Tailwind CSS"
```

---

### Task 3: 创建共享类型定义

**Files:**
- Create: `src/shared/types/session.ts`
- Create: `src/shared/types/llm.ts`
- Create: `src/shared/types/config.ts`
- Create: `src/shared/types/hotkey.ts`
- Create: `src/shared/constants.ts`

**Step 1: 定义面试会话相关类型**

`src/shared/types/session.ts`:
```typescript
export interface Session {
  id: string;
  company: string;
  position: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: 'recording' | 'completed' | 'reviewed';
}

export interface TranscriptEntry {
  id: string;
  sessionId: string;
  timestamp: number;
  speaker: 'interviewer' | 'me';
  text: string;
}

export interface ScreenshotQA {
  id: string;
  sessionId: string;
  timestamp: number;
  imagePath: string;
  question: string;
  answer: string;
  model: string;
}

export interface ReviewReport {
  id: string;
  sessionId: string;
  generatedAt: number;
  summary: string;
  questions: string[];
  performance: {
    strengths: string[];
    weaknesses: string[];
  };
  suggestions: string[];
  keyTopics: string[];
}
```

**Step 2: 定义 LLM 相关类型**

`src/shared/types/llm.ts`:
```typescript
export interface LLMProvider {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatMessageContent[];
}

export type ChatMessageContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };
```

**Step 3: 定义配置和快捷键类型**

`src/shared/types/config.ts` 和 `src/shared/types/hotkey.ts`：定义 AppConfig、ASRConfig、AppearanceConfig、HotkeyConfig 等接口。

**Step 4: 定义常量**

`src/shared/constants.ts`：默认快捷键映射、默认模型预设（OpenAI/DeepSeek/Qwen/GLM/Moonshot/Claude）、默认 system prompt 等。

**Step 5: 编译验证**

```bash
npx tsc --noEmit
```

Expected: 无编译错误。

**Step 6: Commit**

```bash
git add .
git commit -m "feat: add shared type definitions and constants"
```

---

## Phase 2: 隐身窗口与快捷键

### Task 4: 实现 StealthWindow 隐身窗口

**Files:**
- Create: `src/main/window/StealthWindow.ts`
- Modify: `src/main/index.ts`

**Step 1: 实现 StealthWindow 类**

`src/main/window/StealthWindow.ts`:
```typescript
import { BrowserWindow } from 'electron';

export class StealthWindow {
  private window: BrowserWindow | null = null;
  private opacity: number = 0.85;
  private isInteractable: boolean = false;

  create(): BrowserWindow { /* 创建隐身窗口，配置：
    transparent, frame:false, alwaysOnTop, skipTaskbar,
    hasShadow:false, focusable:false,
    setContentProtection(true),
    setAlwaysOnTop(true, 'floating'),
    setIgnoreMouseEvents(true, { forward: true })
  */ }

  show(): void;
  hide(): void;
  toggle(): void;
  setOpacity(value: number): void;
  increaseOpacity(step?: number): void;
  decreaseOpacity(step?: number): void;
  enableInteraction(): void;   // 临时启用鼠标事件
  disableInteraction(): void;  // 恢复鼠标穿透
  getWindow(): BrowserWindow | null;
}
```

**Step 2: 在主进程中集成**

修改 `src/main/index.ts`，使用 StealthWindow 代替默认 BrowserWindow。

**Step 3: 运行验证**

```bash
npx electron-vite dev
```

Expected: 窗口置顶、无边框、鼠标穿透、半透明。用会议软件（如 Zoom）开启屏幕共享，验证窗口不可见。

**Step 4: Commit**

```bash
git add .
git commit -m "feat: implement StealthWindow with content protection"
```

---

### Task 5: 实现 ConfigManager 配置管理

**Files:**
- Create: `src/main/config/ConfigManager.ts`
- Create: `src/main/config/defaults.ts`

**Step 1: 实现 ConfigManager**

```typescript
import Store from 'electron-store';
import * as keytar from 'keytar';

export class ConfigManager {
  private store: Store;
  private listeners: Map<string, Set<Function>>;

  constructor();

  // 普通配置读写
  get<T>(key: string, defaultValue?: T): T;
  set<T>(key: string, value: T): void;

  // 敏感信息（API Key）通过 Keychain 存储
  async getSecure(key: string): Promise<string | null>;
  async setSecure(key: string, value: string): Promise<void>;
  async deleteSecure(key: string): Promise<void>;

  // 配置变更监听（热重载）
  onChanged(key: string, callback: (newVal: any, oldVal: any) => void): () => void;

  // 快捷键配置
  getHotkeys(): HotkeyConfig;
  setHotkeys(config: HotkeyConfig): void;

  // 导入/导出/重置
  exportConfig(): object;
  importConfig(config: object): void;
  resetToDefaults(): void;
}
```

**Step 2: 创建默认配置**

`src/main/config/defaults.ts`：定义所有默认值，包括默认快捷键、默认外观、默认模型预设。

**Step 3: 编译验证**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add .
git commit -m "feat: implement ConfigManager with Keychain integration"
```

---

### Task 6: 实现 HotkeyManager 全局快捷键

**Files:**
- Create: `src/main/hotkey/HotkeyManager.ts`

**Step 1: 实现 HotkeyManager**

```typescript
import { globalShortcut } from 'electron';
import { ConfigManager } from '../config/ConfigManager';

export class HotkeyManager {
  private configManager: ConfigManager;
  private handlers: Map<string, () => void>;
  private registeredShortcuts: Map<string, string>; // action -> accelerator

  constructor(configManager: ConfigManager);

  // 注册动作处理器
  registerHandler(action: string, handler: () => void): void;

  // 根据配置注册所有快捷键
  registerAll(): void;

  // 注销所有快捷键
  unregisterAll(): void;

  // 热重载：重新注册所有快捷键
  reload(): void;

  // 冲突检测
  checkConflict(accelerator: string): { hasConflict: boolean; conflictWith?: string };

  // 更新单个快捷键
  updateHotkey(action: string, accelerator: string): boolean;

  // 恢复默认
  resetToDefaults(): void;

  destroy(): void;
}
```

**Step 2: 监听配置变更实现热重载**

在构造函数中，通过 `configManager.onChanged('hotkeys', () => this.reload())` 监听快捷键配置变化。

**Step 3: 在主进程中集成**

修改 `src/main/index.ts`，初始化 HotkeyManager，注册基本的快捷键处理器（如 toggle 窗口显示/隐藏、调整透明度）。

**Step 4: 运行验证**

```bash
npx electron-vite dev
```

Expected: 按 `Cmd+Shift+H` 能切换窗口显示/隐藏，按 `Cmd+Shift+[` / `]` 能调整透明度。

**Step 5: Commit**

```bash
git add .
git commit -m "feat: implement HotkeyManager with customization and hot-reload"
```

---

### Task 7: 实现 IPC 通信层

**Files:**
- Create: `src/main/ipc/handlers.ts`
- Create: `src/preload/index.ts` (修改)
- Create: `src/shared/types/ipc.ts`

**Step 1: 定义 IPC 通道和类型**

`src/shared/types/ipc.ts`：定义所有 IPC 通道名和参数/返回值类型。

```typescript
export const IPC_CHANNELS = {
  // 窗口控制
  WINDOW_TOGGLE: 'window:toggle',
  WINDOW_SET_OPACITY: 'window:setOpacity',
  // 截屏
  SCREENSHOT_CAPTURE: 'screenshot:capture',
  // AI
  LLM_CHAT: 'llm:chat',
  LLM_ANALYZE_SCREENSHOT: 'llm:analyzeScreenshot',
  LLM_STREAM_CHUNK: 'llm:streamChunk',
  LLM_STREAM_END: 'llm:streamEnd',
  // 语音
  ASR_START: 'asr:start',
  ASR_STOP: 'asr:stop',
  ASR_TRANSCRIPT: 'asr:transcript',
  // 会话
  SESSION_START: 'session:start',
  SESSION_STOP: 'session:stop',
  SESSION_LIST: 'session:list',
  SESSION_GET: 'session:get',
  // 复盘
  REVIEW_GENERATE: 'review:generate',
  REVIEW_GET: 'review:get',
  // 配置
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_GET_SECURE: 'config:getSecure',
  CONFIG_SET_SECURE: 'config:setSecure',
  // 快捷键
  HOTKEY_UPDATE: 'hotkey:update',
  HOTKEY_GET_ALL: 'hotkey:getAll',
  HOTKEY_RESET: 'hotkey:reset',
} as const;
```

**Step 2: 实现主进程 IPC handlers**

`src/main/ipc/handlers.ts`：使用 `ipcMain.handle` 注册所有处理器，调用对应的 service。

**Step 3: 更新 preload 脚本**

`src/preload/index.ts`：通过 `contextBridge.exposeInMainWorld` 暴露类型安全的 API。

**Step 4: 编译验证**

```bash
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: implement IPC communication layer with type-safe channels"
```

---

## Phase 3: 截屏与 AI 分析

### Task 8: 实现 LLMService

**Files:**
- Create: `src/main/services/LLMService.ts`
- Create: `src/main/services/__tests__/LLMService.test.ts`

**Step 1: 写测试**

```typescript
describe('LLMService', () => {
  it('should build correct request body for chat');
  it('should build correct request body for screenshot analysis with vision');
  it('should handle stream response');
  it('should throw on invalid API key');
  it('should support multiple providers via baseURL');
});
```

**Step 2: 运行测试确认失败**

```bash
npx vitest run src/main/services/__tests__/LLMService.test.ts
```

Expected: FAIL

**Step 3: 实现 LLMService**

```typescript
export class LLMService {
  private config: LLMProvider;

  constructor(config: LLMProvider);
  updateConfig(config: Partial<LLMProvider>): void;

  // 流式文本聊天
  async chat(messages: ChatMessage[]): Promise<AsyncIterable<string>>;

  // 截屏分析（vision）
  async analyzeScreenshot(
    imageBase64: string,
    prompt?: string,
    historyMessages?: ChatMessage[]
  ): Promise<AsyncIterable<string>>;

  // 生成复盘报告
  async generateReview(sessionData: string): Promise<AsyncIterable<string>>;

  // 测试连接
  async testConnection(): Promise<{ success: boolean; error?: string }>;

  // 内部：构建请求并处理 SSE 流
  private async *streamRequest(body: object): AsyncGenerator<string>;
}
```

核心逻辑：使用 `fetch` 调用 `${baseURL}/v1/chat/completions`，`stream: true`，解析 SSE data 行。

**Step 4: 运行测试确认通过**

```bash
npx vitest run src/main/services/__tests__/LLMService.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add .
git commit -m "feat: implement LLMService with OpenAI-compatible streaming API"
```

---

### Task 9: 实现截屏区域选择

**Files:**
- Create: `src/main/window/SelectorWindow.ts`
- Create: `src/renderer/components/ScreenshotSelector/ScreenshotSelector.tsx`
- Create: `src/renderer/components/ScreenshotSelector/index.ts`

**Step 1: 实现 SelectorWindow**

`src/main/window/SelectorWindow.ts`：创建全屏透明窗口覆盖所有显示器，加载截屏选择器 UI。

```typescript
export class SelectorWindow {
  private window: BrowserWindow | null = null;

  // 显示选区窗口，返回用户选择的区域坐标
  async selectRegion(): Promise<{ x: number; y: number; width: number; height: number } | null>;
  close(): void;
}
```

**Step 2: 实现选区 UI 组件**

`ScreenshotSelector.tsx`：全屏半透明遮罩，鼠标拖拽绘制选区矩形，显示选区尺寸，回车确认 / ESC 取消。

**Step 3: 运行验证**

手动测试：触发截屏快捷键 → 出现全屏遮罩 → 拖拽选区 → 确认后返回坐标。

**Step 4: Commit**

```bash
git add .
git commit -m "feat: implement screenshot region selector with drag-to-select UI"
```

---

### Task 10: 实现 ScreenCapture 截屏服务

**Files:**
- Create: `src/main/capture/ScreenCapture.ts`

**Step 1: 实现 ScreenCapture**

```typescript
import { desktopCapturer, screen } from 'electron';
import { SelectorWindow } from '../window/SelectorWindow';
import { StealthWindow } from '../window/StealthWindow';

export class ScreenCapture {
  private selectorWindow: SelectorWindow;
  private stealthWindow: StealthWindow;

  constructor(stealthWindow: StealthWindow);

  // 完整截屏流程：隐藏窗口 → 选区 → 截图 → 恢复窗口
  async captureRegion(): Promise<{ image: Buffer; imageBase64: string } | null>;

  // 截取指定区域
  private async captureScreen(region: Rectangle): Promise<Buffer>;
}
```

**Step 2: 在 HotkeyManager 中集成**

将 `Cmd+Shift+S` 快捷键绑定到 `screenCapture.captureRegion()`，截图后通过 IPC 发送到渲染进程并调用 LLMService。

**Step 3: 运行验证**

```bash
npx electron-vite dev
```

Expected: 按 `Cmd+Shift+S` → 隐身窗口消失 → 选区遮罩出现 → 拖拽选区 → 截图完成 → 窗口恢复。

**Step 4: Commit**

```bash
git add .
git commit -m "feat: implement ScreenCapture with region selection and stealth window integration"
```

---

### Task 11: 实现 AnswerPanel 答案面板

**Files:**
- Create: `src/renderer/components/AnswerPanel/AnswerPanel.tsx`
- Create: `src/renderer/components/AnswerPanel/index.ts`
- Create: `src/renderer/stores/chatStore.ts`

**Step 1: 实现 chatStore**

```typescript
import { create } from 'zustand';

interface ChatState {
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    screenshot?: string; // base64 缩略图
  }>;
  isStreaming: boolean;
  currentStreamText: string;
  enableHistory: boolean; // 上下文开关（默认关闭）

  addUserMessage(content: string, screenshot?: string): void;
  startStream(): void;
  appendStreamChunk(chunk: string): void;
  endStream(): void;
  setEnableHistory(enabled: boolean): void;
  clearMessages(): void;
}
```

**Step 2: 实现 AnswerPanel**

- 顶部：工具栏（上下文开关、清空按钮）
- 中间：消息列表，支持 Markdown 渲染 + 代码高亮
- 底部：文本输入框 + 发送按钮
- 流式回答时显示打字动画
- 截屏问题显示缩略图

**Step 3: 集成 IPC 监听**

监听 `LLM_STREAM_CHUNK` 和 `LLM_STREAM_END` 事件，实时更新 chatStore。

**Step 4: 运行验证**

手动测试完整流程：截屏 → AI 分析 → 流式答案显示。

**Step 5: Commit**

```bash
git add .
git commit -m "feat: implement AnswerPanel with streaming Markdown rendering"
```

---

## Phase 4: 语音捕获与转写

### Task 12: 实现 AudioCapture 音频捕获

**Files:**
- Create: `src/main/capture/AudioCapture.ts`
- Create: `scripts/setup-audio.sh`

**Step 1: 创建音频设备配置脚本**

`scripts/setup-audio.sh`：检测 BlackHole 是否安装，未安装则提示。创建多输出设备（BlackHole + 物理扬声器）。

**Step 2: 实现 AudioCapture**

```typescript
export class AudioCapture {
  private systemAudioStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private isRecording: boolean = false;

  // 开始双通道捕获
  async start(): Promise<void>;

  // 停止捕获
  stop(): void;

  // 获取音频数据回调
  onSystemAudioData(callback: (data: Buffer) => void): void;
  onMicData(callback: (data: Buffer) => void): void;

  // 列出可用音频设备
  static async listDevices(): Promise<MediaDeviceInfo[]>;

  // 检测 BlackHole 是否可用
  static async checkBlackHole(): Promise<boolean>;
}
```

使用 Electron `desktopCapturer` 或 Web Audio API 捕获系统音频（通过 BlackHole 虚拟设备），`navigator.mediaDevices.getUserMedia` 捕获麦克风。

**Step 3: 运行验证**

手动测试：启动录音 → 播放音频 + 说话 → 确认两个通道分别捕获到数据。

**Step 4: Commit**

```bash
git add .
git commit -m "feat: implement dual-channel AudioCapture with BlackHole integration"
```

---

### Task 13: 实现 ASR 服务抽象层

**Files:**
- Create: `src/main/services/ASRService.ts`
- Create: `src/main/services/ASRProviders/ASRProvider.ts`
- Create: `src/main/services/ASRProviders/WhisperASR.ts`
- Create: `src/main/services/__tests__/ASRService.test.ts`

**Step 1: 定义 ASR Provider 接口**

```typescript
// ASRProvider.ts
export interface ASRTranscript {
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface ASRProvider {
  readonly name: string;

  // 开始流式识别
  startStream(config: {
    language: 'zh' | 'en' | 'zh-en';
    sampleRate: number;
  }): void;

  // 发送音频数据
  sendAudio(data: Buffer): void;

  // 接收转写结果
  onTranscript(callback: (result: ASRTranscript) => void): void;

  // 停止识别
  stopStream(): void;

  // 测试连接
  testConnection(): Promise<{ success: boolean; error?: string }>;
}
```

**Step 2: 实现 WhisperASR（首个 Provider）**

`WhisperASR.ts`：调用 OpenAI Whisper API，支持流式音频发送和结果返回。

**Step 3: 实现 ASRService 编排层**

```typescript
export class ASRService {
  private provider: ASRProvider;
  private systemChannel: { speaker: 'interviewer'; stream: ASRProvider };
  private micChannel: { speaker: 'me'; stream: ASRProvider };

  constructor(providerFactory: () => ASRProvider);

  // 开始双通道转写
  startDualChannel(): void;

  // 接收标记了说话人的转写结果
  onTranscript(callback: (entry: { speaker: string; text: string; timestamp: number }) => void): void;

  // 停止
  stop(): void;
}
```

**Step 4: 写测试并验证**

```bash
npx vitest run src/main/services/__tests__/ASRService.test.ts
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: implement ASR service abstraction with Whisper provider"
```

---

### Task 14: 实现阿里云/腾讯云 ASR Provider

**Files:**
- Create: `src/main/services/ASRProviders/AliyunASR.ts`
- Create: `src/main/services/ASRProviders/TencentASR.ts`

**Step 1: 实现 AliyunASR**

使用阿里云实时语音识别 WebSocket API，支持中英混合模式。

**Step 2: 实现 TencentASR**

使用腾讯云实时语音识别 WebSocket API。

**Step 3: 在 ASRService 中注册**

更新 provider 工厂函数，支持根据配置切换 provider。

**Step 4: Commit**

```bash
git add .
git commit -m "feat: add Aliyun and Tencent ASR providers"
```

---

### Task 15: 实现 TranscriptPanel 转写面板

**Files:**
- Create: `src/renderer/components/TranscriptPanel/TranscriptPanel.tsx`
- Create: `src/renderer/components/TranscriptPanel/TranscriptEntry.tsx`
- Create: `src/renderer/components/TranscriptPanel/index.ts`
- Create: `src/renderer/stores/transcriptStore.ts`

**Step 1: 实现 transcriptStore**

```typescript
interface TranscriptState {
  entries: Array<{
    id: string;
    speaker: 'interviewer' | 'me';
    text: string;
    timestamp: number;
    isFinal: boolean;
  }>;
  isRecording: boolean;
  recordingDuration: number; // 秒
  selectedEntryIds: Set<string>;

  addEntry(entry: ...): void;
  updateEntry(id: string, text: string, isFinal: boolean): void;
  setRecording(recording: boolean): void;
  toggleSelect(id: string): void;
  getSelectedText(): string;
  clear(): void;
}
```

**Step 2: 实现 TranscriptPanel**

- 顶部：录音状态指示（红点 + 时长）+ 开始/停止按钮
- 中间：转写条目列表，按时间排序，面试官/用户不同颜色标识
- 支持选中条目 → 底部出现 "发送给 AI 分析" 按钮
- 底部：导出记录 + 清空按钮

**Step 3: 集成 IPC**

监听 `ASR_TRANSCRIPT` 事件更新 store；"发送给 AI" 调用 `LLM_CHAT` 通道。

**Step 4: 运行验证**

手动测试：开始录音 → 说话 → 实时显示转写 → 选中文本 → 发送 AI。

**Step 5: Commit**

```bash
git add .
git commit -m "feat: implement TranscriptPanel with real-time display and AI send"
```

---

## Phase 5: 数据库与面试记录

### Task 16: 实现 SQLite 数据库层

**Files:**
- Create: `src/main/db/database.ts`
- Create: `src/main/db/migrations/001_initial.ts`
- Create: `src/main/db/repositories/SessionRepo.ts`
- Create: `src/main/db/repositories/TranscriptRepo.ts`
- Create: `src/main/db/repositories/ScreenshotQARepo.ts`
- Create: `src/main/db/repositories/ReviewRepo.ts`
- Create: `src/main/db/__tests__/repositories.test.ts`

**Step 1: 写测试**

```typescript
describe('SessionRepo', () => {
  it('should create a session');
  it('should update session status');
  it('should list sessions with pagination');
  it('should filter sessions by company');
  it('should delete a session and cascade');
});

describe('TranscriptRepo', () => {
  it('should batch insert transcript entries');
  it('should get entries by sessionId ordered by timestamp');
});
```

**Step 2: 运行测试确认失败**

```bash
npx vitest run src/main/db/__tests__/repositories.test.ts
```

**Step 3: 实现数据库初始化和迁移**

`database.ts`：使用 better-sqlite3 打开数据库文件，运行迁移。

`001_initial.ts`：创建表 sessions, transcript_entries, screenshot_qas, review_reports。

**Step 4: 实现 Repositories**

每个 Repo 封装对应表的 CRUD 操作，使用参数化查询防 SQL 注入。

**Step 5: 运行测试确认通过**

```bash
npx vitest run src/main/db/__tests__/repositories.test.ts
```

**Step 6: Commit**

```bash
git add .
git commit -m "feat: implement SQLite database layer with repositories and migrations"
```

---

### Task 17: 实现 SessionRecorder Worker

**Files:**
- Create: `src/workers/sessionWorker.ts`
- Create: `src/main/recorder/SessionRecorder.ts`

**Step 1: 实现 Worker 线程**

`src/workers/sessionWorker.ts`：接收来自主线程的消息（转写条目、截屏问答），写入 SQLite。使用 `parentPort` 通信。

```typescript
// 消息类型
type WorkerMessage =
  | { type: 'start'; sessionId: string; company?: string; position?: string }
  | { type: 'transcript'; entry: TranscriptEntry }
  | { type: 'screenshotQA'; qa: ScreenshotQA }
  | { type: 'stop' }
  ;
```

**Step 2: 实现 SessionRecorder**

`SessionRecorder.ts`：封装 Worker 创建/销毁，提供简洁的 API 给主进程使用。

```typescript
export class SessionRecorder {
  private worker: Worker | null = null;
  private currentSessionId: string | null = null;

  startSession(company?: string, position?: string): string; // 返回 sessionId
  recordTranscript(entry: Omit<TranscriptEntry, 'id' | 'sessionId'>): void;
  recordScreenshotQA(qa: Omit<ScreenshotQA, 'id' | 'sessionId'>): void;
  stopSession(): void;
  isRecording(): boolean;
}
```

**Step 3: 在主进程中集成**

ASR 转写结果 → SessionRecorder.recordTranscript()
截屏 AI 回答 → SessionRecorder.recordScreenshotQA()

**Step 4: 运行验证**

手动测试：开始面试 → 转写/截屏 → 停止 → 检查 SQLite 中数据完整。

**Step 5: Commit**

```bash
git add .
git commit -m "feat: implement SessionRecorder worker thread for interview recording"
```

---

### Task 18: 实现面试复盘报告生成

**Files:**
- Create: `src/main/services/ReviewService.ts`
- Create: `src/renderer/components/ReviewReport/ReviewReport.tsx`
- Create: `src/renderer/components/ReviewReport/index.ts`

**Step 1: 实现 ReviewService**

```typescript
export class ReviewService {
  private llmService: LLMService;
  private sessionRepo: SessionRepo;
  private transcriptRepo: TranscriptRepo;
  private screenshotQARepo: ScreenshotQARepo;
  private reviewRepo: ReviewRepo;

  // 生成复盘报告
  async generateReview(sessionId: string): Promise<AsyncIterable<string>>;

  // 构建发送给 LLM 的面试摘要
  private buildSessionSummary(sessionId: string): string;
}
```

使用专门的 review prompt，要求 LLM 返回结构化 JSON（面试概况、问题清单、表现评估、改进建议、知识点标签）。

**Step 2: 实现 ReviewReport 组件**

展示结构化复盘报告，支持重新生成、导出 PDF / Markdown。

**Step 3: 集成 IPC**

注册 `REVIEW_GENERATE` 和 `REVIEW_GET` handlers。

**Step 4: Commit**

```bash
git add .
git commit -m "feat: implement interview review report generation and display"
```

---

## Phase 6: 设置、托盘与历史

### Task 19: 实现 Settings 设置界面

**Files:**
- Create: `src/renderer/components/Settings/Settings.tsx`
- Create: `src/renderer/components/Settings/ModelSettings.tsx`
- Create: `src/renderer/components/Settings/ASRSettings.tsx`
- Create: `src/renderer/components/Settings/HotkeySettings.tsx`
- Create: `src/renderer/components/Settings/AppearanceSettings.tsx`
- Create: `src/renderer/components/Settings/StorageSettings.tsx`
- Create: `src/renderer/stores/settingsStore.ts`

**Step 1: 实现 settingsStore**

从主进程读取配置到渲染进程 store，修改后同步回主进程。

**Step 2: 实现各设置页签**

- **ModelSettings**: 供应商下拉（预设 + 自定义）、API 地址、API Key（密码框 + 显示按钮）、模型名、Temperature 滑块、测试连接按钮。截屏/语音/复盘可分别配置。
- **ASRSettings**: 供应商选择、凭证输入、语言模式、音频设备选择（下拉列表 + 测试按钮）。
- **HotkeySettings**: 所有快捷键列表，每行一个快捷键录入框（按键录入），冲突提示，恢复默认按钮。
- **AppearanceSettings**: 主题切换、透明度滑块、字体大小、面板尺寸。
- **StorageSettings**: 数据目录选择、保留策略、数据库大小显示、清理/导出按钮。

**Step 3: 使用 Radix UI Tabs 组合**

`Settings.tsx` 使用 Tab 组件组织各设置页签。

**Step 4: 运行验证**

手动测试所有设置项的读取、修改、保存。

**Step 5: Commit**

```bash
git add .
git commit -m "feat: implement Settings UI with model, ASR, hotkey, appearance, storage tabs"
```

---

### Task 20: 实现 TrayManager 系统托盘

**Files:**
- Create: `src/main/tray/TrayManager.ts`
- Create: `resources/tray-icon.png`
- Create: `resources/tray-icon@2x.png`

**Step 1: 实现 TrayManager**

```typescript
import { Tray, Menu, nativeImage } from 'electron';

export class TrayManager {
  private tray: Tray | null = null;

  constructor(
    private stealthWindow: StealthWindow,
    private hotkeyManager: HotkeyManager,
    private sessionRecorder: SessionRecorder
  );

  create(): void;

  // 动态更新菜单（根据录音状态等）
  updateMenu(): void;

  // 更新托盘图标状态（就绪/录音中）
  setStatus(status: 'ready' | 'recording'): void;

  destroy(): void;
}
```

菜单项：截屏分析、开始/停止录音、显示/隐藏、面试记录、设置、退出。每项显示对应快捷键。

**Step 2: 创建托盘图标**

创建 16x16 和 32x32 (@2x) 的简洁托盘图标 PNG。

**Step 3: 在主进程中集成**

**Step 4: 运行验证**

Expected: 系统托盘显示图标，点击菜单项功能正常。

**Step 5: Commit**

```bash
git add .
git commit -m "feat: implement system tray with dynamic menu"
```

---

### Task 21: 实现历史记录界面

**Files:**
- Create: `src/renderer/components/History/HistoryList.tsx`
- Create: `src/renderer/components/History/SessionDetail.tsx`
- Create: `src/renderer/components/History/index.ts`
- Create: `src/renderer/stores/historyStore.ts`

**Step 1: 实现 historyStore**

```typescript
interface HistoryState {
  sessions: Session[];
  currentSession: Session | null;
  transcripts: TranscriptEntry[];
  screenshotQAs: ScreenshotQA[];
  review: ReviewReport | null;
  filters: { company?: string; dateRange?: [number, number] };

  loadSessions(): Promise<void>;
  loadSessionDetail(id: string): Promise<void>;
  setFilters(filters: ...): void;
  deleteSession(id: string): Promise<void>;
  exportSession(id: string, format: 'pdf' | 'markdown' | 'json'): Promise<void>;
}
```

**Step 2: 实现 HistoryList**

面试记录列表，每项显示：日期、公司、岗位、时长、问题数、复盘状态。支持筛选（公司、时间）和排序。

**Step 3: 实现 SessionDetail**

查看单次面试详情：转写全文、截屏问答、复盘报告。支持生成/重新生成复盘。导出按钮。

**Step 4: 集成导出功能**

安装 `jspdf` 和 `markdown-it`，实现 PDF 和 Markdown 导出。

```bash
npm install jspdf markdown-it
npm install -D @types/markdown-it
```

**Step 5: 运行验证**

手动测试：查看历史列表 → 点进详情 → 查看转写/问答 → 生成复盘 → 导出。

**Step 6: Commit**

```bash
git add .
git commit -m "feat: implement history management with session detail and export"
```

---

## Phase 7: 主界面整合与首次启动

### Task 22: 实现主界面布局与路由

**Files:**
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/components/Layout/MainLayout.tsx`
- Create: `src/renderer/stores/appStore.ts`

**Step 1: 实现 appStore**

```typescript
interface AppState {
  currentView: 'answer' | 'transcript' | 'history' | 'settings' | 'review';
  isRecording: boolean;
  currentSessionId: string | null;

  setView(view: ...): void;
  setRecording(recording: boolean, sessionId?: string): void;
}
```

**Step 2: 实现 MainLayout**

隐身窗口内的布局：
- 顶部窄工具栏：视图切换 Tab（答案/转写/历史/设置）+ 面试状态指示
- 内容区：根据 currentView 渲染对应面板
- 答案面板和转写面板在面试中可分栏显示或 Tab 切换

**Step 3: 更新 App.tsx**

整合所有组件到 MainLayout 中。

**Step 4: 运行验证**

```bash
npx electron-vite dev
```

Expected: 隐身窗口中显示完整 UI，Tab 切换正常。

**Step 5: Commit**

```bash
git add .
git commit -m "feat: implement main layout with view routing"
```

---

### Task 23: 实现首次启动引导

**Files:**
- Create: `src/renderer/components/Onboarding/Onboarding.tsx`
- Create: `src/renderer/components/Onboarding/WelcomeStep.tsx`
- Create: `src/renderer/components/Onboarding/AudioSetupStep.tsx`
- Create: `src/renderer/components/Onboarding/ModelSetupStep.tsx`
- Create: `src/renderer/components/Onboarding/ASRSetupStep.tsx`
- Create: `src/renderer/components/Onboarding/HotkeyStep.tsx`
- Create: `src/renderer/components/Onboarding/index.ts`

**Step 1: 实现引导流程组件**

步骤式向导 UI，使用 Radix UI Dialog 作为容器：

1. **WelcomeStep**: 产品介绍，3 张特性卡片
2. **AudioSetupStep**: 检测 BlackHole → 引导安装 → 配置多输出设备 → 测试
3. **ModelSetupStep**: 选供应商 → 填 API Key → 选模型 → 测试连接
4. **ASRSetupStep**: 选供应商 → 填凭证 → 测试识别
5. **HotkeyStep**: 展示默认快捷键 → 可修改 → 完成

**Step 2: 集成到 App**

首次启动（检测 `config.onboardingCompleted === false`）时显示引导，完成后设置标记。

**Step 3: 运行验证**

删除配置文件，重新启动 App，验证引导流程完整走通。

**Step 4: Commit**

```bash
git add .
git commit -m "feat: implement first-run onboarding wizard"
```

---

### Task 24: 实现主进程 App 编排

**Files:**
- Modify: `src/main/index.ts`

**Step 1: 整合所有模块**

`src/main/index.ts` 作为 App 入口，负责：

```typescript
class App {
  private stealthWindow: StealthWindow;
  private configManager: ConfigManager;
  private hotkeyManager: HotkeyManager;
  private trayManager: TrayManager;
  private screenCapture: ScreenCapture;
  private audioCapture: AudioCapture;
  private asrService: ASRService;
  private llmService: LLMService;
  private sessionRecorder: SessionRecorder;
  private database: Database;

  async initialize(): Promise<void> {
    // 1. 初始化配置
    // 2. 初始化数据库
    // 3. 创建服务实例
    // 4. 创建隐身窗口
    // 5. 注册快捷键
    // 6. 创建系统托盘
    // 7. 注册 IPC handlers
    // 8. 监听配置变更
  }

  async shutdown(): Promise<void> {
    // 优雅关闭所有服务
  }
}
```

**Step 2: 处理生命周期**

- `app.on('ready')` → 初始化
- `app.on('before-quit')` → 优雅关闭
- `app.on('activate')` → 显示窗口（macOS dock 点击）

**Step 3: 运行完整 E2E 验证**

```bash
npx electron-vite dev
```

验证完整流程：
1. 启动 → 系统托盘 + 隐身窗口
2. 截屏 → AI 分析 → 答案显示
3. 录音 → 转写显示 → 发送 AI
4. 停止 → 查看历史 → 生成复盘
5. 设置修改 → 热重载生效

**Step 4: Commit**

```bash
git add .
git commit -m "feat: implement main process App orchestration"
```

---

## Phase 8: 打包与收尾

### Task 25: 配置 electron-builder 打包

**Files:**
- Create: `electron-builder.yml`
- Create: `resources/icon.icns`
- Modify: `package.json`

**Step 1: 配置 electron-builder**

```yaml
appId: com.ai-interview-assistant.app
productName: AI 面试助手
directories:
  output: release
mac:
  category: public.app-category.productivity
  icon: resources/icon.icns
  target:
    - target: dmg
      arch: [universal]
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.inherit.plist
dmg:
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications
```

**Step 2: 创建 entitlements**

macOS 权限声明：麦克风、屏幕录制。

**Step 3: 添加 npm scripts**

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "package": "electron-vite build && electron-builder --mac",
    "package:dmg": "electron-vite build && electron-builder --mac --dmg"
  }
}
```

**Step 4: 构建验证**

```bash
npm run package
```

Expected: 在 `release/` 目录下生成 `.dmg` 安装包。

**Step 5: 安装并测试**

打开 DMG → 拖入 Applications → 启动 → 验证所有功能正常。

**Step 6: Commit**

```bash
git add .
git commit -m "feat: configure electron-builder for macOS packaging"
```

---

### Task 26: 最终集成测试与修复

**Files:**
- 根据测试结果修复

**Step 1: 完整功能测试清单**

逐项验证：

- [ ] 隐身窗口：置顶、透明、防屏幕共享
- [ ] 快捷键：所有默认快捷键生效
- [ ] 快捷键自定义：修改、冲突检测、热重载
- [ ] 截屏：区域选择、截图正确
- [ ] AI 分析：截屏发送、流式回答、Markdown 渲染
- [ ] 上下文开关：默认关闭，开启后携带历史
- [ ] 音频捕获：系统音频 + 麦克风双通道
- [ ] 语音转写：实时显示、说话人区分
- [ ] 转写发 AI：选中文本发送、AI 回答
- [ ] 面试记录：自动记录、SQLite 存储完整
- [ ] 复盘报告：生成、显示、导出
- [ ] 历史管理：列表、筛选、详情、导出
- [ ] 设置：所有配置项读写正常
- [ ] 系统托盘：菜单功能、状态指示
- [ ] 首次引导：完整流程
- [ ] 打包安装：DMG 安装后功能正常

**Step 2: 修复发现的问题**

**Step 3: Final Commit**

```bash
git add .
git commit -m "fix: address integration test issues"
```

---

## 任务依赖关系

```
Task 1 (项目初始化)
  ├── Task 2 (依赖安装)
  │     └── Task 3 (类型定义)
  │           ├── Task 4 (隐身窗口)
  │           ├── Task 5 (配置管理)
  │           │     └── Task 6 (快捷键)
  │           └── Task 7 (IPC 通信)
  │                 ├── Task 8 (LLM 服务)
  │                 │     ├── Task 10 (截屏服务) ← Task 9 (选区窗口)
  │                 │     │     └── Task 11 (答案面板)
  │                 │     └── Task 18 (复盘报告)
  │                 ├── Task 12 (音频捕获)
  │                 │     └── Task 13 (ASR 抽象层)
  │                 │           ├── Task 14 (ASR Providers)
  │                 │           └── Task 15 (转写面板)
  │                 └── Task 16 (数据库)
  │                       └── Task 17 (会话记录器)
  │
  Task 19 (设置界面) ← Task 5, 6, 8, 13
  Task 20 (系统托盘) ← Task 4, 6, 17
  Task 21 (历史管理) ← Task 16, 18
  Task 22 (主界面整合) ← Task 11, 15, 19, 21
  Task 23 (首次引导) ← Task 19
  Task 24 (主进程编排) ← All services
  Task 25 (打包) ← Task 24
  Task 26 (集成测试) ← Task 25
```

## 预估工作量

| Phase | 任务数 | 描述 |
|-------|--------|------|
| Phase 1 | 3 | 项目基础搭建 |
| Phase 2 | 4 | 隐身窗口与快捷键 |
| Phase 3 | 4 | 截屏与 AI 分析 |
| Phase 4 | 4 | 语音捕获与转写 |
| Phase 5 | 3 | 数据库与面试记录 |
| Phase 6 | 3 | 设置、托盘与历史 |
| Phase 7 | 3 | 主界面整合与引导 |
| Phase 8 | 2 | 打包与收尾 |
| **合计** | **26** | |
