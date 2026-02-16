export class PresenceService {
  constructor() {
    this.userToConnections = new Map()
    this.connectionToChannels = new Map()
  }

  addConnection(connectionId, userId) {
    if (!this.userToConnections.has(userId)) {
      this.userToConnections.set(userId, new Set())
    }
    this.userToConnections.get(userId).add(connectionId)
    this.connectionToChannels.set(connectionId, new Set())
  }

  removeConnection(connectionId, userId) {
    if (userId && this.userToConnections.has(userId)) {
      const set = this.userToConnections.get(userId)
      set.delete(connectionId)
      if (set.size === 0) {
        this.userToConnections.delete(userId)
      }
    }
    this.connectionToChannels.delete(connectionId)
  }

  joinChannel(connectionId, channelId) {
    const channels = this.connectionToChannels.get(connectionId)
    if (channels) {
      channels.add(channelId)
    }
  }

  leaveChannel(connectionId, channelId) {
    const channels = this.connectionToChannels.get(connectionId)
    if (channels) {
      channels.delete(channelId)
    }
  }

  listOnlineUsers() {
    const users = []
    for (const [userId, connections] of this.userToConnections.entries()) {
      users.push({ user_id: userId, online: connections.size > 0 })
    }
    return users
  }
}
