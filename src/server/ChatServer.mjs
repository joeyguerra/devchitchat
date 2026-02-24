import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import { WebSocketServer } from 'ws'
import { AuthService } from './services/AuthService.mjs'
import { HubService } from './services/HubService.mjs'
import { ChannelService } from './services/ChannelService.mjs'
import { MessageService } from './services/MessageService.mjs'
import { DeliveryService } from './services/DeliveryService.mjs'
import { SearchService } from './services/SearchService.mjs'
import { PresenceService } from './services/PresenceService.mjs'
import { SignalingService } from './services/SignalingService.mjs'
import { HubotBridge } from './services/HubotBridge.mjs'
import { ServiceError } from './util/errors.mjs'
import { newId } from './util/ids.mjs'
import { randomToken } from './util/crypto.mjs'

const CLIENT_ROOT = path.resolve('src/client')

const contentTypeFor = (filePath) => {
  if (filePath.endsWith('.html')) return 'text/html'
  if (filePath.endsWith('.css')) return 'text/css'
  if (filePath.endsWith('.mjs')) return 'text/javascript'
  if (filePath.endsWith('.js')) return 'text/javascript'
  return 'application/octet-stream'
}

export class ChatServer {
  constructor({ db, logger, tls = null }) {
    this.db = db
    this.logger = logger
    this.authService = new AuthService({
      db,
      sessionTtlMs: Number(process.env.SESSION_TTL_MS || 30 * 24 * 60 * 60 * 1000)
    })
    this.hubService = new HubService({ db })
    this.channelService = new ChannelService({ db, hubService: this.hubService })
    this.searchService = new SearchService({ db })
    this.messageService = new MessageService({ db, channelService: this.channelService, searchService: this.searchService })
    this.deliveryService = new DeliveryService({ db })
    this.presenceService = new PresenceService()
    this.signalingService = new SignalingService({})
    this.hubotBridge = new HubotBridge()

    this.connections = new Map()
    this.userConnections = new Map()
    this.peerConnections = new Map()

    this.httpServer = tls
      ? https.createServer(tls, this.handleHttp.bind(this))
      : http.createServer(this.handleHttp.bind(this))
    this.wsServer = new WebSocketServer({ noServer: true })
    this.streamControlWsServer = new WebSocketServer({ noServer: true })
    this.streamMediaWsServer = new WebSocketServer({ noServer: true })

    this.wsServer.on('connection', (ws) => this.handleConnection(ws))
    this.streamControlWsServer.on('connection', (ws) => this.handleStreamControlConnection(ws))
    this.streamMediaWsServer.on('connection', (ws) => this.handleStreamMediaConnection(ws))
    this.httpServer.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket, head))

    this.signalingService.onEvent((event) => this.handleSignalingEvent(event))

    this.streamControlConnections = new Map()
    this.streamMediaConnections = new Map()
    this.streamBroadcasters = new Map()
    this.streamControlViewers = new Map()
    this.streamMediaViewers = new Map()
    this.streamStates = new Map()
    this.streamControlByClientId = new Map()

    this.ensureBootstrap()
  }

  listen(port) {
    this.httpServer.listen(port)
  }

  listenAsync(port) {
    return new Promise((resolve) => {
      this.httpServer.listen(port, () => {
        const address = this.httpServer.address()
        resolve(address?.port)
      })
    })
  }

  ensureBootstrap() {
    const count = this.authService.getUserCount()
    if (count > 0) {
      return
    }
    const token = process.env.BOOTSTRAP_TOKEN || randomToken(18)
    this.authService.bootstrapToken = token
    this.logger.info('auth.bootstrap_ready', { bootstrap_code: token })
  }

  close() {
    this.wsServer.close()
    this.streamControlWsServer.close()
    this.streamMediaWsServer.close()
    this.httpServer.close()
  }

  handleUpgrade(req, socket, head) {
    const host = req.headers.host || 'localhost'
    const pathname = new URL(req.url || '/', `http://${host}`).pathname
    if (pathname === '/ws') {
      this.wsServer.handleUpgrade(req, socket, head, (ws) => {
        this.wsServer.emit('connection', ws, req)
      })
      return
    }
    if (pathname === '/ws-stream-control') {
      this.streamControlWsServer.handleUpgrade(req, socket, head, (ws) => {
        this.streamControlWsServer.emit('connection', ws, req)
      })
      return
    }
    if (pathname === '/ws-stream-media') {
      this.streamMediaWsServer.handleUpgrade(req, socket, head, (ws) => {
        this.streamMediaWsServer.emit('connection', ws, req)
      })
      return
    }
    if (pathname === '/ws-stream') {
      this.streamControlWsServer.handleUpgrade(req, socket, head, (ws) => {
        this.streamControlWsServer.emit('connection', ws, req)
      })
      return
    }
    socket.destroy()
  }

  handleHttp(req, res) {
    const protocol = req.socket.encrypted ? 'https' : 'http'
    const url = new URL(req.url || '/', `${protocol}://${req.headers.host}`)
    let filePath = path.join(CLIENT_ROOT, url.pathname)
    if (url.pathname === '/') {
      filePath = path.join(CLIENT_ROOT, 'index.html')
    }
    if (url.pathname === '/prototype-stream') {
      filePath = path.join(CLIENT_ROOT, 'prototype-stream.html')
    }

    if (!filePath.startsWith(CLIENT_ROOT)) {
      res.statusCode = 400
      res.end('Bad request')
      return
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.statusCode = 404
        res.end('Not found')
        return
      }
      res.setHeader('Content-Type', contentTypeFor(filePath))
      res.end(data)
    })
  }

  handleConnection(ws) {
    const connectionId = newId('conn')
    this.connections.set(connectionId, {
      ws,
      connectionId,
      userId: null,
      sessionId: null,
      peerId: null,
      callId: null
    })

    ws.on('message', (data) => this.handleMessage(connectionId, data))
    ws.on('close', () => this.handleClose(connectionId))
  }

  handleStreamControlConnection(ws) {
    const streamConnectionId = newId('stream_ctrl_conn')
    this.streamControlConnections.set(streamConnectionId, {
      id: streamConnectionId,
      ws,
      stream: null,
      role: null,
      clientId: null
    })

    ws.on('message', (data, isBinary) => this.handleStreamControlMessage(streamConnectionId, data, isBinary))
    ws.on('close', () => this.handleStreamControlClose(streamConnectionId))
  }

  handleStreamMediaConnection(ws) {
    const streamConnectionId = newId('stream_media_conn')
    this.streamMediaConnections.set(streamConnectionId, {
      id: streamConnectionId,
      ws,
      stream: null,
      role: null,
      clientId: null
    })

    ws.on('message', (data, isBinary) => this.handleStreamMediaMessage(streamConnectionId, data, isBinary))
    ws.on('close', () => this.handleStreamMediaClose(streamConnectionId))
  }

  handleStreamControlMessage(streamConnectionId, data, isBinary) {
    const connection = this.streamControlConnections.get(streamConnectionId)
    if (!connection) {
      return
    }

    if (isBinary) {
      return
    }

    let msg = null
    try {
      msg = JSON.parse(data.toString())
    } catch (error) {
      this.sendStream(streamConnectionId, { t: 'error', body: { message: 'Invalid JSON' } })
      return
    }

    if (msg.t === 'join') {
      this.handleStreamJoin(connection, msg)
      return
    }

    this.sendStream(streamConnectionId, { t: 'error', body: { message: 'Unknown message type' } })
  }

  handleStreamMediaMessage(streamConnectionId, data, isBinary) {
    const connection = this.streamMediaConnections.get(streamConnectionId)
    if (!connection) {
      return
    }

    if (isBinary) {
      this.handleStreamBinary(connection, data)
      return
    }

    let msg = null
    try {
      msg = JSON.parse(data.toString())
    } catch (error) {
      this.sendStreamMedia(streamConnectionId, { t: 'error', body: { message: 'Invalid JSON' } })
      return
    }

    if (msg.t === 'join') {
      this.handleStreamMediaJoin(connection, msg)
      return
    }

    this.sendStreamMedia(streamConnectionId, { t: 'error', body: { message: 'Unknown message type' } })
  }

  handleStreamBinary(connection, data) {
    if (!connection.stream || connection.role !== 'broadcaster' || !connection.clientId) {
      this.sendStreamMedia(connection.id, { t: 'error', body: { message: 'Join as broadcaster first' } })
      return
    }
    const broadcasterControlId = this.streamBroadcasters.get(connection.stream)
    const controlConnectionId = this.streamControlByClientId.get(connection.clientId)
    if (!broadcasterControlId || !controlConnectionId || broadcasterControlId !== controlConnectionId) {
      this.sendStreamMedia(connection.id, { t: 'error', body: { message: 'Broadcaster control session is not active' } })
      return
    }
    const viewers = this.streamMediaViewers.get(connection.stream)
    if (!viewers || viewers.size === 0) {
      return
    }
    for (const viewerId of viewers) {
      this.sendStreamBinary(viewerId, data)
    }
  }

  handleStreamJoin(connection, msg) {
    const role = msg.body?.role
    const stream = (msg.body?.stream || 'default').trim()
    const clientId = (msg.body?.client_id || '').trim()
    if (!stream) {
      this.sendStreamControl(connection.id, { t: 'error', body: { message: 'Stream name is required' } })
      return
    }
    if (!['broadcaster', 'viewer'].includes(role)) {
      this.sendStreamControl(connection.id, { t: 'error', body: { message: 'Invalid role' } })
      return
    }
    if (!clientId) {
      this.sendStreamControl(connection.id, { t: 'error', body: { message: 'client_id is required' } })
      return
    }

    const previousStream = connection.stream
    const previousRole = connection.role
    const previousClientId = connection.clientId
    if (previousClientId && this.streamControlByClientId.get(previousClientId) === connection.id) {
      this.streamControlByClientId.delete(previousClientId)
    }
    this.removeStreamMembership(connection)
    if (previousRole === 'broadcaster' && previousStream) {
      this.updateStreamState(previousStream, 'idle')
      this.broadcastStreamControl(previousStream, {
        t: 'stream.peer_event',
        body: {
          stream: previousStream,
          role: 'broadcaster',
          kind: 'leave'
        }
      })
    }
    connection.stream = stream
    connection.role = role
    connection.clientId = clientId
    this.streamControlByClientId.set(clientId, connection.id)

    if (role === 'broadcaster') {
      const existingBroadcasterId = this.streamBroadcasters.get(stream)
      if (existingBroadcasterId && existingBroadcasterId !== connection.id) {
        this.sendStreamControl(existingBroadcasterId, {
          t: 'status',
          body: { message: 'Disconnected: another broadcaster joined this stream' }
        })
        const existingBroadcaster = this.streamControlConnections.get(existingBroadcasterId)
        if (existingBroadcaster) {
          if (existingBroadcaster.clientId && this.streamControlByClientId.get(existingBroadcaster.clientId) === existingBroadcaster.id) {
            this.streamControlByClientId.delete(existingBroadcaster.clientId)
          }
          this.removeStreamMembership(existingBroadcaster)
          existingBroadcaster.stream = null
          existingBroadcaster.role = null
          existingBroadcaster.clientId = null
        }
        this.updateStreamState(stream, 'idle')
        this.broadcastStreamControl(stream, {
          t: 'stream.peer_event',
          body: {
            stream,
            role: 'broadcaster',
            kind: 'leave'
          }
        })
      }
      this.streamBroadcasters.set(stream, connection.id)
      this.updateStreamState(stream, 'live')
      this.broadcastStreamControl(stream, {
        t: 'stream.peer_event',
        body: {
          stream,
          role: 'broadcaster',
          kind: 'join'
        }
      })
    } else {
      if (!this.streamControlViewers.has(stream)) {
        this.streamControlViewers.set(stream, new Set())
      }
      this.streamControlViewers.get(stream).add(connection.id)
      if (this.streamBroadcasters.has(stream)) {
        this.sendStreamControl(connection.id, {
          t: 'stream.peer_event',
          body: {
            stream,
            role: 'broadcaster',
            kind: 'join'
          }
        })
      }
    }

    this.sendStreamControl(connection.id, { t: 'joined', body: { role, stream, client_id: clientId } })
    this.sendStreamControl(connection.id, { t: 'stream.state', body: this.getStreamState(stream) })
  }

  handleStreamMediaJoin(connection, msg) {
    const role = msg.body?.role
    const stream = (msg.body?.stream || 'default').trim()
    const clientId = (msg.body?.client_id || '').trim()
    if (!stream) {
      this.sendStreamMedia(connection.id, { t: 'error', body: { message: 'Stream name is required' } })
      return
    }
    if (!['broadcaster', 'viewer'].includes(role)) {
      this.sendStreamMedia(connection.id, { t: 'error', body: { message: 'Invalid role' } })
      return
    }
    if (!clientId) {
      this.sendStreamMedia(connection.id, { t: 'error', body: { message: 'client_id is required' } })
      return
    }

    this.removeStreamMediaMembership(connection)
    connection.stream = stream
    connection.role = role
    connection.clientId = clientId

    if (role === 'viewer') {
      if (!this.streamMediaViewers.has(stream)) {
        this.streamMediaViewers.set(stream, new Set())
      }
      this.streamMediaViewers.get(stream).add(connection.id)
    }

    this.sendStreamMedia(connection.id, { t: 'joined', body: { role, stream, client_id: clientId } })
  }

  handleStreamControlClose(streamConnectionId) {
    const connection = this.streamControlConnections.get(streamConnectionId)
    if (!connection) {
      return
    }
    const wasBroadcaster = connection.role === 'broadcaster'
    const stream = connection.stream
    if (connection.clientId && this.streamControlByClientId.get(connection.clientId) === connection.id) {
      this.streamControlByClientId.delete(connection.clientId)
    }
    this.removeStreamMembership(connection)
    if (wasBroadcaster && stream) {
      this.updateStreamState(stream, 'idle')
      this.broadcastStreamControl(stream, {
        t: 'stream.peer_event',
        body: {
          stream,
          role: 'broadcaster',
          kind: 'leave'
        }
      })
    }
    this.streamControlConnections.delete(streamConnectionId)
  }

  handleStreamMediaClose(streamConnectionId) {
    const connection = this.streamMediaConnections.get(streamConnectionId)
    if (!connection) {
      return
    }
    this.removeStreamMediaMembership(connection)
    this.streamMediaConnections.delete(streamConnectionId)
  }

  removeStreamMembership(connection) {
    if (!connection.stream || !connection.role) {
      return
    }
    if (connection.role === 'broadcaster') {
      const broadcasterId = this.streamBroadcasters.get(connection.stream)
      if (broadcasterId === connection.id) {
        this.streamBroadcasters.delete(connection.stream)
      }
      return
    }
    if (connection.role === 'viewer') {
      const viewers = this.streamControlViewers.get(connection.stream)
      if (viewers) {
        viewers.delete(connection.id)
        if (viewers.size === 0) {
          this.streamControlViewers.delete(connection.stream)
        }
      }
    }
  }

  removeStreamMediaMembership(connection) {
    if (!connection.stream || !connection.role) {
      return
    }
    if (connection.role === 'viewer') {
      const viewers = this.streamMediaViewers.get(connection.stream)
      if (viewers) {
        viewers.delete(connection.id)
        if (viewers.size === 0) {
          this.streamMediaViewers.delete(connection.stream)
        }
      }
    }
  }

  handleClose(connectionId) {
    const connection = this.connections.get(connectionId)
    if (!connection) {
      return
    }
    if (connection.peerId && connection.callId) {
      this.peerConnections.delete(connection.peerId)
      const result = this.signalingService.leaveCall({ callId: connection.callId, peerId: connection.peerId })
      if (result.removed) {
        this.broadcastCall(connection.callId, {
          t: 'rtc.peer_event',
          ok: true,
          body: {
            call_id: connection.callId,
            kind: 'leave',
            peer: { peer_id: connection.peerId, user_id: connection.userId }
          }
        })
      }
      if (result.ended && result.room_id) {
        this.broadcastChannel(result.room_id, {
          t: 'rtc.call_end',
          ok: true,
          body: {
            call_id: connection.callId,
            channel_id: result.room_id
          }
        })
      }
    }
    if (connection.userId) {
      this.removeUserConnection(connection.userId, connectionId)
      this.presenceService.removeConnection(connectionId, connection.userId)
    }
    this.connections.delete(connectionId)
  }

  async handleMessage(connectionId, data) {
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch (error) {
      this.sendError(connectionId, null, 'BAD_REQUEST', 'Invalid JSON')
      return
    }

    if (!this.isValidEnvelope(msg)) {
      this.sendError(connectionId, msg?.id || null, 'BAD_REQUEST', 'Invalid message envelope')
      return
    }

    const connection = this.connections.get(connectionId)
    const isAuthed = !!connection?.userId
    const t = msg.t

    if (!isAuthed && !['hello', 'auth.invite_redeem', 'auth.signin'].includes(t)) {
      this.sendError(connectionId, msg.id, 'AUTH_REQUIRED', 'Authenticate first')
      return
    }

    try {
      await this.routeMessage(connectionId, msg)
    } catch (error) {
      if (error instanceof ServiceError) {
        this.sendError(connectionId, msg.id, error.code, error.message, error.details)
      } else {
        this.logger.error('ws.handle_error', { error: error?.message })
        this.sendError(connectionId, msg.id, 'INTERNAL', 'Internal error')
      }
    }
  }

  isValidEnvelope(msg) {
    return msg && msg.v === 1 && typeof msg.t === 'string' && typeof msg.id === 'string' && typeof msg.ts === 'number' && typeof msg.body === 'object'
  }

  async routeMessage(connectionId, msg) {
    switch (msg.t) {
      case 'hello':
        this.handleHello(connectionId, msg)
        break
      case 'auth.invite_redeem':
        await this.handleInviteRedeem(connectionId, msg)
        break
      case 'auth.signin':
        await this.handleSignIn(connectionId, msg)
        break
      case 'admin.invite_create':
        this.handleAdminInviteCreate(connectionId, msg)
        break
      case 'hub.list':
        this.handleHubList(connectionId, msg)
        break
      case 'hub.create':
        this.handleHubCreate(connectionId, msg)
        break
      case 'hub.update':
        this.handleHubUpdate(connectionId, msg)
        break
      case 'hub.delete':
        this.handleHubDelete(connectionId, msg)
        break
      case 'channel.list':
        this.handleChannelList(connectionId, msg)
        break
      case 'channel.create':
        this.handleChannelCreate(connectionId, msg)
        break
      case 'channel.update':
        this.handleChannelUpdate(connectionId, msg)
        break
      case 'channel.delete':
        this.handleChannelDelete(connectionId, msg)
        break
      case 'channel.join':
        this.handleChannelJoin(connectionId, msg)
        break
      case 'channel.leave':
        this.handleChannelLeave(connectionId, msg)
        break
      case 'channel.invite_create':
        this.handleChannelInviteCreate(connectionId, msg)
        break
      case 'channel.add_member':
        this.handleChannelAddMember(connectionId, msg)
        break
      case 'msg.send':
        this.handleMsgSend(connectionId, msg)
        break
      case 'msg.list':
        this.handleMsgList(connectionId, msg)
        break
      case 'search.query':
        this.handleSearchQuery(connectionId, msg)
        break
      case 'user.search':
        this.handleUserSearch(connectionId, msg)
        break
      case 'presence.subscribe':
        this.handlePresenceSubscribe(connectionId, msg)
        break
      case 'rtc.call_create':
        this.handleRtcCallCreate(connectionId, msg)
        break
      case 'rtc.join':
        this.handleRtcJoin(connectionId, msg)
        break
      case 'rtc.offer':
        this.handleRtcOffer(connectionId, msg)
        break
      case 'rtc.answer':
        this.handleRtcAnswer(connectionId, msg)
        break
      case 'rtc.ice':
        this.handleRtcIce(connectionId, msg)
        break
      case 'rtc.stream_publish':
        this.handleRtcStreamPublish(connectionId, msg)
        break
      case 'rtc.leave':
        this.handleRtcLeave(connectionId, msg)
        break
      case 'rtc.end_call':
        this.handleRtcEndCall(connectionId, msg)
        break
      default:
        this.sendError(connectionId, msg.id, 'BAD_REQUEST', 'Unknown message type')
        break
    }
  }

  handleHello(connectionId, msg) {
    const resume = msg.body?.resume?.session_token
    let session = null
    if (resume) {
      session = this.authService.validateSession(resume)
    }
    if (session) {
      this.setConnectionUser(connectionId, session.user, session.session_id)
    }

    this.send(connectionId, {
      t: 'hello_ack',
      reply_to: msg.id,
      ok: true,
      body: {
        server: { name: 'devchitchat', ver: '0.1.0' },
        session: {
          authenticated: !!session,
          user: session ? session.user : null,
          session_token: resume || null
        },
        limits: {
          max_channels: 200,
          max_group_members: 20,
          max_message_bytes: 8000,
          max_signaling_bytes: 64000
        }
      }
    })
  }

  async handleInviteRedeem(connectionId, msg) {
    const { invite_token, profile, password } = msg.body || {}
    const result = await this.authService.redeemInvite({ inviteToken: invite_token, profile, password })
    const session = this.authService.validateSession(result.sessionToken)
    this.setConnectionUser(connectionId, session.user, session.session_id)

    this.send(connectionId, {
      t: 'auth.session',
      reply_to: msg.id,
      ok: true,
      body: {
        session_token: result.sessionToken,
        user: result.user
      }
    })
  }

  async handleSignIn(connectionId, msg) {
    const { handle, password } = msg.body || {}
    const result = await this.authService.signInWithPassword({ handle, password })
    const session = this.authService.validateSession(result.sessionToken)
    this.setConnectionUser(connectionId, session.user, session.session_id)

    this.send(connectionId, {
      t: 'auth.session',
      reply_to: msg.id,
      ok: true,
      body: {
        session_token: result.sessionToken,
        user: result.user
      }
    })
  }

  handleAdminInviteCreate(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const { ttl_ms, max_uses, note } = msg.body || {}
    const invite = this.authService.createInvite({
      createdByUserId: connection.userId,
      ttlMs: ttl_ms,
      maxUses: max_uses,
      note
    })

    this.send(connectionId, {
      t: 'admin.invite',
      reply_to: msg.id,
      ok: true,
      body: {
        invite_token: invite.inviteToken,
        expires_at: invite.expiresAt,
        max_uses: invite.maxUses
      }
    })
  }

  handleHubList(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const user = this.authService.getUser(connection.userId)
    const hubs = this.hubService.listHubs(connection.userId, user?.roles || [])
    this.send(connectionId, {
      t: 'hub.list_result',
      reply_to: msg.id,
      ok: true,
      body: { hubs }
    })
  }

  handleHubCreate(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const { name, description, visibility } = msg.body || {}
    const hub = this.hubService.createHub({ name, description, visibility, createdByUserId: connection.userId })
    this.send(connectionId, {
      t: 'hub.created',
      reply_to: msg.id,
      ok: true,
      body: { hub }
    })
    // Broadcast to all hub members (should just be the creator at creation, but covers future-proofing)
    this.broadcastHub(hub.hub_id, {
      t: 'hub.created',
      body: { hub }
    })
  }

  handleHubUpdate(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const user = this.authService.getUser(connection.userId)
    const { hub_id, name, description } = msg.body || {}
    const hub = this.hubService.updateHub({
      hubId: hub_id,
      userId: connection.userId,
      roles: user?.roles || [],
      name,
      description
    })
    this.send(connectionId, {
      t: 'hub.updated',
      reply_to: msg.id,
      ok: true,
      body: { hub }
    })
    // Broadcast to all hub members
    this.broadcastHub(hub.hub_id, {
      t: 'hub.updated',
      body: { hub }
    })
  }

  handleHubDelete(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const user = this.authService.getUser(connection.userId)
    const { hub_id } = msg.body || {}
    const audienceConnectionIds = this.getHubAudienceConnectionIds(hub_id)
    const result = this.hubService.deleteHub({
      hubId: hub_id,
      userId: connection.userId,
      roles: user?.roles || []
    })

    this.send(connectionId, {
      t: 'hub.deleted',
      reply_to: msg.id,
      ok: true,
      body: result
    })

    for (const audienceConnectionId of audienceConnectionIds) {
      if (audienceConnectionId === connectionId) {
        continue
      }
      this.send(audienceConnectionId, {
        t: 'hub.deleted',
        ok: true,
        body: result
      })
    }
  }

  /**
   * Broadcast a hub message to all authenticated clients who can access this hub
   * @param {string} hubId
   * @param {Object} payload
   */
  broadcastHub(hubId, payload) {
    const hub = this.hubService.getHub(hubId)
    if (!hub || hub.deleted_at) {
      return
    }

    const rolesByUserId = new Map()
    for (const [connectionId, connection] of this.connections.entries()) {
      if (!connection.userId) {
        continue
      }

      if (!rolesByUserId.has(connection.userId)) {
        const user = this.authService.getUser(connection.userId)
        rolesByUserId.set(connection.userId, user?.roles || [])
      }

      const roles = rolesByUserId.get(connection.userId)
      if (this.hubService.canAccessHub(hubId, connection.userId, roles)) {
        this.send(connectionId, payload)
      }
    }
  }

  getHubAudienceConnectionIds(hubId) {
    const audience = []
    const rolesByUserId = new Map()

    for (const [connectionId, connection] of this.connections.entries()) {
      if (!connection.userId) {
        continue
      }

      if (!rolesByUserId.has(connection.userId)) {
        const user = this.authService.getUser(connection.userId)
        rolesByUserId.set(connection.userId, user?.roles || [])
      }

      const roles = rolesByUserId.get(connection.userId)
      if (this.hubService.canAccessHub(hubId, connection.userId, roles)) {
        audience.push(connectionId)
      }
    }

    return audience
  }

  getChannelAudienceConnectionIds(channelId) {
    const audience = []
    const rolesByUserId = new Map()

    for (const [connectionId, connection] of this.connections.entries()) {
      if (!connection.userId) {
        continue
      }

      if (!rolesByUserId.has(connection.userId)) {
        const user = this.authService.getUser(connection.userId)
        rolesByUserId.set(connection.userId, user?.roles || [])
      }

      const roles = rolesByUserId.get(connection.userId)
      if (this.channelService.canAccessChannel(channelId, connection.userId, roles)) {
        audience.push(connectionId)
      }
    }

    return audience
  }

  handleChannelList(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const user = this.authService.getUser(connection.userId)
    const { hub_id } = msg.body || {}
    const channels = this.channelService.listChannels(connection.userId, user?.roles || [], hub_id)
    this.send(connectionId, {
      t: 'channel.list_result',
      reply_to: msg.id,
      ok: true,
      body: { channels, hub_id }
    })
  }

  handleChannelCreate(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const user = this.authService.getUser(connection.userId)
    const { hub_id, kind, name, topic, visibility } = msg.body || {}
    
    // If no hub_id provided or 'default' requested, ensure default hub exists
    let hubId = hub_id
    if (!hubId || hubId === 'default') {
      const defaultHub = this.hubService.ensureDefaultHub(connection.userId)
      hubId = defaultHub.hub_id
    }
    
    const channel = this.channelService.createChannel({
      hubId,
      kind,
      name,
      topic,
      visibility,
      createdByUserId: connection.userId,
      userRoles: user?.roles || []
    })
    this.send(connectionId, {
      t: 'channel.created',
      reply_to: msg.id,
      ok: true,
      body: { channel }
    })
    const audienceConnectionIds = this.getChannelAudienceConnectionIds(channel.channel_id)
    for (const audienceConnectionId of audienceConnectionIds) {
      if (audienceConnectionId === connectionId) {
        continue
      }
      this.send(audienceConnectionId, {
        t: 'channel.created',
        ok: true,
        body: { channel }
      })
    }
  }

  handleChannelUpdate(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const user = this.authService.getUser(connection.userId)
    const { channel_id, name, topic } = msg.body || {}
    const channel = this.channelService.updateChannel({
      channelId: channel_id,
      userId: connection.userId,
      roles: user?.roles || [],
      name,
      topic
    })
    this.send(connectionId, {
      t: 'channel.updated',
      reply_to: msg.id,
      ok: true,
      body: { channel }
    })
    const audienceConnectionIds = this.getChannelAudienceConnectionIds(channel.channel_id)
    for (const audienceConnectionId of audienceConnectionIds) {
      if (audienceConnectionId === connectionId) {
        continue
      }
      this.send(audienceConnectionId, {
        t: 'channel.updated',
        ok: true,
        body: { channel }
      })
    }
  }

  handleChannelDelete(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const user = this.authService.getUser(connection.userId)
    const { channel_id } = msg.body || {}
    const audienceConnectionIds = this.getChannelAudienceConnectionIds(channel_id)
    const result = this.channelService.deleteChannel({
      channelId: channel_id,
      userId: connection.userId,
      roles: user?.roles || []
    })

    this.send(connectionId, {
      t: 'channel.deleted',
      reply_to: msg.id,
      ok: true,
      body: result
    })

    for (const audienceConnectionId of audienceConnectionIds) {
      if (audienceConnectionId === connectionId) {
        continue
      }
      this.send(audienceConnectionId, {
        t: 'channel.deleted',
        ok: true,
        body: result
      })
    }
  }

  handleChannelJoin(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const user = this.authService.getUser(connection.userId)
    const { channel_id } = msg.body || {}
    const result = this.channelService.joinChannel({
      channelId: channel_id,
      userId: connection.userId,
      userRoles: user?.roles || []
    })
    this.presenceService.joinChannel(connectionId, channel_id)

    this.send(connectionId, {
      t: 'channel.member_event',
      ok: true,
      body: {
        channel_id,
        kind: 'join',
        actor_user_id: connection.userId,
        target_user_id: connection.userId
      }
    })

    return result
  }

  handleChannelLeave(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const { channel_id } = msg.body || {}
    this.channelService.leaveChannel({ channelId: channel_id, userId: connection.userId })
    this.presenceService.leaveChannel(connectionId, channel_id)

    this.send(connectionId, {
      t: 'channel.member_event',
      ok: true,
      body: {
        channel_id,
        kind: 'leave',
        actor_user_id: connection.userId,
        target_user_id: connection.userId
      }
    })
  }

  handleChannelInviteCreate(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const { channel_id, ttl_ms, max_uses } = msg.body || {}
    const invite = this.channelService.createChannelInvite({
      channelId: channel_id,
      createdByUserId: connection.userId,
      ttlMs: ttl_ms,
      maxUses: max_uses
    })

    this.send(connectionId, {
      t: 'channel.invite',
      reply_to: msg.id,
      ok: true,
      body: {
        channel_id,
        invite_token: invite.inviteToken,
        expires_at: invite.expiresAt,
        max_uses: invite.maxUses
      }
    })
  }

  handleChannelAddMember(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const { channel_id, target_user_id } = msg.body || {}
    const result = this.channelService.addMember({
      channelId: channel_id,
      createdByUserId: connection.userId,
      targetUserId: target_user_id
    })

    this.send(connectionId, {
      t: 'channel.member_added',
      reply_to: msg.id,
      ok: true,
      body: result
    })

    // Notify the newly added member about the channel in real-time
    const channel = this.channelService.getChannel(channel_id)
    if (channel) {
      for (const [, conn] of this.connections) {
        if (conn.userId === target_user_id) {
          this.send(conn.connectionId, {
            t: 'channel.added',
            ok: true,
            body: {
              channel_id: channel.channel_id,
              hub_id: channel.hub_id,
              kind: channel.kind,
              name: channel.name,
              topic: channel.topic,
              visibility: channel.visibility
            }
          })
        }
      }
    }
  }

  handleMsgSend(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const { channel_id, client_msg_id, text } = msg.body || {}
    const result = this.messageService.sendMessage({
      channelId: channel_id,
      userId: connection.userId,
      text,
      clientMsgId: client_msg_id
    })

    this.send(connectionId, {
      t: 'msg.ack',
      reply_to: msg.id,
      ok: true,
      body: {
        channel_id,
        client_msg_id,
        msg_id: result.msg_id,
        seq: result.seq
      }
    })

    // Get user handle for the broadcast
    const user = this.authService.getUser(connection.userId)
    const userHandle = user?.handle || connection.userId

    const payload = {
      t: 'msg.event',
      ok: true,
      body: {
        channel_id,
        msg: {
          msg_id: result.msg_id,
          seq: result.seq,
          user_id: connection.userId,
          user_handle: userHandle,
          ts: result.ts,
          text: text.trim()
        }
      }
    }

    this.broadcastChannel(channel_id, payload)
  }

  handleMsgList(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const { channel_id, after_seq, limit } = msg.body || {}
    const result = this.messageService.listMessages({
      channelId: channel_id,
      userId: connection.userId,
      afterSeq: after_seq || 0,
      limit: limit || 200
    })

    this.send(connectionId, {
      t: 'msg.list_result',
      reply_to: msg.id,
      ok: true,
      body: {
        channel_id,
        messages: result.messages,
        next_after_seq: result.next_after_seq
      }
    })
  }

  handleSearchQuery(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const { scope, q, limit } = msg.body || {}
    if (!scope || scope.kind !== 'channel') {
      throw new ServiceError('BAD_REQUEST', 'Search scope required')
    }
    if (!this.channelService.isMember(scope.channel_id, connection.userId)) {
      throw new ServiceError('FORBIDDEN', 'Not a member of channel')
    }
    const hits = this.searchService.searchMessages({ channelId: scope.channel_id, query: q, limit: limit || 50 })
    this.send(connectionId, {
      t: 'search.result',
      reply_to: msg.id,
      ok: true,
      body: { hits }
    })
  }

  handleUserSearch(connectionId, msg) {
    const { q, limit } = msg.body || {}
    if (!q || q.trim().length === 0) {
      throw new ServiceError('BAD_REQUEST', 'Search query required')
    }
    const users = this.db.prepare(
      `
        SELECT u.user_id, u.handle, u.display_name
        FROM users u
        WHERE (
          u.handle LIKE ?
          OR u.display_name LIKE ?
        )
        LIMIT ?
      `
    ).all(`%${q}%`, `%${q}%`, limit || 10)
    
    const formattedUsers = users.map(u => ({
      user_id: u.user_id,
      profile: {
        handle: u.handle,
        display_name: u.display_name
      }
    }))

    this.send(connectionId, {
      t: 'user.search_result',
      reply_to: msg.id,
      ok: true,
      body: { users: formattedUsers }
    })
  }

  handlePresenceSubscribe(connectionId, msg) {
    const users = this.presenceService.listOnlineUsers()
    this.send(connectionId, {
      t: 'presence.snapshot',
      reply_to: msg.id,
      ok: true,
      body: { users }
    })
  }

  handleRtcCallCreate(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const { channel_id, kind } = msg.body || {}
    if (!this.channelService.isMember(channel_id, connection.userId)) {
      throw new ServiceError('FORBIDDEN', 'Not a member of channel')
    }
    const call = this.signalingService.createCall({ roomId: channel_id, createdByUserId: connection.userId, topology: kind || 'mesh' })
    const ice = this.getIceConfig()

    this.send(connectionId, {
      t: 'rtc.call',
      reply_to: msg.id,
      ok: true,
      body: {
        call_id: call.call_id,
        channel_id,
        ice,
        topology: call.topology
      }
    })

    this.broadcastChannel(channel_id, {
      t: 'rtc.call_event',
      ok: true,
      body: {
        channel_id,
        call_id: call.call_id,
        event: 'created'
      }
    })
  }

  handleRtcJoin(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const { call_id } = msg.body || {}
    const call = this.signalingService.getCall(call_id)
    if (!call) {
      throw new ServiceError('NOT_FOUND', 'Call not found')
    }
    if (!this.channelService.isMember(call.room_id, connection.userId)) {
      throw new ServiceError('FORBIDDEN', 'Not a member of channel')
    }

    if (connection.peerId && connection.callId) {
      const existingCall = this.signalingService.getCall(connection.callId)
      const existingPeer = existingCall?.peers.get(connection.peerId)
      if (connection.callId === call_id && existingPeer) {
        this.send(connectionId, {
          t: 'rtc.participants',
          reply_to: msg.id,
          ok: true,
          body: {
            call_id,
            self_peer_id: connection.peerId,
            ice: this.getIceConfig(),
            peers: Array.from(existingCall.peers.values()).map((peer) => ({
              peer_id: peer.peer_id,
              user_id: peer.user_id
            }))
          }
        })
        return
      }

      this.peerConnections.delete(connection.peerId)
      const leaveResult = this.signalingService.leaveCall({ callId: connection.callId, peerId: connection.peerId })
      if (leaveResult.removed) {
        this.broadcastCall(connection.callId, {
          t: 'rtc.peer_event',
          ok: true,
          body: {
            call_id: connection.callId,
            kind: 'leave',
            peer: { peer_id: connection.peerId, user_id: connection.userId }
          }
        })
      }
      if (leaveResult.ended && leaveResult.room_id) {
        this.broadcastChannel(leaveResult.room_id, {
          t: 'rtc.call_end',
          ok: true,
          body: {
            call_id: connection.callId,
            channel_id: leaveResult.room_id
          }
        })
      }
    }

    const result = this.signalingService.joinCall({ callId: call_id, userId: connection.userId })
    connection.peerId = result.peerId
    connection.callId = call_id
    this.peerConnections.set(result.peerId, connectionId)

    this.send(connectionId, {
      t: 'rtc.participants',
      reply_to: msg.id,
      ok: true,
      body: {
        call_id,
        self_peer_id: result.peerId,
        ice: this.getIceConfig(),
        peers: result.peers
      }
    })

    this.broadcastCall(call_id, {
      t: 'rtc.peer_event',
      ok: true,
      body: {
        call_id,
        kind: 'join',
        peer: { peer_id: result.peerId, user_id: connection.userId }
      }
    })
  }

  handleRtcOffer(connectionId, msg) {
    this.validateSignalingSize(msg)
    const connection = this.connections.get(connectionId)
    const { call_id, to_peer_id, from_peer_id, sdp } = msg.body || {}
    this.validateSdp(sdp)
    this.ensurePeerMatch(connection, from_peer_id, call_id)
    this.signalingService.routeOffer({ callId: call_id, fromPeerId: from_peer_id, toPeerId: to_peer_id, sdp })
  }

  handleRtcAnswer(connectionId, msg) {
    this.validateSignalingSize(msg)
    const connection = this.connections.get(connectionId)
    const { call_id, to_peer_id, from_peer_id, sdp } = msg.body || {}
    this.validateSdp(sdp)
    this.ensurePeerMatch(connection, from_peer_id, call_id)
    this.signalingService.routeAnswer({ callId: call_id, fromPeerId: from_peer_id, toPeerId: to_peer_id, sdp })
  }

  handleRtcIce(connectionId, msg) {
    this.validateSignalingSize(msg)
    const connection = this.connections.get(connectionId)
    const { call_id, to_peer_id, from_peer_id, candidate } = msg.body || {}
    this.ensurePeerMatch(connection, from_peer_id, call_id)
    this.signalingService.routeIce({ callId: call_id, fromPeerId: from_peer_id, toPeerId: to_peer_id, candidate })
  }

  handleRtcStreamPublish(connectionId, msg) {
    this.validateSignalingSize(msg)
    const connection = this.connections.get(connectionId)
    const { call_id, peer_id, stream } = msg.body || {}
    this.ensurePeerMatch(connection, peer_id, call_id)
    this.broadcastCall(call_id, {
      t: 'rtc.stream_event',
      ok: true,
      body: {
        call_id,
        peer_id,
        event: 'published',
        stream
      }
    })
  }

  handleRtcLeave(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const { call_id, peer_id } = msg.body || {}
    this.ensurePeerMatch(connection, peer_id, call_id)
    const result = this.signalingService.leaveCall({ callId: call_id, peerId: peer_id })
    this.peerConnections.delete(peer_id)
    connection.peerId = null
    connection.callId = null
    if (result.removed) {
      this.broadcastCall(call_id, {
        t: 'rtc.peer_event',
        ok: true,
        body: {
          call_id,
          kind: 'leave',
          peer: { peer_id, user_id: connection.userId }
        }
      })
    }
    if (result.ended && result.room_id) {
      this.broadcastChannel(result.room_id, {
        t: 'rtc.call_end',
        ok: true,
        body: {
          call_id,
          channel_id: result.room_id
        }
      })
    }
  }

  handleRtcEndCall(connectionId, msg) {
    const connection = this.connections.get(connectionId)
    const { call_id } = msg.body || {}
    const call = this.signalingService.getCall(call_id)
    if (!call) {
      throw new ServiceError('NOT_FOUND', 'Call not found')
    }
    const isAdmin = this.authService.getUser(connection.userId)?.roles?.includes('admin')
    const member = this.channelService.getMembership(call.room_id, connection.userId)
    const canEnd = isAdmin || ['owner', 'mod'].includes(member?.role)
    if (!canEnd) {
      throw new ServiceError('FORBIDDEN', 'Not allowed to end call')
    }

    const ended = this.signalingService.endCall({ callId: call_id })
    if (!ended) {
      return
    }

    for (const peer of ended.peers) {
      const connId = this.peerConnections.get(peer.peer_id)
      if (connId) {
        this.send(connId, {
          t: 'rtc.call_end',
          ok: true,
          body: {
            call_id,
            channel_id: ended.room_id
          }
        })
      }
    }

    for (const peer of ended.peers) {
      const connId = this.peerConnections.get(peer.peer_id)
      if (connId) {
        const conn = this.connections.get(connId)
        if (conn) {
          conn.peerId = null
          conn.callId = null
        }
      }
      this.peerConnections.delete(peer.peer_id)
    }

    this.broadcastChannel(ended.room_id, {
      t: 'rtc.call_end',
      ok: true,
      body: {
        call_id,
        channel_id: ended.room_id
      }
    })
  }

  setConnectionUser(connectionId, user, sessionId) {
    const connection = this.connections.get(connectionId)
    if (!connection) {
      return
    }
    connection.userId = user.user_id
    connection.sessionId = sessionId
    this.connections.set(connectionId, connection)
    this.addUserConnection(user.user_id, connectionId)
    this.presenceService.addConnection(connectionId, user.user_id)
  }

  ensurePeerMatch(connection, peerId, callId) {
    if (!connection) {
      throw new ServiceError('AUTH_REQUIRED', 'Connection not found')
    }
    if (connection.peerId !== peerId || connection.callId !== callId) {
      throw new ServiceError('FORBIDDEN', 'Peer mismatch')
    }
  }

  validateSignalingSize(msg) {
    const maxBytes = 64000
    const bodySize = Buffer.byteLength(JSON.stringify(msg.body || {}))
    if (bodySize > maxBytes) {
      throw new ServiceError('BAD_REQUEST', 'Signaling payload too large')
    }
  }

  validateSdp(sdp) {
    if (typeof sdp !== 'string' || !sdp.trim().startsWith('v=')) {
      throw new ServiceError('BAD_REQUEST', 'Invalid SDP payload')
    }
  }

  handleSignalingEvent(event) {
    const toPeerId = event.body?.to_peer_id
    if (!toPeerId) {
      return
    }
    const connectionId = this.peerConnections.get(toPeerId)
    if (!connectionId) {
      return
    }
    this.send(connectionId, event)
  }

  getIceConfig() {
    const stunUrls = (process.env.STUN_URLS || 'stun:stun.l.google.com:19302')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean)
    const turnUrls = (process.env.TURN_URLS || '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean)
    const turnUsername = process.env.TURN_USERNAME || null
    const turnCredential = process.env.TURN_CREDENTIAL || null

    return {
      stun_urls: stunUrls,
      turn_urls: turnUrls,
      turn_username: turnUsername,
      turn_credential: turnCredential
    }
  }

  addUserConnection(userId, connectionId) {
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set())
    }
    this.userConnections.get(userId).add(connectionId)
  }

  removeUserConnection(userId, connectionId) {
    if (!this.userConnections.has(userId)) {
      return
    }
    const set = this.userConnections.get(userId)
    set.delete(connectionId)
    if (set.size === 0) {
      this.userConnections.delete(userId)
    }
  }

  broadcastChannel(channelId, payload) {
    const members = this.channelService.listChannelMembers(channelId)
    for (const member of members) {
      const connectionIds = this.userConnections.get(member.user_id)
      if (!connectionIds) {
        continue
      }
      for (const connectionId of connectionIds) {
        this.send(connectionId, payload)
      }
    }
  }

  broadcastCall(callId, payload) {
    const call = this.signalingService.getCall(callId)
    if (!call) {
      return
    }
    for (const peer of call.peers.values()) {
      const connectionId = this.peerConnections.get(peer.peer_id)
      if (connectionId) {
        this.send(connectionId, payload)
      }
    }
  }

  send(connectionId, payload) {
    const connection = this.connections.get(connectionId)
    if (!connection) {
      return
    }
    const message = {
      v: 1,
      id: newId('s'),
      ts: Date.now(),
      ...payload
    }
    connection.ws.send(JSON.stringify(message))
  }

  sendStreamControl(streamConnectionId, payload) {
    const connection = this.streamControlConnections.get(streamConnectionId)
    if (!connection) {
      return
    }
    connection.ws.send(
      JSON.stringify({
        v: 1,
        id: newId('stream_s'),
        ts: Date.now(),
        ...payload
      })
    )
  }

  sendStreamMedia(streamConnectionId, payload) {
    const connection = this.streamMediaConnections.get(streamConnectionId)
    if (!connection) {
      return
    }
    connection.ws.send(
      JSON.stringify({
        v: 1,
        id: newId('stream_m_s'),
        ts: Date.now(),
        ...payload
      })
    )
  }

  sendStreamBinary(streamConnectionId, data) {
    const connection = this.streamMediaConnections.get(streamConnectionId)
    if (!connection) {
      return
    }
    connection.ws.send(data, { binary: true })
  }

  broadcastStreamControl(stream, payload) {
    const broadcasterId = this.streamBroadcasters.get(stream)
    if (broadcasterId) {
      this.sendStreamControl(broadcasterId, payload)
    }
    const viewers = this.streamControlViewers.get(stream)
    if (!viewers) {
      return
    }
    for (const viewerId of viewers) {
      this.sendStreamControl(viewerId, payload)
    }
  }

  getStreamState(stream) {
    const state = this.streamStates.get(stream) || {
      state: 'idle',
      started_at: null,
      ended_at: null
    }
    return {
      stream,
      state: state.state,
      started_at: state.started_at,
      ended_at: state.ended_at,
      broadcaster_present: this.streamBroadcasters.has(stream)
    }
  }

  updateStreamState(stream, nextState) {
    const now = Date.now()
    const current = this.streamStates.get(stream) || {
      state: 'idle',
      started_at: null,
      ended_at: null
    }
    if (nextState === 'live') {
      current.state = 'live'
      if (!current.started_at) {
        current.started_at = now
      }
      current.ended_at = null
    } else {
      current.state = 'idle'
      current.ended_at = now
    }
    this.streamStates.set(stream, current)
    this.broadcastStreamControl(stream, {
      t: 'stream.state',
      body: this.getStreamState(stream)
    })
  }

  sendStream(streamConnectionId, payload) {
    if (this.streamControlConnections.has(streamConnectionId)) {
      this.sendStreamControl(streamConnectionId, payload)
      return
    }
    if (this.streamMediaConnections.has(streamConnectionId)) {
      this.sendStreamMedia(streamConnectionId, payload)
    }
  }

  sendError(connectionId, replyTo, code, message, details = null) {
    this.send(connectionId, {
      t: 'error',
      reply_to: replyTo,
      ok: false,
      body: { code, message, details }
    })
  }
}
