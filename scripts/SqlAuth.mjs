// SQLite-backed Authentication
// This script integrates SQLite authentication with hubot-chat adapter

import Database from '../src/database.mjs'

export default (robot) => {
  const adapter = robot.adapter
  
  // Only register hooks if the adapter supports them
  if (!adapter.registerAuthHook || !adapter.registerAuthzHook) {
    console.log('Authentication hooks not supported by this adapter')
    return
  }

  // Initialize database
  const db = new Database()
  
  // Map of websocket session IDs to authenticated user sessions
  const authenticatedSessions = new Map()
  
  // Authentication hook - validate that user has an authenticated session
  adapter.registerAuthHook(async (sessionId, nickname, payload) => {
    // Check if this session has been authenticated via web login
    const authSession = authenticatedSessions.get(sessionId)
    
    if (!authSession) {
      // Try to authenticate from payload if web session token provided
      if (payload && payload.webSessionId) {
        const webSession = db.getSession(payload.webSessionId)
        
        if (webSession) {
          // Valid web session, use that nickname
          authenticatedSessions.set(sessionId, {
            userId: webSession.user_id,
            nickname: webSession.nickname,
            role: webSession.role,
            webSessionId: payload.webSessionId
          })
          
          return {
            allowed: true,
            sessionId,
            nickname: webSession.nickname
          }
        }
      }
      
      return {
        allowed: false,
        reason: 'Authentication required. Please log in at /auth/login'
      }
    }
    
    // User is authenticated, verify nickname matches
    if (nickname !== authSession.nickname) {
      return {
        allowed: false,
        reason: 'Nickname does not match authenticated user'
      }
    }
    
    // Validate session is still active
    const dbSession = db.getSession(authSession.webSessionId)
    if (!dbSession) {
      authenticatedSessions.delete(sessionId)
      return {
        allowed: false,
        reason: 'Session expired. Please log in again.'
      }
    }
    
    return {
      allowed: true,
      sessionId,
      nickname: authSession.nickname
    }
  })
  
  // Store authenticated sessions when users connect
  robot.listenerMiddleware((context, next, done) => {
    const user = context.response?.message?.user
    
    if (user && user.id) {
      const authSession = authenticatedSessions.get(user.id)
      
      if (authSession) {
        // Attach role and user info to context for other scripts
        context.user = {
          ...user,
          role: authSession.role,
          userId: authSession.userId
        }
      }
    }
    
    next()
  })
  
  // Command: Check authentication status
  robot.respond(/auth status/i, (res) => {
    const sessionId = res.message.user.id
    const authSession = authenticatedSessions.get(sessionId)
    
    if (authSession) {
      const user = db.getUserById(authSession.userId)
      res.reply(`Authenticated as ${authSession.nickname} (${authSession.role})\\nEmail: ${user.email}`)
    } else {
      res.reply('Not authenticated. Please log in at /auth/login')
    }
  })
  
  // Cleanup on disconnect
  robot.adapter.on('disconnect', (sessionId) => {
    authenticatedSessions.delete(sessionId)
  })
  
  console.log('SQLite authentication hooks registered')
  
  // Make database and session map available to other scripts
  robot.authDb = db
  robot.authenticatedSessions = authenticatedSessions
}
