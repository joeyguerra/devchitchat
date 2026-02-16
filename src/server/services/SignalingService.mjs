import { EventEmitter } from 'node:events'
import { newId } from '../util/ids.mjs'
import { ServiceError } from '../util/errors.mjs'

export class SignalingService {
  constructor({ nowFn = () => Date.now() }) {
    this.nowFn = nowFn
    this.calls = new Map()
    this.emitter = new EventEmitter()
  }

  onEvent(handler) {
    this.emitter.on('event', handler)
  }

  createCall({ roomId, createdByUserId, topology = 'mesh' }) {
    for (const existingCall of this.calls.values()) {
      if (existingCall.room_id === roomId) {
        return {
          call_id: existingCall.call_id,
          room_id: existingCall.room_id,
          topology: existingCall.topology
        }
      }
    }

    const callId = newId('call')
    this.calls.set(callId, {
      call_id: callId,
      room_id: roomId,
      created_by_user_id: createdByUserId,
      topology,
      peers: new Map()
    })

    return { call_id: callId, room_id: roomId, topology }
  }

  joinCall({ callId, userId }) {
    const call = this.calls.get(callId)
    if (!call) {
      throw new ServiceError('NOT_FOUND', 'Call not found')
    }
    const peerId = newId('peer')
    call.peers.set(peerId, { peer_id: peerId, user_id: userId, joined_at: this.nowFn() })
    const peers = Array.from(call.peers.values()).map((peer) => ({ peer_id: peer.peer_id, user_id: peer.user_id }))
    return { peerId, peers }
  }

  leaveCall({ callId, peerId }) {
    const call = this.calls.get(callId)
    if (!call) {
      return { removed: false, peers: [], ended: false, room_id: null }
    }
    const removed = call.peers.delete(peerId)
    const peers = Array.from(call.peers.values()).map((peer) => ({ peer_id: peer.peer_id, user_id: peer.user_id }))
    const roomId = call.room_id
    const ended = call.peers.size === 0
    if (call.peers.size === 0) {
      this.calls.delete(callId)
    }
    return { removed, peers, ended, room_id: roomId }
  }

  endCall({ callId }) {
    const call = this.calls.get(callId)
    if (!call) {
      return null
    }
    this.calls.delete(callId)
    return {
      call_id: call.call_id,
      room_id: call.room_id,
      peers: Array.from(call.peers.values()).map((peer) => ({ peer_id: peer.peer_id, user_id: peer.user_id }))
    }
  }

  getCall(callId) {
    return this.calls.get(callId)
  }

  routeOffer({ callId, fromPeerId, toPeerId, sdp }) {
    this.routeSignal({ callId, fromPeerId, toPeerId, payload: { sdp }, type: 'rtc.offer_event' })
  }

  routeAnswer({ callId, fromPeerId, toPeerId, sdp }) {
    this.routeSignal({ callId, fromPeerId, toPeerId, payload: { sdp }, type: 'rtc.answer_event' })
  }

  routeIce({ callId, fromPeerId, toPeerId, candidate }) {
    this.routeSignal({ callId, fromPeerId, toPeerId, payload: { candidate }, type: 'rtc.ice_event' })
  }

  routeSignal({ callId, fromPeerId, toPeerId, payload, type }) {
    const call = this.calls.get(callId)
    if (!call) {
      throw new ServiceError('NOT_FOUND', 'Call not found')
    }
    if (!call.peers.has(fromPeerId) || !call.peers.has(toPeerId)) {
      throw new ServiceError('BAD_REQUEST', 'Peer not in call')
    }

    this.emitter.emit('event', {
      t: type,
      body: {
        call_id: callId,
        from_peer_id: fromPeerId,
        to_peer_id: toPeerId,
        ...payload
      }
    })
  }
}
