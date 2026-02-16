import { newId } from '../util/ids.mjs'

export class DeliveryService {
  constructor({ db, nowFn = () => Date.now() }) {
    this.db = db
    this.nowFn = nowFn
  }

  getOrCreate({ channelId, userId }) {
    const existing = this.db.prepare(
      'SELECT * FROM deliveries WHERE channel_id = ? AND user_id = ?'
    ).get(channelId, userId)

    if (existing) {
      return existing
    }

    const deliveryId = newId('del')
    const now = this.nowFn()
    this.db.prepare(
      `
        INSERT INTO deliveries (delivery_id, user_id, channel_id, after_seq, last_delivered_at, status)
        VALUES (?, ?, ?, 0, ?, 'active')
      `
    ).run(deliveryId, userId, channelId, now)

    return this.db.prepare('SELECT * FROM deliveries WHERE delivery_id = ?').get(deliveryId)
  }

  advance({ channelId, userId, afterSeq }) {
    const now = this.nowFn()
    this.db.prepare(
      `
        UPDATE deliveries
        SET after_seq = ?, last_delivered_at = ?
        WHERE channel_id = ? AND user_id = ?
      `
    ).run(afterSeq, now, channelId, userId)
  }
}
