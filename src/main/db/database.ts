import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { up as migration001 } from './migrations/001_initial'

let db: Database.Database | null = null

export interface DatabaseOptions {
  /** 自定义数据库路径（主要用于测试） */
  dbPath?: string
}

/** 获取数据库实例（单例） */
export function getDatabase(options?: DatabaseOptions): Database.Database {
  if (db) return db

  const dbPath = options?.dbPath ?? getDefaultDbPath()

  // 确保目录存在
  const dir = dbPath.substring(0, dbPath.lastIndexOf('/'))
  mkdirSync(dir, { recursive: true })

  db = new Database(dbPath)

  // 启用 WAL 模式和外键约束
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // 运行迁移
  runMigrations(db)

  return db
}

/** 关闭数据库连接 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

/** 创建内存数据库（用于测试） */
export function createTestDatabase(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('foreign_keys = ON')
  runMigrations(testDb)
  return testDb
}

function getDefaultDbPath(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'data', 'interviews.db')
}

function runMigrations(database: Database.Database): void {
  // 创建迁移跟踪表
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `)

  const applied = database
    .prepare('SELECT name FROM _migrations')
    .all() as { name: string }[]
  const appliedNames = new Set(applied.map((m) => m.name))

  const migrations = [
    { name: '001_initial', fn: migration001 },
  ]

  const insertMigration = database.prepare(
    'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)'
  )

  for (const migration of migrations) {
    if (!appliedNames.has(migration.name)) {
      migration.fn(database)
      insertMigration.run(migration.name, Date.now())
    }
  }
}
