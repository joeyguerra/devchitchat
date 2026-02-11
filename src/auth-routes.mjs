import AuthService from './auth-service.mjs'

// Middleware to check if user is authenticated
export function requireAuth(req, res, next) {
  const sessionId = req.cookies?.session_id
  
  if (!sessionId) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  const session = req.authService.validateSession(sessionId)
  
  if (!session) {
    res.clearCookie('session_id')
    return res.status(401).json({ error: 'Invalid or expired session' })
  }

  req.session = session
  next()
}

// Middleware to check if user is admin
export function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

// Setup authentication routes
export function setupAuthRoutes(robot) {
  const authService = new AuthService()
  const router = robot.router
  
  // Make auth service available to all routes
  router.use((req, res, next) => {
    req.authService = authService
    next()
  })

  // GET /auth/status - Check authentication status
  router.get('/auth/status', (req, res) => {
    const sessionId = req.cookies?.session_id
    
    if (!sessionId) {
      return res.json({ authenticated: false, needsInitialization: authService.needsInitialization() })
    }

    const session = authService.validateSession(sessionId)
    
    if (!session) {
      res.clearCookie('session_id')
      return res.json({ authenticated: false, needsInitialization: authService.needsInitialization() })
    }

    const user = authService.getUserInfo(sessionId)
    
    res.json({
      authenticated: true,
      needsInitialization: false,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        role: user.role
      }
    })
  })

  // GET /auth/init - Check if system needs initialization
  router.get('/auth/init', (req, res) => {
    res.json({ needsInitialization: authService.needsInitialization() })
  })

  // POST /auth/init - Initialize admin account
  router.post('/auth/init', (req, res) => {
    if (!authService.needsInitialization()) {
      return res.status(400).json({ error: 'System already initialized' })
    }

    const { email, nickname, password } = req.body

    if (!email || !nickname || !password) {
      return res.status(400).json({ error: 'Email, nickname, and password are required' })
    }

    const result = authService.initializeAdmin(email, nickname, password)

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    res.json({ success: true, message: 'Admin account created successfully' })
  })

  // POST /auth/login - Login
  router.post('/auth/login', (req, res) => {
    const { emailOrNickname, password } = req.body

    if (!emailOrNickname || !password) {
      return res.status(400).json({ error: 'Email/nickname and password are required' })
    }

    const result = authService.login(emailOrNickname, password)

    if (!result.success) {
      return res.status(401).json({ error: result.error })
    }

    // Set session cookie (httpOnly, secure in production)
    res.cookie('session_id', result.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    })

    res.json({
      success: true,
      user: result.user
    })
  })

  // POST /auth/logout - Logout
  router.post('/auth/logout', requireAuth, (req, res) => {
    const sessionId = req.cookies?.session_id
    
    if (sessionId) {
      authService.logout(sessionId)
    }
    
    res.clearCookie('session_id')
    res.json({ success: true })
  })

  // POST /auth/change-password - Change own password
  router.post('/auth/change-password', requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body
    const sessionId = req.cookies?.session_id

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' })
    }

    const result = authService.changePassword(sessionId, currentPassword, newPassword)

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    res.json({ success: true, message: 'Password changed successfully' })
  })

  // POST /auth/invitations - Create invitation (admin only)
  router.post('/auth/invitations', requireAuth, requireAdmin, (req, res) => {
    const { email, expiresInHours } = req.body
    const sessionId = req.cookies?.session_id

    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const result = authService.createInvitation(
      email,
      sessionId,
      expiresInHours || 72
    )

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    const invitationUrl = authService.generateInvitationUrl(
      result.token,
      req.protocol + '://' + req.get('host')
    )

    res.json({
      success: true,
      invitation: {
        token: result.token,
        email: email,
        expiresAt: result.expiresAt,
        url: invitationUrl
      }
    })
  })

  // GET /auth/register - Show registration page
  router.get('/auth/register', (req, res) => {
    const { token } = req.query

    if (!token) {
      return res.status(400).send(getRegisterPage(null, 'Invalid registration link'))
    }

    // Validate token
    const invitation = authService.db.validateInvitation(token)

    if (!invitation) {
      return res.status(400).send(getRegisterPage(null, 'Invalid or expired invitation'))
    }

    res.send(getRegisterPage(invitation, null))
  })

  // POST /auth/register - Register new user
  router.post('/auth/register', (req, res) => {
    const { token, nickname, password } = req.body

    if (!token || !nickname || !password) {
      return res.status(400).json({ error: 'Token, nickname, and password are required' })
    }

    const result = authService.registerWithInvitation(token, nickname, password)

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    res.json({
      success: true,
      message: 'Account created successfully',
      user: {
        email: result.email,
        nickname: result.nickname
      }
    })
  })

  // POST /auth/reset-password - Reset password (admin only)
  router.post('/auth/reset-password', requireAuth, requireAdmin, (req, res) => {
    const { userId, newPassword } = req.body
    const sessionId = req.cookies?.session_id

    if (!userId || !newPassword) {
      return res.status(400).json({ error: 'User ID and new password are required' })
    }

    const result = authService.resetUserPassword(userId, newPassword, sessionId)

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    res.json({ success: true, message: 'Password reset successfully' })
  })

  // GET /auth/users - List all users (admin only)
  router.get('/auth/users', requireAuth, requireAdmin, (req, res) => {
    const sessionId = req.cookies?.session_id
    const result = authService.listUsers(sessionId)

    if (!result.success) {
      return res.status(403).json({ error: result.error })
    }

    res.json(result.users)
  })

  // GET /auth/audit-logs - Get audit logs (admin only)
  router.get('/auth/audit-logs', requireAuth, requireAdmin, (req, res) => {
    const sessionId = req.cookies?.session_id
    const limit = parseInt(req.query.limit) || 100
    const result = authService.getAuditLogs(sessionId, limit)

    if (!result.success) {
      return res.status(403).json({ error: result.error })
    }

    res.json(result.logs)
  })

  // GET /auth/login - Login page
  router.get('/auth/login', (req, res) => {
    res.send(getLoginPage())
  })

  // GET /auth/setup - Admin setup page
  router.get('/auth/setup', (req, res) => {
    if (!authService.needsInitialization()) {
      return res.redirect('/auth/login')
    }
    res.send(getSetupPage())
  })

  // GET /auth/admin - Admin dashboard
  router.get('/auth/admin', requireAuth, requireAdmin, (req, res) => {
    res.send(getAdminPage())
  })

  console.log('Authentication routes registered')
  
  return authService
}

// HTML page templates
function getLoginPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - DevChitChat</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
    h1 { margin-bottom: 1.5rem; color: #333; text-align: center; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; margin-bottom: 0.5rem; color: #555; font-weight: 500; }
    input { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem; }
    input:focus { outline: none; border-color: #0366d6; }
    button { width: 100%; padding: 0.75rem; background: #0366d6; color: white; border: none; border-radius: 4px; font-size: 1rem; font-weight: 500; cursor: pointer; }
    button:hover { background: #0256c7; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .error { background: #ffeef0; color: #d73a49; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
    .message { background: #e6f4ea; color: #137333; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Login</h1>
    <div id="error" class="error" style="display: none;"></div>
    <div id="message" class="message" style="display: none;"></div>
    <form id="loginForm">
      <div class="form-group">
        <label for="emailOrNickname">Email or Nickname</label>
        <input type="text" id="emailOrNickname" name="emailOrNickname" required autocomplete="username">
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="current-password">
      </div>
      <button type="submit">Login</button>
    </form>
  </div>
  <script>
    // Check if needs initialization
    fetch('/auth/init').then(r => r.json()).then(data => {
      if (data.needsInitialization) {
        window.location.href = '/auth/setup'
      }
    })
    
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault()
      const error = document.getElementById('error')
      const message = document.getElementById('message')
      error.style.display = 'none'
      message.style.display = 'none'
      
      const formData = {
        emailOrNickname: document.getElementById('emailOrNickname').value,
        password: document.getElementById('password').value
      }
      
      try {
        const response = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })
        
        const data = await response.json()
        
        if (data.success) {
          window.location.href = '/'
        } else {
          error.textContent = data.error || 'Login failed'
          error.style.display = 'block'
        }
      } catch (err) {
        error.textContent = 'An error occurred. Please try again.'
        error.style.display = 'block'
      }
    })
  </script>
</body>
</html>
  `
}

function getSetupPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Setup - DevChitChat</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
    h1 { margin-bottom: 0.5rem; color: #333; text-align: center; }
    .subtitle { text-align: center; color: #666; margin-bottom: 1.5rem; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; margin-bottom: 0.5rem; color: #555; font-weight: 500; }
    input { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem; }
    input:focus { outline: none; border-color: #0366d6; }
    button { width: 100%; padding: 0.75rem; background: #0366d6; color: white; border: none; border-radius: 4px; font-size: 1rem; font-weight: 500; cursor: pointer; }
    button:hover { background: #0256c7; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .error { background: #ffeef0; color: #d73a49; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
    .hint { font-size: 0.875rem; color: #666; margin-top: 0.25rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Admin Setup</h1>
    <p class="subtitle">Create the administrator account</p>
    <div id="error" class="error" style="display: none;"></div>
    <form id="setupForm">
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required autocomplete="email">
      </div>
      <div class="form-group">
        <label for="nickname">Nickname</label>
        <input type="text" id="nickname" name="nickname" required autocomplete="username" pattern="[a-zA-Z0-9_-]{3,20}">
        <div class="hint">3-20 characters: letters, numbers, hyphens, underscores</div>
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="new-password">
        <div class="hint">Min 8 chars, uppercase, lowercase, number, special char</div>
      </div>
      <div class="form-group">
        <label for="confirmPassword">Confirm Password</label>
        <input type="password" id="confirmPassword" name="confirmPassword" required autocomplete="new-password">
      </div>
      <button type="submit">Create Admin Account</button>
    </form>
  </div>
  <script>
    document.getElementById('setupForm').addEventListener('submit', async (e) => {
      e.preventDefault()
      const error = document.getElementById('error')
      error.style.display = 'none'
      
      const password = document.getElementById('password').value
      const confirmPassword = document.getElementById('confirmPassword').value
      
      if (password !== confirmPassword) {
        error.textContent = 'Passwords do not match'
        error.style.display = 'block'
        return
      }
      
      const formData = {
        email: document.getElementById('email').value,
        nickname: document.getElementById('nickname').value,
        password: password
      }
      
      try {
        const response = await fetch('/auth/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })
        
        const data = await response.json()
        
        if (data.success) {
          window.location.href = '/auth/login'
        } else {
          error.textContent = data.error || 'Setup failed'
          error.style.display = 'block'
        }
      } catch (err) {
        error.textContent = 'An error occurred. Please try again.'
        error.style.display = 'block'
      }
    })
  </script>
</body>
</html>
  `
}

function getRegisterPage(invitation, errorMessage) {
  const email = invitation ? invitation.email : ''
  const token = invitation ? new URLSearchParams(window.location.search).get('token') : ''
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Register - DevChitChat</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
    h1 { margin-bottom: 0.5rem; color: #333; text-align: center; }
    .subtitle { text-align: center; color: #666; margin-bottom: 1.5rem; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; margin-bottom: 0.5rem; color: #555; font-weight: 500; }
    input { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem; }
    input:focus { outline: none; border-color: #0366d6; }
    input:disabled { background: #f5f5f5; }
    button { width: 100%; padding: 0.75rem; background: #0366d6; color: white; border: none; border-radius: 4px; font-size: 1rem; font-weight: 500; cursor: pointer; }
    button:hover { background: #0256c7; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .error { background: #ffeef0; color: #d73a49; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
    .hint { font-size: 0.875rem; color: #666; margin-top: 0.25rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Create Account</h1>
    <p class="subtitle">You've been invited to join DevChitChat</p>
    ${errorMessage ? `<div class="error">${errorMessage}</div>` : ''}
    ${invitation ? `
    <div id="error" class="error" style="display: none;"></div>
    <form id="registerForm">
      <input type="hidden" id="token" name="token" value="${new URL(typeof window !== 'undefined' ? window.location.href : 'http://localhost').searchParams.get('token') || ''}">
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" value="${email}" disabled>
      </div>
      <div class="form-group">
        <label for="nickname">Nickname</label>
        <input type="text" id="nickname" name="nickname" required autocomplete="username" pattern="[a-zA-Z0-9_-]{3,20}">
        <div class="hint">3-20 characters: letters, numbers, hyphens, underscores</div>
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="new-password">
        <div class="hint">Min 8 chars, uppercase, lowercase, number, special char</div>
      </div>
      <div class="form-group">
        <label for="confirmPassword">Confirm Password</label>
        <input type="password" id="confirmPassword" name="confirmPassword" required autocomplete="new-password">
      </div>
      <button type="submit">Create Account</button>
    </form>
    <script>
      document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault()
        const error = document.getElementById('error')
        error.style.display = 'none'
        
        const password = document.getElementById('password').value
        const confirmPassword = document.getElementById('confirmPassword').value
        
        if (password !== confirmPassword) {
          error.textContent = 'Passwords do not match'
          error.style.display = 'block'
          return
        }
        
        const urlParams = new URLSearchParams(window.location.search)
        const formData = {
          token: urlParams.get('token'),
          nickname: document.getElementById('nickname').value,
          password: password
        }
        
        try {
          const response = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
          })
          
          const data = await response.json()
          
          if (data.success) {
            window.location.href = '/auth/login'
          } else {
            error.textContent = data.error || 'Registration failed'
            error.style.display = 'block'
          }
        } catch (err) {
          error.textContent = 'An error occurred. Please try again.'
          error.style.display = 'block'
        }
      })
    </script>
    ` : ''}
  </div>
</body>
</html>
  `
}

function getAdminPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Dashboard - DevChitChat</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 2rem; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { margin-bottom: 0.5rem; color: #333; }
    .subtitle { color: #666; margin-bottom: 2rem; }
    .section { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 2rem; }
    h2 { margin-bottom: 1rem; color: #333; font-size: 1.25rem; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; margin-bottom: 0.5rem; color: #555; font-weight: 500; }
    input, select { padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem; }
    input:focus, select:focus { outline: none; border-color: #0366d6; }
    button { padding: 0.75rem 1.5rem; background: #0366d6; color: white; border: none; border-radius: 4px; font-size: 1rem; font-weight: 500; cursor: pointer; margin-right: 0.5rem; }
    button:hover { background: #0256c7; }
    button.secondary { background: #6c757d; }
    button.secondary:hover { background: #5a6268; }
    button.danger { background: #d73a49; }
    button.danger:hover { background: #c32939; }
    .error { background: #ffeef0; color: #d73a49; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
    .message { background: #e6f4ea; color: #137333; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 0.75rem; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; font-weight: 600; }
    .badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.875rem; font-weight: 500; }
    .badge.admin { background: #d73a49; color: white; }
    .badge.user { background: #0366d6; color: white; }
    .badge.inactive { background: #6c757d; color: white; }
    .nav { margin-bottom: 2rem; }
    .nav a { margin-right: 1rem; color: #0366d6; text-decoration: none; }
    .nav a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Admin Dashboard</h1>
    <p class="subtitle">Manage users and invitations</p>
    
    <div class="nav">
      <a href="/">Home</a>
      <a href="#" onclick="logout()">Logout</a>
    </div>
    
    <div class="section">
      <h2>Create Invitation</h2>
      <div id="inviteError" class="error" style="display: none;"></div>
      <div id="inviteMessage" class="message" style="display: none;"></div>
      <form id="inviteForm">
        <div class="form-group">
          <label for="inviteEmail">Email</label>
          <input type="email" id="inviteEmail" required>
        </div>
        <div class="form-group">
          <label for="expiresIn">Expires In (hours)</label>
          <input type="number" id="expiresIn" value="72" min="1" max="720">
        </div>
        <button type="submit">Create Invitation</button>
      </form>
      <div id="invitationLink" style="display: none; margin-top: 1rem;">
        <p><strong>Invitation URL:</strong></p>
        <input type="text" id="invitationUrl" readonly style="width: 100%; margin-top: 0.5rem;">
      </div>
    </div>
    
    <div class="section">
      <h2>Users</h2>
      <div id="usersError" class="error" style="display: none;"></div>
      <table id="usersTable">
        <thead>
          <tr>
            <th>Nickname</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Created</th>
            <th>Last Login</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="usersBody">
          <tr><td colspan="7" style="text-align: center;">Loading...</td></tr>
        </tbody>
      </table>
    </div>
    
    <div class="section">
      <h2>Reset User Password</h2>
      <div id="resetError" class="error" style="display: none;"></div>
      <div id="resetMessage" class="message" style="display: none;"></div>
      <form id="resetForm">
        <div class="form-group">
          <label for="resetUserId">User</label>
          <select id="resetUserId" required>
            <option value="">Select a user...</option>
          </select>
        </div>
        <div class="form-group">
          <label for="newPassword">New Password</label>
          <input type="password" id="newPassword" required>
        </div>
        <button type="submit" class="danger">Reset Password</button>
      </form>
    </div>
  </div>
  
  <script>
    async function loadUsers() {
      try {
        const response = await fetch('/auth/users')
        const users = await response.json()
        
        const tbody = document.getElementById('usersBody')
        const select = document.getElementById('resetUserId')
        
        select.innerHTML = '<option value="">Select a user...</option>'
        
        tbody.innerHTML = users.map(user => {
          select.innerHTML += \`<option value="\${user.id}">\${user.nickname} (\${user.email})</option>\`
          
          return \`
            <tr>
              <td>\${user.nickname}</td>
              <td>\${user.email}</td>
              <td><span class="badge \${user.role}">\${user.role}</span></td>
              <td><span class="badge \${user.is_active ? 'user' : 'inactive'}">\${user.is_active ? 'Active' : 'Inactive'}</span></td>
              <td>\${new Date(user.created_at).toLocaleDateString()}</td>
              <td>\${user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : 'Never'}</td>
              <td>
                <button class="secondary" onclick="viewUser(\${user.id})">View</button>
              </td>
            </tr>
          \`
        }).join('')
      } catch (err) {
        document.getElementById('usersError').textContent = 'Failed to load users'
        document.getElementById('usersError').style.display = 'block'
      }
    }
    
    document.getElementById('inviteForm').addEventListener('submit', async (e) => {
      e.preventDefault()
      const error = document.getElementById('inviteError')
      const message = document.getElementById('inviteMessage')
      const link = document.getElementById('invitationLink')
      error.style.display = 'none'
      message.style.display = 'none'
      link.style.display = 'none'
      
      const formData = {
        email: document.getElementById('inviteEmail').value,
        expiresInHours: parseInt(document.getElementById('expiresIn').value)
      }
      
      try {
        const response = await fetch('/auth/invitations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })
        
        const data = await response.json()
        
        if (data.success) {
          message.textContent = 'Invitation created successfully!'
          message.style.display = 'block'
          document.getElementById('invitationUrl').value = data.invitation.url
          link.style.display = 'block'
          e.target.reset()
        } else {
          error.textContent = data.error || 'Failed to create invitation'
          error.style.display = 'block'
        }
      } catch (err) {
        error.textContent = 'An error occurred. Please try again.'
        error.style.display = 'block'
      }
    })
    
    document.getElementById('resetForm').addEventListener('submit', async (e) => {
      e.preventDefault()
      const error = document.getElementById('resetError')
      const message = document.getElementById('resetMessage')
      error.style.display = 'none'
      message.style.display = 'none'
      
      const formData = {
        userId: parseInt(document.getElementById('resetUserId').value),
        newPassword: document.getElementById('newPassword').value
      }
      
      if (!confirm('Are you sure you want to reset this user\\'s password?')) {
        return
      }
      
      try {
        const response = await fetch('/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })
        
        const data = await response.json()
        
        if (data.success) {
          message.textContent = 'Password reset successfully!'
          message.style.display = 'block'
          e.target.reset()
        } else {
          error.textContent = data.error || 'Failed to reset password'
          error.style.display = 'block'
        }
      } catch (err) {
        error.textContent = 'An error occurred. Please try again.'
        error.style.display = 'block'
      }
    })
    
    async function logout() {
      try {
        await fetch('/auth/logout', { method: 'POST' })
        window.location.href = '/auth/login'
      } catch (err) {
        alert('Logout failed')
      }
    }
    
    function viewUser(userId) {
      alert('User details view - not implemented')
    }
    
    loadUsers()
  </script>
</body>
</html>
  `
}

export default setupAuthRoutes
