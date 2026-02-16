export const initDb = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      handle TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      roles_json TEXT NOT NULL,
      password_hash TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      last_seen_at INTEGER,
      FOREIGN KEY(user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS invites (
      invite_id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      max_uses INTEGER NOT NULL,
      uses INTEGER NOT NULL,
      redeemed_by_user_id TEXT,
      note TEXT,
      FOREIGN KEY(created_by_user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS hubs (
      hub_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      visibility TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      deleted_at INTEGER,
      FOREIGN KEY(created_by_user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS hub_members (
      hub_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      left_at INTEGER,
      PRIMARY KEY (hub_id, user_id),
      FOREIGN KEY(hub_id) REFERENCES hubs(hub_id),
      FOREIGN KEY(user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS channels (
      channel_id TEXT PRIMARY KEY,
      hub_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      topic TEXT,
      visibility TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      deleted_at INTEGER,
      FOREIGN KEY(hub_id) REFERENCES hubs(hub_id),
      FOREIGN KEY(created_by_user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      left_at INTEGER,
      banned_at INTEGER,
      PRIMARY KEY (channel_id, user_id),
      FOREIGN KEY(channel_id) REFERENCES channels(channel_id),
      FOREIGN KEY(user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS channel_invites (
      invite_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      max_uses INTEGER NOT NULL,
      uses INTEGER NOT NULL,
      FOREIGN KEY(channel_id) REFERENCES channels(channel_id),
      FOREIGN KEY(created_by_user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      actor_user_id TEXT NOT NULL,
      scope_kind TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      type TEXT NOT NULL,
      body_json TEXT NOT NULL,
      trace TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      msg_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      text TEXT NOT NULL,
      client_msg_id TEXT,
      deleted_at INTEGER,
      FOREIGN KEY(channel_id) REFERENCES channels(channel_id),
      FOREIGN KEY(user_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS deliveries (
      delivery_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      after_seq INTEGER NOT NULL,
      last_delivered_at INTEGER,
      status TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(user_id),
      FOREIGN KEY(channel_id) REFERENCES channels(channel_id)
    );
  `)

  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_messages USING fts5(
        text,
        channel_id UNINDEXED,
        msg_id UNINDEXED,
        seq UNINDEXED,
        user_id UNINDEXED,
        ts UNINDEXED
      );
    `)
  } catch (error) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS fts_messages (
        text TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        msg_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        ts INTEGER NOT NULL
      );
    `)
  }
}
