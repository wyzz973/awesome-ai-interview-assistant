/** IPC 通道常量 */
export const IPC_CHANNELS = {
  // 窗口控制
  WINDOW_TOGGLE: 'window:toggle',
  WINDOW_SET_OPACITY: 'window:setOpacity',
  WINDOW_GET_OPACITY: 'window:getOpacity',

  // 截屏
  SCREENSHOT_CAPTURE: 'screenshot:capture',
  RESUME_PICK_FILE: 'resume:pickFile',

  // AI / LLM
  LLM_CHAT: 'llm:chat',
  LLM_ANALYZE_SCREENSHOT: 'llm:analyzeScreenshot',
  LLM_STREAM_CHUNK: 'llm:streamChunk',
  LLM_STREAM_END: 'llm:streamEnd',
  LLM_STREAM_ERROR: 'llm:streamError',
  LLM_TEST_CONNECTION: 'llm:testConnection',
  LLM_FETCH_MODELS: 'llm:fetchModels',

  // 语音识别
  ASR_START: 'asr:start',
  ASR_STOP: 'asr:stop',
  ASR_TRANSCRIPT: 'asr:transcript',
  ASR_STATUS: 'asr:status',
  ASR_TEST_CONNECTION: 'asr:testConnection',
  ASR_PUSH_MIC_AUDIO: 'asr:pushMicAudio',
  ASR_PUSH_SYSTEM_AUDIO: 'asr:pushSystemAudio',
  ASR_DEBUG: 'asr:debug',

  // 录音控制
  RECORDING_TOGGLE: 'recording:toggle',
  RECORDING_STATUS: 'recording:status',

  // 会话管理
  SESSION_START: 'session:start',
  SESSION_STOP: 'session:stop',
  SESSION_LIST: 'session:list',
  SESSION_GET: 'session:get',
  SESSION_DELETE: 'session:delete',
  SESSION_EXPORT: 'session:export',

  // 复盘报告
  REVIEW_GENERATE: 'review:generate',
  REVIEW_GET: 'review:get',

  // 配置
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_GET_SECURE: 'config:getSecure',
  CONFIG_SET_SECURE: 'config:setSecure',
  CONFIG_DELETE_SECURE: 'config:deleteSecure',
  CONFIG_RESET: 'config:reset',
  CONFIG_EXPORT: 'config:export',
  CONFIG_IMPORT: 'config:import',

  // 快捷键
  HOTKEY_UPDATE: 'hotkey:update',
  HOTKEY_GET_ALL: 'hotkey:getAll',
  HOTKEY_RESET: 'hotkey:reset',
  HOTKEY_CHECK_CONFLICT: 'hotkey:checkConflict',

  // 音频设备
  AUDIO_LIST_DEVICES: 'audio:listDevices',
  AUDIO_CHECK_BLACKHOLE: 'audio:checkBlackhole',
  AUDIO_INSTALL_BLACKHOLE: 'audio:installBlackhole',

  // 健康监测
  HEALTH_GET_SNAPSHOT: 'health:getSnapshot',
  HEALTH_SUBSCRIBE: 'health:subscribe',
  HEALTH_UNSUBSCRIBE: 'health:unsubscribe',
  HEALTH_UPDATE: 'health:update',
} as const

/** IPC 通道名称类型 */
export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
