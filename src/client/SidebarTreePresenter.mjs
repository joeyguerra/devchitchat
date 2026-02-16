class SidebarTreePresenter {
  constructor({
    dom,
    state,
    onOpenCreateRoomModal,
    onDeleteHub,
    onDeleteChannel,
    onSetActiveChannel,
    onUpdateHubName,
    onUpdateChannelName
  }) {
    this.dom = dom
    this.state = state
    this.onOpenCreateRoomModal = onOpenCreateRoomModal
    this.onDeleteHub = onDeleteHub
    this.onDeleteChannel = onDeleteChannel
    this.onSetActiveChannel = onSetActiveChannel
    this.onUpdateHubName = onUpdateHubName
    this.onUpdateChannelName = onUpdateChannelName
  }

  startEditingHubName(hub, hubNameElement) {
    const originalName = hub.name
    const input = document.createElement('input')
    input.type = 'text'
    input.value = originalName
    input.className = 'inline-edit-input hub-edit-input'

    const saveEdit = () => {
      const newName = input.value.trim()
      if (newName && newName !== originalName) {
        this.onUpdateHubName(hub.hub_id, newName)
      }
      hubNameElement.textContent = originalName
      hubNameElement.style.display = ''
      input.remove()
    }

    const cancelEdit = () => {
      hubNameElement.style.display = ''
      input.remove()
    }

    input.addEventListener('blur', saveEdit)
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        saveEdit()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        cancelEdit()
      }
    })

    hubNameElement.style.display = 'none'
    hubNameElement.parentElement.insertBefore(input, hubNameElement)
    input.focus()
    input.select()
  }

  startEditingChannelName(channel, channelNameElement, icon) {
    const originalName = channel.name
    const input = document.createElement('input')
    input.type = 'text'
    input.value = originalName
    input.className = 'inline-edit-input channel-edit-input'

    const saveEdit = () => {
      const newName = input.value.trim()
      if (newName && newName !== originalName) {
        this.onUpdateChannelName(channel.channel_id, newName)
      }
      channelNameElement.textContent = `${icon} ${originalName}`
      channelNameElement.style.display = ''
      input.remove()
    }

    const cancelEdit = () => {
      channelNameElement.style.display = ''
      input.remove()
    }

    input.addEventListener('blur', saveEdit)
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        saveEdit()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        cancelEdit()
      }
    })

    channelNameElement.style.display = 'none'
    channelNameElement.parentElement.insertBefore(input, channelNameElement)
    input.focus()
    input.select()
  }

  render() {
    this.dom.hubsList.innerHTML = ''

    if (this.state.hubs.length === 0) {
      const emptyMsg = document.createElement('li')
      emptyMsg.className = 'empty-message'
      emptyMsg.textContent = 'No hubs yet. Create one!'
      this.dom.hubsList.appendChild(emptyMsg)
      return
    }

    this.state.hubs.forEach((hub) => {
      const hubItem = document.createElement('li')
      hubItem.className = 'hub-item'

      const hubHeader = document.createElement('div')
      hubHeader.className = 'hub-header'

      const hubName = document.createElement('span')
      hubName.className = 'hub-name'
      hubName.textContent = hub.name
      hubName.title = 'Double-click to edit'
      hubName.addEventListener('dblclick', (event) => {
        event.stopPropagation()
        this.startEditingHubName(hub, hubName)
      })

      const addChannelBtn = document.createElement('button')
      addChannelBtn.className = 'add-channel-btn'
      addChannelBtn.textContent = '+'
      addChannelBtn.title = `Add channel to ${hub.name}`
      addChannelBtn.addEventListener('click', (event) => {
        event.stopPropagation()
        this.onOpenCreateRoomModal(hub.hub_id)
      })

      const deleteHubBtn = document.createElement('button')
      deleteHubBtn.className = 'add-channel-btn delete-btn'
      deleteHubBtn.textContent = '🗑'
      deleteHubBtn.title = `Delete hub ${hub.name}`
      deleteHubBtn.setAttribute('aria-label', `Delete hub ${hub.name}`)
      deleteHubBtn.addEventListener('click', (event) => {
        event.stopPropagation()
        this.onDeleteHub(hub)
      })

      const hubActions = document.createElement('div')
      hubActions.className = 'hub-actions'
      hubActions.appendChild(addChannelBtn)
      hubActions.appendChild(deleteHubBtn)

      hubHeader.appendChild(hubName)
      hubHeader.appendChild(hubActions)
      hubItem.appendChild(hubHeader)

      const hubChannels = this.state.channels.filter((channel) => channel.hub_id === hub.hub_id)
      if (hubChannels.length > 0) {
        const channelsList = document.createElement('ul')
        channelsList.className = 'channels-list'

        hubChannels.forEach((channel) => {
          const channelItem = document.createElement('li')
          channelItem.className = 'channel-item'
          const kindIcon = channel.kind === 'voice' ? '🔊' : '#'
          const visibilityIcon = channel.visibility === 'public' ? '🌍' : '🔒'
          const icon = `${kindIcon} ${visibilityIcon}`
          channelItem.innerHTML = ''

          const channelName = document.createElement('span')
          channelName.textContent = `${icon} ${channel.name}`
          channelName.title = 'Click to join'
          channelName.style.flex = '1'
          if (channel.channel_id === this.state.currentChannelId) {
            channelItem.classList.add('active')
          }

          channelName.addEventListener('click', () => {
            this.onSetActiveChannel(channel.channel_id)
          })

          const deleteChannelBtn = document.createElement('button')
          deleteChannelBtn.className = 'channel-delete-btn'
          deleteChannelBtn.textContent = '🗑'
          deleteChannelBtn.title = `Delete channel ${channel.name}`
          deleteChannelBtn.setAttribute('aria-label', `Delete channel ${channel.name}`)
          deleteChannelBtn.addEventListener('click', (event) => {
            event.stopPropagation()
            this.onDeleteChannel(channel)
          })

          channelItem.appendChild(channelName)
          channelItem.appendChild(deleteChannelBtn)
          channelsList.appendChild(channelItem)
        })

        hubItem.appendChild(channelsList)
      }

      this.dom.hubsList.appendChild(hubItem)
    })
  }
}

export { SidebarTreePresenter }
