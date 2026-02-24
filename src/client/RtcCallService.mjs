import { AnswererConnectionActor, OffererConnectionActor } from './RtcConnector.mjs'

class RtcCallService {
  constructor({
    state,
    send,
    rtcInfo,
    rtcWarn,
    isValidSdp,
    summarizeSdpMedia,
    getOrCreateInboundStream,
    ensureRemoteAudio,
    addStreamTile,
    removeStreamTile,
    notifyStreamPublish,
    updateCallControls,
    showToast
  }) {
    this.state = state
    this.send = send
    this.rtcInfo = rtcInfo
    this.rtcWarn = rtcWarn
    this.isValidSdp = isValidSdp
    this.summarizeSdpMedia = summarizeSdpMedia
    this.getOrCreateInboundStream = getOrCreateInboundStream
    this.ensureRemoteAudio = ensureRemoteAudio
    this.addStreamTile = addStreamTile
    this.removeStreamTile = removeStreamTile
    this.notifyStreamPublish = notifyStreamPublish
    this.updateCallControls = updateCallControls
    this.showToast = showToast
    this.negotiationInFlightByPeer = new Set()
    this.negotiationQueuedByPeer = new Set()
  }

  ensurePeers(peers) {
    peers.forEach((peer) => {
      if (peer.peer_id === this.state.selfPeerId) {
        return
      }
      this.createPeerConnection(peer.peer_id, 'offerer')
      this.negotiatePeer(peer.peer_id)
    })
  }

  buildIceServers() {
    if (!this.state.ice) {
      return []
    }
    const servers = []
    if (this.state.ice.stun_urls?.length) {
      servers.push({ urls: this.state.ice.stun_urls })
    }
    if (this.state.ice.turn_urls?.length) {
      servers.push({
        urls: this.state.ice.turn_urls,
        username: this.state.ice.turn_username,
        credential: this.state.ice.turn_credential
      })
    }
    return servers
  }

  createPeerActor(peerId, role = 'offerer') {
    const existing = this.state.peerConnections.get(peerId)
    if (existing) {
      const sameRole = (
        (role === 'offerer' && existing instanceof OffererConnectionActor) ||
        (role === 'answerer' && existing instanceof AnswererConnectionActor)
      )
      if (sameRole) {
        return existing
      }
      this.closePeer(peerId)
    }

    const ActorClass = role === 'answerer' ? AnswererConnectionActor : OffererConnectionActor
    const actor = new ActorClass({
      onIceCandidate: (candidate) => {
        this.rtcInfo('[RTC] local ICE candidate', {
          toPeerId: peerId,
          type: candidate.type || null
        })
        this.send('rtc.ice', {
          call_id: this.state.callId,
          to_peer_id: peerId,
          from_peer_id: this.state.selfPeerId,
          candidate
        })
      },
      onStateChange: (connectionState) => {
        const connState = connectionState?.connectionState
        if (!connState) {
          return
        }
        this.rtcInfo('[RTC] connection state', { peerId, state: connState })
        if (connState === 'failed' || connState === 'closed') {
          this.closePeer(peerId)
        }
      }
    }, {
      rtcConfig: { iceServers: this.buildIceServers() }
    })

    actor.pc.addEventListener('track', (event) => {
      const stream = this.getOrCreateInboundStream(event, peerId)
      this.rtcInfo('[RTC] ontrack', {
        peerId,
        trackKind: event.track?.kind || null,
        streamId: stream?.id || null,
        videoTracks: stream?.getVideoTracks().length || 0,
        audioTracks: stream?.getAudioTracks().length || 0
      })
      if (!stream) {
        return
      }
      if (stream.getVideoTracks().length === 0) {
        this.ensureRemoteAudio(stream, peerId)
        return
      }
      this.addStreamTile(stream, `${peerId}`, false, peerId)
      this.ensureRemoteAudio(stream, peerId)
    })

    actor.pc.addEventListener('iceconnectionstatechange', () => {
      this.rtcInfo('[RTC] ice connection state', { peerId, state: actor.pc.iceConnectionState })
      if (actor.pc.iceConnectionState === 'failed' || actor.pc.iceConnectionState === 'closed') {
        this.closePeer(peerId)
      }
    })

    this.state.peerConnections.set(peerId, actor)
    return actor
  }

  createPeerConnection(peerId, role = 'offerer') {
    return this.createPeerActor(peerId, role).pc
  }

  ensureTransceiverSlots(pc) {
    const audioTransceivers = pc.getTransceivers().filter((transceiver) => transceiver.receiver?.track?.kind === 'audio')
    const videoTransceivers = pc.getTransceivers().filter((transceiver) => transceiver.receiver?.track?.kind === 'video')
    while (audioTransceivers.length < 1) {
      audioTransceivers.push(pc.addTransceiver('audio', { direction: 'recvonly' }))
    }
    while (videoTransceivers.length < 2) {
      videoTransceivers.push(pc.addTransceiver('video', { direction: 'recvonly' }))
    }
    return {
      audio: audioTransceivers[0] || null,
      camera: videoTransceivers[0] || null,
      screen: videoTransceivers[1] || null
    }
  }

  async attachTrackToPeerConnection(transceiver, track) {
    if (!transceiver?.sender) {
      return
    }
    const currentTrack = transceiver.sender.track
    if (currentTrack?.id === track?.id) {
      return
    }
    if (track) {
      if (transceiver.direction === 'recvonly' || transceiver.direction === 'inactive') {
        transceiver.direction = 'sendrecv'
      }
      await transceiver.sender.replaceTrack(track)
      return
    }
    await transceiver.sender.replaceTrack(null)
    if (transceiver.direction === 'sendrecv' || transceiver.direction === 'sendonly') {
      transceiver.direction = 'recvonly'
    }
  }

  async attachLocalTracks(pc) {
    const slots = this.ensureTransceiverSlots(pc)
    const desiredTracks = {
      audio: this.state.audioStream?.getAudioTracks?.()[0] || null,
      camera: this.state.videoStream?.getVideoTracks?.()[0] || null,
      screen: this.state.screenStream?.getVideoTracks?.()[0] || null
    }

    await Promise.all([
      this.attachTrackToPeerConnection(slots.audio, desiredTracks.audio),
      this.attachTrackToPeerConnection(slots.camera, desiredTracks.camera),
      this.attachTrackToPeerConnection(slots.screen, desiredTracks.screen)
    ])
  }

  async waitForStableSignaling(pc, timeoutMs = 3000) {
    if (!pc || pc.signalingState === 'stable') {
      return true
    }
    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        cleanup()
        resolve(false)
      }, timeoutMs)
      const onStateChange = () => {
        if (pc.signalingState !== 'stable') {
          return
        }
        cleanup()
        resolve(true)
      }
      const cleanup = () => {
        window.clearTimeout(timeoutId)
        pc.removeEventListener('signalingstatechange', onStateChange)
      }
      pc.addEventListener('signalingstatechange', onStateChange)
    })
  }

  async negotiatePeer(peerId) {
    if (this.negotiationInFlightByPeer.has(peerId)) {
      this.negotiationQueuedByPeer.add(peerId)
      return
    }
    this.negotiationInFlightByPeer.add(peerId)
    try {
      do {
        this.negotiationQueuedByPeer.delete(peerId)
        await this.negotiatePeerOnce(peerId)
      } while (this.negotiationQueuedByPeer.has(peerId))
    } finally {
      this.negotiationInFlightByPeer.delete(peerId)
    }
  }

  async negotiatePeerOnce(peerId) {
    try {
      const actor = this.createPeerActor(peerId, 'offerer')
      const pc = actor.pc

      const stable = await this.waitForStableSignaling(pc)
      if (!stable) {
        this.rtcWarn('[RTC] negotiate skipped, signaling not stable', {
          toPeerId: peerId,
          signalingState: pc.signalingState
        })
        return
      }

      this.ensureTransceiverSlots(pc)
      await this.attachLocalTracks(pc)
      this.rtcInfo('[RTC] creating offer', {
        toPeerId: peerId,
        senderTracks: pc.getSenders().map((sender) => sender.track?.kind || 'none')
      })
      await actor.handle({ type: 'create-offer' })
      const offer = actor.state.localSDP
      if (!this.isValidSdp(offer?.sdp)) {
        this.rtcWarn('[RTC] offer creation failed, invalid local SDP', { toPeerId: peerId, callId: this.state.callId })
        return
      }
      this.rtcInfo('[RTC] offer created', {
        toPeerId: peerId,
        callId: this.state.callId,
        media: this.summarizeSdpMedia(offer.sdp)
      })
      this.send('rtc.offer', {
        call_id: this.state.callId,
        to_peer_id: peerId,
        from_peer_id: this.state.selfPeerId,
        sdp: offer.sdp
      })
    } catch (error) {
      this.rtcWarn('[RTC] negotiate failed', {
        toPeerId: peerId,
        name: error?.name || null,
        message: error?.message || String(error)
      })
    }
  }

  closePeer(peerId) {
    const actor = this.state.peerConnections.get(peerId)
    this.state.peerConnections.delete(peerId)
    if (actor) {
      actor.close()
    }
    this.state.remoteInboundStreamsByPeer.delete(peerId)

    for (const [streamId, tile] of this.state.streamTiles.entries()) {
      if (tile.dataset.peerId === peerId) {
        tile.remove()
        this.state.streamTiles.delete(streamId)
      }
    }
    for (const [streamId, audioEl] of this.state.remoteAudioEls.entries()) {
      if (audioEl.dataset.peerId === peerId) {
        audioEl.srcObject = null
        audioEl.remove()
        this.state.remoteAudioEls.delete(streamId)
      }
    }
    this.updateCallControls()
  }

  async handleOffer(body) {
    if (!this.isValidSdp(body?.sdp)) {
      console.warn('Ignoring invalid rtc.offer_event SDP', body)
      return
    }
    this.rtcInfo('[RTC] offer received', {
      fromPeerId: body.from_peer_id,
      callId: body.call_id,
      media: this.summarizeSdpMedia(body.sdp)
    })
    const pc = this.createPeerConnection(body.from_peer_id, 'answerer')
    const actor = this.state.peerConnections.get(body.from_peer_id)
    if (!actor) {
      this.rtcWarn('[RTC] offer ignored, missing peer actor', {
        fromPeerId: body.from_peer_id,
        callId: body.call_id
      })
      return
    }
    this.rtcInfo('[RTC] local tracks before attach', {
      toPeerId: body.from_peer_id,
      audioTracks: this.state.audioStream?.getAudioTracks().length || 0,
      videoTracks: this.state.videoStream?.getVideoTracks().length || 0,
      screenTracks: this.state.screenStream?.getVideoTracks().length || 0,
      senderTracks: pc.getSenders().map((sender) => sender.track?.kind || 'none')
    })
    await actor.handle({ type: 'set-remote-offer', sdp: { type: 'offer', sdp: body.sdp } })
    await this.attachLocalTracks(pc)
    this.rtcInfo('[RTC] local tracks after attach', {
      toPeerId: body.from_peer_id,
      senderTracks: pc.getSenders().map((sender) => sender.track?.kind || 'none')
    })
    const pending = this.state.pendingIceByPeer.get(body.from_peer_id) || []
    for (const candidate of pending) {
      await actor.handle({ type: 'add-remote-ice', candidate })
    }
    this.state.pendingIceByPeer.delete(body.from_peer_id)
    await actor.handle({ type: 'create-answer' })
    const answer = actor.state.localSDP
    if (!this.isValidSdp(answer?.sdp)) {
      this.rtcWarn('[RTC] answer creation failed, invalid local SDP', {
        toPeerId: body.from_peer_id,
        callId: body.call_id
      })
      return
    }
    this.rtcInfo('[RTC] answer created', {
      toPeerId: body.from_peer_id,
      callId: body.call_id,
      media: this.summarizeSdpMedia(answer.sdp)
    })
    this.send('rtc.answer', {
      call_id: body.call_id,
      to_peer_id: body.from_peer_id,
      from_peer_id: this.state.selfPeerId,
      sdp: answer.sdp
    })
  }

  async handleAnswer(body) {
    if (!this.isValidSdp(body?.sdp)) {
      console.warn('Ignoring invalid rtc.answer_event SDP', body)
      return
    }
    const actor = this.state.peerConnections.get(body.from_peer_id)
    if (!actor) {
      this.rtcWarn('[RTC] answer ignored, missing peer connection', {
        fromPeerId: body.from_peer_id,
        callId: body.call_id
      })
      return
    }
    if (!(actor instanceof OffererConnectionActor)) {
      this.rtcWarn('[RTC] answer ignored, actor is not offerer', {
        fromPeerId: body.from_peer_id,
        callId: body.call_id
      })
      return
    }
    const pc = actor.pc
    this.rtcInfo('[RTC] answer received', {
      fromPeerId: body.from_peer_id,
      callId: body.call_id,
      media: this.summarizeSdpMedia(body.sdp)
    })
    await actor.handle({ type: 'set-remote-answer', sdp: { type: 'answer', sdp: body.sdp } })
    const pending = this.state.pendingIceByPeer.get(body.from_peer_id) || []
    for (const candidate of pending) {
      await actor.handle({ type: 'add-remote-ice', candidate })
    }
    this.state.pendingIceByPeer.delete(body.from_peer_id)
    if (!pc.remoteDescription) {
      this.rtcWarn('[RTC] remote description missing after answer', {
        fromPeerId: body.from_peer_id,
        callId: body.call_id
      })
    }
  }

  async handleIce(body) {
    const actor = this.state.peerConnections.get(body.from_peer_id)
    if (!actor) {
      if (body.candidate) {
        const pending = this.state.pendingIceByPeer.get(body.from_peer_id) || []
        pending.push(body.candidate)
        this.state.pendingIceByPeer.set(body.from_peer_id, pending)
        this.rtcInfo('[RTC] ICE queued, peer actor missing', { fromPeerId: body.from_peer_id, queued: pending.length })
      }
      this.rtcWarn('[RTC] ICE deferred, missing peer connection', {
        fromPeerId: body.from_peer_id,
        callId: body.call_id
      })
      return
    }
    const pc = actor.pc
    if (body.candidate) {
      this.rtcInfo('[RTC] ICE received', {
        fromPeerId: body.from_peer_id,
        type: body.candidate.type || null,
        hasRemoteDescription: Boolean(pc.remoteDescription)
      })
      if (!pc.remoteDescription) {
        const pending = this.state.pendingIceByPeer.get(body.from_peer_id) || []
        pending.push(body.candidate)
        this.state.pendingIceByPeer.set(body.from_peer_id, pending)
        this.rtcInfo('[RTC] ICE queued until remote description', {
          fromPeerId: body.from_peer_id,
          queued: pending.length
        })
        return
      }
      await actor.handle({ type: 'add-remote-ice', candidate: body.candidate })
    }
  }

  handlePeerEvent(body) {
    if (body.kind === 'join' && body.peer?.peer_id && body.peer.peer_id !== this.state.selfPeerId) {
      this.rtcInfo('[RTC] peer join event', {
        peerId: body.peer.peer_id,
        callId: body.call_id
      })
      this.createPeerConnection(body.peer.peer_id, 'answerer')
    }
    if (body.kind === 'leave' && body.peer?.peer_id) {
      this.rtcInfo('[RTC] peer leave event', {
        peerId: body.peer.peer_id,
        callId: body.call_id
      })
      this.closePeer(body.peer.peer_id)
    }
  }

  async startAudio() {
    if (this.state.audioStream) {
      return
    }
    try {
      const audioConstraints = this.state.selectedAudioInputId
        ? { deviceId: { exact: this.state.selectedAudioInputId } }
        : true
      this.state.audioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false })
    } catch (error) {
      this.state.micMuted = true
      this.showToast('Microphone access was denied')
      this.updateCallControls()
      return
    }
    this.state.audioStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.state.micMuted
    })
    this.state.peerConnections.forEach((actor, peerId) => {
      this.negotiatePeer(peerId)
    })
    this.updateCallControls()
  }

  stopAudio() {
    if (!this.state.audioStream) {
      return
    }
    this.state.audioStream.getTracks().forEach((track) => track.stop())
    this.state.audioStream = null
    this.state.micMuted = false
    this.state.peerConnections.forEach((actor, peerId) => {
      this.negotiatePeer(peerId)
    })
    this.updateCallControls()
  }

  toggleMicMute() {
    if (!this.state.callId || !this.state.audioStream) {
      return
    }
    this.state.micMuted = !this.state.micMuted
    this.state.audioStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.state.micMuted
    })
    this.updateCallControls()
  }

  async startVideo() {
    if (this.state.videoStream) {
      this.stopVideo()
      return
    }
    try {
      const videoConstraints = this.state.selectedVideoInputId
        ? { width: 640, height: 360, deviceId: { exact: this.state.selectedVideoInputId } }
        : { width: 640, height: 360 }
      this.state.videoStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false })
    } catch (error) {
      this.showToast('Camera access was denied')
      this.updateCallControls()
      return
    }
    this.addStreamTile(this.state.videoStream, 'Camera', true, 'local')
    this.notifyStreamPublish('cam', 'camera', 'Camera', this.state.videoStream)
    this.state.peerConnections.forEach((actor, peerId) => {
      this.negotiatePeer(peerId)
    })
    this.updateCallControls()
  }

  stopVideo() {
    if (!this.state.videoStream) {
      return
    }
    this.state.videoStream.getTracks().forEach((track) => track.stop())
    this.removeStreamTile(this.state.videoStream)
    this.state.videoStream = null
    this.state.peerConnections.forEach((actor, peerId) => {
      this.negotiatePeer(peerId)
    })
    this.updateCallControls()
  }

  async startScreenShare() {
    if (this.state.screenStream) {
      this.stopScreenShare()
      return
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      this.showToast('Screen share is not supported on this device/browser')
      return
    }
    try {
      this.state.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    } catch (error) {
      this.showToast('Screen share was cancelled or denied')
      this.updateCallControls()
      return
    }
    this.addStreamTile(this.state.screenStream, 'Screen', true, 'local')
    this.notifyStreamPublish('screen', 'screen', 'Screen', this.state.screenStream)
    this.state.peerConnections.forEach((actor, peerId) => {
      this.negotiatePeer(peerId)
    })
    this.updateCallControls()
    this.state.screenStream.getVideoTracks()[0].addEventListener('ended', () => {
      this.stopScreenShare()
    })
  }

  stopScreenShare() {
    if (!this.state.screenStream) {
      return
    }
    this.state.screenStream.getTracks().forEach((track) => track.stop())
    this.removeStreamTile(this.state.screenStream)
    this.state.screenStream = null
    this.state.peerConnections.forEach((actor, peerId) => {
      this.negotiatePeer(peerId)
    })
    this.updateCallControls()
  }

  teardownCall() {
    this.state.peerConnections.forEach((actor) => actor.close())
    this.state.peerConnections.clear()
    this.state.remoteAudioEls.forEach((audioEl) => {
      audioEl.srcObject = null
      audioEl.remove()
    })
    this.state.remoteAudioEls.clear()
    this.state.remoteInboundStreamsByPeer.clear()
    this.state.pendingIceByPeer.clear()
    this.state.streamTilePruneTimers.forEach((timer) => window.clearTimeout(timer))
    this.state.streamTilePruneTimers.clear()
    this.state.streamTiles.forEach((tile) => tile.remove())
    this.state.streamTiles.clear()
    this.state.callId = null
    this.state.callChannelId = null
    this.state.selfPeerId = null
    this.stopAudio()
    this.stopVideo()
    this.stopScreenShare()
    this.state.voiceActive = false
    this.updateCallControls()
  }
}

export { RtcCallService }
