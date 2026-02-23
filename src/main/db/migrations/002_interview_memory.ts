import type Database from 'better-sqlite3'

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_contexts (
      session_id TEXT PRIMARY KEY,
      round TEXT NOT NULL DEFAULT '',
      background_note TEXT NOT NULL DEFAULT '',
      resume_file_name TEXT NOT NULL DEFAULT '',
      resume_file_path TEXT NOT NULL DEFAULT '',
      resume_text TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_session_context_updated
      ON session_contexts(updated_at);

    CREATE TABLE IF NOT EXISTS interview_memory_chunks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      source TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      timestamp INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_memory_chunks_session_time
      ON interview_memory_chunks(session_id, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_memory_chunks_session_source
      ON interview_memory_chunks(session_id, source);

    CREATE VIRTUAL TABLE IF NOT EXISTS interview_memory_chunks_fts USING fts5(
      text,
      source UNINDEXED,
      session_id UNINDEXED,
      chunk_id UNINDEXED,
      tokenize='unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS trg_memory_chunks_ai
    AFTER INSERT ON interview_memory_chunks BEGIN
      INSERT INTO interview_memory_chunks_fts(rowid, text, source, session_id, chunk_id)
      VALUES (new.rowid, new.text, new.source, new.session_id, new.id);
    END;

    CREATE TRIGGER IF NOT EXISTS trg_memory_chunks_au
    AFTER UPDATE ON interview_memory_chunks BEGIN
      INSERT INTO interview_memory_chunks_fts(interview_memory_chunks_fts, rowid, text, source, session_id, chunk_id)
      VALUES ('delete', old.rowid, old.text, old.source, old.session_id, old.id);
      INSERT INTO interview_memory_chunks_fts(rowid, text, source, session_id, chunk_id)
      VALUES (new.rowid, new.text, new.source, new.session_id, new.id);
    END;

    CREATE TRIGGER IF NOT EXISTS trg_memory_chunks_ad
    AFTER DELETE ON interview_memory_chunks BEGIN
      INSERT INTO interview_memory_chunks_fts(interview_memory_chunks_fts, rowid, text, source, session_id, chunk_id)
      VALUES ('delete', old.rowid, old.text, old.source, old.session_id, old.id);
    END;
  `)
}

