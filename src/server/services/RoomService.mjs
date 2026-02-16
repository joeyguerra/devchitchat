import { newId } from '../util/ids.mjs'
import { hashToken, randomToken } from '../util/crypto.mjs'
import { ServiceError } from '../util/errors.mjs'
import { runTransaction } from '../db/transaction.mjs'

export class RoomService {
  constructor({ db, nowFn = () => Date.now() }) {
    this.db = db
    this.nowFn = nowFn
  }

  createRoom({ kind, name, topic = null, visibility = 'discoverable', createdByUserId }) {
    if (!['public', 'private'].includes(kind)) {
      throw new ServiceError('BAD_REQUEST', 'Invalid room kind')
    }
    if (!name?.trim()) {
      throw new ServiceError('BAD_REQUEST', 'Room name required')
    }
    const roomId = newId('r')
    const now = this.nowFn()
    const vis = kind === 'public' ? 'discoverable' : visibility

    runTransaction(this.db, () => {
      this.db.prepare(
        `
          INSERT INTO rooms (room_id, kind, name, topic, visibility, created_by_user_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      ).run(roomId, kind, name.trim(), topic, vis, createdByUserId, now)

      this.db.prepare(
        `
          INSERT INTO room_members (room_id, user_id, role, joined_at)
          VALUES (?, ?, 'owner', ?)
        `
      ).run(roomId, createdByUserId, now)
    })

    return { room_id: roomId, kind, name: name.trim(), topic }
  }

  listRooms(userId) {
    return this.db.prepare(
      `
        SELECT r.room_id, r.name, r.kind,
          (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.room_id AND rm.left_at IS NULL AND rm.banned_at IS NULL) AS member_count
        FROM rooms r
        WHERE r.deleted_at IS NULL
        AND (
          r.kind = 'public'
          OR EXISTS (
            SELECT 1 FROM room_members rm
            WHERE rm.room_id = r.room_id
            AND rm.user_id = ?
            AND rm.left_at IS NULL
            AND rm.banned_at IS NULL
          )
        )
        ORDER BY r.kind, r.name
      `
    ).all(userId)
  }

  joinRoom({ roomId, userId }) {
    const room = this.getRoom(roomId)
    if (!room || room.deleted_at) {
      throw new ServiceError('NOT_FOUND', 'Room not found')
    }
    if (room.kind === 'private') {
      const member = this.getMembership(roomId, userId)
      if (!member || member.left_at || member.banned_at) {
        throw new ServiceError('FORBIDDEN', 'Not a member of this group')
      }
      return { room_id: roomId, kind: room.kind }
    }

    const now = this.nowFn()
    this.db.prepare(
      `
        INSERT INTO room_members (room_id, user_id, role, joined_at)
        VALUES (?, ?, 'member', ?)
        ON CONFLICT(room_id, user_id) DO UPDATE SET left_at = NULL, banned_at = NULL
      `
    ).run(roomId, userId, now)

    return { room_id: roomId, kind: room.kind }
  }

  leaveRoom({ roomId, userId }) {
    const now = this.nowFn()
    this.db.prepare('UPDATE room_members SET left_at = ? WHERE room_id = ? AND user_id = ?').run(now, roomId, userId)
    return { room_id: roomId }
  }

  isMember(roomId, userId) {
    const member = this.getMembership(roomId, userId)
    return !!member && !member.left_at && !member.banned_at
  }

  listRoomMembers(roomId) {
    return this.db.prepare(
      `
        SELECT user_id, role FROM room_members
        WHERE room_id = ? AND left_at IS NULL AND banned_at IS NULL
      `
    ).all(roomId)
  }

  createRoomInvite({ roomId, createdByUserId, ttlMs = 24 * 60 * 60 * 1000, maxUses = 1 }) {
    const member = this.getMembership(roomId, createdByUserId)
    if (!member || !['owner', 'mod'].includes(member.role)) {
      throw new ServiceError('FORBIDDEN', 'Room invite requires owner or mod')
    }
    const room = this.getRoom(roomId)
    if (!room || room.kind !== 'private') {
      throw new ServiceError('BAD_REQUEST', 'Invites are only for private rooms')
    }

    const inviteToken = randomToken()
    const inviteId = newId('rinvite')
    const now = this.nowFn()
    const expiresAt = now + ttlMs

    this.db.prepare(
      `
        INSERT INTO room_invites (invite_id, room_id, token_hash, created_by_user_id, created_at, expires_at, max_uses, uses)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `
    ).run(inviteId, roomId, hashToken(inviteToken), createdByUserId, now, expiresAt, maxUses)

    return { inviteToken, inviteId, expiresAt, maxUses }
  }

  redeemRoomInvite({ inviteToken, userId }) {
    const invite = this.db.prepare('SELECT * FROM room_invites WHERE token_hash = ?').get(hashToken(inviteToken))
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
      this.db.prepare('UPDATE room_invites SET uses = uses + 1 WHERE invite_id = ?').run(invite.invite_id)
      this.db.prepare(
        `
          INSERT INTO room_members (room_id, user_id, role, joined_at)
          VALUES (?, ?, 'member', ?)
          ON CONFLICT(room_id, user_id) DO UPDATE SET left_at = NULL, banned_at = NULL
        `
      ).run(invite.room_id, userId, now)
    })

    return { room_id: invite.room_id }
  }

  addMember({ roomId, createdByUserId, targetUserId }) {
    const adder = this.getMembership(roomId, createdByUserId)
    if (!adder || !['owner', 'mod'].includes(adder.role)) {
      throw new ServiceError('FORBIDDEN', 'Only owner or mod can add members')
    }
    const room = this.getRoom(roomId)
    if (!room) {
      throw new ServiceError('NOT_FOUND', 'Room not found')
    }
    const existing = this.getMembership(roomId, targetUserId)
    if (existing && !existing.left_at && !existing.banned_at) {
      throw new ServiceError('BAD_REQUEST', 'User is already a member')
    }
    const now = this.nowFn()
    this.db.prepare(
      `
        INSERT INTO room_members (room_id, user_id, role, joined_at)
        VALUES (?, ?, 'member', ?)
        ON CONFLICT(room_id, user_id) DO UPDATE SET left_at = NULL, banned_at = NULL
      `
    ).run(roomId, targetUserId, now)
    return { room_id: roomId, user_id: targetUserId }
  }

  getRoom(roomId) {
    return this.db.prepare('SELECT * FROM rooms WHERE room_id = ?').get(roomId)
  }

  getMembership(roomId, userId) {
    return this.db.prepare('SELECT * FROM room_members WHERE room_id = ? AND user_id = ?').get(roomId, userId)
  }
}
