class WsClient {
  constructor({
    urlFactory,
    connectTimeoutMs = 10000,
    maxReconnectDelayMs = 10000,
    onSocketCreated = null,
    onStatus = null,
    onSocketEvent = null,
    onOpen = null,
    onClose = null,
    onError = null,
    onMessage = null
  }) {
    this.urlFactory = urlFactory
    this.connectTimeoutMs = connectTimeoutMs
    this.maxReconnectDelayMs = maxReconnectDelayMs
    this.onSocketCreated = onSocketCreated
    this.onStatus = onStatus
    this.onSocketEvent = onSocketEvent
    this.onOpen = onOpen
    this.onClose = onClose
    this.onError = onError
    this.onMessage = onMessage

    this.ws = null
    this.reconnectTimer = null
    this.connectTimer = null
    this.reconnectAttempts = 0
  }

  getWebSocket() {
    return this.ws
  }

  isOpen() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  readyStateText() {
    if (!this.ws) return 'none'
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting'
      case WebSocket.OPEN: return 'open'
      case WebSocket.CLOSING: return 'closing'
      case WebSocket.CLOSED: return 'closed'
      default: return 'unknown'
    }
  }

  clearConnectTimer() {
    if (!this.connectTimer) {
      return
    }
    window.clearTimeout(this.connectTimer)
    this.connectTimer = null
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      return
    }
    const attempt = this.reconnectAttempts + 1
    this.reconnectAttempts = attempt
    this.onSocketEvent?.('reconnect_scheduled', '')
    const delayMs = Math.min(1000 * (2 ** (attempt - 1)), this.maxReconnectDelayMs)
    this.onStatus?.(`reconnecting (${attempt})`)
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delayMs)
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.ws = new WebSocket(this.urlFactory())
    this.onSocketCreated?.(this.ws)
    this.onSocketEvent?.('connect_start', '')
    this.onStatus?.('connecting')

    this.clearConnectTimer()
    this.connectTimer = window.setTimeout(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.CONNECTING) {
        return
      }
      this.onSocketEvent?.('connect_timeout', 'socket open timed out after 10s')
      this.onStatus?.('socket timeout')
      try {
        this.ws.close()
      } catch (error) {
        // ignore close errors during timeout recovery
      }
      this.scheduleReconnect()
    }, this.connectTimeoutMs)

    this.ws.addEventListener('open', () => {
      this.clearConnectTimer()
      this.reconnectAttempts = 0
      if (this.reconnectTimer) {
        window.clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
      this.onSocketEvent?.('open', '')
      this.onStatus?.('connected')
      this.onOpen?.()
    })

    this.ws.addEventListener('close', (event) => {
      this.clearConnectTimer()
      this.onSocketEvent?.('close', `close ${event.code}${event.reason ? ` (${event.reason})` : ''}`)
      this.onStatus?.('disconnected')
      this.onClose?.(event)
      this.scheduleReconnect()
    })

    this.ws.addEventListener('error', () => {
      this.clearConnectTimer()
      this.onSocketEvent?.('error', 'socket error')
      this.onStatus?.('socket error')
      this.onError?.()
    })

    this.ws.addEventListener('message', (event) => {
      this.onSocketEvent?.('message', '')
      this.onMessage?.(event.data)
    })
  }

  sendJson(payload) {
    if (!this.isOpen()) {
      return false
    }
    this.ws.send(JSON.stringify(payload))
    return true
  }
}

export { WsClient }
