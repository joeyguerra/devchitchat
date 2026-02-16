class MessagePresenter {
  constructor({ dom, state }) {
    this.dom = dom
    this.state = state
  }

  renderMessages(channelId) {
    if (channelId !== this.state.currentChannelId) {
      return
    }
    const list = this.state.messages.get(channelId) || []
    this.dom.messages.innerHTML = ''
    list.forEach((msg) => {
      const item = document.createElement('div')
      item.className = 'message'
      const meta = document.createElement('div')
      meta.className = 'meta'
      const handle = msg.user_handle || msg.user_id
      meta.textContent = `${handle} · ${new Date(msg.ts).toLocaleTimeString()}`
      const text = document.createElement('div')
      text.textContent = msg.text
      item.appendChild(meta)
      item.appendChild(text)
      this.dom.messages.appendChild(item)
    })
    this.dom.messages.scrollTop = this.dom.messages.scrollHeight
  }

  renderSearch(hits) {
    if (!hits.length) {
      this.dom.searchResults.textContent = 'No results'
      return
    }
    this.dom.searchResults.textContent = hits.map((hit) => hit.snippet || hit.text).join(' | ')
  }
}

export { MessagePresenter }
