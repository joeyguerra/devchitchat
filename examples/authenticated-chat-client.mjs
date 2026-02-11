// Example: Client-side integration for authenticated WebSocket chat
// Add this to your chat client JavaScript

class AuthenticatedChatClient {
  constructor(wsUrl = 'ws://localhost:8080/chat') {
    this.wsUrl = wsUrl
    this.ws = null
    this.authenticated = false
    this.user = null
  }

  // Check if user is authenticated via web session
  async checkAuth() {
    try {
      const response = await fetch('/api/auth/check', {
        credentials: 'include' // Important: include cookies
      })
      
      const data = await response.json()
      
      if (data.authenticated) {
        this.authenticated = true
        this.user = data.user
        return {
          authenticated: true,
          user: data.user,
          sessionId: data.sessionId
        }
      } else {
        this.authenticated = false
        return { authenticated: false }
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      return { authenticated: false, error }
    }
  }

  // Connect to WebSocket after authenticating
  async connect() {
    const authStatus = await this.checkAuth()
    
    if (!authStatus.authenticated) {
      // Redirect to login
      window.location.href = '/auth/login'
      return false
    }

    // Notify server to link WebSocket session to web session
    const wsSessionId = this.generateSessionId()
    
    try {
      // First, link the sessions on the server
      await fetch('/api/auth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ wsSessionId })
      })

      // Now connect to WebSocket
      this.ws = new WebSocket(this.wsUrl)
      
      this.ws.onopen = () => {
        console.log('Connected to chat')
        
        // Send authentication info
        this.send({
          type: 'authenticate',
          sessionId: wsSessionId,
          nickname: this.user.nickname,
          webSessionId: authStatus.sessionId
        })
      }
      
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data)
        this.handleMessage(message)
      }
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
      
      this.ws.onclose = () => {
        console.log('Disconnected from chat')
        this.authenticated = false
      }
      
      return true
    } catch (error) {
      console.error('Failed to connect:', error)
      return false
    }
  }

  // Send message through WebSocket
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    } else {
      console.error('WebSocket not connected')
    }
  }

  // Send chat message
  sendMessage(text, room = null) {
    this.send({
      type: 'message',
      text: text,
      room: room
    })
  }

  // Handle incoming messages
  handleMessage(message) {
    switch (message.type) {
      case 'auth_success':
        console.log('Authenticated successfully')
        this.onAuthSuccess && this.onAuthSuccess(message)
        break
        
      case 'auth_error':
        console.error('Authentication failed:', message.error)
        this.onAuthError && this.onAuthError(message)
        // Redirect to login
        window.location.href = '/auth/login'
        break
        
      case 'message':
        this.onMessage && this.onMessage(message)
        break
        
      case 'error':
        this.onError && this.onError(message)
        break
        
      default:
        console.log('Unknown message type:', message.type)
    }
  }

  // Generate unique session ID for WebSocket
  generateSessionId() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  // Disconnect from chat
  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  // Logout (disconnect and clear session)
  async logout() {
    this.disconnect()
    
    try {
      await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include'
      })
    } catch (error) {
      console.error('Logout failed:', error)
    }
    
    window.location.href = '/auth/login'
  }
}

// Example usage:
// 
// const chat = new AuthenticatedChatClient()
//
// // Set up event handlers
// chat.onAuthSuccess = (data) => {
//   console.log('Authenticated as:', data.nickname)
//   displayWelcomeMessage(data.nickname)
// }
//
// chat.onMessage = (message) => {
//   displayMessage(message.from, message.text)
// }
//
// chat.onError = (error) => {
//   displayError(error.message)
// }
//
// // Connect (will check auth and connect WebSocket)
// await chat.connect()
//
// // Send a message
// chat.sendMessage('Hello, world!', 'general')
//
// // Logout
// chat.logout()

// Example HTML integration:
/*
<!DOCTYPE html>
<html>
<head>
  <title>DevChitChat</title>
</head>
<body>
  <div id="chat-container">
    <div id="messages"></div>
    <input type="text" id="message-input" placeholder="Type a message...">
    <button id="send-button">Send</button>
    <button id="logout-button">Logout</button>
  </div>

  <script src="chat-client.js"></script>
  <script>
    const chat = new AuthenticatedChatClient()
    
    // Setup UI handlers
    document.getElementById('send-button').addEventListener('click', () => {
      const input = document.getElementById('message-input')
      const text = input.value.trim()
      if (text) {
        chat.sendMessage(text)
        input.value = ''
      }
    })
    
    document.getElementById('message-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('send-button').click()
      }
    })
    
    document.getElementById('logout-button').addEventListener('click', () => {
      chat.logout()
    })
    
    // Setup chat event handlers
    chat.onMessage = (message) => {
      const messagesDiv = document.getElementById('messages')
      const messageEl = document.createElement('div')
      messageEl.textContent = `${message.from}: ${message.text}`
      messagesDiv.appendChild(messageEl)
      messagesDiv.scrollTop = messagesDiv.scrollHeight
    }
    
    chat.onError = (error) => {
      alert(error.message)
    }
    
    // Connect to chat
    (async () => {
      const connected = await chat.connect()
      if (connected) {
        console.log('Connected to chat!')
      }
    })()
  </script>
</body>
</html>
*/

export default AuthenticatedChatClient
