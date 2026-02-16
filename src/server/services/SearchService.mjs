export class SearchService {
  constructor({ db }) {
    this.db = db
    this.useFts = this.isFtsEnabled()
  }

  isFtsEnabled() {
    try {
      const row = this.db.prepare("SELECT sql FROM sqlite_master WHERE name = 'fts_messages'").get()
      if (!row?.sql) {
        return false
      }
      return row.sql.toUpperCase().includes('VIRTUAL TABLE')
    } catch (error) {
      return false
    }
  }

  indexMessage({ msg_id, channel_id, seq, user_id, ts, text }) {
    if (this.useFts) {
      this.db.prepare(
        `
          INSERT INTO fts_messages (text, channel_id, msg_id, seq, user_id, ts)
          VALUES (?, ?, ?, ?, ?, ?)
        `
      ).run(text, channel_id, msg_id, seq, user_id, ts)
      return
    }

    this.db.prepare(
      `
        INSERT INTO fts_messages (text, channel_id, msg_id, seq, user_id, ts)
        VALUES (?, ?, ?, ?, ?, ?)
      `
    ).run(text, channel_id, msg_id, seq, user_id, ts)
  }

  searchMessages({ channelId, query, limit = 50 }) {
    if (this.useFts) {
      return this.db.prepare(
        `
          SELECT m.channel_id, m.msg_id, m.seq, m.user_id, m.ts,
            snippet(fts_messages, 0, '...', '...', '...', 10) AS snippet
          FROM fts_messages
          JOIN messages m ON m.msg_id = fts_messages.msg_id
          WHERE fts_messages MATCH ? AND m.channel_id = ?
          ORDER BY bm25(fts_messages)
          LIMIT ?
        `
      ).all(query, channelId, limit)
    }

    const like = `%${query}%`
    return this.db.prepare(
      `
        SELECT channel_id, msg_id, seq, user_id, ts, text AS snippet
        FROM fts_messages
        WHERE channel_id = ? AND text LIKE ?
        LIMIT ?
      `
    ).all(channelId, like, limit)
  }
}
