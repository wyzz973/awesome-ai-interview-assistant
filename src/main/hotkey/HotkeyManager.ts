import { globalShortcut } from 'electron'
import type { HotkeyAction, HotkeyConfig } from '@shared/types/hotkey'
import { DEFAULT_HOTKEYS } from '@shared/constants'
import type { ConfigManager } from '../config/ConfigManager'

type HotkeyHandler = () => void

export class HotkeyManager {
  private configManager: ConfigManager
  private handlers: Map<HotkeyAction, HotkeyHandler> = new Map()
  private registeredAccelerators: Map<HotkeyAction, string> = new Map()
  private unsubscribeConfig: (() => void) | null = null

  constructor(configManager: ConfigManager) {
    this.configManager = configManager
    this.unsubscribeConfig = this.configManager.onChanged('hotkeys', () => {
      this.reload()
    })
  }

  /** 注册某个动作的处理函数 */
  registerHandler(action: HotkeyAction, handler: HotkeyHandler): void {
    this.handlers.set(action, handler)
  }

  /** 根据当前配置注册所有快捷键 */
  registerAll(): void {
    const hotkeys = this.configManager.getHotkeys()
    for (const [action, accelerator] of Object.entries(hotkeys) as [HotkeyAction, string][]) {
      this.registerOne(action, accelerator)
    }
  }

  /** 注销所有快捷键 */
  unregisterAll(): void {
    for (const [, accelerator] of this.registeredAccelerators) {
      globalShortcut.unregister(accelerator)
    }
    this.registeredAccelerators.clear()
  }

  /** 热重载：注销全部后重新注册 */
  reload(): void {
    this.unregisterAll()
    this.registerAll()
  }

  /** 检测某个加速键是否已被其他动作占用 */
  checkConflict(accelerator: string, excludeAction?: HotkeyAction): HotkeyAction | null {
    for (const [action, existing] of this.registeredAccelerators) {
      if (existing === accelerator && action !== excludeAction) {
        return action
      }
    }
    return null
  }

  /** 更新单个快捷键并立即生效 */
  updateHotkey(action: HotkeyAction, accelerator: string): void {
    // 注销旧的
    const oldAccelerator = this.registeredAccelerators.get(action)
    if (oldAccelerator) {
      globalShortcut.unregister(oldAccelerator)
      this.registeredAccelerators.delete(action)
    }

    // 注册新的
    this.registerOne(action, accelerator)

    // 持久化到配置
    const hotkeys = { ...this.configManager.getHotkeys() }
    hotkeys[action] = accelerator
    this.configManager.setHotkeys(hotkeys)
  }

  /** 恢复默认快捷键 */
  resetToDefaults(): void {
    this.unregisterAll()
    this.configManager.setHotkeys({ ...DEFAULT_HOTKEYS })
    // onChanged 回调会触发 reload()
  }

  /** 销毁：注销所有快捷键和配置监听 */
  destroy(): void {
    this.unregisterAll()
    if (this.unsubscribeConfig) {
      this.unsubscribeConfig()
      this.unsubscribeConfig = null
    }
    this.handlers.clear()
  }

  private registerOne(action: HotkeyAction, accelerator: string): void {
    const handler = this.handlers.get(action)
    if (!handler) return

    const success = globalShortcut.register(accelerator, handler)
    if (success) {
      this.registeredAccelerators.set(action, accelerator)
    } else {
      console.warn(`HotkeyManager: failed to register "${accelerator}" for action "${action}"`)
    }
  }
}
