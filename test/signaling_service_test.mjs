import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SignalingService } from '../src/server/services/SignalingService.mjs'

test('signaling routes offer to peer', () => {
  const signaling = new SignalingService({})
  const call = signaling.createCall({ roomId: 'r1', createdByUserId: 'u1' })

  const peerA = signaling.joinCall({ callId: call.call_id, userId: 'u1' })
  const peerB = signaling.joinCall({ callId: call.call_id, userId: 'u2' })

  let event
  signaling.onEvent((payload) => {
    event = payload
  })

  signaling.routeOffer({ callId: call.call_id, fromPeerId: peerA.peerId, toPeerId: peerB.peerId, sdp: 'v=0' })

  assert.equal(event.t, 'rtc.offer_event')
  assert.equal(event.body.to_peer_id, peerB.peerId)
})
