import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestContext } from './helpers.mjs'

test('auth invite create and redeem', async () => {
  const ctx = createTestContext()
  const adminId = ctx.insertUser('admin', 'Admin', ['admin'])

  const invite = ctx.auth.createInvite({ createdByUserId: adminId, ttlMs: 1000, maxUses: 1 })
  const result = await ctx.auth.redeemInvite({
    inviteToken: invite.inviteToken,
    profile: { handle: 'joey', display_name: 'Joey' },
    password: 'test-password'
  })

  assert.ok(result.sessionToken)
  assert.equal(result.user.handle, 'joey')

  const stored = ctx.db.prepare('SELECT uses, redeemed_by_user_id FROM invites WHERE invite_id = ?').get(invite.inviteId)
  assert.equal(stored.uses, 1)
  assert.ok(stored.redeemed_by_user_id)
})

test('auth invite expires', async () => {
  const ctx = createTestContext()
  const adminId = ctx.insertUser('admin', 'Admin', ['admin'])
  const invite = ctx.auth.createInvite({ createdByUserId: adminId, ttlMs: 10, maxUses: 1 })

  ctx.advanceTime(20)
  await assert.rejects(
    () => ctx.auth.redeemInvite({ inviteToken: invite.inviteToken, profile: { handle: 'late', display_name: 'Late' }, password: 'test-password' }),
    /expired/
  )
})

test('session validation', async () => {
  const ctx = createTestContext()
  const adminId = ctx.insertUser('admin', 'Admin', ['admin'])
  const invite = ctx.auth.createInvite({ createdByUserId: adminId })
  const result = await ctx.auth.redeemInvite({ inviteToken: invite.inviteToken, profile: { handle: 'sam', display_name: 'Sam' }, password: 'test-password' })

  const session = ctx.auth.validateSession(result.sessionToken)
  assert.ok(session)
  assert.equal(session.user.handle, 'sam')
})
