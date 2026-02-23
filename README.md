# awesome-ai-interview-assistant

一个面向程序员技术面试场景的桌面 AI Copilot（Electron + React + TypeScript）。

核心目标：在一次面试会话中，把「简历 + 面试背景 + 实时转写 + 截图问答 + 普通提问」统一到同一个上下文里，按问题检索并注入给大模型，帮助你给出更稳、更快、更贴题的回答。

## 核心特性

- 会话级面试工作流
  - 手动 `开始面试` / `结束面试`
  - 一次面试一个 `sessionId`，上下文不串场
- 简历上下文注入
  - 开始面试前可选择简历文件（`pdf/doc/docx/txt/md`）
  - 支持补充轮次与面试背景（如一面/二面/终面）
- 多源记忆统一检索
  - 实时转写（面试官/我）
  - 截图提问与回答
  - 普通聊天提问与回答
  - 简历和会话背景
- 检索增强（OpenClaw 风格）
  - 关键词召回（FTS）+ 相似度打分 + 时效衰减 + 来源加权
  - MMR 去重重排，减少重复片段
- 面试后复盘
  - 历史会话查看
  - 导出 `Markdown / JSON`
  - AI 复盘报告
- 多模型与多 ASR 供应商
  - OpenAI 兼容接口 + 多家预设

## 当前工作流（推荐）

1. 赛前准备
   - 填写公司、岗位、轮次、面试背景
   - 选择简历文件
2. 点击 `开始面试`
   - 创建会话并注入简历/背景上下文
   - 启动音频采集与转写
3. 面试进行中
   - 文字提问 / 截图提问 / 实时转写自动入会话记忆
   - 每次提问按问题检索相关片段后注入 LLM
4. 点击 `结束面试`
   - 结束本次会话，停止采集与转写
5. 历史复盘
   - 查看会话详情、转写、截图问答、复盘报告

## 技术栈

- Electron + electron-vite
- React 18 + Zustand + Tailwind CSS
- TypeScript
- SQLite (`better-sqlite3`) + FTS5
- `electron-log` / `keytar`

## 项目结构

```text
src/
  main/                     # 主进程：IPC、窗口、录制、检索、数据库
    db/                     # migration + repositories
    services/               # LLM/ASR/Memory/ResumeParser
    ipc/                    # IPC handlers
  preload/                  # 安全桥接 (window.api)
  renderer/                 # 前端 UI
    components/             # 面板、历史、设置
    stores/                 # Zustand 状态管理
    services/               # 音频桥接、提问策略
  shared/                   # 跨进程类型与常量
```

## 平台支持

| 平台 | 开发运行 | 打包 | 说明 |
|---|---|---|---|
| macOS | ✅ | ✅ | 当前主目标平台，音频工作流最完整 |
| Windows | ✅ | ✅ | 可运行/可打包，系统音频双通道能力需按本机方案配置 |
| Linux | ✅ | ✅ | 可运行/可打包，音频设备与权限依发行版而异 |

## 环境要求

- Node.js 20+
- npm 10+
- 可用的 LLM / ASR API Key

### macOS 额外建议

双声道面试转写建议安装 BlackHole：

```bash
brew install --cask blackhole-2ch
```

## 本地运行（多平台）

### 1) 克隆并安装依赖（macOS / Windows / Linux）

```bash
git clone https://github.com/wyzz973/awesome-ai-interview-assistant.git
cd awesome-ai-interview-assistant
npm install
```

### 2) 启动开发环境

```bash
npm run dev
```

### 3) 构建

```bash
npm run build
```

### 4) 校验

```bash
npm run typecheck
npm run test:e2e
npx vitest run
```

## 打包发布（多平台）

### macOS

```bash
npm run package:mac
```

附加目标：

```bash
npm run package:dmg
npm run package:zip
```

### Windows

```bash
npm run package:win
```

输出 NSIS 安装包（`.exe`）。

### Linux

```bash
npm run package:linux
```

输出 `AppImage` 和 `deb`。

### 一次性构建全部平台（建议在 CI 中做）

```bash
npm run package:all
```

> 跨平台打包依赖宿主系统能力。最稳方案：  
> 在对应平台原生机器上打包，或使用 GitHub Actions 的矩阵任务（`macos-latest` / `windows-latest` / `ubuntu-latest`）。

## 数据与隐私

- 面试记录默认存本地 SQLite（Electron `userData` 目录）
- API Key 使用系统安全存储（Keychain / keytar）
- 项目不依赖云端后端即可运行（除模型/语音 API 调用）

## 常见问题

### 1) 我选了简历，但回答里说“无法访问你的简历”

请先点击 `开始面试` 再提问。
简历上下文是「会话绑定」模式：只在当前面试会话注入。

### 2) 转写里只有“我”的声道，没有“面试官”

通常是系统音频路由未配置好。请检查 BlackHole 与多输出设备设置后再开始面试。

### 3) 主进程报 `write EIO`

这是终端/stdio 失效时日志写入导致的错误，最新代码已在主进程 logger 中做了容错（忽略 EPIPE/EIO/ERR_STREAM_DESTROYED）。

## 致谢

- 检索与记忆注入思路参考了 OpenClaw 的上下文工程实践
- 感谢 Electron / React / SQLite / Vitest 社区

## 贡献

欢迎 Issue / PR：

1. Fork
2. 新建分支
3. 提交改动与说明
4. 发起 PR

---

如果这个项目对你有帮助，欢迎点个 Star。
