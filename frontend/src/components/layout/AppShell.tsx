import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { useAuth } from '../../context/AuthContext'
import { openCommandPalette } from '../CommandPalette'
import { transitions } from '../../lib/motion'
import ThemeToggle from '../ThemeToggle'
import Magnetic from '../Magnetic'

// Root app shell: ambient aurora + floating glass command bar that persist
// across every protected route. Pages render their content via <Outlet/>.
export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const userName = user?.name ?? user?.email ?? ''
  const initial = (userName || 'K').charAt(0).toUpperCase()
  const [profileOpen, setProfileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Deepen the glass + shadow once the page scrolls — the bar reads as
  // "floating glass" at the top and "docked cockpit" while scrolled.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Navigate to a dashboard section. Works from any route: the dashboard
  // reads the hash on mount/change and smooth-scrolls to the anchor.
  const go = (section: string) => navigate(`/#${section}`)

  return (
    <div className="app-atmosphere premium-atmosphere min-h-screen scroll-smooth">
      <motion.header
        initial={{ y: -28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={transitions.page}
        className="sticky top-4 z-40 mx-auto w-[min(100%-2rem,100rem)]"
      >
        <div
          className={`flex items-center gap-2 rounded-[1.75rem] border py-2 pl-3 pr-2 backdrop-blur-xl transition-all duration-500 ${
            scrolled
              ? 'border-white/10 bg-black/65 shadow-[0_30px_100px_rgba(0,0,0,0.65)] dark:border-white/15'
              : 'border-white/5 bg-black/50 shadow-[0_24px_90px_rgba(0,0,0,0.55)] dark:border-white/10'
          }`}
        >
          <Link to="/" className="group flex items-center gap-2.5" aria-label="KnoVid home">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#D946EF] text-white shadow-[0_0_24px_rgb(217 70 239/0.55)] transition-transform duration-200 group-hover:scale-105">
              <IconLogo className="h-5 w-5" />
            </span>
            <span className="font-display hidden text-lg font-black tracking-tight text-white drop-shadow-[0_0_14px_rgb(217 70 239/0.5)] sm:block">
              KnoVid
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {[
              { label: 'Workspace', target: 'top' },
              { label: 'Library', target: 'library' },
            ].map((l) => {
              const active = location.pathname === '/' && location.hash === `#${l.target}`
              return (
                <button
                  key={l.label}
                  type="button"
                  onClick={() => go(l.target)}
                  className={`relative rounded-full px-3.5 py-1.5 text-sm transition-all duration-200 ${
                    active
                      ? 'font-semibold text-[#C2410C] shadow-[0_0_18px_rgb(255_107_53/0.25)] dark:text-[#FF8A5C]'
                      : 'text-stone-600 hover:bg-stone-900/5 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/[0.06] dark:hover:text-white'
                  }`}
                >
                  {l.label}
                  {active && (
                    <motion.span
                      layoutId="nav-glow"
                      className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-[#FF6B35]/15 to-[#D946EF]/15"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </button>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={openCommandPalette}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-sm text-stone-300 transition-colors hover:border-[#FF6B35]/70 hover:text-white"
              aria-label="Search library"
            >
              <IconSearch className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="rounded-md border border-white/10 bg-white/5 px-1.5 font-mono text-[10px] text-stone-400">⌘K</kbd>
            </button>

            <ThemeToggle />

            <Magnetic strength={0.28}>
              <button
                type="button"
                onClick={() => go('portal')}
                className="sheen-button inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#FF6B35] to-[#D946EF] px-3.5 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgb(217 70 239/0.5)] transition-transform duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_44px_rgb(217 70 239/0.65)] active:scale-[0.97]"
              >
                <IconSparkles className="h-4 w-4" />
                Generate
              </button>
            </Magnetic>

            <div className="relative ml-1">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                aria-label="Open profile"
                aria-expanded={profileOpen}
                className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-1.5 transition-colors hover:bg-white/[0.06] lg:pr-3"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#FF6B35] to-[#D946EF] font-display text-sm font-black text-white shadow-[0_0_18px_rgb(217 70 239/0.5)]">
                  {initial}
                </span>
                <span className="hidden max-w-[8rem] truncate text-sm text-stone-300 lg:block">{userName}</span>
                <svg className={`hidden h-3.5 w-3.5 text-stone-500 transition-transform lg:block ${profileOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>

              <AnimateProfile open={profileOpen} userName={userName} email={user?.email ?? ''} initial={initial} onClose={() => setProfileOpen(false)} />
            </div>

            <button
              type="button"
              onClick={logout}
              aria-label="Logout"
              title="Logout"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/30 text-stone-300 transition-colors hover:border-red-400/40 hover:text-red-300"
            >
              <IconLogout className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.header>

      <main className="relative z-10">
        <Outlet />
      </main>
    </div>
  )
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  )
}

function IconLogout({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}

function IconSparkles({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9.9 2.4 11 6l3.6 1.1-3.6 1.1L9.9 12l-1.1-3.8L5.2 7.1 8.8 6z" />
      <path d="m17 14 .8 2.4 2.4.8-2.4.8L17 20.4l-.8-2.4-2.4-.8 2.4-.8z" />
    </svg>
  )
}

function IconLogo({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
    </svg>
  )
}

function AnimateProfile({
  open,
  userName,
  email,
  initial,
  onClose,
}: {
  open: boolean
  userName: string
  email: string
  initial: string
  onClose: () => void
}) {
  return (
    <motion.div
      initial={false}
      animate={open ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -8, scale: 0.97, pointerEvents: 'none' }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-72 origin-top-right overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d10]/95 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
    >
      <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.035] p-4">
        <div aria-hidden className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#D946EF]/20 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#D946EF] font-display text-base font-black text-white shadow-[0_0_20px_rgba(217,70,239,0.45)]">{initial}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{userName || 'KnoVid member'}</p>
            <p className="mt-0.5 truncate text-xs text-stone-500">{email || 'Your knowledge workspace'}</p>
          </div>
        </div>
        <div className="relative mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.07] pt-4">
          <span className="rounded-xl border border-[#FF6B35]/20 bg-[#FF6B35]/[0.07] px-2.5 py-2 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-[#FFB58C]">Knowledge builder</span>
          <span className="rounded-xl border border-[#D946EF]/20 bg-[#D946EF]/[0.07] px-2.5 py-2 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-[#E879F9]">Profile active</span>
        </div>
      </div>
      <button type="button" onClick={onClose} className="mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm text-stone-300 transition-colors hover:bg-white/[0.06] hover:text-white">
        Close profile
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
    </motion.div>
  )
}
