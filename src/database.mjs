import { DatabaseSync } from 'node:sqlite'
import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

class Database {
  constructor(dbPath = path.join(__dirname, '..', 'data', 'auth.db')) {
    this.db = new DatabaseSync(dbPath)
    this.initializeSchema()
  }

  initializeSchema() {
    // Enable foreign keys
    this.db.exec('PRAGMA foreign_keys = ON')
    
    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        nickname TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login_at TEXT
      )
    `)

    // Invitations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        created_by INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        used_at TEXT,
        used_by INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (created_by) REFERENCES users(id),
        FOREIGN KEY (used_by) REFERENCES users(id)
      )
    `)

    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        nickname TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `)

    // Password reset tokens table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `)

    // Audit log table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `)

    // Create indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id)')
  }

  // Hash password using PBKDF2
  hashPassword(password, salt = null) {
    if (!salt) {
      salt = randomBytes(32).toString('hex')
    }
    const hash = pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
    return { hash, salt }
  }

  // Verify password with timing-safe comparison
  verifyPassword(password, hash, salt) {
    const { hash: computedHash } = this.hashPassword(password, salt)
    try {
      return timingSafeEqual(
        Buffer.from(hash, 'hex'),
        Buffer.from(computedHash, 'hex')
      )
    } catch {
      return false
    }
  }

  // Check if admin exists
  hasAdmin() {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?')
    const result = stmt.get('admin')
    return result.count > 0
  }

  // Create admin user
  createAdmin(email, nickname, password) {
    // Check if admin already exists
    if (this.hasAdmin()) {
      return { success: false, error: 'Admin already exists' }
    }
    
    const { hash, salt } = this.hashPassword(password)
    const stmt = this.db.prepare(`
      INSERT INTO users (email, nickname, password_hash, salt, role)
      VALUES (?, ?, ?, ?, 'admin')
    `)
    
    try {
      const result = stmt.run(email, nickname, hash, salt)
      this.logAudit(result.lastInsertRowid, 'admin_created', 'Admin account created')
      return { success: true, userId: result.lastInsertRowid }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Authenticate user
  authenticateUser(emailOrNickname, password) {
    const stmt = this.db.prepare(`
      SELECT id, email, nickname, password_hash, salt, role, is_active
      FROM users
      WHERE (email = ? OR nickname = ?) AND is_active = 1
    `)
    
    const user = stmt.get(emailOrNickname, emailOrNickname)
    
    if (!user || !this.verifyPassword(password, user.password_hash, user.salt)) {
      this.logAudit(null, 'login_failed', `Failed login attempt for: ${emailOrNickname}`)
      return null
    }

    // Update last login
    const updateStmt = this.db.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?')
    updateStmt.run(user.id)

    this.logAudit(user.id, 'login_success', 'User logged in successfully')
    
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      role: user.role
    }
  }

  // Create invitation
  createInvitation(email, createdBy, expiresInHours = 72) {
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
    
    const stmt = this.db.prepare(`
      INSERT INTO invitations (email, token, created_by, expires_at)
      VALUES (?, ?, ?, ?)
    `)
    
    try {
      const result = stmt.run(email, token, createdBy, expiresAt)
      this.logAudit(createdBy, 'invitation_created', `Invitation created for: ${email}`)
      return { success: true, token, expiresAt, invitationId: result.lastInsertRowid }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Validate invitation token
  validateInvitation(token) {
    const stmt = this.db.prepare(`
      SELECT id, email, expires_at, used
      FROM invitations
      WHERE token = ? AND used = 0 AND datetime(expires_at) > datetime('now')
    `)
    
    const invitation = stmt.get(token)
    return invitation || null
  }

  // Use invitation to create account
  useInvitation(token, nickname, password) {
    const invitation = this.validateInvitation(token)
    
    if (!invitation) {
      return { success: false, error: 'Invalid or expired invitation' }
    }

    const { hash, salt } = this.hashPassword(password)
    
    const createUserStmt = this.db.prepare(`
      INSERT INTO users (email, nickname, password_hash, salt, role)
      VALUES (?, ?, ?, ?, 'user')
    `)
    
    const updateInvitationStmt = this.db.prepare(`
      UPDATE invitations
      SET used = 1, used_at = datetime('now'), used_by = ?
      WHERE id = ?
    `)
    
    try {
      const userResult = createUserStmt.run(invitation.email, nickname, hash, salt)
      updateInvitationStmt.run(userResult.lastInsertRowid, invitation.id)
      
      this.logAudit(userResult.lastInsertRowid, 'account_created', 'Account created via invitation')
      
      return {
        success: true,
        userId: userResult.lastInsertRowid,
        email: invitation.email,
        nickname
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Get user by ID
  getUserById(userId) {
    const stmt = this.db.prepare(`
      SELECT id, email, nickname, role, is_active, created_at, last_login_at
      FROM users
      WHERE id = ?
    `)
    return stmt.get(userId)
  }

  // Get user by nickname
  getUserByNickname(nickname) {
    const stmt = this.db.prepare(`
      SELECT id, email, nickname, role, is_active, created_at, last_login_at
      FROM users
      WHERE nickname = ?
    `)
    return stmt.get(nickname)
  }

  // List all users (admin only)
  listUsers() {
    const stmt = this.db.prepare(`
      SELECT id, email, nickname, role, is_active, created_at, last_login_at
      FROM users
      ORDER BY created_at DESC
    `)
    return stmt.all()
  }

  // Reset password (admin only)
  resetPassword(userId, newPassword, adminId) {
    const { hash, salt } = this.hashPassword(newPassword)
    const stmt = this.db.prepare(`
      UPDATE users
      SET password_hash = ?, salt = ?, updated_at = datetime('now')
      WHERE id = ?
    `)
    
    try {
      stmt.run(hash, salt, userId)
      this.logAudit(adminId, 'password_reset', `Password reset for user ID: ${userId}`)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Create session
  createSession(userId, nickname, role, expiresInHours = 24) {
    const sessionId = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
    
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, user_id, nickname, role, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    
    stmt.run(sessionId, userId, nickname, role, expiresAt)
    return sessionId
  }

  // Get session
  getSession(sessionId) {
    const stmt = this.db.prepare(`
      SELECT id, user_id, nickname, role, expires_at
      FROM sessions
      WHERE id = ? AND datetime(expires_at) > datetime('now')
    `)
    
    const session = stmt.get(sessionId)
    
    if (session) {
      // Update last activity
      const updateStmt = this.db.prepare(`
        UPDATE sessions SET last_activity_at = datetime('now') WHERE id = ?
      `)
      updateStmt.run(sessionId)
    }
    
    return session
  }

  // Delete session (logout)
  deleteSession(sessionId) {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?')
    stmt.run(sessionId)
  }

  // Clean up expired sessions
  cleanupExpiredSessions() {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE datetime(expires_at) <= datetime(\'now\')')
    return stmt.run()
  }

  // Audit logging
  logAudit(userId, action, details, ipAddress = null) {
    const stmt = this.db.prepare(`
      INSERT INTO audit_log (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(userId, action, details, ipAddress)
  }

  // Get audit logs
  getAuditLogs(limit = 100, userId = null) {
    let query = `
      SELECT a.*, u.nickname, u.email
      FROM audit_log a
      LEFT JOIN users u ON a.user_id = u.id
    `
    
    if (userId) {
      query += ' WHERE a.user_id = ?'
    }
    
    query += ' ORDER BY a.created_at DESC LIMIT ?'
    
    const stmt = this.db.prepare(query)
    return userId ? stmt.all(userId, limit) : stmt.all(limit)
  }

  // Close database connection
  close() {
    if (this.db) {
      this.db.close()
    }
  }
}

export default Database
