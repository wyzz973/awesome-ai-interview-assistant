# 安全策略 (Security Policy)

## 支持的版本

| 版本 | 支持状态 |
|---|---|
| 最新 release | ✅ |
| 开发分支 (main) | ✅ |
| 旧版本 | ❌ |

## 报告漏洞

如果你发现了安全漏洞，请**不要**在公开 Issue 中提交。请通过以下方式联系维护者：

1. 发送邮件至项目维护者（见 `package.json` 中的联系方式）
2. 在邮件标题中注明 `[SECURITY]`
3. 描述漏洞详情、复现步骤和潜在影响

我们会在 **48 小时**内确认收到报告，并在 **7 个工作日**内提供初步评估。

## 安全架构

### Electron 安全

- **contextIsolation**: 已启用 — renderer 无法直接访问 Node.js API
- **nodeIntegration**: 已禁用 — renderer 不能使用 `require()`
- **Content-Security-Policy**: 已配置 — 限制脚本、样式、连接来源
- **导航守卫**: 已配置 — 阻止 renderer 被劫持到外部 URL
- **窗口打开拦截**: 所有新窗口请求被拦截，外部链接通过系统浏览器打开
- **内容保护**: 生产模式下启用 `setContentProtection(true)`，防止屏幕录制泄露

### 数据安全

- **本地存储**: 所有面试数据存储在本地 SQLite 数据库，不上传到云端
- **API 密钥**: 通过 `keytar` 存储在操作系统密钥链中，不以明文保存
- **错误脱敏**: IPC 错误消息自动过滤 API 密钥和 Token
- **截图验证**: Base64 图片数据在处理前进行大小验证（上限 20MB）

### 网络安全

- 仅向用户配置的 LLM/ASR API 端点发起 HTTPS 请求
- 无内置后端服务、无遥测、无数据收集
- WebSocket 连接仅用于 ASR 实时转写（Aliyun / Tencent 提供商）

## 安全检查清单

- [x] Electron `contextIsolation` 已启用
- [x] Electron `nodeIntegration` 已禁用
- [x] CSP 策略已配置
- [x] 导航守卫已配置
- [x] IPC 错误消息自动脱敏（sanitizeError）
- [x] API 密钥使用 OS 密钥链存储
- [x] Base64 截图大小验证
- [x] LLM 请求超时（120s）
- [x] ASR 请求超时（30s）
- [x] SSE 流缓冲上限（4MB）
- [ ] macOS 代码签名 + 公证
- [ ] Windows SmartScreen 签名
- [ ] 自动更新签名验证
