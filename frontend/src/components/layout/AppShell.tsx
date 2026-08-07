import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { useAuth } from '../../context/AuthContext'
import { openCommandPalette } from '../CommandPalette'
import { transitions } from '../../lib/motion'
import ThemeToggle from '../ThemeToggle'

// Root app shell: ambient aurora + floating glass command bar that persist
// across every protected route. Pages render their content via <Outlet/>.
export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const userName = user?.name ?? user?.email ?? ''
  const initial = (userName || 'K').charAt(0).toUpperCase()

  // Navigate to a dashboard section. Works from any route: the dashboard
  // reads the hash on mount/change and smooth-scrolls to the anchor.
  const go = (section: string) => navigate(`/#${section}`)

  return (
    <div className="app-atmosphere premium-atmosphere min-h-screen scroll-smooth">
      <motion.header
        initial={{ y: -28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={transitions.page}
        className="sticky top-4 z-40 mx-auto w-[min(100%-2rem,72rem)]"
      >
        <div className="flex items-center gap-2 rounded-[1.75rem] border-b border-white/5 bg-black/50 py-2 pl-3 pr-2 shadow-[0_24px_90px_rgba(0,0,0,0.55)] backdrop-blur-xl dark:border-white/10">
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
                  className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? 'bg-[#FF6B35]/12 font-semibold text-[#C2410C] dark:bg-white/[0.08] dark:text-[#FF8A5C]'
                      : 'text-stone-600 hover:bg-stone-900/5 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/[0.06] dark:hover:text-white'
                  }`}
                >
                  {l.label}
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

            <button
              type="button"
              onClick={() => go('portal')}
              className="sheen-button inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#FF6B35] to-[#D946EF] px-3.5 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_rgb(217 70 239/0.5)] transition-transform duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_44px_rgb(217 70 239/0.65)] active:scale-[0.97]"
            >
              <IconSparkles className="h-4 w-4" />
              Generate
            </button>

            <span className="ml-1 hidden items-center gap-2 rounded-full pl-0.5 pr-3 lg:flex" title={userName || 'Signed in'}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#FF6B35] to-[#D946EF] font-display text-sm font-black text-white shadow-[0_0_18px_rgb(217 70 239/0.5)]">
                {initial}
              </span>
              <span className="max-w-[8rem] truncate text-sm text-stone-300">{userName}</span>
            </span>

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