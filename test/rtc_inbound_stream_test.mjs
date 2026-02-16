import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getOrCreateInboundStream } from '../src/client/RtcInboundStream.mjs'

let streamIdSeed = 0

class FakeMediaStream {
  constructor(tracks = []) {
    this.id = `s-${++streamIdSeed}`
    this._tracks = [...tracks]
  }

  getTracks() {
    return [...this._tracks]
  }

  addTrack(track) {
    if (!this._tracks.some((existing) => existing.id === track.id)) {
      this._tracks.push(track)
    }
  }

  removeTrack(track) {
    this._tracks = this._tracks.filter((candidate) => candidate.id !== track.id)
  }
}

const makeTrack = (kind, id) => ({ kind, id })

const createState = () => ({
  remoteInboundStreamsByPeer: new Map()
})

test('stores signaled stream by stream id and transceiver mid key', () => {
  const state = createState()
  const signaled = new FakeMediaStream([makeTrack('video', 'cam-1')])
  signaled.id = 'remote-stream-1'

  const resolved = getOrCreateInboundStream(
    state,
    { streams: [signaled], transceiver: { mid: '1' } },
    'peer-a',
    { MediaStreamCtor: FakeMediaStream }
  )

  assert.equal(resolved, signaled)
  const peerMap = state.remoteInboundStreamsByPeer.get('peer-a')
  assert.ok(peerMap instanceof Map)
  assert.equal(peerMap.get('stream:remote-stream-1'), signaled)
  assert.equal(peerMap.get('mid:1'), signaled)
})

test('streamless tracks with different mids create separate streams for same peer', () => {
  const state = createState()

  const camStream = getOrCreateInboundStream(
    state,
    { track: makeTrack('video', 'cam-track'), transceiver: { mid: '2' }, streams: [] },
    'peer-a',
    { MediaStreamCtor: FakeMediaStream }
  )
  const screenStream = getOrCreateInboundStream(
    state,
    { track: makeTrack('video', 'screen-track'), transceiver: { mid: '3' }, streams: [] },
    'peer-a',
    { MediaStreamCtor: FakeMediaStream }
  )

  assert.notEqual(camStream.id, screenStream.id)
  assert.equal(camStream.getTracks()[0].id, 'cam-track')
  assert.equal(screenStream.getTracks()[0].id, 'screen-track')
})

test('same mid replaces same-kind video track instead of accumulating stale tracks', () => {
  const state = createState()
  const first = getOrCreateInboundStream(
    state,
    { track: makeTrack('video', 'screen-a'), transceiver: { mid: '4' }, streams: [] },
    'peer-a',
    { MediaStreamCtor: FakeMediaStream }
  )

  const second = getOrCreateInboundStream(
    state,
    { track: makeTrack('video', 'screen-b'), transceiver: { mid: '4' }, streams: [] },
    'peer-a',
    { MediaStreamCtor: FakeMediaStream }
  )

  assert.equal(first, second)
  const tracks = second.getTracks()
  assert.equal(tracks.length, 1)
  assert.equal(tracks[0].id, 'screen-b')
})

test('normalizes legacy per-peer stream values into stream maps', () => {
  const state = createState()
  const legacyStream = new FakeMediaStream([makeTrack('audio', 'mic-legacy')])
  legacyStream.id = 'legacy-1'
  state.remoteInboundStreamsByPeer.set('peer-a', legacyStream)

  const resolved = getOrCreateInboundStream(
    state,
    { track: makeTrack('video', 'cam-new'), transceiver: { mid: '5' }, streams: [] },
    'peer-a',
    { MediaStreamCtor: FakeMediaStream }
  )

  const peerMap = state.remoteInboundStreamsByPeer.get('peer-a')
  assert.ok(peerMap instanceof Map)
  assert.equal(peerMap.get('stream:legacy-1'), legacyStream)
  assert.equal(peerMap.get('mid:5'), resolved)
})
