# Logging System Design

## Overview

为 AI 面试助手项目搭建标准化日志系统，基于已安装的 `electron-log` v5 封装，替换现有散落的 `console` 调用，并在关键业务路径添加日志埋点。

## 现状分析

- `electron-log` v5.4.3 已安装但未使用
- 全项目仅 9 处 `console` 调用（5 error + 4 warn）
- 没有日志封装、配置体系或文件输出
- 日志集中在主进程（88.9%），渲染进程仅 1 处

## 架构设计

### 模块结构

```
src/main/logger/
├── index.ts        # 主进程 Logger 初始化与配置，导出 createLogger/getLogger
└── transports.ts   # 自定义 transport（按日期轮转、旧日志清理）

src/renderer/utils/
└── logger.ts       # 渲染器端 Logger（通过 electron-log/renderer + IPC 转发）

src/preload/index.ts  # 新增 log IPC 通道（electron-log/renderer 自动处理）
```

### 核心机制

1. **主进程**：直接使用 `electron-log`，通过 `scope` 区分模块来源
2. **渲染器进程**：使用 `electron-log/renderer`，日志自动通过 IPC 转发到主进程统一写入
3. **日期轮转**：通过自定义 `resolvePathFn` 每次写入时动态生成当天日期文件名
4. **旧日志清理**：应用启动时清理 7 天前的日志文件

### 数据流

```
[渲染器进程]                    [主进程]
logger.info("msg")  --IPC-->  electron-log  --> 控制台输出
                                            --> 文件输出 (userData/logs/2026-02-19.log)
```

## 日志格式

### 文件日志

```
[2026-02-19 14:30:25.123] [info] (LLMService) 请求 OpenAI API
[2026-02-19 14:30:25.456] [error] (AudioCapture) mic capture failed: Device not found
```

格式模板：`[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {scope} {text}`

### 控制台日志

保留 electron-log 默认格式（带颜色高亮）。

## 日志级别策略

| 环境 | 控制台级别 | 文件级别 | 判断方式 |
|------|-----------|---------|---------|
| 开发 | debug | debug | `!app.isPackaged` |
| 生产 | warn | info | `app.isPackaged` |

## 日志存储

- **路径**：`app.getPath('userData')/logs/`
- **文件名**：按日期命名，如 `2026-02-19.log`
- **轮转**：每天自动生成新文件（通过 `resolvePathFn` 动态计算文件名）
- **清理**：启动时删除 7 天前的旧日志文件
- **单文件大小限制**：禁用 `maxSize`（设为 0），因为按日期已天然分割

## 日志埋点计划

### 替换现有 console 调用（9 处）

| 文件 | 原调用 | 替换为 |
|------|--------|--------|
| `src/main/index.ts:211` | `console.error('Screenshot failed:')` | `log.error(...)` |
| `src/main/index.ts:235` | `console.warn('ASR start failed...')` | `log.warn(...)` |
| `src/main/index.ts:241` | `console.warn('Audio capture start failed:')` | `log.warn(...)` |
| `src/main/index.ts:249` | `console.error('Toggle recording failed:')` | `log.error(...)` |
| `src/main/hotkey/HotkeyManager.ts:101` | `console.warn('HotkeyManager: failed...')` | `log.warn(...)` |
| `src/main/capture/AudioCapture.ts:169` | `console.error('AudioCapture: mic...')` | `log.error(...)` |
| `src/main/capture/AudioCapture.ts:191` | `console.error('AudioCapture: system...')` | `log.error(...)` |
| `src/main/config/ConfigManager.ts:115` | `console.error('ConfigManager: listener...')` | `log.error(...)` |
| `src/renderer/stores/settingsStore.ts:46` | `console.warn('[settingsStore] IPC...')` | `log.warn(...)` |

### 新增日志埋点（约 30-40 处）

| 模块 | 日志内容 | 级别 |
|------|---------|------|
| 应用生命周期 | 启动、退出、窗口创建 | info |
| LLMService | API 请求发送/响应/失败 | info/error |
| ASRService | 识别启动/结果/失败 | info/error |
| AudioCapture | 录音启动/停止/失败 | info/error |
| ScreenCapture | 截屏操作 | debug |
| SessionRecorder | 会话开始/结束 | info |
| ConfigManager | 配置变更 | debug |
| HotkeyManager | 快捷键注册/触发 | debug |
| IPC handlers | 关键 IPC 调用 | debug |
| 渲染器 stores | 重要状态变更 | debug |

## 使用方式

### 主进程

```typescript
import { getLogger } from './logger';

const log = getLogger('LLMService');
log.info('请求 OpenAI API', { model: 'gpt-4' });
log.error('API 调用失败', error);
```

### 渲染器进程

```typescript
import { getLogger } from '../utils/logger';

const log = getLogger('settingsStore');
log.warn('IPC not available');
```

## 技术决策

1. **为何不用 winston？** — electron-log 专为 Electron 设计，已安装，内置 IPC transport 支持主/渲染进程通信
2. **为何自定义日期轮转？** — electron-log 仅支持按大小轮转，按日期需通过 `resolvePathFn` 自行实现
3. **为何不添加远程日志？** — 当前阶段不需要，保持简单，后续可通过添加自定义 transport 扩展
