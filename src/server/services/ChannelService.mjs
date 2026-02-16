import { newId } from '../util/ids.mjs'
import { hashToken, randomToken } from '../util/crypto.mjs'
import { ServiceError } from '../util/errors.mjs'
import { runTransaction } from '../db/transaction.mjs'

export class ChannelService {
  constructor({ db, hubService, nowFn = () => Date.now() }) {
    this.db = db
    this.hubService = hubService
    this.nowFn = nowFn
  }

  createChannel({ hubId, kind, name, topic = null, visibility = 'public', createdByUserId, userRoles = [] }) {
    if (!['text', 'voice'].includes(kind)) {
      throw new ServiceError('BAD_REQUEST', 'Invalid channel kind')
    }
    if (!name?.trim()) {
      throw new ServiceError('BAD_REQUEST', 'Channel name required')
    }

    // Check hub access
    if (!this.hubService.canAccessHub(hubId, createdByUserId, userRoles)) {
      throw new ServiceError('FORBIDDEN', 'Cannot access hub')
    }

    const channelId = newId('c')
    const now = this.nowFn()

    runTransaction(this.db, () => {
      this.db.prepare(
        `
          INSERT INTO channels (channel_id, hub_id, kind, name, topic, visibility, created_by_user_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(channelId, hubId, kind, name.trim(), topic, visibility, createdByUserId, now)

      this.db.prepare(
        `
          INSERT INTO channel_members (channel_id, user_id, role, joined_at)
          VALUES (?, ?, 'owner', ?)
        `
      ).run(channelId, createdByUserId, now)
    })

    return { channel_id: channelId, hub_id: hubId, kind, name: name.trim(), topic, visibility }
  }

  listChannels(userId, userRoles = [], hubId = null) {
    const isAdmin = userRoles.includes('admin')

    // Build query based on whether filtering by hub
    let query
    let params

    if (hubId) {
      // List channels in a specific hub
      if (isAdmin) {
        query = `
          SELECT c.channel_id, c.hub_id, c.name, c.kind, c.visibility, c.topic
          FROM channels c
          WHERE c.hub_id = ? AND c.deleted_at IS NULL
          ORDER BY c.name
        `
        params = [hubId]
      } else {
        query = `
          SELECT c.channel_id, c.hub_id, c.name, c.kind, c.visibility, c.topic
          FROM channels c
          WHERE c.hub_id = ? AND c.deleted_at IS NULL
          AND (
            c.visibility = 'public'
            OR EXISTS (
              SELECT 1 FROM channel_members cm
              WHERE cm.channel_id = c.channel_id
              AND cm.user_id = ?
              AND cm.left_at IS NULL
              AND cm.banned_at IS NULL
            )
          )
          ORDER BY c.name
        `
        params = [hubId, userId]
      }
    } else {
      // List all accessible channels across all hubs
      if (isAdmin) {
        query = `
          SELECT c.channel_id, c.hub_id, c.name, c.kind, c.visibility, c.topic,
            h.name AS hub_name
          FROM channels c
          JOIN hubs h ON c.hub_id = h.hub_id
          WHERE c.deleted_at IS NULL AND h.deleted_at IS NULL
          ORDER BY h.name, c.name
        `
        params = []
      } else {
        query = `
          SELECT c.channel_id, c.hub_id, c.name, c.kind, c.visibility, c.topic,
            h.name AS hub_name
          FROM channels c
          JOIN hubs h ON c.hub_id = h.hub_id
          WHERE c.deleted_at IS NULL AND h.deleted_at IS NULL
          AND (
            (h.visibility = 'public' AND c.visibility = 'public')
            OR EXISTS (
              SELECT 1 FROM channel_members cm
              WHERE cm.channel_id = c.channel_id
              AND cm.user_id = ?
              AND cm.left_at IS NULL
              AND cm.banned_at IS NULL
            )
            OR EXISTS (
              SELECT 1 FROM hub_members hm
              WHERE hm.hub_id = h.hub_id
              AND hm.user_id = ?
              AND hm.left_at IS NULL
            )
          )
          ORDER BY h.name, c.name
        `
        params = [userId, userId]
      }
    }

    return this.db.prepare(query).all(...params)
  }

  joinChannel({ channelId, userId, userRoles = [] }) {
    const channel = this.getChannel(channelId)
    if (!channel || channel.deleted_at) {
      throw new ServiceError('NOT_FOUND', 'Channel not found')
    }

    // Check hub access first
    if (!this.hubService.canAccessHub(channel.hub_id, userId, userRoles)) {
      throw new ServiceError('FORBIDDEN', 'Cannot access hub')
    }

    if (channel.visibility === 'private') {
      const member = this.getMembership(channelId, userId)
      if (!member || member.left_at || member.banned_at) {
        throw new ServiceError('FORBIDDEN', 'Not a member of this channel')
      }
      return { channel_id: channelId, kind: channel.kind }
    }

    const now = this.nowFn()
    this.db.prepare(
      `
        INSERT INTO channel_members (channel_id, user_id, role, joined_at)
        VALUES (?, ?, 'member', ?)
        ON CONFLICT(channel_id, user_id) DO UPDATE SET left_at = NULL, banned_at = NULL
      `
    ).run(channelId, userId, now)

    return { channel_id: channelId, kind: channel.kind }
  }

  leaveChannel({ channelId, userId }) {
    const now = this.nowFn()
    this.db.prepare('UPDATE channel_members SET left_at = ? WHERE channel_id = ? AND user_id = ?').run(now, channelId, userId)
    return { channel_id: channelId }
  }

  isMember(channelId, userId) {
    const member = this.getMembership(channelId, userId)
    return !!member && !member.left_at && !member.banned_at
  }

  /**
   * Check if user can access a channel
   * @param {string} channelId - Channel ID
   * @param {string} userId - User ID
   * @param {Array<string>} roles - User roles
   * @returns {boolean}
   */
  canAccessChannel(channelId, userId, roles = []) {
    if (roles.includes('admin')) {
      return true
    }

    const channel = this.getChannel(channelId)
    if (!channel || channel.deleted_at) {
      return false
    }

    if (!this.hubService.canAccessHub(channel.hub_id, userId, roles)) {
      return false
    }

    if (channel.visibility === 'public') {
      return true
    }

    return this.isMember(channelId, userId)
  }

  listChannelMembers(channelId) {
    return this.db.prepare(
      `
        SELECT user_id, role FROM channel_members
        WHERE channel_id = ? AND left_at IS NULL AND banned_at IS NULL
      `
    ).all(channelId)
  }

  createChannelInvite({ channelId, createdByUserId, ttlMs = 24 * 60 * 60 * 1000, maxUses = 1 }) {
    const member = this.getMembership(channelId, createdByUserId)
    if (!member || !['owner', 'mod'].includes(member.role)) {
      throw new ServiceError('FORBIDDEN', 'Channel invite requires owner or mod')
    }
    const channel = this.getChannel(channelId)
    if (!channel || channel.visibility !== 'private') {
      throw new ServiceError('BAD_REQUEST', 'Invites are only for private channels')
    }

    const inviteToken = randomToken()
    const inviteId = newId('cinvite')
    const now = this.nowFn()
    const expiresAt = now + ttlMs

    this.db.prepare(
      `
        INSERT INTO channel_invites (invite_id, channel_id, token_hash, created_by_user_id, created_at, expires_at, max_uses, uses)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `
    ).run(inviteId, channelId, hashToken(inviteToken), createdByUserId, now, expiresAt, maxUses)

    return { inviteToken, inviteId, expiresAt, maxUses }
  }

  redeemChannelInvite({ inviteToken, userId }) {
    const invite = this.db.prepare('SELECT * FROM channel_invites WHERE token_hash = ?').get(hashToken(inviteToken))
    const now = this.nowFn()

    if (!invite) {
      throw new ServiceError('NOT_FOUND', 'Invite not found')
    }
    if (invite.expires_at <= now) {
      throw new ServiceError('BAD_REQUEST', 'Invite expired')
    }
    if (invite.uses >= invite.max_uses) {
      throw new ServiceError('BAD_REQUEST', 'Invite already used')
    }

    runTransaction(this.db, () => {
      this.db.prepare('UPDATE channel_invites SET uses = uses + 1 WHERE invite_id = ?').run(invite.invite_id)
      this.db.prepare(
        `
          INSERT INTO channel_members (channel_id, user_id, role, joined_at)
          VALUES (?, ?, 'member', ?)
          ON CONFLICT(channel_id, user_id) DO UPDATE SET left_at = NULL, banned_at = NULL
        `
      ).run(invite.channel_id, userId, now)
    })

    return { channel_id: invite.channel_id }
  }

  addMember({ channelId, createdByUserId, targetUserId }) {
    const adder = this.getMembership(channelId, createdByUserId)
    if (!adder || !['owner', 'mod'].includes(adder.role)) {
      throw new ServiceError('FORBIDDEN', 'Only owner or mod can add members')
    }
    const channel = this.getChannel(channelId)
    if (!channel) {
      throw new ServiceError('NOT_FOUND', 'Channel not found')
    }
    const existing = this.getMembership(channelId, targetUserId)
    if (existing && !existing.left_at && !existing.banned_at) {
      throw new ServiceError('BAD_REQUEST', 'User is already a member')
    }
    const now = this.nowFn()
    this.db.prepare(
      `
        INSERT INTO channel_members (channel_id, user_id, role, joined_at)
        VALUES (?, ?, 'member', ?)
        ON CONFLICT(channel_id, user_id) DO UPDATE SET left_at = NULL, banned_at = NULL
      `
    ).run(channelId, targetUserId, now)
    return { channel_id: channelId, user_id: targetUserId }
  }

  getChannel(channelId) {
    return this.db.prepare('SELECT * FROM channels WHERE channel_id = ?').get(channelId)
  }

  getMembership(channelId, userId) {
    return this.db.prepare('SELECT * FROM channel_members WHERE channel_id = ? AND user_id = ?').get(channelId, userId)
  }

  /**
   * Ensure default "general" channel exists in a hub
   * @param {string} hubId - Hub ID
   * @param {string} createdByUserId - Bootstrap admin user ID
   * @returns {Object} Channel
   */
  ensureDefaultChannel(hubId, createdByUserId) {
    const existing = this.db.prepare(
      'SELECT * FROM channels WHERE hub_id = ? AND name = ? AND deleted_at IS NULL'
    ).get(hubId, 'general')
    
    if (existing) {
      return existing
    }

    return this.createChannel({
      hubId,
      kind: 'text',
      name: 'general',
      topic: 'General discussions',
      visibility: 'public',
      createdByUserId,
      userRoles: ['admin']
    })
  }

  /**
   * Update channel name and/or topic
   * @param {Object} params
   * @param {string} params.channelId - Channel ID
   * @param {string} params.userId - User ID making the update
   * @param {Array<string>} params.roles - User roles
   * @param {string} [params.name] - New channel name
   * @param {string} [params.topic] - New channel topic
   * @returns {Object} Updated channel
   */
  updateChannel({ channelId, userId, roles = [], name = null, topic = null }) {
    const channel = this.getChannel(channelId)
    if (!channel || channel.deleted_at) {
      throw new ServiceError('NOT_FOUND', 'Channel not found')
    }

    // Check permissions: admins, channel creator, or channel owners can update
    const isAdmin = roles.includes('admin')
    const isCreator = channel.created_by_user_id === userId
    
    const membership = this.getMembership(channelId, userId)
    const isOwner = membership && membership.role === 'owner' && !membership.left_at && !membership.banned_at

    if (!isAdmin && !isCreator && !isOwner) {
      throw new ServiceError('FORBIDDEN', 'Cannot update channel')
    }

    // At least one field must be provided
    if (name === null && topic === null) {
      throw new ServiceError('BAD_REQUEST', 'No fields to update')
    }

    // Build update query dynamically
    const updates = []
    const params = []
    
    if (name !== null) {
      if (!name.trim()) {
        throw new ServiceError('BAD_REQUEST', 'Channel name cannot be empty')
      }
      updates.push('name = ?')
      params.push(name.trim())
    }
    
    if (topic !== null) {
      updates.push('topic = ?')
      params.push(topic)
    }

    params.push(channelId)

    this.db.prepare(
      `UPDATE channels SET ${updates.join(', ')} WHERE channel_id = ?`
    ).run(...params)

    // Return updated channel
    return this.getChannel(channelId)
  }

  /**
   * Soft-delete a channel
   * @param {Object} params
   * @param {string} params.channelId - Channel ID
   * @param {string} params.userId - User ID making the delete request
   * @param {Array<string>} params.roles - User roles
   * @returns {Object} Deleted channel metadata
   */
  deleteChannel({ channelId, userId, roles = [] }) {
    const channel = this.getChannel(channelId)
    if (!channel || channel.deleted_at) {
      throw new ServiceError('NOT_FOUND', 'Channel not found')
    }

    const isAdmin = roles.includes('admin')
    const isCreator = channel.created_by_user_id === userId
    const membership = this.getMembership(channelId, userId)
    const isOwner = membership && membership.role === 'owner' && !membership.left_at && !membership.banned_at
    if (!isAdmin && !isCreator && !isOwner) {
      throw new ServiceError('FORBIDDEN', 'Cannot delete channel')
    }

    const now = this.nowFn()
    this.db.prepare('UPDATE channels SET deleted_at = ? WHERE channel_id = ?').run(now, channelId)

    return {
      channel_id: channel.channel_id,
      hub_id: channel.hub_id
    }
  }
}
