// SQLite-backed Role-Based Access Control
// This script implements role-based authorization using SQLite database

export default (robot) => {
  const adapter = robot.adapter
  
  if (!adapter.registerAuthHook || !adapter.registerAuthzHook) {
    console.log('Authentication/Authorization hooks not supported by this adapter')
    return
  }
  
  // Wait for authDb to be available from SqlAuth.mjs
  const waitForDb = () => {
    return new Promise((resolve) => {
      const checkDb = () => {
        if (robot.authDb && robot.authenticatedSessions) {
          resolve()
        } else {
          setTimeout(checkDb, 100)
        }
      }
      checkDb()
    })
  }
  
  waitForDb().then(() => {
    const db = robot.authDb
    const authenticatedSessions = robot.authenticatedSessions
    
    // Get user role from database
    const getUserRole = (sessionId) => {
      const authSession = authenticatedSessions.get(sessionId)
      if (!authSession) {
        return 'guest'
      }
      return authSession.role
    }
    
    // Enforce role-based permissions
    adapter.registerAuthzHook(async (action, context) => {
      const role = getUserRole(context.sessionId)
      
      // Only admins and authenticated users can create rooms
      if (action === 'room.create') {
        if (role === 'guest') {
          return {
            allowed: false,
            reason: 'You must be logged in to create rooms'
          }
        }
        
        // Only admins can create private rooms
        if (context.visibility === 'private' && role !== 'admin') {
          return {
            allowed: false,
            reason: 'Only admins can create private rooms'
          }
        }
      }
      
      // Guests cannot join certain rooms
      if (action === 'room.join') {
        const restrictedRooms = ['admin-only', 'staff', 'moderators']
        
        if (restrictedRooms.includes(context.roomName)) {
          if (role !== 'admin') {
            return {
              allowed: false,
              reason: 'You do not have permission to join this room'
            }
          }
        }
      }
      
      // Guests have limited messaging
      if (action === 'message.send') {
        // Guests cannot send messages (must be authenticated)
        if (role === 'guest') {
          return {
            allowed: false,
            reason: 'You must be logged in to send messages'
          }
        }
      }
      
      // Only admins can modify room settings
      if (action === 'room.modify' || action === 'room.delete') {
        if (role !== 'admin') {
          return {
            allowed: false,
            reason: 'Only admins can modify or delete rooms'
          }
        }
      }
      
      // Only authenticated users can start DMs
      if (action === 'dm.start') {
        if (role === 'guest') {
          return {
            allowed: false,
            reason: 'You must be logged in to send direct messages'
          }
        }
        
        // Only admins can DM the hubot user
        if (context.targetNickname === 'hubot' && role !== 'admin') {
          return {
            allowed: false,
            reason: 'Only admins can send direct messages to hubot'
          }
        }
      }
      
      return { allowed: true }
    })
    
    // Command: Check your role
    robot.respond(/what is my role/i, (res) => {
      const sessionId = res.message.user.id
      const role = getUserRole(sessionId)
      res.reply(`Your role is: ${role}`)
    })
    
    // Command: List all users (admin only)
    robot.respond(/list users/i, (res) => {
      const sessionId = res.message.user.id
      const role = getUserRole(sessionId)
      
      if (role !== 'admin') {
        res.reply('Only admins can list users')
        return
      }
      
      const users = db.listUsers()
      
      if (users.length === 0) {
        res.reply('No users found')
        return
      }
      
      const userList = users.map(user => 
        `• ${user.nickname} (${user.email}) - ${user.role} - ${user.is_active ? 'Active' : 'Inactive'}`
      ).join('\\n')
      
      res.reply(`Users:\\n${userList}`)
    })
    
    // Command: Check another user's role (admin only)
    robot.respond(/role of (\w+)/i, (res) => {
      const sessionId = res.message.user.id
      const role = getUserRole(sessionId)
      
      if (role !== 'admin') {
        res.reply('Only admins can check other users roles')
        return
      }
      
      const targetNickname = res.match[1]
      const targetUser = db.getUserByNickname(targetNickname)
      
      if (!targetUser) {
        res.reply(`User ${targetNickname} not found`)
        return
      }
      
      res.reply(`${targetUser.nickname}'s role is: ${targetUser.role}`)
    })
    
    console.log('SQLite-backed role-based access control hooks registered')
  })
}
