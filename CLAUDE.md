# CLAUDE.md

This file provides guidance for AI assistants working on this codebase.

## Project Overview

AI Interview Assistant (AI 面试助手) — an Electron desktop app that acts as a real-time AI copilot during technical interviews. It unifies resume context, live transcription (ASR), screenshot Q&A, and chat into a single session-scoped context, using retrieval-augmented generation to inject relevant memory fragments into LLM prompts.

Primary language: **Chinese** (UI text, prompts, commit messages, and comments are predominantly in Chinese).

## Tech Stack

- **Runtime**: Electron 33 + Node.js 20+
- **Build**: electron-vite (Vite 5) + electron-builder
- **Frontend**: React 18, TypeScript, Zustand (state), Tailwind CSS v4, Radix UI primitives
- **Backend (main process)**: TypeScript, better-sqlite3 (SQLite + FTS5), electron-log, keytar (secure storage)
- **Testing**: Vitest (unit + e2e)
- **Package manager**: npm (lockfile committed)

## Architecture

The app follows the standard Electron three-process architecture:

```
src/
  main/              # Main process (Node.js)
  preload/           # Preload bridge (contextBridge → window.api)
  renderer/          # Renderer process (React SPA)
  shared/            # Cross-process types, constants, IPC channel definitions
  workers/           # Worker threads (sessionWorker for DB writes)
```

### Main Process (`src/main/`)

Entry point: `src/main/index.ts` — instantiates a singleton `App` class that orchestrates all services.

| Directory | Purpose |
|---|---|
| `capture/` | AudioCapture (mic + system audio), ScreenCapture (region selection) |
| `config/` | ConfigManager (electron-store) + default config values |
| `db/` | SQLite database singleton, migrations (`001_initial`, `002_interview_memory`), repository classes |
| `db/repositories/` | SessionRepo, TranscriptRepo, ScreenshotQARepo, ReviewRepo, SessionContextRepo, InterviewMemoryRepo |
| `hotkey/` | HotkeyManager — global shortcuts via Electron `globalShortcut` |
| `ipc/` | `handlers.ts` — all `ipcMain.handle` / `ipcMain.on` registrations (single file) |
| `logger/` | electron-log wrapper with scoped loggers (`getLogger('Scope')`) and EPIPE/EIO error suppression |
| `recorder/` | SessionRecorder — manages session lifecycle, delegates DB writes to worker thread |
| `services/` | Core business logic: LLMService, ASRService, ReviewService, InterviewMemoryService, PromptPolicy, ResumeParser, HealthMonitorService |
| `services/ASRProviders/` | ASR provider implementations: WhisperASR, AliyunASR, TencentASR |
| `tray/` | TrayManager — system tray icon and menu |
| `window/` | StealthWindow (main overlay window), SelectorWindow (screenshot region picker) |

### Preload (`src/preload/index.ts`)

Single file that exposes `window.api` to the renderer via `contextBridge.exposeInMainWorld`. All IPC calls go through this typed API surface. The `ElectronAPI` type is exported for renderer-side typing.

### Renderer (`src/renderer/`)

React SPA entry: `src/renderer/main.tsx` → `App.tsx`.

| Directory | Purpose |
|---|---|
| `components/AnswerPanel/` | Chat/answer UI with streaming text display |
| `components/Common/` | Shared UI components: Button, Input, Toast, Loading, ErrorBoundary, etc. |
| `components/History/` | Session history list, detail view, export functionality |
| `components/Layout/` | MainLayout (tab navigation), Toolbar |
| `components/Onboarding/` | First-run wizard (model, ASR, audio, hotkey setup) |
| `components/ReviewReport/` | Post-interview review report display |
| `components/ScreenshotSelector/` | Screenshot region selection overlay |
| `components/Settings/` | Settings panels: Model, ASR, Hotkey, Appearance, Storage |
| `components/TranscriptPanel/` | Real-time transcription display |
| `services/` | Renderer-side services: AudioCaptureBridge, audio device selection, policy modules |
| `stores/` | Zustand stores: appStore, chatStore, historyStore, settingsStore, transcriptStore |
| `styles/` | Global CSS (`globals.css`), theme tokens (`theme.ts`) |
| `utils/` | Renderer utilities (formatHotkey, logger) |

### Shared (`src/shared/`)

- `types/` — TypeScript interfaces shared across processes: `config.ts`, `health.ts`, `hotkey.ts`, `ipc.ts`, `llm.ts`, `session.ts`
- `constants.ts` — IPC channel names are **not** here (they're in `types/ipc.ts`); this file has default configs, LLM/ASR provider presets, default prompts, hotkeys

### Workers (`src/workers/`)

- `sessionWorker.ts` — Worker thread for writing session data (transcripts, screenshot QA) to SQLite without blocking the main process. Uses a message-passing protocol.

## Key Patterns

### IPC Communication

All IPC channels are defined in `src/shared/types/ipc.ts` as `IPC_CHANNELS`. The pattern:
1. Renderer calls `window.api.someMethod(...)` (defined in `src/preload/index.ts`)
2. Preload forwards via `ipcRenderer.invoke(IPC_CHANNELS.SOME_CHANNEL, ...)`
3. Main process handles in `src/main/ipc/handlers.ts` via `ipcMain.handle(...)`

For streaming (LLM responses, ASR transcripts): main process uses `event.sender.send(...)` to push chunks, renderer listens via `ipcRenderer.on(...)`.

### Database

- SQLite via `better-sqlite3` with WAL mode and foreign keys enabled
- Singleton via `getDatabase()` in `src/main/db/database.ts`
- Migrations in `src/main/db/migrations/` — numbered sequentially, tracked in `_migrations` table
- Repository pattern: each table has a dedicated `*Repo` class
- `createTestDatabase()` returns an in-memory SQLite instance for tests
- Interview memory uses FTS5 for keyword search + Jaccard similarity for pseudo-vector retrieval + time decay + source weighting + MMR deduplication

### State Management

Renderer uses Zustand stores (no Redux). Stores are in `src/renderer/stores/`:
- `appStore` — global app state (current view, recording status, health snapshot)
- `chatStore` — chat messages, LLM streaming state
- `historyStore` — session history list
- `settingsStore` — config from main process
- `transcriptStore` — real-time ASR transcript entries

### Logging

Use `getLogger('ScopeName')` from `src/main/logger/index.ts` in the main process. This returns a scoped `electron-log` instance. Renderer uses a lightweight logger at `src/renderer/utils/logger.ts`.

### Config & Secrets

- General config: `electron-store` via `ConfigManager`
- API keys: stored securely via `keytar` (OS keychain). Access through `configManager.getSecure()` / `setSecure()`
- LLM config supports role-based configs: `chat`, `screenshot`, `review` — each role can use different providers/models
- Config changes emit events via `configManager.onChanged(key, callback)`

### LLM Integration

- OpenAI-compatible HTTP API (supports OpenAI, DeepSeek, GLM, Qwen, Moonshot, MiniMax, Claude)
- Streaming responses via async iterators
- System prompt is runtime-built: base prompt + programming language preference + session context injection
- Provider presets in `src/shared/constants.ts` (`LLM_PROVIDER_PRESETS`)

### ASR (Speech Recognition)

- Provider abstraction: `ASRProvider` interface with implementations for Whisper (OpenAI-compatible), Aliyun, Tencent
- Dual-channel: separate mic (user) and system audio (interviewer) streams
- VAD (Voice Activity Detection) for Whisper streaming
- Audio routing on macOS requires BlackHole for system audio capture

## Path Aliases

Configured in `tsconfig.node.json`, `tsconfig.web.json`, `electron.vite.config.ts`, and `vitest.config.ts`:

| Alias | Path |
|---|---|
| `@shared/*` | `src/shared/*` |
| `@main/*` | `src/main/*` |
| `@renderer/*` | `src/renderer/*` |

## Commands

```bash
# Development
npm run dev              # Start Electron in dev mode (hot reload)
npm run build            # Build all processes (main + preload + renderer)

# Type checking
npm run typecheck        # tsc --noEmit

# Testing
npx vitest run           # Run all unit tests
npm run test:e2e         # Run e2e tests (src/main/e2e/)

# Packaging
npm run package          # Build + package for current platform
npm run package:mac      # macOS (dmg + zip, x64 + arm64)
npm run package:win      # Windows (NSIS installer, x64)
npm run package:linux    # Linux (AppImage + deb, x64)
npm run package:all      # All platforms
```

## Testing Conventions

- Test files are colocated with source: `__tests__/*.test.ts` inside each module directory
- Vitest with `globals: false` — you must import `describe`, `it`, `expect` etc. explicitly from `vitest`
- Use `createTestDatabase()` for database tests (in-memory SQLite)
- Tests do not require running Electron — main process services are testable standalone
- E2E tests are in `src/main/e2e/` and run via `npm run test:e2e`

## Code Conventions

- **Language**: Comments, log messages, prompts, and UI text are primarily in Chinese
- **TypeScript**: Strict mode enabled. Use path aliases (`@shared/`, `@main/`, `@renderer/`)
- **Imports**: Use `type` imports for type-only imports (e.g., `import type { Foo } from '...'`)
- **No linter configured**: No ESLint or Prettier config files in the repo. Follow existing code style
- **Error handling**: Wrap IPC handlers in try/catch, return `{ success: boolean, error?: string }` objects. Use `electron-log` scoped loggers — never use raw `console.log` in main process
- **Semicolons**: Not used (no-semi style)
- **Quotes**: Single quotes for strings
- **Trailing commas**: Used in multi-line structures
- **Indentation**: 2 spaces

## File Organization Rules

- One concern per file: each service, repo, store, or component gets its own file
- Components use barrel exports via `index.ts` in each component directory
- New IPC channels must be added to `src/shared/types/ipc.ts`, handled in `src/main/ipc/handlers.ts`, and exposed in `src/preload/index.ts`
- New database tables require a new numbered migration file in `src/main/db/migrations/`
- New repos go in `src/main/db/repositories/` and must be instantiated in the `App` class (`src/main/index.ts`)

## Build Output

- `out/` — Vite build output (main, preload, renderer)
- `dist/` — electron-builder packaged apps
- Both are gitignored

## Data & Privacy

- All interview data stored locally in SQLite (`userData/data/interviews.db`)
- API keys stored in OS keychain via keytar (never in plaintext config files)
- Screenshots persisted to `userData/data/screenshots/{sessionId}/`
- No cloud backend — only outbound calls are to LLM/ASR API providers
