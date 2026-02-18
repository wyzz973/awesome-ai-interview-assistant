import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL DEFAULT '',
      position TEXT NOT NULL DEFAULT '',
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL DEFAULT 0,
      duration INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'recording'
    );

    CREATE TABLE IF NOT EXISTS transcript_entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      speaker TEXT NOT NULL,
      text TEXT NOT NULL,
      is_final INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_transcript_session_time
      ON transcript_entries(session_id, timestamp);

    CREATE TABLE IF NOT EXISTS screenshot_qas (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      image_path TEXT NOT NULL,
      question TEXT NOT NULL DEFAULT '',
      answer TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_screenshot_session
      ON screenshot_qas(session_id);

    CREATE TABLE IF NOT EXISTS review_reports (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE,
      generated_at INTEGER NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      questions TEXT NOT NULL DEFAULT '[]',
      performance TEXT NOT NULL DEFAULT '{"strengths":[],"weaknesses":[]}',
      suggestions TEXT NOT NULL DEFAULT '[]',
      key_topics TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_review_session
      ON review_reports(session_id);
  `)
}
