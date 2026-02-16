import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { initDb } from '../src/server/db/initDb.mjs'
import { ChatServer } from '../src/server/ChatServer.mjs'

const insertUser = (db, userId, handle, roles = ['user']) => {
  db.prepare(
    `
      INSERT INTO users (user_id, handle, display_name, roles_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `
  ).run(userId, handle, handle, JSON.stringify(roles), Date.now())
}

const createServer = () => {
  const db = new DatabaseSync(':memory:')
  initDb(db)
  return new ChatServer({ db, logger: { info: () => {}, warn: () => {}, error: () => {} } })
}

test('rtc.join is idempotent for same connection and call', () => {
  const server = createServer()
  const userId = 'u_join_same'
  insertUser(server.db, userId, 'join_same')

  const hub = server.hubService.ensureDefaultHub(userId)
  const channel = server.channelService.createChannel({
    hubId: hub.hub_id,
    kind: 'voice',
    name: 'voice',
    visibility: 'public',
    createdByUserId: userId
  })
  const call = server.signalingService.createCall({ roomId: channel.channel_id, createdByUserId: userId })

  const sent = []
  server.send = (_connectionId, payload) => sent.push(payload)
  server.broadcastCall = () => {}
  server.broadcastChannel = () => {}
  server.connections.set('conn-1', {
    ws: { send: () => {} },
    connectionId: 'conn-1',
    userId,
    sessionId: 'sess-1',
    peerId: null,
    callId: null
  })

  server.handleRtcJoin('conn-1', { id: 'join-1', body: { call_id: call.call_id } })
  const firstPeerId = server.connections.get('conn-1').peerId
  assert.ok(firstPeerId)
  assert.equal(server.signalingService.getCall(call.call_id).peers.size, 1)

  server.handleRtcJoin('conn-1', { id: 'join-2', body: { call_id: call.call_id } })
  assert.equal(server.connections.get('conn-1').peerId, firstPeerId)
  assert.equal(server.signalingService.getCall(call.call_id).peers.size, 1)
  assert.equal(sent.filter((payload) => payload.t === 'rtc.participants').length, 2)

  server.close()
})

test('rtc.join leaves previous call before joining another', () => {
  const server = createServer()
  const userId = 'u_join_switch'
  insertUser(server.db, userId, 'join_switch')

  const hub = server.hubService.ensureDefaultHub(userId)
  const channelA = server.channelService.createChannel({
    hubId: hub.hub_id,
    kind: 'voice',
    name: 'voice-a',
    visibility: 'public',
    createdByUserId: userId
  })
  const channelB = server.channelService.createChannel({
    hubId: hub.hub_id,
    kind: 'voice',
    name: 'voice-b',
    visibility: 'public',
    createdByUserId: userId
  })
  const callA = server.signalingService.createCall({ roomId: channelA.channel_id, createdByUserId: userId })
  const callB = server.signalingService.createCall({ roomId: channelB.channel_id, createdByUserId: userId })

  server.send = () => {}
  server.broadcastCall = () => {}
  server.broadcastChannel = () => {}
  server.connections.set('conn-2', {
    ws: { send: () => {} },
    connectionId: 'conn-2',
    userId,
    sessionId: 'sess-2',
    peerId: null,
    callId: null
  })

  server.handleRtcJoin('conn-2', { id: 'join-a', body: { call_id: callA.call_id } })
  const firstPeerId = server.connections.get('conn-2').peerId
  assert.equal(server.signalingService.getCall(callA.call_id).peers.size, 1)

  server.handleRtcJoin('conn-2', { id: 'join-b', body: { call_id: callB.call_id } })
  assert.equal(server.signalingService.getCall(callA.call_id), undefined)
  assert.equal(server.signalingService.getCall(callB.call_id).peers.size, 1)
  assert.notEqual(server.connections.get('conn-2').peerId, firstPeerId)
  assert.equal(server.peerConnections.has(firstPeerId), false)

  server.close()
})
