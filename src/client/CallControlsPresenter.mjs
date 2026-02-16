class CallControlsPresenter {
  constructor({ state, dom, isVoiceChannel }) {
    this.state = state
    this.dom = dom
    this.isVoiceChannel = isVoiceChannel
  }

  render() {
    const inVoiceChannel = this.isVoiceChannel(this.state.currentChannelId)
    const inActiveVoiceCall = Boolean(this.state.callId && this.state.callChannelId === this.state.currentChannelId)

    this.dom.startCallBtn.disabled = !inVoiceChannel || !inActiveVoiceCall
    this.dom.toggleMediaBtn.disabled = !inActiveVoiceCall
    this.dom.shareScreenBtn.disabled = !inActiveVoiceCall
    this.dom.hangupCallBtn.disabled = !this.state.callId
    if (this.dom.editChannelBtn) {
      this.dom.editChannelBtn.disabled = !this.state.currentChannelId
    }

    this.dom.startCallBtn.textContent = this.state.micMuted ? '🔇' : '🎤'
    this.dom.startCallBtn.title = this.state.micMuted ? 'Unmute microphone' : 'Mute microphone'
    this.dom.toggleMediaBtn.textContent = this.state.videoStream ? '📕' : '📷'
    this.dom.toggleMediaBtn.title = this.state.videoStream ? 'Turn camera off' : 'Turn camera on'
    this.dom.shareScreenBtn.textContent = this.state.screenStream ? '🛑' : '🖥'
    this.dom.shareScreenBtn.title = this.state.screenStream ? 'Stop screen share' : 'Start screen share'

    if (!inVoiceChannel) {
      this.dom.voiceHint.textContent = 'Select a voice channel to join live audio'
    } else if (!inActiveVoiceCall) {
      this.dom.voiceHint.textContent = 'Connecting to voice channel...'
    } else {
      this.dom.voiceHint.textContent = this.state.micMuted
        ? 'In voice. You are muted'
        : 'In voice. Mic is live'
    }

    if (this.dom.streamsEmpty) {
      this.dom.streamsEmpty.classList.toggle('hidden', this.dom.streams.children.length > 0)
    }
  }
}

export { CallControlsPresenter }
