// Authentication Routes Setup
// This script sets up the web-based authentication interface

import setupAuthRoutes from '../src/auth-routes.mjs'
import cookieParser from 'cookie-parser'

export default (robot) => {
  // Add cookie parser middleware
  robot.router.use(cookieParser())
  
  // Add JSON body parser
  robot.router.use((req, res, next) => {
    if (req.headers['content-type'] === 'application/json') {
      let data = ''
      req.on('data', chunk => {
        data += chunk
      })
      req.on('end', () => {
        try {
          req.body = data ? JSON.parse(data) : {}
        } catch (e) {
          req.body = {}
        }
        next()
      })
    } else {
      req.body = {}
      next()
    }
  })
  
  // Setup authentication routes
  const authService = setupAuthRoutes(robot)
  
  // Make auth service available to robot
  robot.authService = authService
  
  // Redirect root to login if not authenticated, or to chat if authenticated
  robot.router.get('/', (req, res, next) => {
    const sessionId = req.cookies?.session_id
    
    if (!sessionId) {
      // Check if needs initialization
      if (authService.needsInitialization()) {
        return res.redirect('/auth/setup')
      }
      return res.redirect('/auth/login')
    }
    
    const session = authService.validateSession(sessionId)
    
    if (!session) {
      res.clearCookie('session_id')
      return res.redirect('/auth/login')
    }
    
    // User is authenticated, continue to chat interface
    next()
  })
  
  console.log('Authentication routes script loaded')
}
