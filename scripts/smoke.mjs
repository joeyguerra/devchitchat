import { WebSocket } from 'ws'

const url = process.env.SMOKE_URL || 'ws://localhost:3000/ws'

const ws = new WebSocket(url)

const send = (t, body) => {
  ws.send(JSON.stringify({ v: 1, t, id: `${t}-${Date.now()}`, ts: Date.now(), body }))
}

ws.on('open', () => {
  send('hello', { client: { name: 'smoke', ver: '0.1.0', platform: 'node' }, resume: {} })
})

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString())
  console.log('[smoke]', msg.t, msg.body || {})
})

ws.on('close', () => {
  console.log('[smoke] closed')
})
