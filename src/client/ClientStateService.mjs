class ClientStateService {
  constructor({ store }) {
    this.store = store
  }

  setSocket(ws) {
    this.store.dispatch({ type: 'ws/setSocket', ws })
  }

  setSocketStatus({ event, error = '', reconnectAttempts }) {
    this.store.dispatch({
      type: 'ws/setStatusEvent',
      event,
      error,
      reconnectAttempts
    })
  }

  setPendingAuthRequest(request) {
    this.store.dispatch({ type: 'auth/setPendingRequest', request })
  }

  clearPendingAuthRequest() {
    this.store.dispatch({ type: 'auth/setPendingRequest', request: null })
  }

  setTextChatDrawerOpen(open) {
    this.store.dispatch({ type: 'ui/setTextChatDrawerOpen', open })
  }

  setSelectedHubForChannelCreation(hubId) {
    this.store.dispatch({ type: 'channels/setSelectedHubForCreation', hubId })
  }
}

export { ClientStateService }
