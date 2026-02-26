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
    this.dom.searchResults.innerHTML = ''
    if (!hits.length) {
      const empty = document.createElement('div')
      empty.className = 'search-results-empty'
      empty.textContent = 'No results'
      this.dom.searchResults.appendChild(empty)
      return
    }

    const list = document.createElement('ul')
    list.className = 'search-results-list'

    hits.forEach((hit) => {
      const item = document.createElement('li')
      item.className = 'search-hit'

      const meta = document.createElement('div')
      meta.className = 'search-hit-meta'
      const timeText = hit.ts ? new Date(hit.ts).toLocaleTimeString() : ''
      const seqText = Number.isFinite(hit.seq) ? `#${hit.seq}` : ''
      meta.textContent = [seqText, hit.user_id, timeText].filter(Boolean).join(' · ')

      const snippet = document.createElement('div')
      snippet.className = 'search-hit-snippet'
      snippet.textContent = hit.snippet || hit.text || ''

      item.appendChild(meta)
      item.appendChild(snippet)
      list.appendChild(item)
    })

    this.dom.searchResults.appendChild(list)
  }
}

export { MessagePresenter }
