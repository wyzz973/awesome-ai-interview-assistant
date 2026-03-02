# 贡献指南 (Contributing Guide)

感谢你对 AI 面试助手项目的兴趣！以下是参与贡献的指南。

## 开发环境

### 前置条件

- **Node.js** 20+
- **npm** (使用项目根目录的 `package-lock.json`)
- **macOS**: 需要安装 [BlackHole](https://existential.audio/blackhole/) 用于系统音频捕获
- **Git**

### 快速开始

```bash
# 克隆仓库
git clone <repo-url>
cd awesome-ai-interview-assistant

# 安装依赖
npm install

# 启动开发模式（热重载）
npm run dev
```

### 常用命令

```bash
npm run dev          # 启动 Electron 开发模式
npm run build        # 构建所有进程
npm run typecheck    # TypeScript 类型检查
npm test             # 运行所有单元测试
npm run test:watch   # 监听模式运行测试
npm run test:e2e     # 运行端到端测试
```

## 代码规范

### 语言

- 注释、日志、UI 文本、提交消息以**中文**为主
- 变量名、函数名、类型名使用**英文**

### TypeScript

- 严格模式 (`strict: true`)
- 使用路径别名：`@shared/`、`@main/`、`@renderer/`
- 类型导入使用 `import type { ... }` 语法
- 不使用分号（no-semi 风格）
- 单引号
- 2 空格缩进
- 多行结构使用尾逗号

### 文件组织

- 一个关注点一个文件
- 组件目录使用 `index.ts` 桶导出
- 新的 IPC 通道必须同时更新：`src/shared/types/ipc.ts`、`src/main/ipc/handlers.ts`、`src/preload/index.ts`
- 新数据库表需要在 `src/main/db/migrations/` 中创建编号迁移文件
- 主进程日志使用 `getLogger('ScopeName')`，**不要**使用 `console.log`

### 错误处理

- IPC handler 统一使用 try/catch，返回 `{ success: boolean, error?: string }`
- 错误消息通过 `sanitizeError()` 脱敏，防止 API 密钥泄露
- Worker 线程中单条写入失败不阻塞后续操作

## 测试

- 测试文件与源码共存：`__tests__/*.test.ts`
- 使用 Vitest（`globals: false`），必须显式导入 `describe`、`it`、`expect` 等
- 数据库测试使用 `createTestDatabase()` 创建内存数据库
- 无需运行 Electron 即可测试主进程服务

```bash
# 运行全部测试
npm test

# 运行特定测试文件
npx vitest run src/main/services/__tests__/LLMService.test.ts

# 监听模式
npm run test:watch
```

## 提交流程

1. 从 `main` 分支创建特性分支：`git checkout -b feature/你的特性名`
2. 编写代码和测试
3. 确保测试通过：`npm test`
4. 确保类型检查通过：`npm run typecheck`
5. 提交代码（中文提交消息）
6. 推送并创建 Pull Request

### 提交消息格式

```
<type>: <描述>

类型:
- feat: 新功能
- fix: 修复 Bug
- docs: 文档变更
- refactor: 重构
- test: 测试相关
- chore: 构建/工具链
```

## 架构注意事项

详见 [CLAUDE.md](./CLAUDE.md) 中的完整架构说明。

### 关键原则

- **三进程架构**: main（Node.js）、preload（桥接）、renderer（React）
- **IPC 通信**: 所有跨进程通信通过 `ipcMain.handle` / `ipcRenderer.invoke`
- **状态管理**: renderer 使用 Zustand，不使用 Redux
- **数据库**: SQLite + WAL 模式 + Repository 模式
- **安全**: 详见 [SECURITY.md](./SECURITY.md)

## 报告问题

- 使用 GitHub Issues
- 安全漏洞请参考 [SECURITY.md](./SECURITY.md) 中的报告方式
