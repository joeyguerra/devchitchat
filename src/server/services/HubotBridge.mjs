import { EventEmitter } from 'node:events'

export class HubotBridge {
  constructor({ botUserId = 'u_hubot' } = {}) {
    this.botUserId = botUserId
    this.emitter = new EventEmitter()
  }

  onCommand(handler) {
    this.emitter.on('command', handler)
  }

  emitCommand(payload) {
    this.emitter.emit('command', payload)
  }
}
