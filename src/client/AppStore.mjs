const createInitialState = () => ({
  ws: null,
  sessionToken: localStorage.getItem('session_token') || null,
  user: null,
  hubs: [],
  channels: [],
  currentHubId: null,
  currentChannelId: null,
  selectedHubIdForChannelCreation: null,
  messages: new Map(),
  callId: null,
  callChannelId: null,
  selfPeerId: null,
  peerConnections: new Map(),
  ice: null,
  audioStream: null,
  videoStream: null,
  screenStream: null,
  streamTiles: new Map(),
  streamTilePruneTimers: new Map(),
  remoteAudioEls: new Map(),
  remoteInboundStreamsByPeer: new Map(),
  pendingIceByPeer: new Map(),
  pendingAuthRequest: null,
  channelCallMap: new Map(),
  toastTimer: null,
  voiceActive: false,
  sidebarMenuOpen: false,
  micMuted: false,
  selectedAudioInputId: localStorage.getItem('media.audio_input_id') || '',
  selectedVideoInputId: localStorage.getItem('media.video_input_id') || '',
  textChatDrawerOpen: false,
  reconnectTimer: null,
  wsConnectTimer: null,
  reconnectAttempts: 0,
  lastSocketEvent: 'init',
  lastSocketError: ''
})

class AppStore {
  constructor(initialState = createInitialState()) {
    this.state = initialState
    this.listeners = new Set()
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(event, payload = {}) {
    this.listeners.forEach((listener) => {
      listener(event, payload, this.state)
    })
  }

  dispatch(action) {
    switch (action?.type) {
      case 'auth/set': {
        this.state.user = action.user ?? null
        if (action.sessionToken !== undefined) {
          this.state.sessionToken = action.sessionToken
        }
        this.emit('auth:updated', { user: this.state.user, source: action.source || 'dispatch' })
        return
      }
      case 'auth/setPendingRequest': {
        this.state.pendingAuthRequest = action.request || null
        this.emit('auth:pendingRequestUpdated', { hasPending: Boolean(this.state.pendingAuthRequest) })
        return
      }
      case 'hubs/set': {
        this.state.hubs = action.hubs || []
        this.emit('hubs:updated', { count: this.state.hubs.length })
        return
      }
      case 'hubs/upsert': {
        const hub = action.hub
        if (!hub?.hub_id) {
          return
        }
        const hubIndex = this.state.hubs.findIndex((entry) => entry.hub_id === hub.hub_id)
        if (hubIndex === -1) {
          this.state.hubs.push(hub)
        } else {
          this.state.hubs[hubIndex] = hub
        }
        this.emit('hubs:updated', { count: this.state.hubs.length })
        return
      }
      case 'hubs/remove': {
        if (!action.hubId) {
          return
        }
        this.state.hubs = this.state.hubs.filter((hub) => hub.hub_id !== action.hubId)
        this.emit('hubs:updated', { count: this.state.hubs.length })
        return
      }
      case 'hubs/updated': {
        this.emit('hubs:updated', { count: this.state.hubs.length })
        return
      }
      case 'channels/set': {
        this.state.channels = action.channels || []
        this.emit('channels:updated', { count: this.state.channels.length })
        return
      }
      case 'channels/upsert': {
        const channel = action.channel
        if (!channel?.channel_id) {
          return
        }
        const channelIndex = this.state.channels.findIndex((entry) => entry.channel_id === channel.channel_id)
        if (channelIndex === -1) {
          this.state.channels.push(channel)
        } else {
          this.state.channels[channelIndex] = channel
        }
        this.emit('channels:updated', { count: this.state.channels.length })
        return
      }
      case 'channels/remove': {
        if (!action.channelId) {
          return
        }
        this.state.channels = this.state.channels.filter((channel) => channel.channel_id !== action.channelId)
        this.emit('channels:updated', { count: this.state.channels.length })
        return
      }
      case 'channels/removeByHub': {
        if (!action.hubId) {
          return
        }
        this.state.channels = this.state.channels.filter((channel) => channel.hub_id !== action.hubId)
        this.emit('channels:updated', { count: this.state.channels.length })
        return
      }
      case 'channels/updated': {
        this.emit('channels:updated', { count: this.state.channels.length })
        return
      }
      case 'channels/setCurrent': {
        this.state.currentChannelId = action.channelId ?? null
        this.emit('channels:updated', { count: this.state.channels.length })
        return
      }
      case 'channels/setSelectedHubForCreation': {
        this.state.selectedHubIdForChannelCreation = action.hubId ?? null
        this.emit('channels:selectedHubUpdated', { hubId: this.state.selectedHubIdForChannelCreation })
        return
      }
      case 'messages/set': {
        if (!action.channelId) {
          return
        }
        this.state.messages.set(action.channelId, action.messages || [])
        this.emit('messages:updated', { channelId: action.channelId })
        return
      }
      case 'messages/append': {
        if (!action.channelId || !action.message) {
          return
        }
        if (!this.state.messages.has(action.channelId)) {
          this.state.messages.set(action.channelId, [])
        }
        this.state.messages.get(action.channelId).push(action.message)
        this.emit('messages:updated', { channelId: action.channelId })
        return
      }
      case 'messages/deleteChannel': {
        if (!action.channelId) {
          return
        }
        this.state.messages.delete(action.channelId)
        this.emit('messages:updated', { channelId: action.channelId })
        return
      }
      case 'messages/updated': {
        if (!action.channelId) {
          return
        }
        this.emit('messages:updated', { channelId: action.channelId })
        return
      }
      case 'search/set': {
        this.emit('search:updated', { hits: action.hits || [] })
        return
      }
      case 'ui/setTextChatDrawerOpen': {
        this.state.textChatDrawerOpen = Boolean(action.open)
        this.emit('ui:textChatDrawerUpdated', { open: this.state.textChatDrawerOpen })
        return
      }
      case 'ws/setSocket': {
        this.state.ws = action.ws || null
        this.emit('ws:socketUpdated', { hasSocket: Boolean(this.state.ws) })
        return
      }
      case 'ws/setStatusEvent': {
        this.state.lastSocketEvent = action.event || ''
        this.state.lastSocketError = action.error || ''
        if (action.reconnectAttempts !== undefined) {
          this.state.reconnectAttempts = action.reconnectAttempts
        }
        this.emit('ws:statusUpdated', {
          event: this.state.lastSocketEvent,
          error: this.state.lastSocketError,
          reconnectAttempts: this.state.reconnectAttempts
        })
        return
      }
      case 'call/updated': {
        this.emit('call:updated', { source: action.source || 'dispatch' })
        return
      }
      case 'call/mapSet': {
        if (!action.channelId || !action.callId) {
          return
        }
        this.state.channelCallMap.set(action.channelId, action.callId)
        this.emit('call:updated', { source: action.source || 'dispatch' })
        return
      }
      case 'call/mapDelete': {
        if (!action.channelId) {
          return
        }
        this.state.channelCallMap.delete(action.channelId)
        this.emit('call:updated', { source: action.source || 'dispatch' })
        return
      }
      case 'call/sessionSet': {
        if (action.callId !== undefined) {
          this.state.callId = action.callId
        }
        if (action.callChannelId !== undefined) {
          this.state.callChannelId = action.callChannelId
        }
        if (action.ice !== undefined) {
          this.state.ice = action.ice
        }
        if (action.selfPeerId !== undefined) {
          this.state.selfPeerId = action.selfPeerId
        }
        if (action.voiceActive !== undefined) {
          this.state.voiceActive = action.voiceActive
        }
        this.emit('call:updated', { source: action.source || 'dispatch' })
        return
      }
      default:
        return
    }
  }

  getChannelById(channelId) {
    return this.state.channels.find((channel) => channel.channel_id === channelId) || null
  }

  isVoiceChannel(channelId) {
    return this.getChannelById(channelId)?.kind === 'voice'
  }
}

export { AppStore, createInitialState }
