class AuthPresenter {
  constructor({ dom }) {
    this.dom = dom
  }

  setAuthMessage(text) {
    this.dom.authHint.textContent = text
    this.dom.signinHint.textContent = text
  }

  render({
    user,
    onSetSidebarMenuOpen,
    onSetTextChatDrawerOpen,
    onUpdateChannelLayoutMode,
    onToast
  }) {
    if (user) {
      this.dom.userPill.textContent = `@${user.handle}`
      this.dom.logoutBtn.classList.remove('hidden')
      this.dom.authCard.classList.add('hidden')
      this.dom.layout.classList.remove('hidden')
      if (user.roles?.includes('admin')) {
        this.dom.adminPanel.classList.remove('hidden')
      } else {
        this.dom.adminPanel.classList.add('hidden')
      }
      onSetSidebarMenuOpen(false)
      onSetTextChatDrawerOpen(false)
      onToast('Signed in. Create a channel or invite someone')
    } else {
      this.dom.userPill.textContent = 'signed out'
      this.dom.logoutBtn.classList.add('hidden')
      this.dom.authCard.classList.remove('hidden')
      this.dom.layout.classList.add('hidden')
      this.dom.adminPanel.classList.add('hidden')
      onSetSidebarMenuOpen(false)
      onSetTextChatDrawerOpen(false)
    }
    onUpdateChannelLayoutMode()
  }
}

export { AuthPresenter }
