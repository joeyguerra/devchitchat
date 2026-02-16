/**
 * Resolve or synthesize inbound MediaStreams for remote peer track events.
 * Maintains a per-peer stream registry keyed by stream id and transceiver mid.
 *
 * @param {Object} state
 * @param {Map<string, Map<string, MediaStream>|MediaStream>} state.remoteInboundStreamsByPeer
 * @param {RTCTrackEvent} event
 * @param {string} peerId
 * @param {Object} [options]
 * @param {Function} [options.MediaStreamCtor]
 * @returns {MediaStream|null}
 */
const getOrCreateInboundStream = (state, event, peerId, options = {}) => {
  if (!state?.remoteInboundStreamsByPeer || !peerId) {
    return null
  }

  const MediaStreamCtor = options.MediaStreamCtor || globalThis.MediaStream
  if (!MediaStreamCtor) {
    return null
  }

  const getPeerStreamMap = () => {
    const existing = state.remoteInboundStreamsByPeer.get(peerId)
    if (existing instanceof Map) {
      return existing
    }
    const streamMap = new Map()
    if (existing && typeof existing === 'object' && typeof existing.getTracks === 'function' && existing.id) {
      streamMap.set(`stream:${existing.id}`, existing)
    }
    state.remoteInboundStreamsByPeer.set(peerId, streamMap)
    return streamMap
  }

  const signaledStream = event.streams?.[0]
  if (signaledStream) {
    const peerStreams = getPeerStreamMap()
    const streamKey = `stream:${signaledStream.id}`
    peerStreams.set(streamKey, signaledStream)
    const transceiverMid = event.transceiver?.mid
    if (transceiverMid !== undefined && transceiverMid !== null) {
      peerStreams.set(`mid:${transceiverMid}`, signaledStream)
    }
    return signaledStream
  }

  if (!event.track) {
    return null
  }

  const peerStreams = getPeerStreamMap()
  const transceiverMid = event.transceiver?.mid
  const streamKey = transceiverMid !== undefined && transceiverMid !== null
    ? `mid:${transceiverMid}`
    : `track:${event.track.kind}:${event.track.id}`

  let stream = peerStreams.get(streamKey) || null
  if (!stream) {
    stream = [...peerStreams.values()].find((candidate) => (
      candidate.getTracks().some((track) => track.id === event.track.id)
    )) || null
  }
  if (!stream) {
    stream = new MediaStreamCtor()
    peerStreams.set(streamKey, stream)
  }

  stream.getTracks()
    .filter((track) => track.kind === event.track.kind && track.id !== event.track.id)
    .forEach((track) => {
      try {
        stream.removeTrack(track)
      } catch (error) {
        // ignore removeTrack inconsistencies across browsers
      }
    })
  const hasTrack = stream.getTracks().some((track) => track.id === event.track.id)
  if (!hasTrack) {
    stream.addTrack(event.track)
  }
  peerStreams.set(streamKey, stream)
  return stream
}

export { getOrCreateInboundStream }
