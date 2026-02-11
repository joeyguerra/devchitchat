// WebSocket to Web Session Integration
// This script bridges web authentication sessions to WebSocket connections

export default (robot) => {
  // Wait for auth service to be available
  const waitForAuth = () => {
    return new Promise((resolve) => {
      const checkAuth = () => {
        if (robot.authService && robot.authenticatedSessions) {
          resolve()
        } else {
          setTimeout(checkAuth, 100)
        }
      }
      checkAuth()
    })
  }
  
  waitForAuth().then(() => {
    const authService = robot.authService
    const authenticatedSessions = robot.authenticatedSessions
    
    // When a user connects via WebSocket, check if they have a valid web session
    // This would be triggered when the chat client sends authentication data
    robot.router.post('/api/auth/connect', (req, res) => {
      const sessionId = req.cookies?.session_id
      const { wsSessionId } = req.body
      
      if (!sessionId || !wsSessionId) {
        return res.status(400).json({ error: 'Missing session information' })
      }
      
      const session = authService.validateSession(sessionId)
      
      if (!session) {
        return res.status(401).json({ error: 'Invalid or expired session' })
      }
      
      // Map WebSocket session to authenticated user
      authenticatedSessions.set(wsSessionId, {
        userId: session.userId,
        nickname: session.nickname,
        role: session.role,
        webSessionId: sessionId
      })
      
      res.json({
        success: true,
        user: {
          nickname: session.nickname,
          role: session.role
        }
      })
    })
    
    // API endpoint to check authentication before connecting to WebSocket
    robot.router.get('/api/auth/check', (req, res) => {
      const sessionId = req.cookies?.session_id
      
      if (!sessionId) {
        return res.json({ authenticated: false })
      }
      
      const session = authService.validateSession(sessionId)
      
      if (!session) {
        res.clearCookie('session_id')
        return res.json({ authenticated: false })
      }
      
      res.json({
        authenticated: true,
        user: {
          id: session.userId,
          nickname: session.nickname,
          role: session.role
        },
        sessionId: sessionId  // Send this to WebSocket for authentication
      })
    })
    
    console.log('WebSocket-Web session integration loaded')
  })
}
