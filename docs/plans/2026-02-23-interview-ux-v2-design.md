# V2 高压面试低负担交互重设计

日期：2026-02-23  
状态：已落地（第一版实现）

## 1. 目标与原则
- 高压场景下最小认知负担：先看健康状态，再操作。
- 面试中答案优先：默认快速可口述答案，细节可展开。
- 页面内常驻状态优先：减少 toast 噪声。
- 四页统一信息层级：答案 / 转写 / 历史 / 设置一次性替换。

## 2. 全局状态机
- 赛前准备：`isRecording=false`
  - 显示健康状态条（音频 / ASR / LLM / 门禁模式）。
  - 可编辑面试草稿（公司、岗位、轮次、背景、简历）。
- 面试进行中：`isRecording=true`
  - 答案页支持 `focus/split` 布局切换。
  - 实时链路健康持续刷新。
- 面试结束：`isRecording=false` 且 `lastCompletedSessionId!=null`
  - 快速进入历史归档与复盘。

## 3. 四页 IA 与交互
### 3.1 答案页
- 拆分准备态与面试态。
- 顶部固定健康状态条。
- 保留高频动作：开始/结束、实时转写、截图提问、配置检查、面试归档。
- 面试中支持单栏答案与双栏（答案 + 转写速览）切换。
- 助手回答默认突出首段，剩余内容折叠。

### 3.2 转写页
- 顶部保留实时健康状态与录制时长。
- 无内容时仅保留“开始面试”入口与修复入口。
- “超时无转写”改为页面内提示。

### 3.3 历史页
- 列表改为归档卡片，必含：公司、岗位、轮次、状态、时长、摘要。
- 筛选优先公司/状态/时间。
- 详情页保留完整复盘、导出和会话上下文。

### 3.4 设置页
- 分层：基础设置 / 高级设置。
- 基础设置：LLM、ASR、录制门禁策略（strict/lenient）。
- 高级设置：原有模型/ASR调参与快捷键、外观、存储。

## 4. 接口与类型变更
### 4.1 新增类型
- `src/shared/types/health.ts`
  - `HealthSnapshot`
  - `HealthState`
  - `HealthLatency`
  - `HealthIssueCode`

### 4.2 配置类型扩展
- `src/shared/types/config.ts`
  - 新增 `recordingGateMode: 'strict' | 'lenient'`

### 4.3 历史列表类型扩展
- `src/shared/types/session.ts`
  - 新增 `SessionListItem`（包含 `round`、`summary`）

### 4.4 IPC 扩展
- `src/shared/types/ipc.ts`
  - `HEALTH_GET_SNAPSHOT`
  - `HEALTH_SUBSCRIBE`
  - `HEALTH_UNSUBSCRIBE`
  - `HEALTH_UPDATE`

### 4.5 Preload API 扩展
- `src/preload/index.ts`
  - `healthGetSnapshot()`
  - `healthSubscribe(intervalMs?)`
  - `healthUnsubscribe()`
  - `onHealthUpdate(callback)`

## 5. 数据与状态流
- 主进程新增 `HealthMonitorService` 聚合链路健康。
- LLM 请求成功/失败和延迟写入健康状态。
- ASR debug 事件写入健康状态。
- 渲染进程订阅 `HEALTH_UPDATE`，并在 `appStore.healthSnapshot` 中缓存。
- 门禁策略：
  - strict：阻断开始并跳转设置页。
  - lenient：允许开始并持续告警。

## 6. AI 冗余治理
- 默认 `systemPrompt` 增强：短答优先、首段可口述、追问再展开。
- 请求侧附加轻量约束：`[DIRECT_ANSWER_MODE]`。
- `MessageBubble` 默认展示首段，细节折叠展开。

## 7. 异常与恢复
- 关键链路异常通过健康条和页面内提示持续暴露。
- 开始面试失败时写入 `recordingIssue` 并保持可定位修复入口。
- 订阅断开自动可重新订阅；页面卸载时主动取消健康订阅。

## 8. 测试与验收
### 8.1 新增测试
- `src/main/services/__tests__/HealthMonitorService.test.ts`
- `src/main/services/__tests__/sessionSummary.test.ts`
- `src/renderer/services/__tests__/directAnswerPolicy.test.ts`
- `src/renderer/services/__tests__/recordingGate.test.ts`

### 8.2 验证命令
- `npm run typecheck`
- `npx vitest run src/renderer/services/__tests__/audioDeviceSelection.test.ts src/renderer/services/__tests__/codeLanguagePolicy.test.ts src/renderer/services/__tests__/directAnswerPolicy.test.ts src/renderer/services/__tests__/recordingGate.test.ts src/renderer/services/__tests__/screenshotPrompt.test.ts src/main/services/__tests__/HealthMonitorService.test.ts src/main/services/__tests__/sessionSummary.test.ts`

### 8.3 已知环境问题
- 全量 `npx vitest run` 中涉及 `better-sqlite3` 的测试在当前环境受 Node ABI 不匹配影响（`NODE_MODULE_VERSION` 不一致），与本次改动逻辑无直接关系。

## 9. 上线清单
- [x] 四页交互重构第一版完成。
- [x] 健康监测链路与订阅完成。
- [x] strict/lenient 门禁完成。
- [x] 历史列表 round+summary 展示完成。
- [x] AI 直答约束与折叠展示完成。
- [ ] 后续补充：更细粒度健康指标（例如端到端首字延迟、ASR 质量评分）。
