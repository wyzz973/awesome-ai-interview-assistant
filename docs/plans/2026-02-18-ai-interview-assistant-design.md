# AI 面试助手 — 产品设计文档 (PRD)

> 日期：2026-02-18
> 版本：V1.0 MVP
> 状态：已确认

---

## 一、产品概述

### 1.1 产品定位

一款 macOS 桌面端 AI 面试助手，帮助用户在技术面试中获取实时 AI 辅助。核心能力包括：截屏题目分析、实时语音转写、AI 智能问答、面试全程记录与复盘。

### 1.2 核心差异化

- **隐身窗口**：悬浮答案面板不会被会议软件的屏幕共享捕获
- **双通道语音**：分离面试官与用户声音，实时转写
- **多模型支持**：兼容 OpenAI API 格式，支持国内外主流大模型
- **面试复盘**：全程记录 + AI 生成结构化复盘报告

### 1.3 目标平台

- V1.0：macOS
- 后续：架构预留跨平台扩展能力（Windows）

### 1.4 商业模式

- V1.0：纯本地应用，用户自配 API Key
- 后续：架构预留后端接入能力，转 SaaS 订阅制

---

## 二、整体架构

### 2.1 架构方案

Electron 全栈方案 — Electron 主进程处理原生能力，React 渲染进程构建 UI，全栈 TypeScript。

```
┌──────────────────────────────────────────────────────┐
│                    Electron App                       │
│                                                       │
│  ┌─────────────────┐    IPC     ┌──────────────────┐ │
│  │   Main Process   │◄────────►│  Renderer Process  │ │
│  │   (Node.js)      │          │  (React + TS)      │ │
│  │                   │          │                    │ │
│  │  - 窗口管理       │          │  - 悬浮答案面板    │ │
│  │  - 截屏服务       │          │  - 语音转写面板    │ │
│  │  - 音频捕获       │          │  - 设置界面        │ │
│  │  - 全局快捷键     │          │  - 对话历史        │ │
│  │  - 系统托盘       │          │  - 面试记录/复盘   │ │
│  └────────┬──────────┘          └──────────────────┘ │
│           │                                           │
│     Worker Thread                                     │
│     ┌──────────────┐                                  │
│     │ SessionRecorder│  面试记录子进程                  │
│     └──────────────┘                                  │
└───────────┼───────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────┐
│                    外部服务层                           │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  LLM API     │  │  ASR 服务     │  │  声纹识别     │ │
│  │  (OpenAI 兼容)│  │  (云端转写)   │  │  (说话人分离) │ │
│  └─────────────┘  └──────────────┘  └──────────────┘ │
└───────────────────────────────────────────────────────┘
```

### 2.2 核心模块

| 模块 | 职责 | 所在进程 |
|------|------|---------|
| WindowManager | 隐身窗口创建、置顶、透明度、拖拽、防屏幕共享 | Main |
| ScreenCapture | 快捷键截屏、区域选择、图片处理 | Main |
| AudioCapture | 系统音频/麦克风捕获、双通道分离 | Main |
| ASRService | 音频流转写、说话人标识 | Main |
| LLMService | 统一 AI 调用接口（兼容 OpenAI API 格式） | Main |
| HotkeyManager | 全局快捷键注册、冲突检测、热重载 | Main |
| TrayManager | 系统托盘菜单、状态指示 | Main |
| SessionRecorder | 面试全程记录（独立子进程） | Worker |
| ConfigManager | 配置管理、加密存储 | Main |
| Database | SQLite 数据访问层 | Main |
| AnswerPanel | 悬浮答案显示、Markdown 渲染 | Renderer |
| TranscriptPanel | 实时语音转写显示、说话人区分 | Renderer |
| SettingsView | API 配置、模型选择、快捷键自定义 | Renderer |
| HistoryView | 面试记录查看、筛选、导出 | Renderer |
| ReviewReport | 复盘报告展示 | Renderer |

---

## 三、隐身窗口系统

### 3.1 实现原理

利用 macOS 窗口层级和 Electron 内置 API 实现对屏幕共享的不可见性。

```
macOS 屏幕层级：

Level 25 (floating)  ← 我们的窗口 (contentProtection=true)
Level 0  (normal)    ← 会议软件 (屏幕共享只能捕获这一层)
```

### 3.2 核心配置

```typescript
const stealthWindow = new BrowserWindow({
  transparent: true,           // 窗口透明
  frame: false,                // 无边框
  alwaysOnTop: true,           // 始终置顶
  skipTaskbar: true,           // 不在任务栏显示
  hasShadow: false,            // 无阴影
  focusable: false,            // 不抢焦点（避免触发焦点检测）
});

stealthWindow.setContentProtection(true);   // 防屏幕共享捕获
stealthWindow.setAlwaysOnTop(true, 'floating');
stealthWindow.setOpacity(0.85);             // 透明度可调
```

### 3.3 防检测策略

| 检测类型 | 对策 |
|---------|------|
| 屏幕共享捕获 | `setContentProtection(true)` — 系统级屏蔽 |
| 焦点检测 | `focusable: false` — 窗口不获取焦点 |
| 鼠标/键盘事件检测 | `ignoreMouseEvents`，仅交互时临时启用 |
| 窗口列表检测 | 窗口标题留空，进程名伪装 |

### 3.4 交互模式

| 模式 | 触发方式 | 行为 |
|------|---------|------|
| 正常模式 | 默认 | 窗口不可点击，鼠标事件穿透 |
| 交互模式 | 按住 Option | 临时可点击、可滚动 |
| 拖拽模式 | 按住 Cmd+Option | 临时可拖拽窗口位置 |

---

## 四、快捷键系统

### 4.1 全部快捷键可自定义

所有快捷键均可在设置界面中自定义，提供以下默认值：

| 功能 | 默认快捷键 | 说明 |
|------|-----------|------|
| 截屏 | `Cmd+Shift+S` | 触发区域截屏并发送 AI |
| 隐藏/显示 | `Cmd+Shift+H` | 快速切换窗口可见性 |
| 降低透明度 | `Cmd+Shift+[` | 更透明 |
| 增加透明度 | `Cmd+Shift+]` | 更不透明 |
| 交互模式 | `Option`（按住） | 临时允许点击窗口 |
| 拖拽模式 | `Cmd+Option`（按住） | 临时允许拖拽窗口 |
| 开始/停止录音 | `Cmd+Shift+R` | 切换语音捕获状态 |
| 发送文字提问 | `Cmd+Enter` | 发送问题给 AI |

### 4.2 自定义能力

- 设置界面中直接录入新快捷键（按下即录入）
- 自动检测冲突（与系统/其他应用冲突时提醒）
- 热重载，修改后立即生效，无需重启
- 一键恢复默认快捷键
- 配置持久化到 `hotkeys.json`

---

## 五、截屏与 AI 分析

### 5.1 截屏流程

```
用户按快捷键 → 隐藏 AI 窗口 → 进入区域选择模式（全屏遮罩+十字光标）
→ 用户拖拽选区 → 截取区域 → 恢复 AI 窗口（显示加载状态）
→ 图片 base64 发送 LLM → 流式返回答案 → 实时渲染 Markdown + 代码高亮
```

### 5.2 LLM 调用接口

统一使用 OpenAI API 兼容格式，支持多供应商切换：

```typescript
class LLMService {
  private baseURL: string;   // 可配置
  private apiKey: string;
  private model: string;

  // 截屏分析
  async analyzeScreenshot(image: Buffer, context?: string): Promise<ReadableStream>;
  // 文本问答
  async chat(messages: Message[]): Promise<ReadableStream>;
  // 复盘报告生成
  async generateReview(sessionData: SessionData): Promise<ReadableStream>;
}
```

支持的供应商预设：OpenAI、DeepSeek、Qwen（通义千问）、GLM（智谱）、Moonshot、Claude，以及任意 OpenAI API 兼容的自定义端点。

### 5.3 上下文控制

| 功能 | 说明 |
|------|------|
| 系统提示词 | 内置面试场景优化的 system prompt，可自定义 |
| 历史上下文 | **用户可选项（默认关闭）**，开启后携带最近 N 轮截屏问答作为上下文 |
| 题型识别 | 自动识别代码题/选择题/系统设计题，切换提示策略 |

---

## 六、语音捕获与实时转写

### 6.1 双通道音频架构

```
通道 A：系统音频（面试官声音）
  会议软件 → 虚拟音频设备 (BlackHole) → App 捕获
  同时通过多输出设备 → 物理扬声器（用户仍能听到）

通道 B：麦克风（用户声音）
  麦克风 → CoreAudio → App 捕获
```

### 6.2 系统音频捕获

首次启动时引导安装 BlackHole 虚拟音频驱动，并提供一键配置脚本创建多输出设备。

### 6.3 ASR 服务

抽象接口设计，支持多供应商切换：

| 供应商 | 说明 |
|--------|------|
| 阿里云 ASR | 国内推荐，中英混合识别好 |
| 腾讯云 ASR | 国内备选 |
| Whisper API | OpenAI Whisper，国际通用 |
| Google STT | Google Speech-to-Text |

配置参数：语言（中文/英文/中英混合）、采样率 16kHz、编码 PCM/Opus、流式实时转写延迟 < 500ms。

### 6.4 说话人区分

```
第一层：物理通道隔离（主要）
  系统音频通道 → 标记为 "面试官"
  麦克风通道   → 标记为 "我"

第二层：AI 声纹辅助（补充）
  当两人声音出现在同一通道时，使用声纹特征二次判断和去噪
```

### 6.5 转写面板

- 实时显示带时间戳和说话人标记的转写文本
- 支持选中文本一键发送 AI 分析
- 录音状态指示和时长显示
- 支持导出和清空

---

## 七、面试记录与智能复盘

### 7.1 SessionRecorder 子进程

独立 Worker Thread 运行，不阻塞主进程。持续记录：

- 语音转写全文（带时间戳 + 说话人）
- 截屏问答记录（截图 + AI 回答）
- 用户手动提问记录
- 会话元数据（时长、公司、岗位）

实时写入 SQLite 数据库，断电不丢失。

### 7.2 数据模型

```typescript
// 面试会话
interface Session {
  id: string;
  company: string;        // 公司名称（可选填）
  position: string;       // 面试岗位（可选填）
  startTime: number;
  endTime: number;
  duration: number;
  status: 'recording' | 'completed' | 'reviewed';
}

// 转写记录
interface TranscriptEntry {
  sessionId: string;
  timestamp: number;
  speaker: 'interviewer' | 'me';
  text: string;
}

// 截屏问答记录
interface ScreenshotQA {
  sessionId: string;
  timestamp: number;
  imagePath: string;
  question: string;
  answer: string;
  model: string;
}

// 复盘报告
interface ReviewReport {
  sessionId: string;
  generatedAt: number;
  summary: string;          // 面试概况
  questions: string[];      // 面试官问题列表
  performance: {
    strengths: string[];
    weaknesses: string[];
  };
  suggestions: string[];    // 改进建议
  keyTopics: string[];      // 涉及知识点
}
```

### 7.3 复盘报告

面试结束后，汇总全部转写 + 问答记录，调用 LLM 生成结构化报告，包含：

- 面试概况
- 问题清单
- 表现良好项
- 待改进项
- 改进建议
- 知识点标签

支持重新生成、导出 PDF / Markdown。

### 7.4 历史管理

- 按公司、岗位、时间筛选
- 查看完整转写和问答记录
- 导出单次/全部记录

---

## 八、设置系统与本地存储

### 8.1 设置分类

| 分类 | 内容 |
|------|------|
| AI 模型 | 供应商选择、API 地址、API Key、模型名称、Temperature 等参数；截屏/语音/复盘可分别配置不同模型 |
| 语音识别 | ASR 供应商、凭证、语言模式、音频输入源选择 |
| 快捷键 | 全部快捷键自定义 |
| 外观 | 主题、透明度、字体大小、面板尺寸、启动位置 |
| 存储 | 数据目录、截图保留策略、数据清理、导出 |

### 8.2 存储分层

| 层级 | 技术 | 内容 |
|------|------|------|
| 配置数据 | JSON 文件 (electron-store) | settings.json / hotkeys.json / models.json |
| 敏感数据 | macOS Keychain (keytar) | API Key、ASR 凭证 |
| 业务数据 | SQLite (better-sqlite3) | 面试会话、转写、问答、复盘报告 |
| 二进制文件 | 文件系统 | 截图 PNG，数据库中存路径引用 |

### 8.3 本地目录结构

```
~/AIInterviewer/
├── config/
│   ├── settings.json
│   ├── hotkeys.json
│   ├── models.json
│   └── prompts/
│       ├── system.md
│       ├── screenshot.md
│       └── review.md
├── data/
│   ├── interviews.db
│   ├── screenshots/
│   └── exports/
└── logs/
    └── app.log
```

### 8.4 安全性

| 项目 | 措施 |
|------|------|
| API Key | macOS Keychain 加密存储 |
| 配置文件权限 | 仅当前用户可读写 (chmod 600) |
| 截图存储 | 纯本地，不上传服务器 |
| 日志脱敏 | 自动屏蔽敏感信息 |

---

## 九、技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 桌面框架 | Electron 33+ | 主框架 |
| 前端框架 | React 19 + TypeScript | UI 层 |
| 状态管理 | Zustand | 轻量 |
| UI 组件 | Tailwind CSS + Radix UI | 样式 + 无样式组件 |
| Markdown 渲染 | react-markdown + rehype-highlight | 答案渲染 |
| 数据库 | better-sqlite3 | 嵌入式 SQLite |
| 配置存储 | electron-store | JSON 配置 |
| 密钥存储 | keytar (macOS Keychain) | 加密存储 |
| 音频捕获 | node-audiorecorder + BlackHole | 双通道音频 |
| ASR | 阿里云 / 腾讯云 / Whisper API | 可切换 |
| LLM | OpenAI 兼容 API (fetch) | 多供应商 |
| 构建工具 | Vite + electron-builder | 开发 + 打包 |
| 进程通信 | Electron IPC | Main ↔ Renderer |
| 子进程 | Worker Threads | 面试记录 |
| 日志 | electron-log | 应用日志 |
| 导出 | jspdf + markdown-it | PDF / Markdown |

---

## 十、项目结构

```
ai-interview-assistant/
├── package.json
├── tsconfig.json
├── electron-builder.yml
├── vite.config.ts
│
├── src/
│   ├── main/                     # Electron 主进程
│   │   ├── index.ts
│   │   ├── window/
│   │   │   ├── StealthWindow.ts
│   │   │   └── SelectorWindow.ts
│   │   ├── capture/
│   │   │   ├── ScreenCapture.ts
│   │   │   └── AudioCapture.ts
│   │   ├── services/
│   │   │   ├── LLMService.ts
│   │   │   ├── ASRService.ts
│   │   │   └── ASRProviders/
│   │   │       ├── AliyunASR.ts
│   │   │       ├── TencentASR.ts
│   │   │       └── WhisperASR.ts
│   │   ├── recorder/
│   │   │   └── SessionRecorder.ts
│   │   ├── hotkey/
│   │   │   └── HotkeyManager.ts
│   │   ├── tray/
│   │   │   └── TrayManager.ts
│   │   ├── db/
│   │   │   ├── database.ts
│   │   │   ├── migrations/
│   │   │   └── repositories/
│   │   │       ├── SessionRepo.ts
│   │   │       ├── TranscriptRepo.ts
│   │   │       └── ReviewRepo.ts
│   │   ├── config/
│   │   │   └── ConfigManager.ts
│   │   └── ipc/
│   │       └── handlers.ts
│   │
│   ├── renderer/                 # React 渲染进程
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── AnswerPanel/
│   │   │   ├── TranscriptPanel/
│   │   │   ├── ScreenshotSelector/
│   │   │   ├── Settings/
│   │   │   ├── History/
│   │   │   ├── ReviewReport/
│   │   │   └── Common/
│   │   ├── stores/
│   │   │   ├── appStore.ts
│   │   │   ├── chatStore.ts
│   │   │   └── settingsStore.ts
│   │   ├── hooks/
│   │   ├── styles/
│   │   └── utils/
│   │
│   ├── shared/                   # 共享代码
│   │   ├── types/
│   │   │   ├── session.ts
│   │   │   ├── llm.ts
│   │   │   └── config.ts
│   │   └── constants.ts
│   │
│   └── workers/                  # Worker 线程
│       └── sessionWorker.ts
│
├── resources/
│   ├── icon.icns
│   └── tray-icon.png
│
└── scripts/
    └── setup-audio.sh
```

---

## 十一、用户流程

### 11.1 首次启动

```
安装打开 → 欢迎引导 (3步) → 音频设备配置 (BlackHole 引导安装)
→ AI 模型配置 (选供应商、填 Key、测试连接)
→ ASR 配置 (选供应商、填凭证、测试识别)
→ 快捷键确认 → 进入主界面
```

### 11.2 日常使用

```
① 面试前：启动 App → 驻留托盘 → 可选填公司/岗位
② 面试中-语音：快捷键录音 → 双通道转写 → 选中文本发 AI
③ 面试中-截屏：快捷键截屏 → 选区 → AI 分析 → 流式答案
④ 面试后：停止录音 → 自动保存 → 一键复盘 → 查看/导出
```

### 11.3 系统托盘

```
AI 面试助手    ● 就绪
──────────────────
截屏分析   ⌘⇧S
开始录音   ⌘⇧R
显示/隐藏  ⌘⇧H
──────────────────
面试记录
设置
──────────────────
退出
```

---

## 十二、MVP 边界

### V1.0 包含

- 隐身悬浮窗口（防屏幕共享、置顶、透明度可调）
- 快捷键截屏 + AI 分析（区域选择，流式回答）
- 系统音频 + 麦克风双通道捕获
- 实时语音转写 + 说话人区分
- 转写文本一键发送 AI 问答
- 面试全程记录（子进程，SQLite 存储）
- 面试复盘报告生成
- 历史记录管理（查看、筛选、导出）
- 多 LLM 模型支持（OpenAI API 兼容格式）
- 多 ASR 供应商支持
- 全局快捷键自定义
- 设置界面（模型、语音、外观、存储）
- 系统托盘

### V1.0 不包含（后续版本）

- 后端服务 / 用户账户体系
- 订阅付费系统
- Windows 平台支持
- 自动更新 (OTA)
- 知识库上传（简历/JD 解析）
- 统计分析面板
- 多语言国际化
