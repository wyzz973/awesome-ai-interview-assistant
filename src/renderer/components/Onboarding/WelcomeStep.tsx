import { Sparkles } from 'lucide-react'

export default function WelcomeStep() {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-accent-primary/15 flex items-center justify-center">
        <Sparkles size={32} className="text-accent-primary" />
      </div>
      <h2 className="text-lg font-semibold text-text-primary">欢迎使用 AI 面试助手</h2>
      <p className="text-sm text-text-secondary leading-relaxed max-w-sm">
        这是一款基于 AI 的面试辅助工具，帮助你在技术面试中获取实时参考答案、
        语音转写和智能复盘。
      </p>
      <div className="text-xs text-text-muted space-y-1.5 text-left">
        <p>接下来我们将完成几个简单的设置步骤：</p>
        <ul className="space-y-1 pl-4">
          <li className="list-disc">检测音频捕获环境</li>
          <li className="list-disc">配置 AI 模型</li>
          <li className="list-disc">设置语音识别</li>
          <li className="list-disc">自定义快捷键</li>
        </ul>
      </div>
    </div>
  )
}
