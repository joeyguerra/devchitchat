import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestContext } from './helpers.mjs'

test('search indexes messages', () => {
  const ctx = createTestContext()
  const userId = ctx.insertUser('a', 'A', ['user'])
  
  const hub = ctx.hubService.ensureDefaultHub(userId)
  const channel = ctx.channelService.createChannel({ hubId: hub.hub_id, kind: 'text', name: 'general', visibility: 'public', createdByUserId: userId })

  ctx.channelService.joinChannel({ channelId: channel.channel_id, userId })
  ctx.messageService.sendMessage({ channelId: channel.channel_id, userId, text: 'error timeout in raid' })

  const hits = ctx.searchService.searchMessages({ channelId: channel.channel_id, query: 'timeout', limit: 10 })
  assert.ok(hits.length >= 1)
  assert.equal(hits[0].channel_id, channel.channel_id)
})
