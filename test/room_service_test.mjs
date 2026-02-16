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

test('channel delete removes channel from listings', () => {
  const ctx = createTestContext()
  const adminId = ctx.insertUser('admin_delete_channel', 'Admin', ['admin'])

  const hub = ctx.hubService.ensureDefaultHub(adminId)
  const channel = ctx.channelService.createChannel({
    hubId: hub.hub_id,
    kind: 'text',
    name: 'to-delete',
    visibility: 'public',
    createdByUserId: adminId
  })

  ctx.channelService.deleteChannel({ channelId: channel.channel_id, userId: adminId, roles: ['admin'] })

  const channels = ctx.channelService.listChannels(adminId, ['admin'], hub.hub_id)
  assert.equal(channels.some((row) => row.channel_id === channel.channel_id), false)
})

test('hub delete removes hub and its channels from listings', () => {
  const ctx = createTestContext()
  const adminId = ctx.insertUser('admin_delete_hub', 'Admin', ['admin'])

  const hub = ctx.hubService.createHub({
    name: 'delete-hub',
    visibility: 'public',
    createdByUserId: adminId
  })
  const channel = ctx.channelService.createChannel({
    hubId: hub.hub_id,
    kind: 'text',
    name: 'hub-channel',
    visibility: 'public',
    createdByUserId: adminId
  })

  ctx.hubService.deleteHub({ hubId: hub.hub_id, userId: adminId, roles: ['admin'] })

  const hubs = ctx.hubService.listHubs(adminId, ['admin'])
  const channels = ctx.channelService.listChannels(adminId, ['admin'], hub.hub_id)
  assert.equal(hubs.some((row) => row.hub_id === hub.hub_id), false)
  assert.equal(channels.some((row) => row.channel_id === channel.channel_id), false)
})

test('private channel is only accessible to members and admins', () => {
  const ctx = createTestContext()
  const ownerId = ctx.insertUser('owner_private_access', 'Owner', ['user'])
  const nonMemberId = ctx.insertUser('non_member_private_access', 'NonMember', ['user'])
  const adminId = ctx.insertUser('admin_private_access', 'Admin', ['admin'])

  const hub = ctx.hubService.ensureDefaultHub(ownerId)
  const channel = ctx.channelService.createChannel({
    hubId: hub.hub_id,
    kind: 'text',
    name: 'private-only',
    visibility: 'private',
    createdByUserId: ownerId
  })

  assert.equal(ctx.channelService.canAccessChannel(channel.channel_id, ownerId, ['user']), true)
  assert.equal(ctx.channelService.canAccessChannel(channel.channel_id, nonMemberId, ['user']), false)
  assert.equal(ctx.channelService.canAccessChannel(channel.channel_id, adminId, ['admin']), true)
})
