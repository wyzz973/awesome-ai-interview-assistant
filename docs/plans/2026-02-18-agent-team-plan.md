# AI 面试助手 — Agent Team 开发计划

> 日期：2026-02-18
> 设计文档：`docs/plans/2026-02-18-ai-interview-assistant-design.md`
> 实施参考：`docs/plans/2026-02-18-ai-interview-assistant-impl.md`

---

## 一、团队编制与职责分工

### 1.1 团队成员

| 角色 | Agent Name | 职责概述 |
|------|-----------|---------|
| **技术负责人 (Tech Lead)** | `lead` | 项目编排、代码审查、分支合并、冲突解决、最终集成 |
| **基础架构工程师** | `infra` | 项目脚手架、构建配置、共享类型、IPC 通信层、配置管理、数据库层 |
| **系统工程师** | `system` | 隐身窗口、快捷键系统、截屏捕获、音频捕获、系统托盘 |
| **AI 服务工程师** | `ai-service` | LLM 服务、ASR 服务及多供应商适配、会话记录 Worker、复盘服务 |
| **前端工程师** | `frontend` | 所有 React UI 组件、Zustand stores、主界面布局、首次引导 |
| **测试工程师** | `qa` | 单元测试编写、每个任务的验收测试、集成测试、最终全量测试 |

### 1.2 文件所有权（避免冲突）

每个工程师只修改自己负责的文件区域。跨区域修改需通过 `lead` 协调。

```
infra 负责文件：
  ├── package.json, tsconfig.json, electron.vite.config.ts
  ├── src/shared/                    # 类型定义、常量
  ├── src/preload/                   # preload 脚本
  ├── src/main/config/               # ConfigManager
  ├── src/main/ipc/                  # IPC handlers
  └── src/main/db/                   # 数据库层

system 负责文件：
  ├── src/main/window/               # StealthWindow, SelectorWindow
  ├── src/main/hotkey/               # HotkeyManager
  ├── src/main/capture/              # ScreenCapture, AudioCapture
  ├── src/main/tray/                 # TrayManager
  ├── scripts/                       # setup-audio.sh
  └── resources/                     # 图标资源

ai-service 负责文件：
  ├── src/main/services/             # LLMService, ASRService, ReviewService
  ├── src/main/services/ASRProviders/ # 各 ASR 供应商
  ├── src/main/recorder/             # SessionRecorder
  └── src/workers/                   # sessionWorker

frontend 负责文件：
  ├── src/renderer/components/       # 所有 UI 组件
  ├── src/renderer/stores/           # Zustand stores
  ├── src/renderer/hooks/            # 自定义 Hooks
  ├── src/renderer/styles/           # 样式
  ├── src/renderer/utils/            # 工具函数
  ├── src/renderer/App.tsx
  ├── src/renderer/main.tsx
  └── src/renderer/index.html

qa 负责文件：
  └── **/__tests__/                  # 所有测试文件

lead 负责文件：
  ├── src/main/index.ts              # 主进程入口（最终集成）
  ├── electron-builder.yml           # 打包配置
  └── docs/                          # 文档
```

---

## 二、Git 工作流

### 2.1 分支策略

```
main (保护分支)
  │
  ├── task001_项目初始化_electron_react_vite
  ├── task002_安装核心依赖_配置tailwind
  ├── task003_共享类型定义
  ├── task004_隐身窗口_stealth_window
  ├── task005_配置管理_config_manager
  │   ...
  └── task026_最终集成测试
```

### 2.2 提交规范

**分支命名：** `taskXXX_任务描述`（下划线分隔，纯小写拼音/英文）

**提交流程（每个任务必须遵循）：**

```
1. 开发者从 main 创建任务分支
   git checkout main && git pull
   git checkout -b taskXXX_任务描述

2. 开发者完成代码编写

3. 开发者自测通过后，通知 qa

4. qa 在该分支上运行验收测试
   - 编译检查：npx tsc --noEmit
   - 单元测试：npx vitest run（如有）
   - 功能验证：按验收标准逐项检查

5. qa 验收通过 → 开发者在分支上 commit
   git add <specific files>
   git commit -m "feat(taskXXX): 任务描述"

6. qa 验收不通过 → 开发者修复 → 重新提交 qa 验收

7. lead 审查并合并到 main
   git checkout main
   git merge taskXXX_任务描述
```

### 2.3 合并规则

- 所有分支必须通过 `qa` 验收后才能 commit
- `lead` 负责按依赖顺序合并分支到 `main`
- 合并冲突由 `lead` 协调相关开发者解决
- 每次合并后 `lead` 运行 `npx tsc --noEmit` 确认无编译错误

---

## 三、任务编排（7 个 Wave，最大化并行）

### Wave 0: 基础设施（串行，infra 独立完成）

> 所有后续任务依赖 Wave 0。此阶段必须先完成。

| Task ID | 分支名 | 负责人 | 任务 | 依赖 |
|---------|--------|--------|------|------|
| task001 | `task001_项目初始化_electron_react_vite` | infra | 初始化 Electron + React + Vite 项目脚手架 | 无 |
| task002 | `task002_安装核心依赖_配置tailwind` | infra | 安装所有依赖，配置 Tailwind CSS | task001 |
| task003 | `task003_共享类型定义_constants` | infra | 创建 shared types + constants | task002 |

**验收标准：**
- task001: `npx electron-vite dev` 能启动，显示 "AI 面试助手"
- task002: Tailwind 样式生效，所有依赖安装成功
- task003: `npx tsc --noEmit` 编译通过

---

### Wave 1: 核心基础模块（4 人并行）

> Wave 0 完成后，infra / system / ai-service / frontend 同时开工。

| Task ID | 分支名 | 负责人 | 任务 | 依赖 |
|---------|--------|--------|------|------|
| task004 | `task004_隐身窗口_stealth_window` | system | 实现 StealthWindow（防屏幕共享、置顶、透明、鼠标穿透） | task003 |
| task005 | `task005_配置管理_config_manager` | infra | 实现 ConfigManager + Keychain 加密存储 + 默认配置 | task003 |
| task006 | `task006_llm_service` | ai-service | 实现 LLMService（OpenAI 兼容 API、流式响应、多供应商） | task003 |
| task007 | `task007_数据库层_sqlite` | ai-service | **注意：** 与 task006 串行，ai-service 先做 task006 再做 task007。或者由 infra 完成 task005 后接手 task007 | task003 |

**并行分配方案（解决 ai-service 两个任务冲突）：**

实际执行时：
- **infra**: task005 (ConfigManager) → 完成后接 task007 (数据库层)
- **system**: task004 (StealthWindow)
- **ai-service**: task006 (LLMService)
- **frontend**: task008 (公共 UI 组件库) ← 新增准备任务

| Task ID | 分支名 | 负责人 | 任务 | 依赖 |
|---------|--------|--------|------|------|
| task004 | `task004_隐身窗口_stealth_window` | system | StealthWindow 隐身窗口 | task003 |
| task005 | `task005_配置管理_config_manager` | infra | ConfigManager 配置管理 | task003 |
| task006 | `task006_llm_service` | ai-service | LLMService AI 调用服务 | task003 |
| task008 | `task008_公共UI组件_通用样式` | frontend | 公共组件（Loading、Toast、按钮、输入框等）、全局样式、暗色主题 | task003 |

**验收标准：**
- task004: 窗口置顶、透明可调、`setContentProtection(true)` 生效、鼠标穿透正常
- task005: 配置读写正常、Keychain 存取 API Key 正常、配置变更监听生效
- task006: LLM 流式请求正确构建、SSE 解析正常、testConnection 通过（mock 测试）
- task008: 公共组件在 Storybook 或独立页面中渲染正常

---

### Wave 2: 二级模块（4 人并行）

> Wave 1 各自的前置任务完成后开工。

| Task ID | 分支名 | 负责人 | 任务 | 依赖 |
|---------|--------|--------|------|------|
| task007 | `task007_数据库层_sqlite` | infra | SQLite 数据库初始化、迁移、4 个 Repository | task005 |
| task009 | `task009_快捷键系统_hotkey_manager` | system | HotkeyManager 全局快捷键（自定义、冲突检测、热重载） | task004, task005 |
| task010 | `task010_asr_service_whisper` | ai-service | ASR 服务抽象层 + WhisperASR Provider | task006 |
| task011 | `task011_answer_panel_chat_store` | frontend | AnswerPanel 答案面板 + chatStore + Markdown 渲染 | task008 |

**验收标准：**
- task007: 所有 Repo 单元测试通过（CRUD、分页、筛选、级联删除）
- task009: 默认快捷键全部生效、自定义后热重载生效、冲突检测正确
- task010: ASR Provider 接口测试通过、WhisperASR mock 测试通过
- task011: Markdown + 代码高亮渲染正确、流式打字效果正常、上下文开关工作

---

### Wave 3: 三级模块（4 人并行）

| Task ID | 分支名 | 负责人 | 任务 | 依赖 |
|---------|--------|--------|------|------|
| task012 | `task012_ipc_通信层` | infra | IPC 通道定义 + preload + handlers 骨架 | task007, task005 |
| task013 | `task013_截屏选区_selector_window` | system | SelectorWindow 区域选择（全屏遮罩、拖拽选区、十字光标） | task009 |
| task014 | `task014_asr_aliyun_tencent` | ai-service | 阿里云 ASR + 腾讯云 ASR Provider 实现 | task010 |
| task015 | `task015_transcript_panel` | frontend | TranscriptPanel 转写面板 + transcriptStore | task011 |

**验收标准：**
- task012: IPC 通道类型安全、preload 暴露的 API 与类型匹配、编译通过
- task013: 全屏遮罩显示正确、拖拽选区坐标准确、ESC 取消正常、显示选区尺寸
- task014: 阿里云/腾讯云 WebSocket 连接测试通过（mock）、Provider 接口一致
- task015: 转写条目实时显示、说话人颜色区分、选中文本可发送 AI、录音状态指示

---

### Wave 4: 功能组装（4 人并行）

| Task ID | 分支名 | 负责人 | 任务 | 依赖 |
|---------|--------|--------|------|------|
| task016 | `task016_screen_capture_service` | system | ScreenCapture 完整截屏流程（隐藏窗口→选区→截图→恢复→发送 AI） | task013, task004 |
| task017 | `task017_audio_capture_双通道` | system | **注意：** system 串行，先 task016 后 task017。AudioCapture + BlackHole 配置脚本 | task009 |
| task018 | `task018_session_recorder_worker` | ai-service | SessionRecorder Worker 线程 + 面试记录写入 SQLite | task007, task010 |
| task019 | `task019_settings_ui` | frontend | Settings 设置界面（模型/语音/快捷键/外观/存储 5 个页签） | task015 |

**实际执行时（解决 system 串行）：**
- **system**: task016 → task017（串行）
- **infra**: task012 完成后空闲，接手协助 task017 的 `scripts/setup-audio.sh`
- **ai-service**: task018
- **frontend**: task019

**验收标准：**
- task016: 完整截屏流程走通（快捷键→隐藏→选区→截图→恢复）、截图 Buffer 正确
- task017: 系统音频 + 麦克风双通道分别捕获到数据、BlackHole 检测脚本正确
- task018: Worker 独立进程运行、转写/截屏数据写入 SQLite 正确、停止后数据完整
- task019: 所有设置项读写保存正确、测试连接按钮工作、快捷键录入框正常

---

### Wave 5: 高级功能（4 人并行）

| Task ID | 分支名 | 负责人 | 任务 | 依赖 |
|---------|--------|--------|------|------|
| task020 | `task020_review_service_复盘` | ai-service | ReviewService 复盘报告生成 + ReviewReport UI 组件 | task018, task006 |
| task021 | `task021_system_tray` | system | TrayManager 系统托盘（动态菜单、状态图标） | task016, task009, task018 |
| task022 | `task022_history_管理界面` | frontend | HistoryList + SessionDetail + 导出（PDF/Markdown） | task019 |
| task023 | `task023_ipc_handlers_完整实现` | infra | 补全所有 IPC handlers（连接各 service 到 preload API） | task012, task016, task017, task018 |

**验收标准：**
- task020: 复盘报告生成流程正确、结构化 JSON 解析正确、报告 UI 展示完整
- task021: 托盘图标显示、菜单项功能正常、录音状态动态更新
- task022: 历史列表筛选/排序正确、详情页显示完整、PDF/Markdown 导出正确
- task023: 所有 IPC 通道端到端联通、渲染进程能调用所有主进程功能

---

### Wave 6: 界面整合（2 人并行 + lead 编排）

| Task ID | 分支名 | 负责人 | 任务 | 依赖 |
|---------|--------|--------|------|------|
| task024 | `task024_main_layout_主界面整合` | frontend | MainLayout 布局 + appStore + 视图路由 + 组件整合 | task022, task019, task015, task011 |
| task025 | `task025_onboarding_首次引导` | frontend | **串行在 task024 之后。** 5 步引导向导 | task024 |
| task026 | `task026_main_process_app编排` | lead | 主进程 App 类编排（初始化所有模块、生命周期管理） | task023, task021 |

**验收标准：**
- task024: Tab 切换正常、所有面板在对应视图中显示正确
- task025: 首次启动检测正确、引导流程完整走通、完成后标记生效
- task026: App 启动流程完整（配置→DB→服务→窗口→快捷键→托盘→IPC）、优雅关闭

---

### Wave 7: 打包与最终验收（lead + qa）

| Task ID | 分支名 | 负责人 | 任务 | 依赖 |
|---------|--------|--------|------|------|
| task027 | `task027_electron_builder_打包` | lead | electron-builder 配置、entitlements、npm scripts、DMG 打包 | task026 |
| task028 | `task028_最终集成测试` | qa | 全量功能验收测试（16 项检查清单）、Bug 修复协调 | task027 |

**验收标准：**
- task027: `npm run package` 生成 DMG、安装后启动正常
- task028: 全部 16 项功能测试通过（详见下方测试清单）

---

## 四、任务详细定义

以下是每个任务的完整定义，包含具体的文件清单、实现要点和验收标准。

---

### task001: 项目初始化 Electron + React + Vite

**负责人：** infra
**分支：** `task001_项目初始化_electron_react_vite`
**依赖：** 无

**创建文件：**
- `package.json`
- `tsconfig.json`
- `tsconfig.node.json`
- `electron.vite.config.ts`
- `.gitignore`
- `src/main/index.ts` — 最基本的 BrowserWindow 创建
- `src/preload/index.ts` — 空壳 preload
- `src/renderer/index.html`
- `src/renderer/main.tsx`
- `src/renderer/App.tsx` — 显示 "AI 面试助手" 文字

**实现要点：**
```bash
npm init -y
npm install electron --save-dev
npm install react react-dom
npm install -D @types/react @types/react-dom typescript
npm install -D electron-vite @vitejs/plugin-react
```

配置 electron-vite（main/preload/renderer 三入口），配置 TypeScript 路径别名 `@shared`, `@main`, `@renderer`。

**验收标准：**
- [ ] `npx electron-vite dev` 启动成功
- [ ] Electron 窗口显示 "AI 面试助手" 文本
- [ ] TypeScript 编译无错误

---

### task002: 安装核心依赖配置 Tailwind

**负责人：** infra
**分支：** `task002_安装核心依赖_配置tailwind`
**依赖：** task001

**创建文件：**
- `tailwind.config.js`
- `postcss.config.js`
- `src/renderer/styles/globals.css`

**修改文件：**
- `package.json` (新增依赖)

**安装依赖：**
```bash
# UI
npm install zustand tailwindcss @tailwindcss/typography postcss autoprefixer -D
npm install @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-select \
  @radix-ui/react-slider @radix-ui/react-switch @radix-ui/react-tooltip
npm install react-markdown rehype-highlight remark-gfm lucide-react

# 主进程
npm install better-sqlite3 electron-store electron-log keytar
npm install -D @types/better-sqlite3

# 测试
npm install -D vitest @testing-library/react @testing-library/jest-dom

# 导出
npm install jspdf markdown-it
npm install -D @types/markdown-it
```

**验收标准：**
- [ ] 所有依赖安装成功，无冲突
- [ ] Tailwind class 在渲染进程中生效
- [ ] `npx vitest --version` 可用

---

### task003: 共享类型定义与常量

**负责人：** infra
**分支：** `task003_共享类型定义_constants`
**依赖：** task002

**创建文件：**
- `src/shared/types/session.ts` — Session, TranscriptEntry, ScreenshotQA, ReviewReport
- `src/shared/types/llm.ts` — LLMProvider, ChatMessage, ChatMessageContent
- `src/shared/types/config.ts` — AppConfig, ASRConfig, AppearanceConfig
- `src/shared/types/hotkey.ts` — HotkeyConfig, HotkeyAction
- `src/shared/types/ipc.ts` — IPC_CHANNELS 常量, IPC 参数/返回值类型
- `src/shared/constants.ts` — 默认快捷键映射, 模型预设, 默认 system prompt

**验收标准：**
- [ ] `npx tsc --noEmit` 无错误
- [ ] 类型定义覆盖 PRD 中所有数据模型
- [ ] 模型预设包含 OpenAI/DeepSeek/Qwen/GLM/Moonshot/Claude

---

### task004: StealthWindow 隐身窗口

**负责人：** system
**分支：** `task004_隐身窗口_stealth_window`
**依赖：** task003

**创建文件：**
- `src/main/window/StealthWindow.ts`

**修改文件：**
- `src/main/index.ts` — 使用 StealthWindow

**实现方法：** 见 PRD 第三节

**验收标准：**
- [ ] 窗口始终置顶 (floating level)
- [ ] `setContentProtection(true)` 生效
- [ ] 窗口无边框、透明
- [ ] 默认鼠标穿透 (`ignoreMouseEvents`)
- [ ] `show()` / `hide()` / `toggle()` 正常
- [ ] `setOpacity()` / `increaseOpacity()` / `decreaseOpacity()` 正常
- [ ] `enableInteraction()` / `disableInteraction()` 切换正常
- [ ] 编译通过

---

### task005: ConfigManager 配置管理

**负责人：** infra
**分支：** `task005_配置管理_config_manager`
**依赖：** task003

**创建文件：**
- `src/main/config/ConfigManager.ts`
- `src/main/config/defaults.ts`

**实现方法：** 见 PRD 第八节

**验收标准：**
- [ ] `get()` / `set()` 读写 JSON 配置正常
- [ ] `getSecure()` / `setSecure()` 通过 macOS Keychain 存取正常
- [ ] `onChanged()` 监听回调触发正确
- [ ] `getHotkeys()` / `setHotkeys()` 正常
- [ ] `exportConfig()` / `importConfig()` / `resetToDefaults()` 正常
- [ ] 默认配置完整覆盖所有配置项

---

### task006: LLMService AI 调用服务

**负责人：** ai-service
**分支：** `task006_llm_service`
**依赖：** task003

**创建文件：**
- `src/main/services/LLMService.ts`
- `src/main/services/__tests__/LLMService.test.ts`

**实现方法：** 见实施计划 Task 8

**验收标准：**
- [ ] 单元测试全部通过（请求构建、流式解析、错误处理、多供应商）
- [ ] `chat()` 正确构建 OpenAI 兼容请求体
- [ ] `analyzeScreenshot()` 正确构建 vision 请求（base64 图片）
- [ ] `streamRequest()` 正确解析 SSE `data:` 行
- [ ] `testConnection()` 返回正确结果
- [ ] `updateConfig()` 动态切换供应商生效

---

### task007: SQLite 数据库层

**负责人：** infra
**分支：** `task007_数据库层_sqlite`
**依赖：** task005

**创建文件：**
- `src/main/db/database.ts`
- `src/main/db/migrations/001_initial.ts`
- `src/main/db/repositories/SessionRepo.ts`
- `src/main/db/repositories/TranscriptRepo.ts`
- `src/main/db/repositories/ScreenshotQARepo.ts`
- `src/main/db/repositories/ReviewRepo.ts`
- `src/main/db/__tests__/repositories.test.ts`

**验收标准：**
- [ ] 所有 Repository 单元测试通过
- [ ] SessionRepo: CRUD、分页、按公司筛选、级联删除
- [ ] TranscriptRepo: 批量插入、按 sessionId + timestamp 查询
- [ ] ScreenshotQARepo: CRUD、按 sessionId 查询
- [ ] ReviewRepo: CRUD、按 sessionId 查询
- [ ] 数据库迁移自动执行
- [ ] 参数化查询（防 SQL 注入）

---

### task008: 公共 UI 组件与全局样式

**负责人：** frontend
**分支：** `task008_公共UI组件_通用样式`
**依赖：** task003

**创建文件：**
- `src/renderer/components/Common/Button.tsx`
- `src/renderer/components/Common/Input.tsx`
- `src/renderer/components/Common/Loading.tsx`
- `src/renderer/components/Common/Toast.tsx`
- `src/renderer/components/Common/IconButton.tsx`
- `src/renderer/components/Common/StatusBadge.tsx`
- `src/renderer/components/Common/index.ts`
- `src/renderer/styles/globals.css` (完善)
- `src/renderer/styles/theme.ts` — 暗色/亮色主题变量

**验收标准：**
- [ ] 所有组件在暗色主题下渲染正常
- [ ] Loading 有动画效果
- [ ] Toast 支持 success/error/info 类型
- [ ] 组件导出正确，可被其他组件引用
- [ ] 编译通过

---

### task009: HotkeyManager 全局快捷键

**负责人：** system
**分支：** `task009_快捷键系统_hotkey_manager`
**依赖：** task004, task005

**创建文件：**
- `src/main/hotkey/HotkeyManager.ts`

**实现方法：** 见实施计划 Task 6

**验收标准：**
- [ ] 所有默认快捷键注册成功且响应正确
- [ ] `Cmd+Shift+H` 切换窗口显隐
- [ ] `Cmd+Shift+[` / `]` 调整透明度
- [ ] `updateHotkey()` 修改后立即生效（热重载）
- [ ] `checkConflict()` 冲突检测正确
- [ ] `resetToDefaults()` 恢复默认
- [ ] 配置变更自动触发 `reload()`

---

### task010: ASR 服务抽象层 + Whisper Provider

**负责人：** ai-service
**分支：** `task010_asr_service_whisper`
**依赖：** task006

**创建文件：**
- `src/main/services/ASRService.ts`
- `src/main/services/ASRProviders/ASRProvider.ts` (接口)
- `src/main/services/ASRProviders/WhisperASR.ts`
- `src/main/services/__tests__/ASRService.test.ts`

**验收标准：**
- [ ] ASRProvider 接口定义完整
- [ ] WhisperASR 实现符合接口
- [ ] ASRService 双通道编排逻辑正确
- [ ] `onTranscript` 回调包含 speaker + text + timestamp
- [ ] 单元测试通过（mock provider）

---

### task011: AnswerPanel 答案面板

**负责人：** frontend
**分支：** `task011_answer_panel_chat_store`
**依赖：** task008

**创建文件：**
- `src/renderer/stores/chatStore.ts`
- `src/renderer/components/AnswerPanel/AnswerPanel.tsx`
- `src/renderer/components/AnswerPanel/MessageBubble.tsx`
- `src/renderer/components/AnswerPanel/StreamingText.tsx`
- `src/renderer/components/AnswerPanel/index.ts`

**验收标准：**
- [ ] chatStore 状态管理正确
- [ ] Markdown 渲染正确（标题、列表、代码块、表格）
- [ ] 代码高亮生效
- [ ] 流式打字效果平滑
- [ ] 上下文开关（默认关闭）
- [ ] 截屏消息显示缩略图
- [ ] 底部输入框 + 发送按钮
- [ ] 清空按钮功能正常

---

### task012: IPC 通信层

**负责人：** infra
**分支：** `task012_ipc_通信层`
**依赖：** task007, task005

**创建文件：**
- `src/main/ipc/handlers.ts` — IPC handler 骨架（部分 handler 可先返回 mock 数据）
- `src/preload/index.ts` — 完整 contextBridge API

**验收标准：**
- [ ] 所有 IPC_CHANNELS 在 preload 中暴露
- [ ] 类型安全：渲染进程调用有完整类型提示
- [ ] CONFIG_GET / CONFIG_SET handler 工作正常
- [ ] 编译通过

---

### task013: 截屏区域选择 SelectorWindow

**负责人：** system
**分支：** `task013_截屏选区_selector_window`
**依赖：** task009

**创建文件：**
- `src/main/window/SelectorWindow.ts`
- `src/renderer/components/ScreenshotSelector/ScreenshotSelector.tsx`
- `src/renderer/components/ScreenshotSelector/index.ts`

**验收标准：**
- [ ] 全屏半透明遮罩正确覆盖屏幕
- [ ] 十字光标显示
- [ ] 鼠标拖拽绘制矩形选区
- [ ] 选区显示尺寸标注
- [ ] 回车确认、ESC 取消
- [ ] 返回正确的 `{ x, y, width, height }` 坐标

---

### task014: 阿里云/腾讯云 ASR Provider

**负责人：** ai-service
**分支：** `task014_asr_aliyun_tencent`
**依赖：** task010

**创建文件：**
- `src/main/services/ASRProviders/AliyunASR.ts`
- `src/main/services/ASRProviders/TencentASR.ts`

**验收标准：**
- [ ] AliyunASR 实现 ASRProvider 接口
- [ ] TencentASR 实现 ASRProvider 接口
- [ ] WebSocket 连接逻辑正确（可 mock 验证）
- [ ] ASRService 支持根据配置切换 provider

---

### task015: TranscriptPanel 转写面板

**负责人：** frontend
**分支：** `task015_transcript_panel`
**依赖：** task011

**创建文件：**
- `src/renderer/stores/transcriptStore.ts`
- `src/renderer/components/TranscriptPanel/TranscriptPanel.tsx`
- `src/renderer/components/TranscriptPanel/TranscriptEntry.tsx`
- `src/renderer/components/TranscriptPanel/index.ts`

**验收标准：**
- [ ] transcriptStore 状态管理正确
- [ ] 转写条目按时间排序显示
- [ ] 面试官/用户不同颜色标识
- [ ] 录音状态指示（红点 + 时长）
- [ ] 支持选中文本 → "发送给 AI" 按钮出现
- [ ] 导出记录 + 清空按钮

---

### task016: ScreenCapture 截屏服务

**负责人：** system
**分支：** `task016_screen_capture_service`
**依赖：** task013, task004

**创建文件：**
- `src/main/capture/ScreenCapture.ts`

**验收标准：**
- [ ] 快捷键触发完整截屏流程
- [ ] 隐身窗口自动隐藏/恢复
- [ ] 选区窗口正确调起
- [ ] 截图 Buffer 内容正确（可保存为 PNG 验证）
- [ ] base64 编码正确
- [ ] 取消选区时正确返回 null

---

### task017: AudioCapture 双通道音频捕获

**负责人：** system
**分支：** `task017_audio_capture_双通道`
**依赖：** task009

**创建文件：**
- `src/main/capture/AudioCapture.ts`
- `scripts/setup-audio.sh`

**验收标准：**
- [ ] `setup-audio.sh` 正确检测 BlackHole
- [ ] 麦克风通道捕获音频数据正常
- [ ] 系统音频通道（通过 BlackHole）捕获正常
- [ ] `listDevices()` 返回可用设备列表
- [ ] `checkBlackHole()` 检测结果正确
- [ ] `start()` / `stop()` 状态切换正常

---

### task018: SessionRecorder Worker 线程

**负责人：** ai-service
**分支：** `task018_session_recorder_worker`
**依赖：** task007, task010

**创建文件：**
- `src/workers/sessionWorker.ts`
- `src/main/recorder/SessionRecorder.ts`

**验收标准：**
- [ ] Worker 线程独立运行，不阻塞主进程
- [ ] `startSession()` 在 SQLite 中创建会话记录
- [ ] `recordTranscript()` 正确写入转写条目
- [ ] `recordScreenshotQA()` 正确写入截屏问答
- [ ] `stopSession()` 更新会话状态和结束时间
- [ ] 断电/异常终止后数据不丢失（实时写入）

---

### task019: Settings 设置界面

**负责人：** frontend
**分支：** `task019_settings_ui`
**依赖：** task015

**创建文件：**
- `src/renderer/stores/settingsStore.ts`
- `src/renderer/components/Settings/Settings.tsx`
- `src/renderer/components/Settings/ModelSettings.tsx`
- `src/renderer/components/Settings/ASRSettings.tsx`
- `src/renderer/components/Settings/HotkeySettings.tsx`
- `src/renderer/components/Settings/AppearanceSettings.tsx`
- `src/renderer/components/Settings/StorageSettings.tsx`
- `src/renderer/components/Settings/index.ts`

**验收标准：**
- [ ] Tab 页签切换正常（5 个 Tab）
- [ ] ModelSettings: 供应商预设选择、API Key 输入、测试连接按钮
- [ ] ASRSettings: 供应商选择、音频设备下拉
- [ ] HotkeySettings: 按键录入框、冲突提示、恢复默认
- [ ] AppearanceSettings: 透明度滑块、字体大小
- [ ] StorageSettings: 数据目录显示、清理/导出按钮
- [ ] 所有设置修改后通过 IPC 保存到主进程

---

### task020: ReviewService 复盘报告

**负责人：** ai-service
**分支：** `task020_review_service_复盘`
**依赖：** task018, task006

**创建文件：**
- `src/main/services/ReviewService.ts`
- `src/renderer/components/ReviewReport/ReviewReport.tsx`
- `src/renderer/components/ReviewReport/index.ts`

**注意：** ReviewReport UI 组件由 ai-service 编写（因为它与 ReviewService 紧密耦合），放置在 frontend 的文件区域内，需提前与 frontend 协调。

**验收标准：**
- [ ] `buildSessionSummary()` 正确汇总转写 + 问答
- [ ] `generateReview()` 调用 LLM 并解析结构化 JSON
- [ ] ReviewReport 组件展示完整（概况、问题、表现、建议、标签）
- [ ] 重新生成按钮功能正常
- [ ] 导出 PDF / Markdown 正常

---

### task021: TrayManager 系统托盘

**负责人：** system
**分支：** `task021_system_tray`
**依赖：** task016, task009, task018

**创建文件：**
- `src/main/tray/TrayManager.ts`
- `resources/tray-icon.png`
- `resources/tray-icon@2x.png`

**验收标准：**
- [ ] 系统托盘图标显示
- [ ] 菜单项：截屏分析、开始/停止录音、显示/隐藏、面试记录、设置、退出
- [ ] 每项显示对应快捷键
- [ ] 录音状态动态更新菜单文字（开始 ↔ 停止）
- [ ] 点击退出可关闭应用

---

### task022: 历史记录管理界面

**负责人：** frontend
**分支：** `task022_history_管理界面`
**依赖：** task019

**创建文件：**
- `src/renderer/stores/historyStore.ts`
- `src/renderer/components/History/HistoryList.tsx`
- `src/renderer/components/History/SessionDetail.tsx`
- `src/renderer/components/History/ExportButton.tsx`
- `src/renderer/components/History/index.ts`

**验收标准：**
- [ ] 历史列表正确显示（日期、公司、岗位、时长、状态）
- [ ] 按公司筛选功能正常
- [ ] 按时间排序功能正常
- [ ] 点击进入详情：转写全文 + 截屏问答 + 复盘报告
- [ ] 生成/重新生成复盘按钮
- [ ] PDF 导出文件正确
- [ ] Markdown 导出文件正确
- [ ] 删除会话功能正常

---

### task023: IPC Handlers 完整实现

**负责人：** infra
**分支：** `task023_ipc_handlers_完整实现`
**依赖：** task012, task016, task017, task018

**修改文件：**
- `src/main/ipc/handlers.ts` — 补全所有 handler 实现

**验收标准：**
- [ ] 所有 IPC 通道 handler 实现完整
- [ ] 截屏相关 IPC 连通 ScreenCapture
- [ ] 语音相关 IPC 连通 AudioCapture + ASRService
- [ ] 会话相关 IPC 连通 SessionRecorder
- [ ] 配置相关 IPC 连通 ConfigManager
- [ ] LLM 流式响应通过 IPC 正确传递到渲染进程

---

### task024: MainLayout 主界面整合

**负责人：** frontend
**分支：** `task024_main_layout_主界面整合`
**依赖：** task022, task019, task015, task011

**创建文件：**
- `src/renderer/stores/appStore.ts`
- `src/renderer/components/Layout/MainLayout.tsx`
- `src/renderer/components/Layout/Toolbar.tsx`
- `src/renderer/components/Layout/index.ts`

**修改文件：**
- `src/renderer/App.tsx`

**验收标准：**
- [ ] 顶部工具栏：视图切换 Tab（答案/转写/历史/设置）
- [ ] 面试状态指示（录音中/就绪）
- [ ] 视图切换正确渲染对应面板
- [ ] appStore 状态管理正确
- [ ] 隐身窗口中显示完整 UI

---

### task025: Onboarding 首次启动引导

**负责人：** frontend
**分支：** `task025_onboarding_首次引导`
**依赖：** task024

**创建文件：**
- `src/renderer/components/Onboarding/Onboarding.tsx`
- `src/renderer/components/Onboarding/WelcomeStep.tsx`
- `src/renderer/components/Onboarding/AudioSetupStep.tsx`
- `src/renderer/components/Onboarding/ModelSetupStep.tsx`
- `src/renderer/components/Onboarding/ASRSetupStep.tsx`
- `src/renderer/components/Onboarding/HotkeyStep.tsx`
- `src/renderer/components/Onboarding/index.ts`

**验收标准：**
- [ ] 首次启动检测 `onboardingCompleted === false` 时显示引导
- [ ] 5 步向导流程：欢迎 → 音频 → 模型 → ASR → 快捷键
- [ ] 每步可前进/后退
- [ ] 音频步骤检测 BlackHole 并引导安装
- [ ] 模型步骤支持测试连接
- [ ] 完成后设置 `onboardingCompleted = true`
- [ ] 再次启动不再显示引导

---

### task026: 主进程 App 编排

**负责人：** lead
**分支：** `task026_main_process_app编排`
**依赖：** task023, task021

**修改文件：**
- `src/main/index.ts`

**验收标准：**
- [ ] App 类正确初始化所有模块（ConfigManager → Database → Services → StealthWindow → HotkeyManager → TrayManager → IPC）
- [ ] `app.on('ready')` 触发初始化
- [ ] `app.on('before-quit')` 优雅关闭所有服务
- [ ] `app.on('activate')` 显示窗口
- [ ] 所有模块间依赖注入正确

---

### task027: electron-builder 打包

**负责人：** lead
**分支：** `task027_electron_builder_打包`
**依赖：** task026

**创建文件：**
- `electron-builder.yml`
- `build/entitlements.mac.plist`
- `build/entitlements.mac.inherit.plist`
- `resources/icon.icns`

**修改文件：**
- `package.json` — 添加 scripts

**验收标准：**
- [ ] `npm run build` 编译成功
- [ ] `npm run package` 生成 DMG
- [ ] entitlements 包含麦克风、屏幕录制权限
- [ ] DMG 安装后应用可正常启动

---

### task028: 最终集成测试

**负责人：** qa
**分支：** `task028_最终集成测试`
**依赖：** task027

**全量测试清单：**

| # | 测试项 | 验证内容 |
|---|--------|---------|
| 1 | 隐身窗口 | 置顶、透明、防屏幕共享 |
| 2 | 快捷键-默认 | 所有默认快捷键响应正确 |
| 3 | 快捷键-自定义 | 修改快捷键后热重载生效 |
| 4 | 截屏-选区 | 区域选择、截图内容正确 |
| 5 | 截屏-AI分析 | 截图发送、流式回答、Markdown 渲染 |
| 6 | 上下文开关 | 默认关闭、开启后携带历史 |
| 7 | 音频捕获 | 系统音频 + 麦克风双通道 |
| 8 | 语音转写 | 实时显示、说话人区分 |
| 9 | 转写发AI | 选中文本发送、AI 回答显示 |
| 10 | 面试记录 | 自动记录、SQLite 数据完整 |
| 11 | 复盘报告 | 生成、显示、导出 |
| 12 | 历史管理 | 列表、筛选、详情、导出 |
| 13 | 设置 | 所有配置项读写正常 |
| 14 | 系统托盘 | 菜单功能、状态指示 |
| 15 | 首次引导 | 完整流程走通 |
| 16 | 打包安装 | DMG 安装后功能正常 |

---

## 五、并行甘特图

```
时间轴 →

Wave 0 (串行):
  infra:     [task001]──[task002]──[task003]
  system:     等待...
  ai-service: 等待...
  frontend:   等待...
  qa:         等待...

Wave 1 (并行):
  infra:     [task005 ConfigManager    ]
  system:    [task004 StealthWindow    ]
  ai-service:[task006 LLMService       ]
  frontend:  [task008 公共UI组件        ]
  qa:         验收 task001~003

Wave 2 (并行):
  infra:     [task007 SQLite数据库     ]
  system:    [task009 HotkeyManager    ]
  ai-service:[task010 ASR+Whisper      ]
  frontend:  [task011 AnswerPanel      ]
  qa:         验收 Wave 1 的 4 个任务

Wave 3 (并行):
  infra:     [task012 IPC通信层        ]
  system:    [task013 SelectorWindow   ]
  ai-service:[task014 Aliyun/Tencent   ]
  frontend:  [task015 TranscriptPanel  ]
  qa:         验收 Wave 2 的 4 个任务

Wave 4 (并行):
  infra:     协助 system
  system:    [task016 ScreenCapture]──[task017 AudioCapture]
  ai-service:[task018 SessionRecorder  ]
  frontend:  [task019 Settings UI      ]
  qa:         验收 Wave 3 的 4 个任务

Wave 5 (并行):
  infra:     [task023 IPC完整实现      ]
  system:    [task021 TrayManager      ]
  ai-service:[task020 ReviewService    ]
  frontend:  [task022 History UI       ]
  qa:         验收 Wave 4 的任务

Wave 6 (收敛):
  infra:     空闲/支援
  system:    空闲/支援
  ai-service:空闲/支援
  frontend:  [task024 MainLayout]──[task025 Onboarding]
  lead:      [task026 App编排   ]
  qa:         验收 Wave 5 的任务

Wave 7 (收尾):
  lead:      [task027 打包      ]
  qa:        [task028 最终集成测试]
```

---

## 六、QA 验收流程

### 6.1 每个任务的验收流程

```
1. 开发者完成代码 → 通知 qa："taskXXX 已完成，请验收"

2. qa 切换到任务分支：
   git checkout taskXXX_任务描述

3. qa 执行验收检查：
   a) 编译检查：npx tsc --noEmit
   b) 如有单元测试：npx vitest run <test-path>
   c) 如需功能验证：npx electron-vite dev → 按验收标准逐项手动测试
   d) 代码风格检查：无明显代码问题

4. 验收结果：
   ✅ 通过 → qa 通知开发者和 lead："taskXXX 验收通过"
              → 开发者 commit：git commit -m "feat(taskXXX): 描述"
              → lead 合并到 main
   ❌ 不通过 → qa 通知开发者："taskXXX 验收不通过，问题：..."
               → 开发者修复 → 重新提交验收
```

### 6.2 QA 并行验收策略

QA 始终滞后一个 Wave 进行验收，这样：
- 开发者不会被阻塞等待验收
- QA 有充足时间验收上一个 Wave 的任务
- 发现问题时开发者可以在做新任务的间隙修复

---

## 七、沟通协议

### 7.1 团队通信

- **任务状态更新**：通过 TaskList / TaskUpdate 工具
- **跨团队协调**：通过 SendMessage 工具发送给相关人
- **阻塞问题**：立即通知 `lead`

### 7.2 关键协调点

| 场景 | 处理方式 |
|------|---------|
| A 的任务需要 B 的模块接口 | B 先提供接口定义（.d.ts），A 基于接口开发，B 后续补实现 |
| 合并冲突 | lead 协调双方，确定保留哪些改动 |
| 依赖任务延迟 | lead 调整 Wave 内任务分配，让空闲成员支援 |
| 验收不通过 | qa 反馈具体问题，开发者优先修复，不阻塞其他任务 |
| task020 跨文件区域 | ai-service 编写 ReviewReport UI 前，先与 frontend 确认组件规范 |

### 7.3 每日同步

每个 Wave 开始前，lead 发送 broadcast：
- 当前 Wave 任务分配确认
- 上一 Wave 验收状态
- 阻塞问题和解决方案

---

## 八、启动命令

在新会话中，Team Lead 应执行以下操作来启动团队：

```
1. 创建团队：TeamCreate(team_name="ai-interview", description="AI面试助手开发团队")

2. 创建所有 28 个任务到 TaskList

3. 设置任务依赖关系（blockedBy）

4. 启动 5 个 teammate：
   - Task(name="infra",      subagent_type="general-purpose", team_name="ai-interview")
   - Task(name="system",     subagent_type="general-purpose", team_name="ai-interview")
   - Task(name="ai-service", subagent_type="general-purpose", team_name="ai-interview")
   - Task(name="frontend",   subagent_type="general-purpose", team_name="ai-interview")
   - Task(name="qa",         subagent_type="general-purpose", team_name="ai-interview")

5. 分配 Wave 0 任务给 infra

6. 等待 Wave 0 完成后，分配 Wave 1 任务（4 人并行）

7. 逐 Wave 推进直到完成
```
