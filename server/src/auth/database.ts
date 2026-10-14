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
      CREATE TABLE IF NOT EXISTS guardian_requests (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        policy_version TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS guardian_requests_expires_at ON guardian_requests(expires_at);
      CREATE INDEX IF NOT EXISTS guardian_requests_email ON guardian_requests(email);
      CREATE TABLE IF NOT EXISTS guardian_grants (
        token_hash TEXT PRIMARY KEY,
        policy_version TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS guardian_grants_expires_at ON guardian_grants(expires_at);
    `);
    const columns = new Set((db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map(column => column.name));
    for (const [name, declaration] of [
      ['privacy_policy_version', 'TEXT'], ['privacy_consent_at', 'INTEGER'], ['is_minor', 'INTEGER NOT NULL DEFAULT 0'],
      ['guardian_consent_version', 'TEXT'], ['guardian_consent_at', 'INTEGER'],
    ] as const) {
      if (!columns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${declaration}`);
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
