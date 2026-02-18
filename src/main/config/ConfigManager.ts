import Store from 'electron-store'
import * as keytar from 'keytar'
import type { AppConfig } from '@shared/types/config'
import type { HotkeyConfig } from '@shared/types/hotkey'
import { DEFAULT_APP_CONFIG, KEYCHAIN_SERVICE } from './defaults'

type ChangeCallback = (newValue: unknown, oldValue: unknown) => void

export class ConfigManager {
  private store: Store<AppConfig>
  private listeners: Map<string, Set<ChangeCallback>>

  constructor() {
    this.store = new Store<AppConfig>({
      name: 'settings',
      defaults: DEFAULT_APP_CONFIG,
    })
    this.listeners = new Map()
  }

  /** 读取配置项 */
  get<K extends keyof AppConfig>(key: K): AppConfig[K]
  get<T>(key: string, defaultValue?: T): T
  get(key: string, defaultValue?: unknown): unknown {
    return this.store.get(key as keyof AppConfig, defaultValue as never)
  }

  /** 写入配置项并触发变更监听 */
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void
  set(key: string, value: unknown): void
  set(key: string, value: unknown): void {
    const oldValue = this.store.get(key as keyof AppConfig)
    this.store.set(key as keyof AppConfig, value as never)
    this.notifyListeners(key, value, oldValue)
  }

  /** 通过 macOS Keychain 读取敏感信息 */
  async getSecure(key: string): Promise<string | null> {
    return keytar.getPassword(KEYCHAIN_SERVICE, key)
  }

  /** 通过 macOS Keychain 存储敏感信息 */
  async setSecure(key: string, value: string): Promise<void> {
    await keytar.setPassword(KEYCHAIN_SERVICE, key, value)
  }

  /** 通过 macOS Keychain 删除敏感信息 */
  async deleteSecure(key: string): Promise<boolean> {
    return keytar.deletePassword(KEYCHAIN_SERVICE, key)
  }

  /** 监听配置项变更，返回取消订阅函数 */
  onChanged(key: string, callback: ChangeCallback): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set())
    }
    this.listeners.get(key)!.add(callback)
    return () => {
      this.listeners.get(key)?.delete(callback)
    }
  }

  /** 获取快捷键配置 */
  getHotkeys(): HotkeyConfig {
    return this.get('hotkeys')
  }

  /** 设置快捷键配置 */
  setHotkeys(config: HotkeyConfig): void {
    this.set('hotkeys', config)
  }

  /** 导出全部配置（不含敏感信息） */
  exportConfig(): AppConfig {
    return JSON.parse(JSON.stringify(this.store.store))
  }

  /** 导入配置（合并覆盖） */
  importConfig(config: Partial<AppConfig>): void {
    const current = this.store.store
    const merged = { ...current, ...config }
    this.store.store = merged

    // 通知所有变更的 key
    for (const key of Object.keys(config) as (keyof AppConfig)[]) {
      this.notifyListeners(key, merged[key], current[key])
    }
  }

  /** 重置为默认配置 */
  resetToDefaults(): void {
    const oldConfig = this.store.store
    this.store.clear()
    // store.clear 后会自动使用 defaults，通知所有 key 变更
    const newConfig = this.store.store
    for (const key of Object.keys(oldConfig) as (keyof AppConfig)[]) {
      if (JSON.stringify(oldConfig[key]) !== JSON.stringify(newConfig[key])) {
        this.notifyListeners(key, newConfig[key], oldConfig[key])
      }
    }
  }

  /** 获取配置文件路径（用于调试） */
  getConfigPath(): string {
    return this.store.path
  }

  private notifyListeners(key: string, newValue: unknown, oldValue: unknown): void {
    const callbacks = this.listeners.get(key)
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(newValue, oldValue)
        } catch (err) {
          console.error(`ConfigManager: listener error for key "${key}":`, err)
        }
      }
    }
  }
}
