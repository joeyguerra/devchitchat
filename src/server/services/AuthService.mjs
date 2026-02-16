import { newId } from '../util/ids.mjs'
import { randomToken, hashToken, hashPassword, verifyPassword } from '../util/crypto.mjs'
import { ServiceError } from '../util/errors.mjs'
import { runTransaction } from '../db/transaction.mjs'

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Authentication service for invites, sessions, and bootstrap
 */
export class AuthService {
  /**
   * @param {Object} config
   * @param {Database} config.db - SQLite database
   * @param {Function} [config.nowFn] - Current timestamp provider (default Date.now)
   * @param {number} [config.sessionTtlMs] - Session TTL in milliseconds
   * @param {string} [config.bootstrapToken] - Bootstrap token for first admin user
   */
  constructor({ db, nowFn = () => Date.now(), sessionTtlMs = DEFAULT_SESSION_TTL_MS, bootstrapToken = null }) {
    this.db = db
    this.nowFn = nowFn
    this.sessionTtlMs = sessionTtlMs
    this.bootstrapToken = bootstrapToken
  }

  /**
   * Create an invite token
   * @param {Object} config
   * @param {string} config.createdByUserId - Admin user creating the invite
   * @param {number} [config.ttlMs] - TTL in milliseconds (default 24h)
   * @param {number} [config.maxUses] - Max number of uses (default 1)
   * @param {string} [config.note] - Optional note
   * @returns {Object} - {inviteToken, inviteId, expiresAt, maxUses}
   * @throws {ServiceError} - If not admin
   */
  createInvite({ createdByUserId, ttlMs = DEFAULT_TTL_MS, maxUses = 1, note = null }) {
    this.requireAdmin(createdByUserId)
    const inviteToken = randomToken()
    const inviteId = newId('invite')
    const now = this.nowFn()
    const expiresAt = now + ttlMs

    this.db.prepare(
      `
        INSERT INTO invites (invite_id, token_hash, created_by_user_id, created_at, expires_at, max_uses, uses, note)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      `
    ).run(inviteId, hashToken(inviteToken), createdByUserId, now, expiresAt, maxUses, note)

    return { inviteToken, inviteId, expiresAt, maxUses }
  }

  /**
   * Redeem an invite token and create user and session
   * @param {Object} config
   * @param {string} config.inviteToken - Invite token
   * @param {Object} config.profile - User profile {handle, display_name}
   * @param {string} config.password - Password for the new account
   * @returns {Promise<Object>} - {user, session_token}
   * @throws {ServiceError} - If token invalid, expired, or handle taken
   */
  async redeemInvite({ inviteToken, profile, password }) {
    const invite = this.findInvite(inviteToken)
    const now = this.nowFn()

    if (!invite) {
      const bootstrap = await this.tryBootstrap({ inviteToken, profile, now, password })
      if (bootstrap) {
        return bootstrap
      }
      throw new ServiceError('AUTH_FAILED', 'Invite token is invalid')
    }
    if (invite.expires_at <= now) {
      throw new ServiceError('AUTH_FAILED', 'Invite token has expired')
    }
    if (invite.uses >= invite.max_uses) {
      throw new ServiceError('AUTH_FAILED', 'Invite token has been used')
    }

    const handle = profile?.handle?.trim()
    const displayName = profile?.display_name?.trim() || handle
    if (!handle) {
      throw new ServiceError('BAD_REQUEST', 'Handle is required')
    }
    if (!password) {
      throw new ServiceError('BAD_REQUEST', 'Password is required')
    }
    if (this.isHandleTaken(handle)) {
      throw new ServiceError('CONFLICT', 'Handle already taken')
    }

    const userId = newId('u')
    const roles = this.getDefaultRoles()
    const passwordHash = await hashPassword(password)

    const insertUser = this.db.prepare(
      `
        INSERT INTO users (user_id, handle, display_name, roles_json, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
    )

    const updateInvite = this.db.prepare(
      `
        UPDATE invites
        SET uses = uses + 1, redeemed_by_user_id = ?
        WHERE invite_id = ?
      `
    )

    const result = runTransaction(this.db, () => {
      insertUser.run(userId, handle, displayName, JSON.stringify(roles), passwordHash, now)
      updateInvite.run(userId, invite.invite_id)
      const session = this.createSession(userId)
      return { userId, roles, session }
    })

    return {
      sessionToken: result.session.sessionToken,
      user: {
        user_id: userId,
        handle,
        display_name: displayName,
        roles
      }
    }
  }

  async tryBootstrap({ inviteToken, profile, now, password }) {
    if (!this.bootstrapToken || inviteToken !== this.bootstrapToken) {
      return null
    }
    const count = this.getUserCount()
    if (count > 0) {
      return null
    }

    const handle = profile?.handle?.trim()
    const displayName = profile?.display_name?.trim() || handle
    if (!handle) {
      throw new ServiceError('BAD_REQUEST', 'Handle is required')
    }
    if (!password) {
      throw new ServiceError('BAD_REQUEST', 'Password is required')
    }
    if (this.isHandleTaken(handle)) {
      throw new ServiceError('CONFLICT', 'Handle already taken')
    }

    const userId = newId('u')
    const roles = ['admin']
    const passwordHash = await hashPassword(password)

    const insertUser = this.db.prepare(
      `
        INSERT INTO users (user_id, handle, display_name, roles_json, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
    )

    const result = runTransaction(this.db, () => {
      insertUser.run(userId, handle, displayName, JSON.stringify(roles), passwordHash, now)
      const session = this.createSession(userId)
      return { userId, roles, session }
    })

    this.bootstrapToken = null

    return {
      sessionToken: result.session.sessionToken,
      user: {
        user_id: userId,
        handle,
        display_name: displayName,
        roles
      }
    }
  }

  /**
   * Sign in with username (handle) and password
   * @param {Object} config
   * @param {string} config.handle - User handle
   * @param {string} config.password - User password
   * @returns {Promise<Object>} - {user, session_token}
   * @throws {ServiceError} - If handle or password invalid
   */
  async signInWithPassword({ handle, password }) {
    if (!handle || !password) {
      throw new ServiceError('BAD_REQUEST', 'Handle and password required')
    }

    const row = this.db.prepare('SELECT user_id, handle, display_name, roles_json, password_hash FROM users WHERE handle = ?').get(handle)

    if (!row || !row.password_hash) {
      throw new ServiceError('AUTH_FAILED', 'Invalid handle or password')
    }

    const isValid = await verifyPassword(password, row.password_hash)
    if (!isValid) {
      throw new ServiceError('AUTH_FAILED', 'Invalid handle or password')
    }

    const session = this.createSession(row.user_id)

    return {
      sessionToken: session.sessionToken,
      user: {
        user_id: row.user_id,
        handle: row.handle,
        display_name: row.display_name,
        roles: JSON.parse(row.roles_json)
      }
    }
  }

  createSession(userId) {
    const sessionId = newId('s')
    const sessionToken = randomToken(32)
    const now = this.nowFn()
    const expiresAt = now + this.sessionTtlMs

    this.db.prepare(
      `
        INSERT INTO sessions (session_id, user_id, token_hash, created_at, expires_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
    ).run(sessionId, userId, hashToken(sessionToken), now, expiresAt, now)

    return { sessionId, sessionToken, expiresAt }
  }

  validateSession(sessionToken) {
    if (!sessionToken) {
      return null
    }
    const now = this.nowFn()
    const row = this.db.prepare(
      `
        SELECT s.session_id, s.user_id, s.expires_at, s.revoked_at, u.handle, u.display_name, u.roles_json
        FROM sessions s
        JOIN users u ON u.user_id = s.user_id
        WHERE s.token_hash = ?
      `
    ).get(hashToken(sessionToken))

    if (!row) {
      return null
    }
    if (row.revoked_at || row.expires_at <= now) {
      return null
    }

    this.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE session_id = ?').run(now, row.session_id)

    return {
      session_id: row.session_id,
      user: {
        user_id: row.user_id,
        handle: row.handle,
        display_name: row.display_name,
        roles: JSON.parse(row.roles_json)
      }
    }
  }

  revokeSession(sessionId) {
    const now = this.nowFn()
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE session_id = ?').run(now, sessionId)
  }

  requireAdmin(userId) {
    const user = this.getUser(userId)
    if (!user || !user.roles.includes('admin')) {
      throw new ServiceError('FORBIDDEN', 'Admin role required')
    }
  }

  getUser(userId) {
    const row = this.db.prepare('SELECT user_id, handle, display_name, roles_json FROM users WHERE user_id = ?').get(userId)
    if (!row) {
      return null
    }
    return {
      user_id: row.user_id,
      handle: row.handle,
      display_name: row.display_name,
      roles: JSON.parse(row.roles_json)
    }
  }

  findInvite(inviteToken) {
    return this.db.prepare('SELECT * FROM invites WHERE token_hash = ?').get(hashToken(inviteToken))
  }

  getDefaultRoles() {
    return ['user']
  }

  getUserCount() {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM users').get()
    return row?.count || 0
  }

  isHandleTaken(handle) {
    const row = this.db.prepare('SELECT 1 FROM users WHERE handle = ?').get(handle)
    return !!row
  }
}
