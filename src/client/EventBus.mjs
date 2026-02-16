class EventBus {
  constructor() {
    this.listeners = new Map()
  }

  on(eventName, handler) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set())
    }
    const handlers = this.listeners.get(eventName)
    handlers.add(handler)
    return () => {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.listeners.delete(eventName)
      }
    }
  }

  emit(eventName, payload) {
    const handlers = this.listeners.get(eventName)
    if (!handlers) {
      return
    }
    handlers.forEach((handler) => {
      handler(payload)
    })
  }
}

export { EventBus }
