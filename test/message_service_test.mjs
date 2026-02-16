import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestContext } from './helpers.mjs'

test('message append and list', () => {
  const ctx = createTestContext()
  const userId = ctx.insertUser('a', 'A', ['user'])
  
  const hub = ctx.hubService.ensureDefaultHub(userId)
  const channel = ctx.channelService.createChannel({ hubId: hub.hub_id, kind: 'text', name: 'general', visibility: 'public', createdByUserId: userId })

  ctx.channelService.joinChannel({ channelId: channel.channel_id, userId })

  const first = ctx.messageService.sendMessage({ channelId: channel.channel_id, userId, text: 'hello' })
  const second = ctx.messageService.sendMessage({ channelId: channel.channel_id, userId, text: 'world' })

  assert.equal(first.seq, 1)
  assert.equal(second.seq, 2)

  const list = ctx.messageService.listMessages({ channelId: channel.channel_id, userId, afterSeq: 0, limit: 10 })
  assert.equal(list.messages.length, 2)
})
