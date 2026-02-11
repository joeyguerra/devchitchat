import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import Database from '../src/database.mjs'
import AuthService from '../src/auth-service.mjs'
import { randomBytes } from 'node:crypto'
import { unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testDbPath = path.join(__dirname, '..', 'data', 'test-auth.db')

describe('Authentication System', () => {
  let db
  let authService
  
  before(() => {
    // Create test database
    db = new Database(testDbPath)
    authService = new AuthService(testDbPath)
  })
  
  after(() => {
    // Clean up test database
    db.close()
    try {
      unlinkSync(testDbPath)
    } catch (e) {
      // Ignore if file doesn't exist
    }
  })
  
  describe('Database', () => {
    it('should initialize schema correctly', () => {
      const tables = db.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table'
      `).all()
      
      const tableNames = tables.map(t => t.name)
      assert.ok(tableNames.includes('users'))
      assert.ok(tableNames.includes('invitations'))
      assert.ok(tableNames.includes('sessions'))
      assert.ok(tableNames.includes('audit_log'))
    })
    
    it('should hash passwords securely', () => {
      const password = 'TestPassword123!'
      const { hash, salt } = db.hashPassword(password)
      
      assert.ok(hash)
      assert.ok(salt)
      assert.strictEqual(hash.length, 128) // 64 bytes in hex
      assert.strictEqual(salt.length, 64)  // 32 bytes in hex
    })
    
    it('should verify passwords correctly', () => {
      const password = 'TestPassword123!'
      const { hash, salt } = db.hashPassword(password)
      
      assert.ok(db.verifyPassword(password, hash, salt))
      assert.ok(!db.verifyPassword('WrongPassword', hash, salt))
    })
    
    it('should create admin user', () => {
      const result = db.createAdmin(
        'admin@test.com',
        'adminuser',
        'Admin123!Test'
      )
      
      assert.ok(result.success)
      assert.ok(result.userId)
    })
    
    it('should not create duplicate admin', () => {
      const result = db.createAdmin(
        'admin2@test.com',
        'admin2',
        'Admin123!Test'
      )
      
      assert.ok(!result.success)
    })
    
    it('should authenticate user with correct credentials', () => {
      const user = db.authenticateUser('admin@test.com', 'Admin123!Test')
      
      assert.ok(user)
      assert.strictEqual(user.email, 'admin@test.com')
      assert.strictEqual(user.nickname, 'adminuser')
      assert.strictEqual(user.role, 'admin')
    })
    
    it('should reject invalid credentials', () => {
      const user = db.authenticateUser('admin@test.com', 'WrongPassword')
      assert.strictEqual(user, null)
    })
  })
  
  describe('Invitations', () => {
    let adminSessionId
    
    before(() => {
      // Create admin session for tests
      const admin = db.authenticateUser('admin@test.com', 'Admin123!Test')
      adminSessionId = db.createSession(admin.id, admin.nickname, admin.role)
    })
    
    it('should create invitation', () => {
      const result = authService.createInvitation(
        'user@test.com',
        adminSessionId,
        72
      )
      
      assert.ok(result.success)
      assert.ok(result.token)
      assert.ok(result.expiresAt)
    })
    
    it('should validate invitation token', () => {
      const createResult = db.createInvitation('newuser@test.com', 1, 72)
      const invitation = db.validateInvitation(createResult.token)
      
      assert.ok(invitation)
      assert.strictEqual(invitation.email, 'newuser@test.com')
    })
    
    it('should reject invalid invitation token', () => {
      const invitation = db.validateInvitation('invalid-token')
      assert.strictEqual(invitation, null)
    })
    
    it('should use invitation to create account', () => {
      const createResult = db.createInvitation('invited@test.com', 1, 72)
      
      const result = authService.registerWithInvitation(
        createResult.token,
        'inviteduser',
        'Invited123!Test'
      )
      
      assert.ok(result.success)
      assert.strictEqual(result.email, 'invited@test.com')
      assert.strictEqual(result.nickname, 'inviteduser')
    })
    
    it('should not allow reuse of invitation', () => {
      const createResult = db.createInvitation('reuse@test.com', 1, 72)
      
      authService.registerWithInvitation(
        createResult.token,
        'user1',
        'Password123!Test'
      )
      
      const result2 = authService.registerWithInvitation(
        createResult.token,
        'user2',
        'Password123!Test'
      )
      
      assert.ok(!result2.success)
    })
  })
  
  describe('Sessions', () => {
    it('should create session', () => {
      const sessionId = db.createSession(1, 'adminuser', 'admin')
      
      assert.ok(sessionId)
      assert.strictEqual(sessionId.length, 64) // 32 bytes in hex
    })
    
    it('should retrieve valid session', () => {
      const sessionId = db.createSession(1, 'adminuser', 'admin')
      const session = db.getSession(sessionId)
      
      assert.ok(session)
      assert.strictEqual(session.nickname, 'adminuser')
      assert.strictEqual(session.role, 'admin')
    })
    
    it('should reject expired session', () => {
      // Create session that expires immediately
      const sessionId = randomBytes(32).toString('hex')
      db.db.prepare(`
        INSERT INTO sessions (id, user_id, nickname, role, expires_at)
        VALUES (?, ?, ?, ?, datetime('now', '-1 hour'))
      `).run(sessionId, 1, 'admin', 'admin')
      
      const session = db.getSession(sessionId)
      assert.strictEqual(session, undefined)
    })
    
    it('should delete session', () => {
      const sessionId = db.createSession(1, 'adminuser', 'admin')
      db.deleteSession(sessionId)
      
      const session = db.getSession(sessionId)
      assert.strictEqual(session, undefined)
    })
  })
  
  describe('AuthService', () => {
    it('should validate email addresses', () => {
      assert.ok(authService.validateEmail('test@example.com'))
      assert.ok(authService.validateEmail('user.name+tag@example.co.uk'))
      assert.ok(!authService.validateEmail('invalid'))
      assert.ok(!authService.validateEmail('invalid@'))
      assert.ok(!authService.validateEmail('@invalid.com'))
    })
    
    it('should validate nicknames', () => {
      assert.ok(authService.validateNickname('user123'))
      assert.ok(authService.validateNickname('user-name_test'))
      assert.ok(!authService.validateNickname('ab')) // Too short
      assert.ok(!authService.validateNickname('a'.repeat(21))) // Too long
      assert.ok(!authService.validateNickname('user name')) // Space
      assert.ok(!authService.validateNickname('user@name')) // Invalid char
    })
    
    it('should validate passwords', () => {
      assert.ok(authService.validatePassword('Test123!Pass'))
      assert.ok(authService.validatePassword('MyP@ssw0rd'))
      assert.ok(!authService.validatePassword('short')) // Too short
      assert.ok(!authService.validatePassword('NoSpecialChar123')) // No special
      assert.ok(!authService.validatePassword('nouppercas3!')) // No uppercase
      assert.ok(!authService.validatePassword('NOLOWERCASE3!')) // No lowercase
      assert.ok(!authService.validatePassword('NoNumbers!')) // No number
    })
    
    it('should login and create session', () => {
      const result = authService.login('adminuser', 'Admin123!Test')
      
      assert.ok(result.success)
      assert.ok(result.sessionId)
      assert.ok(result.user)
      assert.strictEqual(result.user.nickname, 'adminuser')
    })
    
    it('should reject invalid login', () => {
      const result = authService.login('adminuser', 'WrongPassword')
      
      assert.ok(!result.success)
      assert.ok(!result.sessionId)
    })
    
    it('should validate active session', () => {
      const loginResult = authService.login('adminuser', 'Admin123!Test')
      const session = authService.validateSession(loginResult.sessionId)
      
      assert.ok(session)
      assert.strictEqual(session.nickname, 'adminuser')
    })
    
    it('should logout', () => {
      const loginResult = authService.login('adminuser', 'Admin123!Test')
      const logoutResult = authService.logout(loginResult.sessionId)
      
      assert.ok(logoutResult.success)
      
      const session = authService.validateSession(loginResult.sessionId)
      assert.strictEqual(session, null)
    })
  })
  
  describe('Password Reset', () => {
    let adminSessionId
    
    before(() => {
      const result = authService.login('adminuser', 'Admin123!Test')
      adminSessionId = result.sessionId
    })
    
    it('should reset user password (admin)', () => {
      // First create a test user
      const inviteResult = db.createInvitation('resettest@test.com', 1, 72)
      authService.registerWithInvitation(
        inviteResult.token,
        'resetuser',
        'OldPassword123!'
      )
      
      const user = db.getUserByNickname('resetuser')
      
      // Admin resets password
      const result = authService.resetUserPassword(
        user.id,
        'NewPassword123!',
        adminSessionId
      )
      
      assert.ok(result.success)
      
      // Verify new password works
      const loginResult = authService.login('resetuser', 'NewPassword123!')
      assert.ok(loginResult.success)
      
      // Verify old password doesn't work
      const oldLogin = authService.login('resetuser', 'OldPassword123!')
      assert.ok(!oldLogin.success)
    })
    
    it('should change own password', () => {
      const loginResult = authService.login('resetuser', 'NewPassword123!')
      
      const result = authService.changePassword(
        loginResult.sessionId,
        'NewPassword123!',
        'ChangedPassword123!'
      )
      
      assert.ok(result.success)
      
      // Verify changed password works
      const newLogin = authService.login('resetuser', 'ChangedPassword123!')
      assert.ok(newLogin.success)
    })
  })
  
  describe('Audit Log', () => {
    it('should log authentication events', () => {
      const logs = db.getAuditLogs(10)
      
      assert.ok(logs.length > 0)
      assert.ok(logs[0].action)
      assert.ok(logs[0].created_at)
    })
  })
})
