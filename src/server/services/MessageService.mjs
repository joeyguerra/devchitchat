import { newId } from '../util/ids.mjs'
import { ServiceError } from '../util/errors.mjs'
import { runTransaction } from '../db/transaction.mjs'

export class MessageService {
  constructor({ db, nowFn = () => Date.now(), channelService, searchService }) {
    this.db = db
    this.nowFn = nowFn
    this.channelService = channelService
    this.searchService = searchService
  }

  sendMessage({ channelId, userId, text, clientMsgId = null }) {
    if (!this.channelService.isMember(channelId, userId)) {
      throw new ServiceError('FORBIDDEN', 'Not a member of channel')
    }
    if (!text?.trim()) {
      throw new ServiceError('BAD_REQUEST', 'Message text required')
    }
    const msgId = newId('m')
    const now = this.nowFn()

    const { seq } = runTransaction(this.db, () => {
      const row = this.db.prepare('SELECT MAX(seq) AS max_seq FROM messages WHERE channel_id = ?').get(channelId)
      const nextSeq = (row?.max_seq || 0) + 1

      this.db.prepare(
        `
          INSERT INTO messages (msg_id, channel_id, seq, user_id, ts, text, client_msg_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      ).run(msgId, channelId, nextSeq, userId, now, text.trim(), clientMsgId)

      this.db.prepare(
        `
          INSERT INTO events (ts, actor_user_id, scope_kind, scope_id, type, body_json)
          VALUES (?, ?, 'channel', ?, 'msg.send', ?)
        `
      ).run(now, userId, channelId, JSON.stringify({ msg_id: msgId, seq: nextSeq }))

      return { seq: nextSeq }
    })

    this.searchService.indexMessage({
      msg_id: msgId,
      channel_id: channelId,
      seq,
      user_id: userId,
      ts: now,
      text: text.trim()
    })

    return { msg_id: msgId, seq, ts: now }
  }

  listMessages({ channelId, userId, afterSeq = 0, limit = 200 }) {
    if (!this.channelService.isMember(channelId, userId)) {
      throw new ServiceError('FORBIDDEN', 'Not a member of channel')
    }
    const rows = this.db.prepare(
      `
        SELECT m.msg_id, m.seq, m.user_id, u.handle as user_handle, m.ts, m.text
        FROM messages m
        LEFT JOIN users u ON m.user_id = u.user_id
        WHERE m.channel_id = ? AND m.seq > ?
        ORDER BY m.seq ASC
        LIMIT ?
      `
    ).all(channelId, afterSeq, limit)

    const lastSeq = rows.length ? rows[rows.length - 1].seq : afterSeq

    return { messages: rows, next_after_seq: lastSeq }
  }
}
