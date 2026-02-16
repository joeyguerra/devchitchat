class SidebarPresenter {
  constructor({ dom, state, isMobileViewport }) {
    this.dom = dom
    this.state = state
    this.isMobileViewport = isMobileViewport
  }

  syncMenuUi() {
    if (!this.dom.mobileMenuBtn || !this.dom.sidebar || !this.dom.sidebarOverlay) {
      return
    }
    this.dom.mobileMenuBtn.setAttribute('aria-expanded', this.state.sidebarMenuOpen ? 'true' : 'false')
    this.dom.sidebar.classList.toggle('mobile-open', this.state.sidebarMenuOpen)
    this.dom.sidebarOverlay.classList.toggle('show', this.state.sidebarMenuOpen)
  }

  setMenuOpen(isOpen, hasUser) {
    if (!hasUser || !this.isMobileViewport()) {
      this.state.sidebarMenuOpen = false
    } else {
      this.state.sidebarMenuOpen = Boolean(isOpen)
    }
    this.syncMenuUi()
  }
}

export { SidebarPresenter }
