import Database from './database.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

class AuthService {
  constructor(dbPath) {
    this.db = new Database(dbPath)
    this.sessionStore = new Map()
    
    // Clean up expired sessions every hour
    setInterval(() => {
      this.db.cleanupExpiredSessions()
    }, 60 * 60 * 1000)
  }

  // Check if system needs initialization (no admin exists)
  needsInitialization() {
    return !this.db.hasAdmin()
  }

  // Initialize system with admin account
  initializeAdmin(email, nickname, password) {
    if (this.db.hasAdmin()) {
      return { success: false, error: 'Admin already exists' }
    }

    // Validate inputs
    if (!this.validateEmail(email)) {
      return { success: false, error: 'Invalid email address' }
    }

    if (!this.validateNickname(nickname)) {
      return { success: false, error: 'Invalid nickname. Use 3-20 alphanumeric characters, hyphens, or underscores' }
    }

    if (!this.validatePassword(password)) {
      return { success: false, error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character' }
    }

    return this.db.createAdmin(email, nickname, password)
  }

  // Authenticate and create session
  login(emailOrNickname, password) {
    const user = this.db.authenticateUser(emailOrNickname, password)
    
    if (!user) {
      return { success: false, error: 'Invalid credentials' }
    }

    const sessionId = this.db.createSession(user.id, user.nickname, user.role)
    
    return {
      success: true,
      sessionId,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        role: user.role
      }
    }
  }

  // Validate session
  validateSession(sessionId) {
    if (!sessionId) {
      return null
    }

    const session = this.db.getSession(sessionId)
    
    if (!session) {
      return null
    }

    return {
      id: session.id,
      userId: session.user_id,
      nickname: session.nickname,
      role: session.role
    }
  }

  // Logout
  logout(sessionId) {
    this.db.deleteSession(sessionId)
    return { success: true }
  }

  // Create invitation (admin only)
  createInvitation(email, adminSessionId, expiresInHours = 72) {
    const session = this.validateSession(adminSessionId)
    
    if (!session || session.role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    if (!this.validateEmail(email)) {
      return { success: false, error: 'Invalid email address' }
    }

    return this.db.createInvitation(email, session.userId, expiresInHours)
  }

  // Register user with invitation
  registerWithInvitation(token, nickname, password) {
    if (!this.validateNickname(nickname)) {
      return { success: false, error: 'Invalid nickname. Use 3-20 alphanumeric characters, hyphens, or underscores' }
    }

    if (!this.validatePassword(password)) {
      return { success: false, error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character' }
    }

    return this.db.useInvitation(token, nickname, password)
  }

  // Reset password (admin only)
  resetUserPassword(userId, newPassword, adminSessionId) {
    const session = this.validateSession(adminSessionId)
    
    if (!session || session.role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    if (!this.validatePassword(newPassword)) {
      return { success: false, error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character' }
    }

    return this.db.resetPassword(userId, newPassword, session.userId)
  }

  // Change own password
  changePassword(sessionId, currentPassword, newPassword) {
    const session = this.validateSession(sessionId)
    
    if (!session) {
      return { success: false, error: 'Invalid session' }
    }

    // Verify current password
    const user = this.db.getUserById(session.userId)
    if (!user) {
      return { success: false, error: 'User not found' }
    }

    const stmt = this.db.db.prepare('SELECT password_hash, salt FROM users WHERE id = ?')
    const credentials = stmt.get(session.userId)
    
    if (!this.db.verifyPassword(currentPassword, credentials.password_hash, credentials.salt)) {
      return { success: false, error: 'Current password is incorrect' }
    }

    if (!this.validatePassword(newPassword)) {
      return { success: false, error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character' }
    }

    return this.db.resetPassword(session.userId, newPassword, session.userId)
  }

  // Get user info
  getUserInfo(sessionId) {
    const session = this.validateSession(sessionId)
    
    if (!session) {
      return null
    }

    return this.db.getUserById(session.userId)
  }

  // List all users (admin only)
  listUsers(adminSessionId) {
    const session = this.validateSession(adminSessionId)
    
    if (!session || session.role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const users = this.db.listUsers()
    return { success: true, users }
  }

  // Get audit logs (admin only)
  getAuditLogs(adminSessionId, limit = 100) {
    const session = this.validateSession(adminSessionId)
    
    if (!session || session.role !== 'admin') {
      return { success: false, error: 'Unauthorized' }
    }

    const logs = this.db.getAuditLogs(limit)
    return { success: true, logs }
  }

  // Validation helpers
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  validateNickname(nickname) {
    const nicknameRegex = /^[a-zA-Z0-9_-]{3,20}$/
    return nicknameRegex.test(nickname)
  }

  validatePassword(password) {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special char
    const minLength = password.length >= 8
    const hasUpper = /[A-Z]/.test(password)
    const hasLower = /[a-z]/.test(password)
    const hasNumber = /\d/.test(password)
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    
    return minLength && hasUpper && hasLower && hasNumber && hasSpecial
  }

  // Generate invitation URL
  generateInvitationUrl(token, baseUrl = 'http://localhost:8080') {
    return `${baseUrl}/auth/register?token=${token}`
  }

  // Close database
  close() {
    this.db.close()
  }
}

export default AuthService
