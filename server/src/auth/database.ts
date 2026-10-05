import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openAuthDatabase(
  path = process.env.BELLFIVE_AUTH_DB_PATH ?? 'server/data/bellfive.sqlite',
): Database.Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        avatar_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS password_credentials (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        username_normalized TEXT NOT NULL UNIQUE,
        password_salt TEXT NOT NULL,
        password_digest TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS wechat_identities (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        app_id TEXT NOT NULL,
        openid TEXT NOT NULL,
        PRIMARY KEY (app_id, openid),
        UNIQUE (user_id, app_id)
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
    `);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
