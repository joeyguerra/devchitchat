import { newId } from '../util/ids.mjs'
import { ServiceError } from '../util/errors.mjs'
import { runTransaction } from '../db/transaction.mjs'

export class HubService {
  constructor({ db, nowFn = () => Date.now() }) {
    this.db = db
    this.nowFn = nowFn
  }

  /**
   * Create a new hub
   * @param {Object} params
   * @param {string} params.name - Hub name
   * @param {string} [params.description] - Hub description
   * @param {string} [params.visibility='public'] - 'public' or 'restricted'
   * @param {string} params.createdByUserId - User ID creating the hub
   * @returns {Object} Created hub
   */
  createHub({ name, description = null, visibility = 'public', createdByUserId }) {
    if (!['public', 'restricted'].includes(visibility)) {
      throw new ServiceError('BAD_REQUEST', 'Invalid hub visibility')
    }
    if (!name?.trim()) {
      throw new ServiceError('BAD_REQUEST', 'Hub name required')
    }
    const hubId = newId('h')
    const now = this.nowFn()

    runTransaction(this.db, () => {
      this.db.prepare(
        `
          INSERT INTO hubs (hub_id, name, description, visibility, created_by_user_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `
      ).run(hubId, name.trim(), description, visibility, createdByUserId, now)

      // Creator automatically becomes a hub member
      this.db.prepare(
        `
          INSERT INTO hub_members (hub_id, user_id, joined_at)
          VALUES (?, ?, ?)
        `
      ).run(hubId, createdByUserId, now)
    })

    return { hub_id: hubId, name: name.trim(), description, visibility }
  }

  /**
   * List hubs accessible to a user
   * @param {string} userId - User ID
   * @param {Array<string>} roles - User roles (e.g., ['admin'])
   * @returns {Array<Object>} List of hubs
   */
  listHubs(userId, roles = []) {
    const isAdmin = roles.includes('admin')

    if (isAdmin) {
      // Admins see all hubs
      return this.db.prepare(
        `
          SELECT h.hub_id, h.name, h.description, h.visibility,
            (SELECT COUNT(*) FROM channels c WHERE c.hub_id = h.hub_id AND c.deleted_at IS NULL) AS channel_count
          FROM hubs h
          WHERE h.deleted_at IS NULL
          ORDER BY h.name
        `
      ).all()
    }

    // Regular users see: public hubs + restricted hubs they're members of
    return this.db.prepare(
      `
        SELECT h.hub_id, h.name, h.description, h.visibility,
          (SELECT COUNT(*) FROM channels c WHERE c.hub_id = h.hub_id AND c.deleted_at IS NULL) AS channel_count
        FROM hubs h
        WHERE h.deleted_at IS NULL
        AND (
          h.visibility = 'public'
          OR EXISTS (
            SELECT 1 FROM hub_members hm
            WHERE hm.hub_id = h.hub_id
            AND hm.user_id = ?
            AND hm.left_at IS NULL
          )
        )
        ORDER BY h.name
      `
    ).all(userId)
  }

  /**
   * Check if user can access a hub
   * @param {string} hubId - Hub ID
   * @param {string} userId - User ID
   * @param {Array<string>} roles - User roles
   * @returns {boolean}
   */
  canAccessHub(hubId, userId, roles = []) {
    if (roles.includes('admin')) {
      return true
    }

    const hub = this.getHub(hubId)
    if (!hub || hub.deleted_at) {
      return false
    }

    if (hub.visibility === 'public') {
      return true
    }

    // Restricted hub: check membership
    const member = this.getHubMembership(hubId, userId)
    return !!member && !member.left_at
  }

  /**
   * Get hub by ID
   * @param {string} hubId - Hub ID
   * @returns {Object|null} Hub or null
   */
  getHub(hubId) {
    return this.db.prepare('SELECT * FROM hubs WHERE hub_id = ?').get(hubId) || null
  }

  /**
   * Get hub membership
   * @param {string} hubId - Hub ID
   * @param {string} userId - User ID
   * @returns {Object|null} Membership or null
   */
  getHubMembership(hubId, userId) {
    return this.db.prepare('SELECT * FROM hub_members WHERE hub_id = ? AND user_id = ?').get(hubId, userId) || null
  }

  /**
   * Join a restricted hub
   * @param {string} hubId - Hub ID
   * @param {string} userId - User ID
   * @returns {Object} Result
   */
  joinHub(hubId, userId) {
    const hub = this.getHub(hubId)
    if (!hub || hub.deleted_at) {
      throw new ServiceError('NOT_FOUND', 'Hub not found')
    }

    const now = this.nowFn()
    this.db.prepare(
      `
        INSERT INTO hub_members (hub_id, user_id, joined_at)
        VALUES (?, ?, ?)
        ON CONFLICT(hub_id, user_id) DO UPDATE SET left_at = NULL
      `
    ).run(hubId, userId, now)

    return { hub_id: hubId }
  }

  /**
   * Leave a hub
   * @param {string} hubId - Hub ID
   * @param {string} userId - User ID
   * @returns {Object} Result
   */
  leaveHub(hubId, userId) {
    const now = this.nowFn()
    this.db.prepare('UPDATE hub_members SET left_at = ? WHERE hub_id = ? AND user_id = ?').run(now, hubId, userId)
    return { hub_id: hubId }
  }

  /**
   * Ensure default "Lobby" hub exists
   * @param {string} createdByUserId - Bootstrap admin user ID
   * @returns {Object} Hub
   */
  ensureDefaultHub(createdByUserId) {
    const existing = this.db.prepare('SELECT * FROM hubs WHERE name = ? AND deleted_at IS NULL').get('Lobby')
    if (existing) {
      return existing
    }

    return this.createHub({
      name: 'Lobby',
      description: 'Main hub for general discussions',
      visibility: 'public',
      createdByUserId
    })
  }

  /**
   * Update hub name and/or description
   * @param {Object} params
   * @param {string} params.hubId - Hub ID
   * @param {string} params.userId - User ID making the update
   * @param {Array<string>} params.roles - User roles
   * @param {string} [params.name] - New hub name
   * @param {string} [params.description] - New hub description
   * @returns {Object} Updated hub
   */
  updateHub({ hubId, userId, roles = [], name = null, description = null }) {
    const hub = this.getHub(hubId)
    if (!hub || hub.deleted_at) {
      throw new ServiceError('NOT_FOUND', 'Hub not found')
    }

    // Only admins or hub creator can update
    const isAdmin = roles.includes('admin')
    const isCreator = hub.created_by_user_id === userId
    if (!isAdmin && !isCreator) {
      throw new ServiceError('FORBIDDEN', 'Cannot update hub')
    }

    // At least one field must be provided
    if (name === null && description === null) {
      throw new ServiceError('BAD_REQUEST', 'No fields to update')
    }

    // Build update query dynamically
    const updates = []
    const params = []
    
    if (name !== null) {
      if (!name.trim()) {
        throw new ServiceError('BAD_REQUEST', 'Hub name cannot be empty')
      }
      updates.push('name = ?')
      params.push(name.trim())
    }
    
    if (description !== null) {
      updates.push('description = ?')
      params.push(description)
    }

    params.push(hubId)

    this.db.prepare(
      `UPDATE hubs SET ${updates.join(', ')} WHERE hub_id = ?`
    ).run(...params)

    // Return updated hub
    return this.getHub(hubId)
  }

  /**
   * Soft-delete a hub and all channels inside it
   * @param {Object} params
   * @param {string} params.hubId - Hub ID
   * @param {string} params.userId - User ID making the delete request
   * @param {Array<string>} params.roles - User roles
   * @returns {{ hub_id: string, channel_ids: Array<string> }}
   */
  deleteHub({ hubId, userId, roles = [] }) {
    const hub = this.getHub(hubId)
    if (!hub || hub.deleted_at) {
      throw new ServiceError('NOT_FOUND', 'Hub not found')
    }

    const isAdmin = roles.includes('admin')
    const isCreator = hub.created_by_user_id === userId
    if (!isAdmin && !isCreator) {
      throw new ServiceError('FORBIDDEN', 'Cannot delete hub')
    }

    const now = this.nowFn()
    const activeChannelRows = this.db.prepare(
      `
        SELECT channel_id
        FROM channels
        WHERE hub_id = ? AND deleted_at IS NULL
      `
    ).all(hubId)
    const channelIds = activeChannelRows.map((row) => row.channel_id)

    runTransaction(this.db, () => {
      this.db.prepare('UPDATE hubs SET deleted_at = ? WHERE hub_id = ?').run(now, hubId)
      this.db.prepare('UPDATE channels SET deleted_at = ? WHERE hub_id = ? AND deleted_at IS NULL').run(now, hubId)
    })

    return { hub_id: hubId, channel_ids: channelIds }
  }
}
