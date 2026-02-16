import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestContext } from './helpers.mjs'

test('channel creation and listing', () => {
  const ctx = createTestContext()
  const adminId = ctx.insertUser('admin', 'Admin', ['admin'])

  const hub = ctx.hubService.ensureDefaultHub(adminId)
  const channel = ctx.channelService.createChannel({ hubId: hub.hub_id, kind: 'text', name: 'general', visibility: 'public', createdByUserId: adminId })
  const channels = ctx.channelService.listChannels(adminId, ['admin'], hub.hub_id)

  assert.equal(channels.length, 1)
  assert.equal(channels[0].channel_id, channel.channel_id)
})

test('private channel membership requires invite', () => {
  const ctx = createTestContext()
  const ownerId = ctx.insertUser('owner', 'Owner', ['user'])
  const userId = ctx.insertUser('joey', 'Joey', ['user'])

  const hub = ctx.hubService.ensureDefaultHub(ownerId)
  const channel = ctx.channelService.createChannel({ hubId: hub.hub_id, kind: 'text', name: 'private-chat', visibility: 'private', createdByUserId: ownerId })
  assert.throws(() => {
    ctx.channelService.joinChannel({ channelId: channel.channel_id, userId })
  }, /Not a member/)

  const invite = ctx.channelService.createChannelInvite({ channelId: channel.channel_id, createdByUserId: ownerId })
  ctx.channelService.redeemChannelInvite({ inviteToken: invite.inviteToken, userId })

  const member = ctx.channelService.isMember(channel.channel_id, userId)
  assert.equal(member, true)
})
