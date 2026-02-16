import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RtcCallService } from '../src/client/RtcCallService.mjs'

class FakeTrack {
  constructor(kind, id) {
    this.kind = kind
    this.id = id
    this.readyState = 'live'
    this.enabled = true
    this.listeners = new Map()
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || []
    handlers.push(handler)
    this.listeners.set(type, handlers)
  }

  stop() {
    this.readyState = 'ended'
    const handlers = this.listeners.get('ended') || []
    handlers.forEach((handler) => handler())
  }
}

class FakeMediaStream {
  constructor(tracks = []) {
    this._tracks = [...tracks]
  }

  getTracks() {
    return [...this._tracks]
  }

  getAudioTracks() {
    return this._tracks.filter((track) => track.kind === 'audio')
  }

  getVideoTracks() {
    return this._tracks.filter((track) => track.kind === 'video')
  }
}

class FakeSender {
  constructor() {
    this.track = null
  }

  async replaceTrack(track) {
    this.track = track || null
  }
}

class FakeTransceiver {
  constructor(kind, mid, direction = 'recvonly') {
    this.mid = String(mid)
    this.direction = direction
    this.sender = new FakeSender()
    this.receiver = { track: { kind } }
  }
}

class FakePeerConnection {
  constructor() {
    this.transceivers = []
    this.midSeed = 0
  }

  getTransceivers() {
    return [...this.transceivers]
  }

  addTransceiver(kind, options = {}) {
    const transceiver = new FakeTransceiver(kind, this.midSeed++, options.direction || 'recvonly')
    this.transceivers.push(transceiver)
    return transceiver
  }

  getSenders() {
    return this.transceivers.map((transceiver) => transceiver.sender)
  }
}

const createState = () => ({
  callId: 'call-1',
  selfPeerId: 'peer-self',
  audioStream: null,
  videoStream: null,
  screenStream: null,
  peerConnections: new Map(),
  remoteInboundStreamsByPeer: new Map(),
  remoteAudioEls: new Map(),
  pendingIceByPeer: new Map(),
  streamTilePruneTimers: new Map(),
  streamTiles: new Map(),
  micMuted: false,
  callChannelId: 'channel-1',
  voiceActive: true
})

const createService = (state) => new RtcCallService({
  state,
  send: () => {},
  rtcInfo: () => {},
  rtcWarn: () => {},
  isValidSdp: () => true,
  summarizeSdpMedia: () => ({}),
  getOrCreateInboundStream: () => null,
  ensureRemoteAudio: () => {},
  addStreamTile: () => {},
  removeStreamTile: () => {},
  notifyStreamPublish: () => {},
  updateCallControls: () => {},
  showToast: () => {}
})

test('attachLocalTracks keeps deterministic audio/camera/screen slots across toggles', async () => {
  const state = createState()
  const service = createService(state)
  const pc = new FakePeerConnection()

  const micTrack = new FakeTrack('audio', 'mic-1')
  const cameraTrack = new FakeTrack('video', 'cam-1')
  const screenTrack = new FakeTrack('video', 'screen-1')

  state.audioStream = new FakeMediaStream([micTrack])
  state.videoStream = new FakeMediaStream([cameraTrack])
  state.screenStream = new FakeMediaStream([screenTrack])

  await service.attachLocalTracks(pc)

  assert.equal(pc.getTransceivers().length, 3)
  const [audioTx, cameraTx, screenTx] = pc.getTransceivers()
  assert.equal(audioTx.receiver.track.kind, 'audio')
  assert.equal(cameraTx.receiver.track.kind, 'video')
  assert.equal(screenTx.receiver.track.kind, 'video')
  assert.equal(audioTx.sender.track?.id, 'mic-1')
  assert.equal(cameraTx.sender.track?.id, 'cam-1')
  assert.equal(screenTx.sender.track?.id, 'screen-1')

  state.screenStream = null
  await service.attachLocalTracks(pc)

  assert.equal(pc.getTransceivers().length, 3)
  assert.equal(audioTx.sender.track?.id, 'mic-1')
  assert.equal(cameraTx.sender.track?.id, 'cam-1')
  assert.equal(screenTx.sender.track, null)

  const newScreenTrack = new FakeTrack('video', 'screen-2')
  state.screenStream = new FakeMediaStream([newScreenTrack])
  await service.attachLocalTracks(pc)

  assert.equal(pc.getTransceivers().length, 3)
  assert.equal(audioTx.sender.track?.id, 'mic-1')
  assert.equal(cameraTx.sender.track?.id, 'cam-1')
  assert.equal(screenTx.sender.track?.id, 'screen-2')
})

test('camera restarts do not clear screen sender slot', async () => {
  const state = createState()
  const service = createService(state)
  const pc = new FakePeerConnection()

  state.videoStream = new FakeMediaStream([new FakeTrack('video', 'cam-a')])
  state.screenStream = new FakeMediaStream([new FakeTrack('video', 'screen-a')])
  await service.attachLocalTracks(pc)

  const [, cameraTx, screenTx] = pc.getTransceivers()
  assert.equal(cameraTx.sender.track?.id, 'cam-a')
  assert.equal(screenTx.sender.track?.id, 'screen-a')

  state.videoStream = null
  await service.attachLocalTracks(pc)
  assert.equal(cameraTx.sender.track, null)
  assert.equal(screenTx.sender.track?.id, 'screen-a')

  state.videoStream = new FakeMediaStream([new FakeTrack('video', 'cam-b')])
  await service.attachLocalTracks(pc)
  assert.equal(cameraTx.sender.track?.id, 'cam-b')
  assert.equal(screenTx.sender.track?.id, 'screen-a')
  assert.equal(pc.getTransceivers().length, 3)
})
