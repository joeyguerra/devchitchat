import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'
import { DatabaseSync } from 'node:sqlite'
import { initDb } from '../src/server/db/initDb.mjs'
import { ChatServer } from '../src/server/ChatServer.mjs'

const waitFor = (ws, predicate, timeoutMs = 1500) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    ws.off('message', handler)
    reject(new Error('Timed out waiting for websocket message'))
  }, timeoutMs)

  const handler = (data) => {
    const msg = JSON.parse(data.toString())
    if (!predicate(msg)) {
      return
    }
    clearTimeout(timer)
    ws.off('message', handler)
    resolve(msg)
  }

  ws.on('message', handler)
})

const waitForType = (ws, type, timeoutMs = 1500) => waitFor(ws, (msg) => msg.t === type, timeoutMs)

const send = (ws, t, body) => {
  ws.send(JSON.stringify({ v: 1, t, id: `${t}-${Date.now()}`, ts: Date.now(), body }))
}

test('ws flow: invite redeem, channel, message, search', async () => {
  const db = new DatabaseSync(':memory:')
  initDb(db)

  const adminId = 'u_admin'
  db.prepare(
    `
      INSERT INTO users (user_id, handle, display_name, roles_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `
  ).run(adminId, 'admin', 'Admin', JSON.stringify(['admin']), Date.now())

  // Create default hub
  const hubId = 'h_lobby'
  db.prepare(
    `
      INSERT INTO hubs (hub_id, name, description, visibility, created_by_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
  ).run(hubId, 'Lobby', 'Main hub', 'public', adminId, Date.now())

  const server = new ChatServer({ db, logger: { info: () => {}, warn: () => {}, error: () => {} } })
  const port = await server.listenAsync(0)

  const ws = new WebSocket(`ws://localhost:${port}/ws`)

  await new Promise((resolve) => ws.on('open', resolve))
  send(ws, 'hello', { client: { name: 'test', ver: '0.1.0', platform: 'node' }, resume: {} })
  await waitForType(ws, 'hello_ack')

  const invite = server.authService.createInvite({ createdByUserId: adminId })
  send(ws, 'auth.invite_redeem', { invite_token: invite.inviteToken, profile: { handle: 'joey', display_name: 'Joey' }, password: 'test-password' })
  await waitForType(ws, 'auth.session')

  send(ws, 'channel.create', { hub_id: hubId, kind: 'text', name: 'general', visibility: 'public' })
  const channelCreated = await waitForType(ws, 'channel.created')
  const channelId = channelCreated.body.channel.channel_id

  send(ws, 'channel.join', { channel_id: channelId })
  await waitForType(ws, 'channel.member_event')

  send(ws, 'msg.send', { channel_id: channelId, client_msg_id: 'local-1', text: 'hello' })
  await waitForType(ws, 'msg.ack')

  send(ws, 'search.query', { scope: { kind: 'channel', channel_id: channelId }, q: 'hello', limit: 10 })
  const search = await waitForType(ws, 'search.result')

  assert.ok(search.body.hits.length >= 1)

  ws.close()
  server.close()
})

test('ws flow: hub updates are broadcast to clients with hub access', async () => {
  const db = new DatabaseSync(':memory:')
  initDb(db)

  const adminId = 'u_admin'
  db.prepare(
    `
      INSERT INTO users (user_id, handle, display_name, roles_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `
  ).run(adminId, 'admin', 'Admin', JSON.stringify(['admin']), Date.now())

  const server = new ChatServer({ db, logger: { info: () => {}, warn: () => {}, error: () => {} } })
  const port = await server.listenAsync(0)

  const creator = new WebSocket(`ws://localhost:${port}/ws`)
  const observer = new WebSocket(`ws://localhost:${port}/ws`)

  await Promise.all([
    new Promise((resolve) => creator.on('open', resolve)),
    new Promise((resolve) => observer.on('open', resolve))
  ])

  send(creator, 'hello', { client: { name: 'creator', ver: '0.1.0', platform: 'node' }, resume: {} })
  send(observer, 'hello', { client: { name: 'observer', ver: '0.1.0', platform: 'node' }, resume: {} })
  await Promise.all([waitForType(creator, 'hello_ack'), waitForType(observer, 'hello_ack')])

  const inviteOne = server.authService.createInvite({ createdByUserId: adminId })
  const inviteTwo = server.authService.createInvite({ createdByUserId: adminId })

  send(creator, 'auth.invite_redeem', {
    invite_token: inviteOne.inviteToken,
    profile: { handle: 'alice', display_name: 'Alice' },
    password: 'test-password'
  })
  send(observer, 'auth.invite_redeem', {
    invite_token: inviteTwo.inviteToken,
    profile: { handle: 'bob', display_name: 'Bob' },
    password: 'test-password'
  })
  await Promise.all([waitForType(creator, 'auth.session'), waitForType(observer, 'auth.session')])

  send(creator, 'hub.create', { name: 'Project', visibility: 'public' })
  const created = await waitForType(creator, 'hub.created')
  const createdHubId = created.body.hub.hub_id

  send(observer, 'hub.list', {})
  const list = await waitForType(observer, 'hub.list_result')
  assert.ok(list.body.hubs.some((hub) => hub.hub_id === createdHubId))

  send(creator, 'hub.update', { hub_id: createdHubId, name: 'Project Updated' })
  const updatedForObserver = await waitFor(
    observer,
    (msg) => msg.t === 'hub.updated' && msg.body?.hub?.hub_id === createdHubId
  )

  assert.equal(updatedForObserver.body.hub.name, 'Project Updated')

  creator.close()
  observer.close()
  server.close()
})

test('ws flow: channel and hub deletes are broadcast to other clients', async () => {
  const db = new DatabaseSync(':memory:')
  initDb(db)

  const adminId = 'u_admin'
  db.prepare(
    `
      INSERT INTO users (user_id, handle, display_name, roles_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `
  ).run(adminId, 'admin', 'Admin', JSON.stringify(['admin']), Date.now())

  const server = new ChatServer({ db, logger: { info: () => {}, warn: () => {}, error: () => {} } })
  const port = await server.listenAsync(0)

  const creator = new WebSocket(`ws://localhost:${port}/ws`)
  const observer = new WebSocket(`ws://localhost:${port}/ws`)

  await Promise.all([
    new Promise((resolve) => creator.on('open', resolve)),
    new Promise((resolve) => observer.on('open', resolve))
  ])

  send(creator, 'hello', { client: { name: 'creator', ver: '0.1.0', platform: 'node' }, resume: {} })
  send(observer, 'hello', { client: { name: 'observer', ver: '0.1.0', platform: 'node' }, resume: {} })
  await Promise.all([waitForType(creator, 'hello_ack'), waitForType(observer, 'hello_ack')])

  const inviteOne = server.authService.createInvite({ createdByUserId: adminId })
  const inviteTwo = server.authService.createInvite({ createdByUserId: adminId })

  send(creator, 'auth.invite_redeem', {
    invite_token: inviteOne.inviteToken,
    profile: { handle: 'alice2', display_name: 'Alice2' },
    password: 'test-password'
  })
  send(observer, 'auth.invite_redeem', {
    invite_token: inviteTwo.inviteToken,
    profile: { handle: 'bob2', display_name: 'Bob2' },
    password: 'test-password'
  })
  await Promise.all([waitForType(creator, 'auth.session'), waitForType(observer, 'auth.session')])

  send(creator, 'hub.create', { name: 'Delete Test Hub', visibility: 'public' })
  const hubCreated = await waitForType(creator, 'hub.created')
  const hubId = hubCreated.body.hub.hub_id

  send(creator, 'channel.create', { hub_id: hubId, kind: 'text', name: 'delete-me', visibility: 'public' })
  const channelCreated = await waitForType(creator, 'channel.created')
  const channelId = channelCreated.body.channel.channel_id

  send(observer, 'channel.join', { channel_id: channelId })
  await waitFor(
    observer,
    (msg) => msg.t === 'channel.member_event' && msg.body?.channel_id === channelId
  )

  send(creator, 'channel.join', { channel_id: channelId })
  await waitFor(
    creator,
    (msg) => msg.t === 'channel.member_event' && msg.body?.channel_id === channelId
  )

  send(creator, 'channel.delete', { channel_id: channelId })
  const observerChannelDeleted = await waitFor(
    observer,
    (msg) => msg.t === 'channel.deleted' && msg.body?.channel_id === channelId
  )
  assert.equal(observerChannelDeleted.body.channel_id, channelId)

  send(creator, 'hub.delete', { hub_id: hubId })
  const observerHubDeleted = await waitFor(
    observer,
    (msg) => msg.t === 'hub.deleted' && msg.body?.hub_id === hubId
  )
  assert.equal(observerHubDeleted.body.hub_id, hubId)

  creator.close()
  observer.close()
  server.close()
})
