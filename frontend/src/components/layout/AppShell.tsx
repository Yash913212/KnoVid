import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { BookOpen, Command, LogOut, Plus, Search, Workflow, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { openCommandPalette } from '../CommandPalette'
import ThemeToggle from '../ThemeToggle'
import LogoMark from '../brand/LogoMark'
import Magnetic from '../Magnetic'
import { Button } from '../ui/Button'

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const userName = user?.name ?? user?.email ?? 'Thinker'
  const initial = userName.charAt(0).toUpperCase()

  const goTo = (hash: string) => {
    setMobileOpen(false)
    navigate(`/app#${hash}`)
  }

  const navItems = [
    { label: 'Workspace', hash: 'top', icon: <Workflow size={16} /> },
    { label: 'Library', hash: 'library', icon: <BookOpen size={16} /> },
  ]

  return (
    <div className="workspace-frame">
      <aside className={`workspace-rail ${mobileOpen ? 'workspace-rail-open' : ''}`}>
        <div className="rail-brand-row"><Link to="/app" aria-label="KnoVid workspace"><LogoMark /></Link><button type="button" className="rail-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={17} /></button></div>
        <div className="rail-label">Workspace</div>
        <nav className="rail-nav" aria-label="Workspace navigation">
          {navItems.map((item) => {
            const active = location.pathname === '/app' && (location.hash === `#${item.hash}` || (!location.hash && item.hash === 'top'))
            return (
              <button type="button" key={item.hash} className={`rail-nav-item isolate ${active ? 'rail-nav-item-active' : ''}`} onClick={() => goTo(item.hash)}>
                {active && (
                  <motion.span
                    layoutId="rail-nav-pill"
                    className="rail-nav-pill"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="rail-nav-inner">{item.icon}<span>{item.label}</span></span>
              </button>
            )
          })}
        </nav>
        <div className="rail-divider" />
        <div className="rail-label">Shortcuts</div>
        <button type="button" className="rail-nav-item" onClick={openCommandPalette}><Command size={16} /><span>Search library</span><kbd>⌘K</kbd></button>
        <div className="rail-bottom">
          <div className="rail-signal-card"><span className="live-dot" /><div><strong>Signal online</strong><small>All systems nominal</small></div></div>
          <button type="button" className="rail-user" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}><span className="user-avatar">{initial}</span><span><strong>{userName}</strong><small>Personal workspace</small></span><span className="user-caret">•••</span></button>
          {profileOpen && <div className="rail-profile-popover"><p>{user?.email}</p><button type="button" onClick={logout}><LogOut size={14} /> Sign out</button></div>}
        </div>
      </aside>
      {mobileOpen && <button type="button" className="workspace-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}

      <div className="workspace-content">
        <header className="workspace-topbar">
          <div className="topbar-left"><button type="button" className="mobile-rail-toggle" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><span /><span /><span /></button><div className="breadcrumb"><span>Knowledge studio</span><i>/</i><strong>{location.pathname.startsWith('/video/') ? 'Universe' : 'Workspace'}</strong></div></div>
          <div className="topbar-actions"><button type="button" className="topbar-search" onClick={openCommandPalette}><Search size={15} /><span>Search your library</span><kbd>⌘K</kbd></button><ThemeToggle /><Magnetic strength={0.2}><Button size="sm" radius="xl" icon={<Plus size={15} />} onClick={() => goTo('portal')}>New import</Button></Magnetic></div>
        </header>
        <main className="workspace-main"><Outlet /></main>
      </div>
    </div>
  )
}
