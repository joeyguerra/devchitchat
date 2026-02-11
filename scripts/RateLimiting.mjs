// Rate Limiting with Role-based Adjustments
// This script implements rate limiting that respects user roles

export default (robot) => {
  const adapter = robot.adapter
  
  if (!adapter.registerAuthzHook) {
    console.log('Authorization hooks not supported by this adapter')
    return
  }

  // Wait for authenticatedSessions to be available from SqlAuth.mjs
  const waitForAuth = () => {
    return new Promise((resolve) => {
      const checkAuth = () => {
        if (robot.authenticatedSessions) {
          resolve()
        } else {
          setTimeout(checkAuth, 100)
        }
      }
      checkAuth()
    })
  }
  
  waitForAuth().then(() => {
    const authenticatedSessions = robot.authenticatedSessions
    
    // Track message counts per user
    const messageCounts = new Map()
    
    // Configuration - different limits for different roles
    const RATE_LIMITS = {
      admin: {
        messagesPerMinute: 100,
        roomCreateCooldownMs: 0 // No cooldown for admins
      },
      moderator: {
        messagesPerMinute: 50,
        roomCreateCooldownMs: 60000 // 1 minute
      },
      user: {
        messagesPerMinute: 20,
        roomCreateCooldownMs: 300000 // 5 minutes
      },
      guest: {
        messagesPerMinute: 5,
        roomCreateCooldownMs: 600000 // 10 minutes
      }
    }
    
    const RATE_LIMIT_WINDOW_MS = 60000 // 1 minute
    const lastRoomCreation = new Map()
    
    // Get user role
    const getUserRole = (sessionId) => {
      const authSession = authenticatedSessions.get(sessionId)
      return authSession ? authSession.role : 'guest'
    }
    
    // Clean up old entries periodically
    setInterval(() => {
      const now = Date.now()
      
      // Clean up message counts
      for (const [key, timestamps] of messageCounts.entries()) {
        const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS)
        if (recent.length === 0) {
          messageCounts.delete(key)
        } else {
          messageCounts.set(key, recent)
        }
      }
      
      // Clean up room creation timestamps
      for (const [sessionId, timestamp] of lastRoomCreation.entries()) {
        const role = getUserRole(sessionId)
        const cooldown = RATE_LIMITS[role]?.roomCreateCooldownMs || RATE_LIMITS.guest.roomCreateCooldownMs
        if (now - timestamp > cooldown) {
          lastRoomCreation.delete(sessionId)
        }
      }
    }, 60000) // Clean up every minute
    
    adapter.registerAuthzHook(async (action, context) => {
      const now = Date.now()
      const role = getUserRole(context.sessionId)
      const limits = RATE_LIMITS[role] || RATE_LIMITS.guest
      
      // Rate limit message sending
      if (action === 'message.send') {
        const key = context.sessionId
        
        if (!messageCounts.has(key)) {
          messageCounts.set(key, [])
        }
        
        const timestamps = messageCounts.get(key)
        const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS)
        
        if (recent.length >= limits.messagesPerMinute) {
          return {
            allowed: false,
            reason: `Rate limit exceeded. Maximum ${limits.messagesPerMinute} messages per minute for ${role} role. Please slow down.`
          }
        }
        
        recent.push(now)
        messageCounts.set(key, recent)
      }
      
      // Rate limit room creation
      if (action === 'room.create') {
        if (limits.roomCreateCooldownMs === 0) {
          // No cooldown, allow immediately
          return { allowed: true }
        }
        
        const lastCreation = lastRoomCreation.get(context.sessionId)
        
        if (lastCreation && now - lastCreation < limits.roomCreateCooldownMs) {
          const remainingMs = limits.roomCreateCooldownMs - (now - lastCreation)
          const remainingMinutes = Math.ceil(remainingMs / 60000)
          
          return {
            allowed: false,
            reason: `Please wait ${remainingMinutes} more minute(s) before creating another room`
          }
        }
        
        lastRoomCreation.set(context.sessionId, now)
      }
      
      return { allowed: true }
    })
    
    // Command: Check rate limit status
    robot.respond(/rate limit status/i, (res) => {
      const sessionId = res.message.user.id
      const role = getUserRole(sessionId)
      const limits = RATE_LIMITS[role] || RATE_LIMITS.guest
      
      const timestamps = messageCounts.get(sessionId) || []
      const now = Date.now()
      const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS)
      
      const remaining = limits.messagesPerMinute - recent.length
      const roomCooldown = limits.roomCreateCooldownMs / 60000
      
      res.reply(`Rate Limit Status (${role}):\\n` +
        `• Messages: ${recent.length}/${limits.messagesPerMinute} used this minute (${remaining} remaining)\\n` +
        `• Room creation cooldown: ${roomCooldown === 0 ? 'None' : roomCooldown + ' minute(s)'}`)
    })
    
    console.log('Role-based rate limiting hooks registered')
  })
}
