class CallStateService {
  constructor({ store }) {
    this.store = store
  }

  markUpdated(source = 'dispatch') {
    this.store.dispatch({ type: 'call/updated', source })
  }

  mapSet(channelId, callId, source = 'dispatch') {
    this.store.dispatch({ type: 'call/mapSet', channelId, callId, source })
  }

  mapDelete(channelId, source = 'dispatch') {
    this.store.dispatch({ type: 'call/mapDelete', channelId, source })
  }

  setSession({ callId, callChannelId, ice, selfPeerId, voiceActive, source = 'dispatch' }) {
    this.store.dispatch({
      type: 'call/sessionSet',
      callId,
      callChannelId,
      ice,
      selfPeerId,
      voiceActive,
      source
    })
  }
}

export { CallStateService }
