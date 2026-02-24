class CallControlsPresenter {
  constructor({ state, dom, isVoiceChannel }) {
    this.state = state
    this.dom = dom
    this.isVoiceChannel = isVoiceChannel
  }

  render() {
    const inVoiceChannel = this.isVoiceChannel(this.state.currentChannelId)
    const hasActiveCall = Boolean(this.state.callId)
    const inActiveVoiceCall = Boolean(hasActiveCall && this.state.callChannelId === this.state.currentChannelId)
    const participantCount = (hasActiveCall ? 1 : 0) + this.state.peerConnections.size

    this.dom.activeCallBar.classList.toggle('hidden', !hasActiveCall)
    this.dom.callBarMicToggleBtn.disabled = !hasActiveCall
    this.dom.callBarCameraToggleBtn.disabled = !hasActiveCall
    this.dom.callBarScreenToggleBtn.disabled = !hasActiveCall
    this.dom.callBarDeviceSettingsBtn.disabled = !hasActiveCall
    this.dom.callBarOpenStageBtn.disabled = !hasActiveCall || !this.state.callChannelId || inVoiceChannel
    this.dom.callBarLeaveBtn.disabled = !hasActiveCall
    this.dom.callBarParticipants.textContent = `${participantCount} on call`
    const callChannelName = this.state.channels.find((entry) => entry.channel_id === this.state.callChannelId)?.name
      || this.state.callChannelId
      || 'Voice channel'
    this.dom.callBarChannelLabel.textContent = callChannelName
    this.dom.callBarEndCallBtn.classList.toggle('hidden', !(hasActiveCall && this.canEndCall()))
    this.dom.callBarEndCallBtn.disabled = !hasActiveCall
    if (this.dom.editChannelBtn) {
      this.dom.editChannelBtn.disabled = !this.state.currentChannelId
    }
    if (this.dom.addMemberBtn) {
      this.dom.addMemberBtn.disabled = !this.state.currentChannelId
    }

    this.dom.callBarMicToggleBtn.textContent = this.state.micMuted ? '🔇' : '🎤'
    this.dom.callBarMicToggleBtn.title = this.state.micMuted ? 'Unmute microphone' : 'Mute microphone'
    this.dom.callBarCameraToggleBtn.textContent = this.state.videoStream ? '📕' : '📷'
    this.dom.callBarCameraToggleBtn.title = this.state.videoStream ? 'Turn camera off' : 'Turn camera on'
    this.dom.callBarScreenToggleBtn.textContent = this.state.screenStream ? '🛑' : '🖥'
    this.dom.callBarScreenToggleBtn.title = this.state.screenStream ? 'Stop screen share' : 'Start screen share'

    if (!inVoiceChannel) {
      this.dom.voiceHint.textContent = hasActiveCall
        ? 'In call while browsing text channels'
        : 'Select a voice channel to join live audio'
    } else if (!inActiveVoiceCall) {
      this.dom.voiceHint.textContent = 'Use Join to enter this call'
    } else {
      this.dom.voiceHint.textContent = this.state.micMuted
        ? 'In voice. You are muted'
        : 'In voice. Mic is live'
    }

    if (this.dom.streamsEmpty) {
      this.dom.streamsEmpty.classList.toggle('hidden', this.dom.streams.children.length > 0)
    }
  }

  canEndCall() {
    if (!this.state.user) {
      return false
    }
    const roles = this.state.user.roles || []
    return roles.includes('admin') || roles.includes('owner') || roles.includes('mod')
  }
}

export { CallControlsPresenter }
