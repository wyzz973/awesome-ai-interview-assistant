import { Sparkles, AlertTriangle } from 'lucide-react'

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

      {/* 合规使用声明 */}
      <div className="w-full max-w-sm p-3 rounded-lg bg-status-warning/10 border border-status-warning/25 text-left space-y-1.5">
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={14} className="text-status-warning shrink-0" />
          <span className="text-xs font-medium text-text-secondary">使用须知</span>
        </div>
        <p className="text-[11px] text-text-muted leading-relaxed">
          本工具仅供个人学习、模拟面试练习和技术能力提升使用。请遵守面试公司的规则与当地法律法规。
          录音功能可能受当地录音同意法约束，请确保在使用前获得必要的知情同意。
          AI 生成的内容仅供参考，不保证准确性。使用本工具所产生的一切后果由用户自行承担。
        </p>
      </div>
    </div>
  )
}
