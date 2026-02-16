import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestContext } from './helpers.mjs'

test('delivery watermark advances', () => {
  const ctx = createTestContext()
  const userId = ctx.insertUser('a', 'A', ['user'])
  
  const hub = ctx.hubService.ensureDefaultHub(userId)
  const channel = ctx.channelService.createChannel({ hubId: hub.hub_id, kind: 'text', name: 'general', visibility: 'public', createdByUserId: userId })

  const record = ctx.deliveryService.getOrCreate({ channelId: channel.channel_id, userId })
  assert.equal(record.after_seq, 0)

  ctx.deliveryService.advance({ channelId: channel.channel_id, userId, afterSeq: 42 })
  const updated = ctx.db.prepare('SELECT after_seq FROM deliveries WHERE delivery_id = ?').get(record.delivery_id)
  assert.equal(updated.after_seq, 42)
})
