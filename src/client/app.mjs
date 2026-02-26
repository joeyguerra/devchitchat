import { WsClient } from './WsClient.mjs'
import { RtcCallService } from './RtcCallService.mjs'
import { AppStore, createInitialState } from './AppStore.mjs'
import { EventBus } from './EventBus.mjs'
import { CallControlsPresenter } from './CallControlsPresenter.mjs'
import { AuthPresenter } from './AuthPresenter.mjs'
import { SidebarPresenter } from './SidebarPresenter.mjs'
import { SidebarTreePresenter } from './SidebarTreePresenter.mjs'
import { MessagePresenter } from './MessagePresenter.mjs'
import { CallStateService } from './CallStateService.mjs'
import { ClientStateService } from './ClientStateService.mjs'
import { getOrCreateInboundStream as resolveInboundStream } from './RtcInboundStream.mjs'

/**
 * Centralized application state
 * @type {Object}
 */
const store = new AppStore(createInitialState())
const state = store.state
const eventBus = new EventBus()

/**
 * DOM query selector shorthand
 * @param {string} selector - CSS selector
 * @returns {Element|null}
 */
const qs = (selector) => document.querySelector(selector)

/**
 * DOM elements for easy reference
 * @type {Object}
 */
const dom = {
  status: qs('#status'),
  userPill: qs('#user-pill'),
  logoutBtn: qs('#logout-btn'),
  authCard: qs('#auth-card'),
  authHint: qs('#auth-hint'),
  signupTab: qs('#signup-tab'),
  signinTab: qs('#signin-tab'),
  signupForm: qs('#signup-form'),
  signinForm: qs('#signin-form'),
  inviteInput: qs('#invite'),
  handleInput: qs('#handle'),
  signupPasswordInput: qs('#signup-password'),
  signinHandleInput: qs('#signin-handle'),
  signinPasswordInput: qs('#signin-password'),
  redeemBtn: qs('#redeem'),
  signinBtn: qs('#signin-btn'),
  signinHint: qs('#signin-hint'),
  toast: qs('#toast'),
  mobileDiagnostics: qs('#mobile-diagnostics'),
  activeCallBar: qs('#active-call-bar'),
  callBarChannelLabel: qs('#call-bar-channel-label'),
  callBarParticipants: qs('#call-bar-participants'),
  callBarMicToggleBtn: qs('#call-bar-mic-toggle'),
  callBarCameraToggleBtn: qs('#call-bar-camera-toggle'),
  callBarScreenToggleBtn: qs('#call-bar-screen-toggle'),
  callBarDeviceSettingsBtn: qs('#call-bar-device-settings'),
  callBarOpenStageBtn: qs('#call-bar-open-stage'),
  callBarLeaveBtn: qs('#call-bar-leave'),
  callBarEndCallBtn: qs('#call-bar-end-call'),
  layout: qs('.layout'),
  chatCard: qs('.chat'),
  mobileMenuBtn: qs('#mobile-menu-btn'),
  sidebar: qs('#sidebar-menu'),
  sidebarResizer: qs('#sidebar-resizer'),
  sidebarOverlay: qs('#sidebar-overlay'),
  adminPanel: qs('#admin-panel'),
  hubsList: qs('#hubs-list'),
  activeRoom: qs('#active-room'),
  messages: qs('#messages'),
  searchResults: qs('#search-results'),
  streams: qs('#streams'),
  streamsEmpty: qs('#streams-empty'),
  textChatToggle: qs('#text-chat-toggle'),
  textChatClose: qs('#text-chat-close'),
  textChatDrawer: qs('#text-chat-drawer'),
  adminInvite: qs('#admin-invite'),
  adminInviteSide: qs('#admin-invite-side'),
  createAdminInviteSideBtn: qs('#create-admin-invite-side'),
  createHubBtn: qs('#create-hub-btn'),
  createHubModal: qs('#create-hub-modal'),
  closeCreateHubModalBtn: qs('#close-create-hub-modal'),
  modalHubName: qs('#modal-hub-name'),
  modalHubDescription: qs('#modal-hub-description'),
  modalHubVisibility: qs('#modal-hub-visibility'),
  modalCreateHubBtn: qs('#modal-create-hub'),
  modalHubCancelBtn: qs('#modal-hub-cancel'),
  addMemberBtn: qs('#add-member'),
  editChannelBtn: qs('#edit-channel-btn'),
  voiceHint: qs('#voice-hint'),
  joinVoiceModal: qs('#join-voice-modal'),
  joinVoiceCloseBtn: qs('#join-voice-close'),
  joinVoiceChannelName: qs('#join-voice-channel-name'),
  joinMutedBtn: qs('#join-muted'),
  joinWithMicBtn: qs('#join-with-mic'),
  joinCancelBtn: qs('#join-cancel'),
  deviceSettingsModal: qs('#device-settings-modal'),
  deviceSettingsCloseBtn: qs('#device-settings-close'),
  deviceSettingsRefreshBtn: qs('#device-settings-refresh'),
  deviceSettingsDoneBtn: qs('#device-settings-done'),
  audioInputSelect: qs('#audio-input-select'),
  videoInputSelect: qs('#video-input-select'),
  roomNameInput: qs('#room-name'),
  roomKindSelect: qs('#room-kind'),
  createRoomModal: qs('#create-room-modal'),
  channelModalTitle: qs('#channel-modal-title'),
  closeCreateRoomModalBtn: qs('#close-create-room-modal'),
  modalCancelBtn: qs('#modal-cancel'),
  modalCreateRoomBtn: qs('#modal-create-room'),
  modalRoomName: qs('#modal-room-name'),
  modalRoomKind: qs('#modal-room-kind'),
  modalRoomVisibility: qs('#modal-room-visibility'),
  modalHubSelect: qs('#modal-hub-select'),
  addMemberModal: qs('#add-member-modal'),
  closeAddMemberModalBtn: qs('#close-add-member-modal'),
  memberSearchInput: qs('#member-search-input'),
  memberSearchResults: qs('#member-search-results'),
  closeAddMemberBtn: qs('#close-add-member-btn'),
  sendMessageBtn: qs('#send-message'),
  messageInput: qs('#message-input'),
  searchBtn: qs('#search-btn'),
  searchInput: qs('#search-input')
}

const MOBILE_SIDEBAR_BREAKPOINT = 900
const SIDEBAR_WIDTH_STORAGE_KEY = 'ui.sidebar_width'
const SIDEBAR_MIN_WIDTH = 220
const SIDEBAR_MAX_WIDTH = 560
const CENTER_MIN_WIDTH = 420
let wsClient = null
let rtcCallService = null
let callControlsPresenter = null
let authPresenter = null
let sidebarPresenter = null
let sidebarTreePresenter = null
let messagePresenter = null
let callStateService = null
let clientStateService = null
const channelModalState = {
  mode: 'create',
  channelId: null
}
let pendingVoiceJoinChannelId = null

const isMobileViewport = () => window.innerWidth <= MOBILE_SIDEBAR_BREAKPOINT

const setSidebarMenuOpen = (isOpen) => {
  sidebarPresenter.setMenuOpen(isOpen, Boolean(state.user))
}

const clearSidebarWidth = () => {
  if (!dom.layout) {
    return
  }
  dom.layout.style.removeProperty('--sidebar-width')
}

const getSidebarWidthLimits = () => {
  const viewportMax = window.innerWidth - CENTER_MIN_WIDTH
  const max = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, viewportMax))
  return { min: SIDEBAR_MIN_WIDTH, max }
}

const getCurrentSidebarWidth = () => {
  if (!dom.layout || !dom.sidebar) {
    return SIDEBAR_MIN_WIDTH
  }
  const fromStyle = Number.parseInt(dom.layout.style.getPropertyValue('--sidebar-width'), 10)
  if (Number.isFinite(fromStyle)) {
    return fromStyle
  }
  return Math.round(dom.sidebar.getBoundingClientRect().width) || SIDEBAR_MIN_WIDTH
}

const applySidebarWidth = (nextWidth, { persist = true } = {}) => {
  if (!dom.layout) {
    return
  }
  if (isMobileViewport()) {
    clearSidebarWidth()
    return
  }
  const { min, max } = getSidebarWidthLimits()
  const clamped = Math.max(min, Math.min(max, Math.round(nextWidth)))
  dom.layout.style.setProperty('--sidebar-width', `${clamped}px`)
  if (persist) {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped))
  }
}

const setupSidebarResizer = () => {
  if (!dom.sidebarResizer) {
    return
  }

  const syncForViewport = () => {
    if (isMobileViewport()) {
      clearSidebarWidth()
      return
    }
    applySidebarWidth(getCurrentSidebarWidth(), { persist: false })
  }

  const savedWidth = Number.parseInt(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) || '', 10)
  if (Number.isFinite(savedWidth)) {
    applySidebarWidth(savedWidth, { persist: false })
  } else {
    syncForViewport()
  }

  let dragState = null
  const finishDrag = () => {
    dragState = null
    dom.sidebarResizer.classList.remove('is-dragging')
    document.body.classList.remove('sidebar-resizing')
  }

  dom.sidebarResizer.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || isMobileViewport()) {
      return
    }
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: getCurrentSidebarWidth()
    }
    dom.sidebarResizer.classList.add('is-dragging')
    document.body.classList.add('sidebar-resizing')
    if (dom.sidebarResizer.setPointerCapture) {
      dom.sidebarResizer.setPointerCapture(event.pointerId)
    }
    event.preventDefault()
  })

  dom.sidebarResizer.addEventListener('pointermove', (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }
    const deltaX = event.clientX - dragState.startX
    applySidebarWidth(dragState.startWidth + deltaX)
  })

  const pointerStop = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }
    if (dom.sidebarResizer.releasePointerCapture) {
      try {
        dom.sidebarResizer.releasePointerCapture(event.pointerId)
      } catch (error) {
        // ignore releasePointerCapture failures when pointer is already released
      }
    }
    finishDrag()
  }
  dom.sidebarResizer.addEventListener('pointerup', pointerStop)
  dom.sidebarResizer.addEventListener('pointercancel', pointerStop)
  dom.sidebarResizer.addEventListener('lostpointercapture', finishDrag)

  dom.sidebarResizer.addEventListener('keydown', (event) => {
    if (isMobileViewport()) {
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }
    const delta = event.key === 'ArrowLeft' ? -16 : 16
    applySidebarWidth(getCurrentSidebarWidth() + delta)
    event.preventDefault()
  })

  window.addEventListener('resize', syncForViewport)
}

const isVoiceChannel = (channelId) => store.isVoiceChannel(channelId)

callControlsPresenter = new CallControlsPresenter({
  state,
  dom,
  isVoiceChannel
})

authPresenter = new AuthPresenter({ dom })
sidebarPresenter = new SidebarPresenter({ dom, state, isMobileViewport })
sidebarTreePresenter = new SidebarTreePresenter({
  dom,
  state,
  onOpenCreateRoomModal: (hubId) => openCreateRoomModal(hubId),
  onDeleteHub: (hub) => {
    const confirmed = window.confirm(`Delete hub "${hub.name}" and all its channels?`)
    if (!confirmed) {
      return
    }
    send('hub.delete', { hub_id: hub.hub_id })
  },
  onDeleteChannel: (channel) => {
    const confirmed = window.confirm(`Delete channel "${channel.name}"?`)
    if (!confirmed) {
      return
    }
    send('channel.delete', { channel_id: channel.channel_id })
  },
  onSetActiveChannel: (channelId) => setActiveChannel(channelId),
  onUpdateHubName: (hubId, name) => send('hub.update', { hub_id: hubId, name }),
  onUpdateChannelName: (channelId, name) => send('channel.update', { channel_id: channelId, name })
})
messagePresenter = new MessagePresenter({ dom, state })
callStateService = new CallStateService({ store })
clientStateService = new ClientStateService({ store })

const syncTextChatDrawerUi = () => {
  if (!dom.textChatToggle || !dom.textChatDrawer) {
    return
  }
  dom.textChatToggle.textContent = state.textChatDrawerOpen ? '>' : '<'
  dom.textChatToggle.setAttribute('aria-expanded', state.textChatDrawerOpen ? 'true' : 'false')
  dom.textChatDrawer.classList.toggle('open', state.textChatDrawerOpen)
}

const setTextChatDrawerOpen = (isOpen) => {
  clientStateService.setTextChatDrawerOpen(Boolean(isOpen))
  syncTextChatDrawerUi()
}

const updateChannelLayoutMode = () => {
  if (!dom.chatCard) {
    return
  }
  const inVoiceChannel = isVoiceChannel(state.currentChannelId)
  dom.chatCard.classList.toggle('voice-channel', inVoiceChannel)
  dom.chatCard.classList.toggle('text-channel', !inVoiceChannel)
  if (!inVoiceChannel) {
    setTextChatDrawerOpen(false)
  }
}

/**
 * Set connection status text
 * @param {string} text
 */
const setStatus = (text) => {
  dom.status.textContent = text
  renderMobileDiagnostics()
}

const wsReadyStateText = () => {
  if (wsClient) {
    return wsClient.readyStateText()
  }
  if (!state.ws) return 'none'
  switch (state.ws.readyState) {
    case WebSocket.CONNECTING: return 'connecting'
    case WebSocket.OPEN: return 'open'
    case WebSocket.CLOSING: return 'closing'
    case WebSocket.CLOSED: return 'closed'
    default: return 'unknown'
  }
}

const renderMobileDiagnostics = () => {
  return
  if (!dom.mobileDiagnostics) {
    return
  }
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const wsUrl = `${protocol}://${location.host}/ws`
  dom.mobileDiagnostics.textContent = [
    `page: ${location.href}`,
    `secureContext: ${window.isSecureContext}`,
    `ws: ${wsReadyStateText()}`,
    `url: ${wsUrl}`,
    `event: ${state.lastSocketEvent || '-'}`,
    `retries: ${state.reconnectAttempts}`,
    state.lastSocketError ? `error: ${state.lastSocketError}` : ''
  ].filter(Boolean).join('\n')
}

const rtcDebugEnabled = new URLSearchParams(window.location.search).get('rtcdebug') === '1'
let rtcDebugPanel = null

const ensureRtcDebugPanel = () => {
  if (!rtcDebugEnabled || rtcDebugPanel) {
    return
  }
  const panel = document.createElement('pre')
  panel.id = 'rtc-debug-panel'
  panel.style.position = 'fixed'
  panel.style.left = '8px'
  panel.style.right = '8px'
  panel.style.bottom = '8px'
  panel.style.zIndex = '9999'
  panel.style.maxHeight = '35vh'
  panel.style.overflow = 'auto'
  panel.style.margin = '0'
  panel.style.padding = '8px'
  panel.style.background = 'rgba(0, 0, 0, 0.85)'
  panel.style.color = '#9df8a3'
  panel.style.font = '11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
  panel.style.border = '1px solid rgba(157, 248, 163, 0.4)'
  panel.style.borderRadius = '8px'
  panel.textContent = '[RTC] debug overlay enabled (?rtcdebug=1)\n'
  document.body.appendChild(panel)
  rtcDebugPanel = panel
}

const appendRtcDebugLine = (level, message, payload) => {
  if (!rtcDebugEnabled) {
    return
  }
  ensureRtcDebugPanel()
  if (!rtcDebugPanel) {
    return
  }
  const ts = new Date().toISOString().slice(11, 23)
  let payloadText = ''
  if (payload !== undefined) {
    try {
      payloadText = ` ${JSON.stringify(payload)}`
    } catch (error) {
      payloadText = ' [unserializable payload]'
    }
  }
  rtcDebugPanel.textContent += `${ts} ${level} ${message}${payloadText}\n`
  const lines = rtcDebugPanel.textContent.split('\n')
  if (lines.length > 180) {
    rtcDebugPanel.textContent = `${lines.slice(lines.length - 180).join('\n')}\n`
  }
  rtcDebugPanel.scrollTop = rtcDebugPanel.scrollHeight
}

const rtcInfo = (message, payload) => {
  if (payload === undefined) {
    console.info(message)
  } else {
    console.info(message, payload)
  }
  appendRtcDebugLine('INFO', message, payload)
}

const rtcWarn = (message, payload) => {
  if (payload === undefined) {
    console.warn(message)
  } else {
    console.warn(message, payload)
  }
  appendRtcDebugLine('WARN', message, payload)
}

/**
 * Show notification toast (auto-hides after 3.2s)
 * @param {string} text
 */
const showToast = (text) => {
  dom.toast.textContent = text
  dom.toast.classList.add('show')
  window.clearTimeout(state.toastTimer)
  state.toastTimer = window.setTimeout(() => {
    dom.toast.classList.remove('show')
  }, 3200)
}

/**
 * Update UI visibility based on auth state
 */
const setAuthUi = () => {
  authPresenter.render({
    user: state.user,
    onSetSidebarMenuOpen: setSidebarMenuOpen,
    onSetTextChatDrawerOpen: setTextChatDrawerOpen,
    onUpdateChannelLayoutMode: updateChannelLayoutMode,
    onToast: showToast
  })
}

/**
 * Send a message to the server
 * @param {string} messageType - Message type identifier
 * @param {Object} body - Message payload
 */
const buildEnvelope = (messageType, body) => ({
  v: 1,
  t: messageType,
  id: `${messageType}-${Date.now()}`,
  ts: Date.now(),
  body
})

wsClient = new WsClient({
  urlFactory: () => {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    return `${protocol}://${location.host}/ws`
  },
  onSocketCreated: (ws) => {
    clientStateService.setSocket(ws)
  },
  onStatus: (text) => {
    setStatus(text)
  },
  onSocketEvent: (event, errorText) => {
    const reconnectAttempts = event === 'reconnect_scheduled'
      ? wsClient.reconnectAttempts
      : (event === 'open' ? 0 : state.reconnectAttempts)
    clientStateService.setSocketStatus({
      event,
      error: errorText || '',
      reconnectAttempts
    })
    if (event === 'message' || event === 'error' || event === 'connect_timeout') {
      renderMobileDiagnostics()
    }
  },
  onOpen: () => {
    send('hello', {
      client: { name: 'devchitchat-web', ver: '0.1.0', platform: 'browser' },
      resume: { session_token: state.sessionToken }
    })
    flushPendingAuthRequest()
  },
  onClose: () => {
    if (state.pendingAuthRequest) {
      const pendingMsg = 'Still connecting... retrying websocket'
      authPresenter.setAuthMessage(pendingMsg)
    }
  },
  onError: () => {
    renderMobileDiagnostics()
  },
  onMessage: (rawData) => {
    const msg = JSON.parse(rawData)
    eventBus.emit('ws:message', msg)
    handleMessage(msg)
  }
})

const flushPendingAuthRequest = () => {
  if (!wsClient.isOpen()) {
    return
  }
  if (!state.pendingAuthRequest) {
    return
  }
  const pending = state.pendingAuthRequest
  clientStateService.clearPendingAuthRequest()
  wsClient.sendJson(buildEnvelope(pending.messageType, pending.body))
}

const sendAuthRequest = (messageType, body) => {
  if (wsClient.isOpen()) {
    send(messageType, body)
    return
  }
  clientStateService.setPendingAuthRequest({ messageType, body })
  connect()
  const pendingMsg = 'Connecting... sign-in will be sent automatically'
  authPresenter.setAuthMessage(pendingMsg)
  showToast(pendingMsg)
}

const send = (messageType, body) => {
  const envelope = buildEnvelope(messageType, body)
  if (!wsClient.sendJson(envelope)) {
    const message = 'Connection not ready. Please wait...'
    authPresenter.setAuthMessage(message)
    showToast(message)
    return
  }
  eventBus.emit('ws:send', envelope)
}

/**
 * Establish WebSocket connection to server
 */
const connect = () => {
  wsClient.connect()
}

/**
 * Handle authentication success and restore session
 * @param {Object} msg
 */
const handleAuthSession = (msg) => {
  store.dispatch({
    type: 'auth/set',
    user: msg.body.user,
    sessionToken: msg.body.session_token,
    source: 'auth.session'
  })
  localStorage.setItem('session_token', state.sessionToken)
  send('hub.list', {})
  requestChannels()
  showToast('Welcome. You are now signed in')
}

/**
 * Handle error responses from server
 * @param {Object} msg
 */
const handleError = (msg) => {
  const errorMsg = msg.body?.message || 'Server error'
  authPresenter.setAuthMessage(errorMsg)
  showToast(errorMsg)

  if (
    msg.reply_to?.startsWith('rtc.join-') &&
    msg.body?.code === 'NOT_FOUND' &&
    isVoiceChannel(state.currentChannelId)
  ) {
    callStateService.mapDelete(state.currentChannelId, 'rtc.join_not_found')
    ensureVoiceStateForChannel(state.currentChannelId)
    return
  }

  if (msg.body?.message?.includes('Not a member') && state.currentChannelId) {
    send('channel.join', { channel_id: state.currentChannelId })
  }
}

const handleHelloAck = (msg) => {
  if (msg.body?.session?.authenticated) {
    store.dispatch({
      type: 'auth/set',
      user: msg.body.session.user,
      sessionToken: msg.body.session.session_token || state.sessionToken,
      source: 'hello_ack'
    })
    localStorage.setItem('session_token', state.sessionToken)
    send('hub.list', {})
    requestChannels()
  } else {
    store.dispatch({ type: 'auth/set', user: null, source: 'hello_ack' })
  }
}

const handleHubListResult = (msg) => {
  store.dispatch({ type: 'hubs/set', hubs: msg.body.hubs || [] })
}

const handleChannelListResult = (msg) => {
  store.dispatch({ type: 'channels/set', channels: msg.body.channels || [] })
  if (!state.currentChannelId && state.channels.length > 0) {
    setActiveChannel(state.channels[0].channel_id)
  }
  if (state.channels.length === 0 && state.user?.roles?.includes('admin')) {
    send('channel.create', { hub_id: 'default', kind: 'text', name: 'general', visibility: 'public' })
  }
}

const handleAdminInvite = (msg) => {
  dom.adminInviteSide.value = msg.body.invite_token
}

const handleHubCreated = (msg) => {
  const exists = state.hubs.some((hub) => hub.hub_id === msg.body.hub.hub_id)
  if (!exists) {
    store.dispatch({ type: 'hubs/upsert', hub: msg.body.hub })
    showToast(`Hub "${msg.body.hub.name}" created successfully`)
    if (dom.createHubModal && dom.createHubModal.close) dom.createHubModal.close()
  }
}

const handleHubUpdated = (msg) => {
  const hubIndex = state.hubs.findIndex((hub) => hub.hub_id === msg.body.hub.hub_id)
  if (hubIndex !== -1) {
    store.dispatch({ type: 'hubs/upsert', hub: msg.body.hub })
    showToast(`Hub renamed to "${msg.body.hub.name}"`)
  }
}

const handleHubDeleted = (msg) => {
  applyHubDeleted(msg.body || {})
  showToast('Hub deleted')
}

const handleChannelMemberEvent = (msg) => {
  if (msg.body?.kind === 'join' && msg.body?.target_user_id === state.user?.user_id) {
    if (msg.body?.channel_id === state.currentChannelId) {
      send('msg.list', { channel_id: state.currentChannelId, after_seq: 0, limit: 200 })
    }
  }
}

const handleChannelCreated = (msg) => {
  const exists = state.channels.some((channel) => channel.channel_id === msg.body.channel.channel_id)
  if (!exists) {
    store.dispatch({ type: 'channels/upsert', channel: msg.body.channel })
    if (msg.reply_to) {
      setActiveChannel(msg.body.channel.channel_id)
    }
  }
}

const handleChannelUpdated = (msg) => {
  const channelIndex = state.channels.findIndex((channel) => channel.channel_id === msg.body.channel.channel_id)
  if (channelIndex !== -1) {
    store.dispatch({ type: 'channels/upsert', channel: msg.body.channel })
    if (msg.body.channel.channel_id === state.currentChannelId) {
      dom.activeRoom.textContent = `${SidebarTreePresenter.channelIcon(msg.body.channel)} ${msg.body.channel.name}`
      updateChannelLayoutMode()
      ensureVoiceStateForChannel(state.currentChannelId)
      callStateService.markUpdated('channel.updated')
    }
    showToast(`Channel renamed to "${msg.body.channel.name}"`)
  }
}

const handleChannelDeleted = (msg) => {
  applyChannelDeleted(msg.body || {})
  showToast('Channel deleted')
}

const handleChannelAdded = (msg) => {
  const existingChannel = state.channels.find((channel) => channel.channel_id === msg.body.channel_id)
  if (!existingChannel) {
    store.dispatch({ type: 'channels/upsert', channel: msg.body })
    showToast(`Added to channel: ${msg.body.name}`)
  }
}

const handleUserSearchResult = (msg) => {
  const users = msg.body.users || []
  dom.memberSearchResults.innerHTML = users.map((user) => `
      <div class='member-search-item' data-user-id='${user.user_id}'>
        <span>${user.profile?.display_name || user.profile?.handle || user.user_id}</span>
        <button class='add-user-btn' data-user-id='${user.user_id}'>Add</button>
      </div>
    `).join('')

  dom.memberSearchResults.querySelectorAll('.add-user-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const userId = btn.getAttribute('data-user-id')
      send('channel.add_member', { channel_id: state.currentChannelId, target_user_id: userId })
    })
  })
}

const handleChannelMemberAdded = () => {
  showToast('Member added successfully')
  dom.addMemberModal.close()
  dom.memberSearchInput.value = ''
  dom.memberSearchResults.innerHTML = ''
}

const setupMessageSubscriptions = () => {
  eventBus.on('ws:message:dispatch', ({ msg, markHandled }) => {
    switch (msg.t) {
      case 'hello_ack':
        handleHelloAck(msg)
        markHandled()
        break
      case 'auth.session':
        handleAuthSession(msg)
        markHandled()
        break
      case 'hub.list_result':
        handleHubListResult(msg)
        markHandled()
        break
      case 'channel.list_result':
        handleChannelListResult(msg)
        markHandled()
        break
      case 'admin.invite':
        handleAdminInvite(msg)
        markHandled()
        break
      case 'hub.created':
        handleHubCreated(msg)
        markHandled()
        break
      case 'hub.updated':
        handleHubUpdated(msg)
        markHandled()
        break
      case 'hub.deleted':
        handleHubDeleted(msg)
        markHandled()
        break
      case 'channel.member_event':
        handleChannelMemberEvent(msg)
        markHandled()
        break
      case 'channel.created':
        handleChannelCreated(msg)
        markHandled()
        break
      case 'channel.updated':
        handleChannelUpdated(msg)
        markHandled()
        break
      case 'channel.deleted':
        handleChannelDeleted(msg)
        markHandled()
        break
      case 'channel.added':
        handleChannelAdded(msg)
        markHandled()
        break
      case 'msg.event':
        addMessage(msg.body.channel_id, msg.body.msg)
        markHandled()
        break
      case 'msg.list_result':
        store.dispatch({
          type: 'messages/set',
          channelId: msg.body.channel_id,
          messages: msg.body.messages
        })
        cacheMessages(msg.body.channel_id)
        markHandled()
        break
      case 'search.result':
        store.dispatch({ type: 'search/set', hits: msg.body.hits || [] })
        markHandled()
        break
      case 'rtc.call_event':
        callStateService.mapSet(msg.body.channel_id, msg.body.call_id, 'rtc.call_event')
        markHandled()
        break
      case 'rtc.call':
        callStateService.setSession({
          callId: msg.body.call_id,
          callChannelId: msg.body.channel_id,
          ice: msg.body.ice,
          source: 'rtc.call'
        })
        pendingVoiceJoinChannelId = null
        send('rtc.join', { call_id: state.callId, peer_meta: { device: 'browser', capabilities: { screen: true } } })
        markHandled()
        break
      case 'rtc.participants':
        rtcInfo('[RTC] participants', {
          callId: msg.body?.call_id,
          selfPeerId: msg.body?.self_peer_id,
          peerCount: (msg.body?.peers || []).length,
          hasIce: Boolean(msg.body?.ice)
        })
        if (msg.body?.ice) {
          callStateService.setSession({
            ice: msg.body.ice,
            selfPeerId: msg.body.self_peer_id,
            source: 'rtc.participants'
          })
        } else {
          callStateService.setSession({
            selfPeerId: msg.body.self_peer_id,
            source: 'rtc.participants'
          })
        }
        ensurePeers(msg.body.peers || [])
        if (state.voiceActive && !state.micMuted) {
          startAudio()
        }
        markHandled()
        break
      case 'rtc.call_end': {
        callStateService.mapDelete(msg.body.channel_id, 'rtc.call_end')
        const matchesActiveCall = msg.body.call_id && state.callId && msg.body.call_id === state.callId
        const matchesActiveChannel = msg.body.channel_id && state.callChannelId && msg.body.channel_id === state.callChannelId
        if (matchesActiveCall || matchesActiveChannel) {
          teardownCall()
        }
        markHandled()
        break
      }
      case 'user.search_result':
        handleUserSearchResult(msg)
        markHandled()
        break
      case 'channel.member_added':
        handleChannelMemberAdded(msg)
        markHandled()
        break
      case 'error':
        handleError(msg)
        markHandled()
        break
      default:
        break
    }
  })
}

const setupStoreSubscriptions = () => {
  store.subscribe((event, payload) => {
    switch (event) {
      case 'auth:updated':
        setAuthUi()
        break
      case 'hubs:updated':
        renderHubs()
        break
      case 'channels:updated':
        renderChannels()
        break
      case 'messages:updated':
        if (payload?.channelId) {
          renderMessages(payload.channelId)
        }
        break
      case 'search:updated':
        renderSearch(payload?.hits || [])
        break
      case 'call:updated':
        updateCallControls()
        break
      default:
        break
    }
  })
}

const isValidSdp = (value) => typeof value === 'string' && value.trim().startsWith('v=')

const summarizeSdpMedia = (sdp) => {
  if (!isValidSdp(sdp)) {
    return null
  }
  const lines = sdp.split(/\r?\n/)
  const summary = {}
  let currentKind = null
  for (const line of lines) {
    if (line.startsWith('m=')) {
      if (line.startsWith('m=audio')) currentKind = 'audio'
      else if (line.startsWith('m=video')) currentKind = 'video'
      else currentKind = null
      continue
    }
    if (!currentKind || !line.startsWith('a=')) {
      continue
    }
    if (line === 'a=sendrecv' || line === 'a=sendonly' || line === 'a=recvonly' || line === 'a=inactive') {
      summary[currentKind] = line.slice(2)
    }
  }
  return summary
}

rtcCallService = new RtcCallService({
  state,
  send,
  rtcInfo,
  rtcWarn,
  isValidSdp,
  summarizeSdpMedia,
  getOrCreateInboundStream: (event, peerId) => getOrCreateInboundStream(event, peerId),
  ensureRemoteAudio: (stream, ownerPeerId) => ensureRemoteAudio(stream, ownerPeerId),
  addStreamTile: (stream, label, isLocal, ownerPeerId) => addStreamTile(stream, label, isLocal, ownerPeerId),
  removeStreamTile: (stream) => removeStreamTile(stream),
  notifyStreamPublish: (streamId, kind, label, stream) => notifyStreamPublish(streamId, kind, label, stream),
  updateCallControls: () => {
    callStateService.markUpdated('rtc.service')
  },
  showToast
})

const handleOffer = async (body) => rtcCallService.handleOffer(body)
const handleAnswer = async (body) => rtcCallService.handleAnswer(body)
const handleIce = async (body) => rtcCallService.handleIce(body)
const handlePeerEvent = (body) => rtcCallService.handlePeerEvent(body)

/**
 * Message type dispatcher
 * @type {Object<string, Function>}
 */
/**
 * Handle error responses from server
 * @param {Object} msg
 */

const messageHandlers = {
  // Most protocol events are now handled via event-bus subscriptions.
  'rtc.peer_event': (msg) => handlePeerEvent(msg.body || {}),
  'rtc.offer_event': (msg) => handleOffer(msg.body || {}),
  'rtc.answer_event': (msg) => handleAnswer(msg.body || {}),
  'rtc.ice_event': (msg) => handleIce(msg.body || {}),
  'rtc.stream_event': () => {
    // stream events are informational
  }
}

/**
 * Route incoming message to appropriate handler
 * @param {Object} msg - Message with type 't'
 */
const handleMessage = (msg) => {
  let handledBySubscription = false
  eventBus.emit('ws:message:dispatch', {
    msg,
    markHandled: () => {
      handledBySubscription = true
    }
  })
  if (handledBySubscription) {
    eventBus.emit('ws:message:handled', { type: msg?.t, raw: msg, via: 'subscription' })
    return
  }
  eventBus.emit('ws:message:handled', { type: msg?.t, raw: msg })
  const handler = messageHandlers[msg.t]
  if (handler) {
    Promise.resolve(handler(msg)).catch((error) => {
      eventBus.emit('ws:handler:error', { type: msg?.t, error })
      console.error('Client message handler failed', msg?.t, error)
      showToast('Realtime handler error. Retrying may help.')
    })
  }
}

/**
 * Request list of channels from server
 */
const requestChannels = () => {
  send('channel.list', {})
}

/**
 * Apply local state updates after a hub is deleted
 * @param {{hub_id?: string}} body
 */
const applyHubDeleted = (body) => {
  const hubId = body.hub_id
  if (!hubId) {
    return
  }

  const removedChannelIds = new Set(
    state.channels.filter((channel) => channel.hub_id === hubId).map((channel) => channel.channel_id)
  )

  store.dispatch({ type: 'hubs/remove', hubId })
  store.dispatch({ type: 'channels/removeByHub', hubId })

  for (const channelId of removedChannelIds) {
    store.dispatch({ type: 'messages/deleteChannel', channelId })
    localStorage.removeItem(`channel:${channelId}:messages`)
  }

  if (state.currentChannelId && removedChannelIds.has(state.currentChannelId)) {
    const nextChannelId = state.channels[0]?.channel_id || null
    store.dispatch({ type: 'channels/setCurrent', channelId: null })
    if (nextChannelId) {
      setActiveChannel(nextChannelId)
    } else {
      callStateService.setSession({ voiceActive: false, source: 'hub.deleted' })
      leaveCurrentVoiceCall()
      dom.activeRoom.textContent = 'No channel selected'
      dom.messages.innerHTML = ''
      updateChannelLayoutMode()
      callStateService.markUpdated('hub.deleted')
    }
  }

}

/**
 * Apply local state updates after a channel is deleted
 * @param {{channel_id?: string}} body
 */
const applyChannelDeleted = (body) => {
  const channelId = body.channel_id
  if (!channelId) {
    return
  }

  store.dispatch({ type: 'channels/remove', channelId })
  store.dispatch({ type: 'messages/deleteChannel', channelId })
  localStorage.removeItem(`channel:${channelId}:messages`)

  if (state.currentChannelId === channelId) {
    const nextChannelId = state.channels[0]?.channel_id || null
    store.dispatch({ type: 'channels/setCurrent', channelId: null })
    if (nextChannelId) {
      setActiveChannel(nextChannelId)
    } else {
      callStateService.setSession({ voiceActive: false, source: 'channel.deleted' })
      leaveCurrentVoiceCall()
      dom.activeRoom.textContent = 'No channel selected'
      dom.messages.innerHTML = ''
      updateChannelLayoutMode()
      callStateService.markUpdated('channel.deleted')
    }
  }

}

// Channel creation modal listeners (hoisted for use in renderHubs)
function openCreateRoomModal(hubId = null) {
  channelModalState.mode = 'create'
  channelModalState.channelId = null
  if (dom.channelModalTitle) {
    dom.channelModalTitle.textContent = 'Create channel'
  }
  dom.modalCreateRoomBtn.textContent = 'Create'
  dom.modalRoomKind.disabled = false
  dom.modalRoomVisibility.disabled = false
  clientStateService.setSelectedHubForChannelCreation(hubId)
  dom.modalRoomName.value = ''
  dom.modalRoomKind.value = 'text'
  dom.modalRoomVisibility.value = 'public'
  // Populate hub selector
  dom.modalHubSelect.innerHTML = '<option value="">Select a hub</option>'
  state.hubs.forEach(hub => {
    const option = document.createElement('option')
    option.value = hub.hub_id
    option.textContent = hub.name
    if (hub.hub_id === hubId) {
      option.selected = true
    }
    dom.modalHubSelect.appendChild(option)
  })
  // If hubId was provided, disable the selector (it's pre-selected)
  if (hubId) {
    dom.modalHubSelect.disabled = true
  } else {
    dom.modalHubSelect.disabled = false
  }
  dom.createRoomModal.showModal()
  dom.modalRoomName.focus()
}

const openEditChannelModal = () => {
  const channelId = state.currentChannelId
  if (!channelId) {
    showToast('Select a channel first')
    return
  }
  const channel = state.channels.find((entry) => entry.channel_id === channelId)
  if (!channel) {
    showToast('Channel not found')
    return
  }

  channelModalState.mode = 'edit'
  channelModalState.channelId = channelId
  if (dom.channelModalTitle) {
    dom.channelModalTitle.textContent = 'Edit channel'
  }
  dom.modalCreateRoomBtn.textContent = 'Save changes'

  clientStateService.setSelectedHubForChannelCreation(channel.hub_id || null)
  dom.modalRoomName.value = channel.name || ''
  dom.modalRoomKind.value = channel.kind || 'text'
  dom.modalRoomVisibility.value = channel.visibility || 'public'
  dom.modalHubSelect.innerHTML = '<option value="">Select a hub</option>'
  state.hubs.forEach((hub) => {
    const option = document.createElement('option')
    option.value = hub.hub_id
    option.textContent = hub.name
    if (hub.hub_id === channel.hub_id) {
      option.selected = true
    }
    dom.modalHubSelect.appendChild(option)
  })
  dom.modalHubSelect.disabled = true
  dom.modalRoomKind.disabled = true
  dom.modalRoomVisibility.disabled = true

  dom.createRoomModal.showModal()
  dom.modalRoomName.focus()
}

const renderHubs = () => {
  sidebarTreePresenter.render()
}

const renderChannels = () => {
  sidebarTreePresenter.render()
}

const leaveCurrentVoiceCall = () => {
  if (!state.callId) {
    pendingVoiceJoinChannelId = null
    callStateService.setSession({ voiceActive: false, source: 'voice_leave_idle' })
    return
  }
  pendingVoiceJoinChannelId = null
  if (state.selfPeerId) {
    send('rtc.leave', { call_id: state.callId, peer_id: state.selfPeerId })
  }
  teardownCall()
}

const openJoinVoiceModal = (channelId) => {
  if (!dom.joinVoiceModal) {
    return
  }
  const channel = state.channels.find((entry) => entry.channel_id === channelId)
  if (dom.joinVoiceChannelName) {
    dom.joinVoiceChannelName.textContent = channel?.name || channelId || 'Voice channel'
  }
  pendingVoiceJoinChannelId = channelId
  if (dom.joinVoiceModal.open) {
    return
  }
  dom.joinVoiceModal.showModal()
}

const closeJoinVoiceModal = () => {
  pendingVoiceJoinChannelId = null
  if (!dom.joinVoiceModal?.open) {
    return
  }
  dom.joinVoiceModal.close()
}

const populateDeviceSelect = (selectEl, devices, selectedId, fallbackLabel) => {
  if (!selectEl) {
    return
  }
  const previousValue = selectedId || ''
  selectEl.innerHTML = ''
  const defaultOption = document.createElement('option')
  defaultOption.value = ''
  defaultOption.textContent = 'System default'
  selectEl.appendChild(defaultOption)

  devices.forEach((device, index) => {
    const option = document.createElement('option')
    option.value = device.deviceId
    option.textContent = device.label || `${fallbackLabel} ${index + 1}`
    selectEl.appendChild(option)
  })

  const hasSelected = devices.some((device) => device.deviceId === previousValue)
  selectEl.value = hasSelected ? previousValue : ''
}

const refreshMediaDeviceOptions = async () => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    showToast('Device selection is not supported in this browser')
    return
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const audioInputs = devices.filter((device) => device.kind === 'audioinput')
    const videoInputs = devices.filter((device) => device.kind === 'videoinput')
    populateDeviceSelect(dom.audioInputSelect, audioInputs, state.selectedAudioInputId, 'Microphone')
    populateDeviceSelect(dom.videoInputSelect, videoInputs, state.selectedVideoInputId, 'Camera')
  } catch (error) {
    showToast('Unable to list media devices')
  }
}

const openDeviceSettingsModal = async () => {
  if (!dom.deviceSettingsModal) {
    return
  }
  await refreshMediaDeviceOptions()
  if (!dom.deviceSettingsModal.open) {
    dom.deviceSettingsModal.showModal()
  }
}

const closeDeviceSettingsModal = () => {
  if (!dom.deviceSettingsModal?.open) {
    return
  }
  dom.deviceSettingsModal.close()
}

const applyMediaDeviceSelections = async () => {
  const nextAudioId = dom.audioInputSelect?.value || ''
  const nextVideoId = dom.videoInputSelect?.value || ''
  const audioChanged = nextAudioId !== state.selectedAudioInputId
  const videoChanged = nextVideoId !== state.selectedVideoInputId

  state.selectedAudioInputId = nextAudioId
  state.selectedVideoInputId = nextVideoId
  localStorage.setItem('media.audio_input_id', nextAudioId)
  localStorage.setItem('media.video_input_id', nextVideoId)

  if (audioChanged && state.audioStream && state.callId) {
    stopAudio()
    if (!state.micMuted) {
      await startAudio()
    }
  }
  if (videoChanged && state.videoStream && state.callId) {
    stopVideo()
    await startVideo()
  }
}

const joinVoiceChannel = (channelId, { withMic } = { withMic: false }) => {
  if (!isVoiceChannel(channelId)) {
    return
  }

  closeJoinVoiceModal()
  callStateService.setSession({ voiceActive: true, source: 'join_voice_channel' })
  state.micMuted = !withMic

  if (state.callId && state.callChannelId === channelId) {
    callStateService.markUpdated('voice_channel_already_active')
    if (!state.micMuted && !state.audioStream) {
      startAudio()
    }
    return
  }

  if (state.callId && state.callChannelId !== channelId) {
    leaveCurrentVoiceCall()
    callStateService.setSession({ voiceActive: true, source: 'switch_voice_channel' })
    state.micMuted = !withMic
  }

  const existingCall = state.channelCallMap.get(channelId)
  if (existingCall) {
    callStateService.setSession({
      callId: existingCall,
      callChannelId: channelId,
      source: 'existing_call_join'
    })
    send('rtc.join', { call_id: existingCall, peer_meta: { device: 'browser', capabilities: { screen: true } } })
  } else {
    pendingVoiceJoinChannelId = channelId
    callStateService.setSession({ callChannelId: channelId, source: 'voice_waiting_call_create' })
    send('rtc.call_create', { channel_id: channelId, kind: 'mesh', media: { audio: true, video: true } })
  }
  callStateService.markUpdated('join_voice_channel')
}

const ensureVoiceStateForChannel = (channelId) => {
  if (!isVoiceChannel(channelId)) {
    // Keep current voice session alive while browsing text channels.
    // A voice session only resets when switching to a different voice channel.
    return
  }

  if (!state.voiceActive) {
    return
  }

  if (state.callId && state.callChannelId === channelId) {
    callStateService.markUpdated('voice_channel_already_active')
    return
  }

  joinVoiceChannel(channelId, { withMic: !state.micMuted })
}

/**
 * Set active channel and load message history
 * @param {string} channelId
 */
const setActiveChannel = (channelId) => {
  const wasCurrentVoice = isVoiceChannel(state.currentChannelId)
  store.dispatch({ type: 'channels/setCurrent', channelId })
  updateChannelLayoutMode()
  const activeChannel = state.channels.find((channel) => channel.channel_id === channelId)
  dom.activeRoom.textContent = `${SidebarTreePresenter.channelIcon(activeChannel)} ${activeChannel?.name || channelId}`
  const cached = loadCachedMessages(channelId)
  if (cached) {
    store.dispatch({ type: 'messages/set', channelId, messages: cached })
  }
  send('channel.join', { channel_id: channelId })
  if (isVoiceChannel(channelId)) {
    const inSameActiveCall = Boolean(state.callId && state.callChannelId === channelId)
    if (!inSameActiveCall && (!state.voiceActive || state.callChannelId !== channelId)) {
      openJoinVoiceModal(channelId)
    } else {
      ensureVoiceStateForChannel(channelId)
    }
  } else if (wasCurrentVoice) {
    closeJoinVoiceModal()
  }
  callStateService.markUpdated('active_channel')
  setSidebarMenuOpen(false)
}

/**
 * Add message to channel message list and render if active channel
 * @param {string} channelId
 * @param {Object} msg - Message object
 */
const addMessage = (channelId, msg) => {
  store.dispatch({ type: 'messages/append', channelId, message: msg })
  cacheMessages(channelId)
}

/**
 * Render all messages for current channel
 * @param {string} channelId
 */
const renderMessages = (channelId) => {
  messagePresenter.renderMessages(channelId)
}

/**
 * Render search results
 * @param {Array<Object>} hits - Search hit results
 */
const renderSearch = (hits) => {
  messagePresenter.renderSearch(hits)
}

/**
 * Cache messages for a channel to localStorage (last 50 messages)
 * @param {string} channelId
 */
const cacheMessages = (channelId) => {
  const list = state.messages.get(channelId) || []
  const trimmed = list.slice(-50)
  localStorage.setItem(`channel:${channelId}:messages`, JSON.stringify(trimmed))
}

/**
 * Load cached messages from localStorage
 * @param {string} channelId
 * @returns {Array<Object>|null}
 */
const loadCachedMessages = (channelId) => {
  const raw = localStorage.getItem(`channel:${channelId}:messages`)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw)
  } catch (error) {
    return null
  }
}

/**
 * Update UI state for voice call controls
 */
const updateCallControls = () => {
  callControlsPresenter.render()
}

/**
 * Ensure peer connections exist for all peers in a call
 * @param {Array<Object>} peers
 */
const ensurePeers = (peers) => {
  rtcCallService.ensurePeers(peers)
}

/**
 * Get a remote stream from the event or synthesize one for streamless track events.
 * @param {RTCTrackEvent} event
 * @param {string} peerId
 * @returns {MediaStream|null}
 */
const getOrCreateInboundStream = (event, peerId) => {
  return resolveInboundStream(state, event, peerId)
}


const ensureRemoteAudio = (stream, ownerPeerId) => {
  if (!stream.getAudioTracks().length) {
    return
  }
  if (state.remoteAudioEls.has(stream.id)) {
    return
  }
  const audio = document.createElement('audio')
  audio.autoplay = true
  audio.muted = false
  audio.srcObject = stream
  audio.dataset.peerId = ownerPeerId
  audio.style.display = 'none'
  document.body.appendChild(audio)
  audio.play().catch(() => {})
  state.remoteAudioEls.set(stream.id, audio)

  const cleanupIfEnded = () => {
    const hasLiveAudio = stream.getAudioTracks().some((track) => track.readyState === 'live')
    if (!hasLiveAudio) {
      audio.srcObject = null
      audio.remove()
      state.remoteAudioEls.delete(stream.id)
    }
  }
  stream.getAudioTracks().forEach((track) => {
    track.addEventListener('ended', cleanupIfEnded)
  })
  stream.addEventListener('addtrack', (event) => {
    if (event.track?.kind === 'audio') {
      event.track.addEventListener('ended', cleanupIfEnded)
    }
  })
  stream.addEventListener('removetrack', (event) => {
    if (!event.track || event.track.kind === 'audio') {
      cleanupIfEnded()
    }
  })
  stream.addEventListener('inactive', cleanupIfEnded)
}

/**
 * Add a media stream tile to the grid
 * @param {MediaStream} stream
 * @param {string} label - Display label
 * @param {boolean} isLocal - Whether this is local or remote stream
 */
const addStreamTile = (stream, label, isLocal, ownerPeerId = null) => {
  if (ownerPeerId) {
    for (const [existingStreamId, existingTile] of state.streamTiles.entries()) {
      if (existingStreamId === stream.id || existingTile.dataset.peerId !== ownerPeerId) {
        continue
      }
      const existingVideo = existingTile.querySelector('video')
      const existingStream = existingVideo?.srcObject
      const hasLiveVideo = !!existingStream?.getVideoTracks().some((track) => track.readyState === 'live')
      if (!hasLiveVideo) {
        existingTile.remove()
        state.streamTiles.delete(existingStreamId)
      }
    }
  }

  if (state.streamTiles.has(stream.id)) {
    rtcInfo('[RTC] stream tile exists', {
      streamId: stream.id,
      ownerPeerId,
      isLocal
    })
    return
  }
  const tile = document.createElement('div')
  tile.className = 'stream-tile'
  if (ownerPeerId) {
    tile.dataset.peerId = ownerPeerId
  }
  const video = document.createElement('video')
  video.autoplay = true
  video.controls = true
  video.muted = isLocal
  video.playsInline = true
  video.srcObject = stream
  video.play().catch(() => {})
  const caption = document.createElement('div')
  caption.className = 'stream-label'
  caption.textContent = isLocal ? `${label} (you)` : label
  tile.appendChild(video)
  tile.appendChild(caption)
  dom.streams.appendChild(tile)
  state.streamTiles.set(stream.id, tile)
  rtcInfo('[RTC] stream tile added', {
    streamId: stream.id,
    ownerPeerId,
    isLocal,
    tiles: state.streamTiles.size
  })

  const hasRenderableVideo = () => {
    return stream.getVideoTracks().some((track) => track.readyState === 'live' && !track.muted)
  }

  const clearPruneTimer = () => {
    const existing = state.streamTilePruneTimers.get(stream.id)
    if (!existing) {
      return
    }
    window.clearTimeout(existing)
    state.streamTilePruneTimers.delete(stream.id)
  }

  const pruneIfNoRenderableVideo = () => {
    if (!hasRenderableVideo()) {
      removeStreamTile(stream)
    }
  }

  const schedulePruneIfMuted = () => {
    clearPruneTimer()
    const timer = window.setTimeout(() => {
      state.streamTilePruneTimers.delete(stream.id)
      pruneIfNoRenderableVideo()
    }, 1200)
    state.streamTilePruneTimers.set(stream.id, timer)
  }

  stream.getVideoTracks().forEach((track) => {
    track.addEventListener('ended', pruneIfNoRenderableVideo)
    track.addEventListener('mute', schedulePruneIfMuted)
    track.addEventListener('unmute', () => {
      clearPruneTimer()
      if (!state.streamTiles.has(stream.id) && hasRenderableVideo()) {
        addStreamTile(stream, label, isLocal, ownerPeerId)
      }
    })
  })
  stream.addEventListener('addtrack', (event) => {
    if (event.track?.kind === 'video') {
      event.track.addEventListener('ended', pruneIfNoRenderableVideo)
      event.track.addEventListener('mute', schedulePruneIfMuted)
      event.track.addEventListener('unmute', () => {
        clearPruneTimer()
        if (!state.streamTiles.has(stream.id) && hasRenderableVideo()) {
          addStreamTile(stream, label, isLocal, ownerPeerId)
        }
      })
    }
  })
  stream.addEventListener('removetrack', (event) => {
    if (!event.track || event.track.kind === 'video') {
      pruneIfNoRenderableVideo()
    }
  })
  stream.addEventListener('inactive', () => {
    clearPruneTimer()
    pruneIfNoRenderableVideo()
  })

  callStateService.markUpdated('stream_tile_added')
}

/**
 * Remove a stream tile from the grid
 * @param {MediaStream} stream
 */
const removeStreamTile = (stream) => {
  const pruneTimer = state.streamTilePruneTimers.get(stream.id)
  if (pruneTimer) {
    window.clearTimeout(pruneTimer)
    state.streamTilePruneTimers.delete(stream.id)
  }
  const tile = state.streamTiles.get(stream.id)
  if (tile) {
    tile.remove()
    state.streamTiles.delete(stream.id)
    rtcInfo('[RTC] stream tile removed', {
      streamId: stream.id,
      tiles: state.streamTiles.size
    })
    callStateService.markUpdated('stream_tile_removed')
  }
}

/**
 * Start audio capture (microphone)
 */
const startAudio = async () => {
  await rtcCallService.startAudio()
}

/**
 * Stop audio capture
 */
const stopAudio = () => {
  rtcCallService.stopAudio()
}

const toggleMicMute = () => {
  if (!state.callId) {
    return
  }
  if (!state.audioStream) {
    state.micMuted = false
    startAudio()
    callStateService.markUpdated('mic_requested_on_toggle')
    return
  }
  rtcCallService.toggleMicMute()
}

/**
 * Start video capture (camera)
 */
const startVideo = async () => {
  await rtcCallService.startVideo()
}

/**
 * Stop video capture
 */
const stopVideo = () => {
  rtcCallService.stopVideo()
}

/**
 * Start screen capture for sharing
 */
const startScreenShare = async () => {
  await rtcCallService.startScreenShare()
}

/**
 * Stop screen capture
 */
const stopScreenShare = () => {
  rtcCallService.stopScreenShare()
}

/**
 * Notify peers of a published stream
 * @param {string} streamId
 * @param {string} kind
 * @param {string} label
 * @param {MediaStream} stream
 */
const notifyStreamPublish = (streamId, kind, label, stream) => {
  if (!state.callId || !state.selfPeerId) {
    return
  }
  send('rtc.stream_publish', {
    call_id: state.callId,
    peer_id: state.selfPeerId,
    stream: {
      stream_id: streamId,
      kind,
      label,
      tracks: { audio: stream.getAudioTracks().length > 0, video: stream.getVideoTracks().length > 0 }
    }
  })
}

/**
 * Tear down all peer connections and media streams when leaving a call
 */
const teardownCall = () => {
  rtcCallService.teardownCall()
}

/**
 * Set up all event listeners for UI interactions
 */
const setupEventListeners = () => {
  setupSidebarResizer()

  dom.mobileMenuBtn.addEventListener('click', () => {
    setSidebarMenuOpen(!state.sidebarMenuOpen)
  })

  dom.sidebarOverlay.addEventListener('click', () => {
    setSidebarMenuOpen(false)
  })

  window.addEventListener('resize', () => {
    setSidebarMenuOpen(state.sidebarMenuOpen)
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setSidebarMenuOpen(false)
      setTextChatDrawerOpen(false)
    }
  })

  dom.textChatToggle.addEventListener('click', () => {
    setTextChatDrawerOpen(!state.textChatDrawerOpen)
  })

  dom.textChatClose.addEventListener('click', () => {
    setTextChatDrawerOpen(false)
  })

  // Auth tab switching
  dom.signupTab.addEventListener('click', () => {
    dom.signupTab.classList.add('active')
    dom.signinTab.classList.remove('active')
    dom.signupForm.classList.add('active')
    dom.signinForm.classList.remove('active')
  })

  dom.signinTab.addEventListener('click', () => {
    dom.signinTab.classList.add('active')
    dom.signupTab.classList.remove('active')
    dom.signinForm.classList.add('active')
    dom.signupForm.classList.remove('active')
  })

  // Sign up listener (with invite token + password)
  dom.redeemBtn.addEventListener('click', () => {
    const inviteToken = dom.inviteInput.value.trim()
    const handle = dom.handleInput.value.trim()
    const password = dom.signupPasswordInput.value.trim()

    if (!inviteToken || !handle || !password) {
      dom.authHint.textContent = 'Please fill in all fields'
      return
    }

    dom.authHint.textContent = 'Signing up...'
    sendAuthRequest('auth.invite_redeem', {
      invite_token: inviteToken,
      profile: { handle, display_name: handle },
      password
    })
  })

  // Sign in listener (with username/password)
  dom.signinBtn.addEventListener('click', () => {
    const handle = dom.signinHandleInput.value.trim()
    const password = dom.signinPasswordInput.value.trim()

    if (!handle || !password) {
      dom.signinHint.textContent = 'Please enter username and password'
      return
    }

    dom.signinHint.textContent = 'Signing in...'
    sendAuthRequest('auth.signin', { handle, password })
  })

  // Allow Enter key to submit in signup form
  dom.signupPasswordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      dom.redeemBtn.click()
    }
  })

  // Allow Enter key to submit in signin form
  dom.signinPasswordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      dom.signinBtn.click()
    }
  })

  // Logout listener
  dom.logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('session_token')
    store.dispatch({ type: 'auth/set', user: null, sessionToken: null, source: 'logout' })
    showToast('Signed out')
  })

  // Admin invite listeners
  const createAdminInvite = () => {
    send('admin.invite_create', { ttl_ms: 24 * 60 * 60 * 1000, max_uses: 1, note: 'web invite' })
  }

  dom.createAdminInviteSideBtn.addEventListener('click', createAdminInvite)

  // Hub creation listeners
  const openCreateHubModal = () => {
    dom.modalHubName.value = ''
    dom.modalHubDescription.value = ''
    dom.modalHubVisibility.value = 'public'
    dom.createHubModal.showModal()
    dom.modalHubName.focus()
  }

  const closeCreateHubModal = () => {
    dom.createHubModal.close()
  }

  const submitCreateHub = () => {
    const name = dom.modalHubName.value.trim()
    const description = dom.modalHubDescription.value.trim() || null
    const visibility = dom.modalHubVisibility.value
    if (!name) {
      return
    }
    send('hub.create', { name, description, visibility })
    // Modal will close when hub.created message is received
  }

  dom.createHubBtn.addEventListener('click', openCreateHubModal)
  dom.closeCreateHubModalBtn.addEventListener('click', closeCreateHubModal)
  dom.modalHubCancelBtn.addEventListener('click', closeCreateHubModal)
  dom.modalCreateHubBtn.addEventListener('click', submitCreateHub)

  dom.modalHubName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitCreateHub()
    }
  })

  dom.createHubModal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeCreateHubModal()
    }
  })

  const closeCreateRoomModal = () => {
    dom.createRoomModal.close()
    clientStateService.setSelectedHubForChannelCreation(null)
    channelModalState.mode = 'create'
    channelModalState.channelId = null
    dom.modalRoomKind.disabled = false
    dom.modalRoomVisibility.disabled = false
    if (dom.channelModalTitle) {
      dom.channelModalTitle.textContent = 'Create channel'
    }
    dom.modalCreateRoomBtn.textContent = 'Create'
  }

  const submitCreateRoom = () => {
    const name = dom.modalRoomName.value.trim()
    const isEditMode = channelModalState.mode === 'edit'
    const kind = dom.modalRoomKind.value
    const visibility = dom.modalRoomVisibility.value
    const hubId = state.selectedHubIdForChannelCreation || dom.modalHubSelect.value
    
    if (!name) {
      showToast('Please enter a channel name')
      return
    }

    if (isEditMode) {
      if (!channelModalState.channelId) {
        showToast('Channel not found')
        return
      }
      send('channel.update', { channel_id: channelModalState.channelId, name })
      closeCreateRoomModal()
      return
    }

    if (!hubId) {
      showToast('Please select a hub')
      return
    }

    send('channel.create', { hub_id: hubId, kind, name, visibility })
    closeCreateRoomModal()
  }

  // Note: openCreateRoomModalBtn no longer exists in HTML, modal is opened via hub + buttons
  dom.closeCreateRoomModalBtn.addEventListener('click', closeCreateRoomModal)
  dom.modalCancelBtn.addEventListener('click', closeCreateRoomModal)
  dom.modalCreateRoomBtn.addEventListener('click', submitCreateRoom)

  // Allow Enter key to submit in modal
  dom.modalRoomName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitCreateRoom()
    }
  })

  // Close modal on Escape key
  dom.createRoomModal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeCreateRoomModal()
    }
  })

  // Add member modal listeners
  const openAddMemberModal = () => {
    if (!state.currentChannelId) {
      showToast('No channel selected')
      return
    }
    dom.memberSearchInput.value = ''
    dom.memberSearchResults.innerHTML = ''
    dom.addMemberModal.showModal()
    dom.memberSearchInput.focus()
  }

  const closeAddMemberModal = () => {
    dom.addMemberModal.close()
  }

  dom.addMemberBtn.addEventListener('click', openAddMemberModal)
  dom.editChannelBtn.addEventListener('click', openEditChannelModal)
  dom.closeAddMemberModalBtn.addEventListener('click', closeAddMemberModal)
  dom.closeAddMemberBtn.addEventListener('click', closeAddMemberModal)

  dom.memberSearchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      const query = dom.memberSearchInput.value.trim()
      if (query) {
        send('user.search', { q: query, limit: 10 })
      }
    }
  })

  dom.addMemberModal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAddMemberModal()
    }
  })

  // Message listeners
  dom.sendMessageBtn.addEventListener('click', () => {
    const text = dom.messageInput.value.trim()
    if (!text || !state.currentChannelId) {
      return
    }
    dom.messageInput.value = ''
    send('msg.send', {
      channel_id: state.currentChannelId,
      client_msg_id: `local-${Date.now()}`,
      text
    })
  })

  dom.messageInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }
    event.preventDefault()
    dom.sendMessageBtn.click()
  })

  // Search listener
  dom.searchBtn.addEventListener('click', () => {
    const q = dom.searchInput.value.trim()
    if (!q || !state.currentChannelId) {
      return
    }
    send('search.query', { scope: { kind: 'channel', channel_id: state.currentChannelId }, q, limit: 20 })
  })

  // Voice call bar listeners
  dom.callBarMicToggleBtn.addEventListener('click', () => {
    toggleMicMute()
  })

  dom.callBarLeaveBtn.addEventListener('click', () => {
    leaveCurrentVoiceCall()
  })

  dom.callBarCameraToggleBtn.addEventListener('click', () => {
    if (!state.callId) {
      return
    }
    if (state.videoStream) {
      stopVideo()
    } else {
      startVideo()
    }
  })

  dom.callBarScreenToggleBtn.addEventListener('click', () => {
    if (!state.callId) {
      return
    }
    if (state.screenStream) {
      stopScreenShare()
    } else {
      startScreenShare()
    }
  })

  dom.callBarDeviceSettingsBtn.addEventListener('click', () => {
    openDeviceSettingsModal()
  })

  dom.callBarOpenStageBtn.addEventListener('click', () => {
    if (!state.callChannelId) {
      return
    }
    if (state.currentChannelId !== state.callChannelId) {
      setActiveChannel(state.callChannelId)
    }
  })

  dom.callBarEndCallBtn.addEventListener('click', () => {
    if (!state.callId) {
      return
    }
    const confirmed = window.confirm('End call for everyone?')
    if (!confirmed) {
      return
    }
    send('rtc.end_call', { call_id: state.callId })
  })

  // Join voice modal listeners
  dom.joinVoiceCloseBtn.addEventListener('click', closeJoinVoiceModal)
  dom.joinCancelBtn.addEventListener('click', closeJoinVoiceModal)
  dom.joinMutedBtn.addEventListener('click', () => {
    const channelId = pendingVoiceJoinChannelId || state.currentChannelId
    if (!channelId) {
      closeJoinVoiceModal()
      return
    }
    joinVoiceChannel(channelId, { withMic: false })
  })
  dom.joinWithMicBtn.addEventListener('click', () => {
    const channelId = pendingVoiceJoinChannelId || state.currentChannelId
    if (!channelId) {
      closeJoinVoiceModal()
      return
    }
    joinVoiceChannel(channelId, { withMic: true })
  })

  dom.joinVoiceModal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeJoinVoiceModal()
    }
  })

  // Media device modal listeners
  dom.deviceSettingsCloseBtn.addEventListener('click', closeDeviceSettingsModal)
  dom.deviceSettingsDoneBtn.addEventListener('click', async () => {
    await applyMediaDeviceSelections()
    closeDeviceSettingsModal()
  })
  dom.deviceSettingsRefreshBtn.addEventListener('click', async () => {
    await refreshMediaDeviceOptions()
  })
  dom.audioInputSelect.addEventListener('change', async () => {
    await applyMediaDeviceSelections()
  })
  dom.videoInputSelect.addEventListener('change', async () => {
    await applyMediaDeviceSelections()
  })
  dom.deviceSettingsModal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeDeviceSettingsModal()
    }
  })

  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      if (dom.deviceSettingsModal?.open) {
        refreshMediaDeviceOptions()
      }
    })
  }
}

// Initialize app
setupStoreSubscriptions()
setupMessageSubscriptions()
setupEventListeners()
ensureRtcDebugPanel()
if (rtcDebugEnabled) {
  rtcInfo('[RTC] debug session started', { href: location.href })
}
callStateService.markUpdated('init')
renderMobileDiagnostics()
connect()
