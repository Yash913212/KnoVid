import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { getVideos, STATUS_DOTS, STATUS_LABELS, type Video } from '../api/videos'
import { formatTime } from '../utils'
import { transitions, staggerContainer, staggerItem } from '../lib/motion'

export const OPEN_PALETTE_EVENT = 'knovid:open-palette'

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [videos, setVideos] = useState<Video[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(false)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    if (videos) return
    setLoading(true)
    try {
      setVideos(await getVideos())
    } catch {
      setVideos([])
    } finally {
      setLoading(false)
    }
  }, [videos])

  const openWithDefaults = useCallback(() => {
    setQuery('')
    setOpen(true)
    void load()
    setTimeout(() => inputRef.current?.focus(), 20)
  }, [load])

  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (!openRef.current) openWithDefaults()
        else setOpen(false)
      }
    }
    const onOpen = () => {
      openWithDefaults()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen)
    }
  }, [openWithDefaults])

  const close = () => setOpen(false)

  const results = useMemo(() => {
    const list = videos ?? []
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (v) =>
        v.originalName.toLowerCase().includes(q) ||
        STATUS_LABELS[v.status].toLowerCase().includes(q) ||
        (v.source === 'url' ? 'url' : 'upload').includes(q)
    )
  }, [videos, query])

  useEffect(() => setActive(0), [query, open])

  useEffect(() => {
    const el = listRef.current?.children[active]
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActive((a) => (results.length === 0 ? a : Math.min(a + 1, results.length - 1)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => Math.max(a - 1, 0))
      } else if (e.key === 'Enter') {
        const v = results[active]
        if (v) {
          close()
          navigate(`/video/${v._id}`)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, results, active, navigate])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className="fixed inset-0 z-50 flex items-start justify-center bg-stone-950/45 px-4 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={transitions.content}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/60 bg-white/92 shadow-[0_40px_120px_rgb(28_25_23/0.35)] backdrop-blur-2xl dark:border-white/10 dark:bg-stone-900/95"
          >
            <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-3 dark:border-white/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-stone-400 dark:text-stone-500">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your video library…"
                aria-label="Search your video library"
                className="flex-1 bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-stone-500"
              />
              <kbd className="rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-[10px] text-stone-400 dark:border-white/10 dark:bg-stone-800 dark:text-stone-500">esc</kbd>
            </div>

            <AnimatePresence mode="popLayout">
              <motion.div
                key={query}
                ref={listRef}
                className="max-h-[46vh] overflow-y-auto p-2"
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transitions.micro}
              >
                {loading && videos === null && (
                  <div className="space-y-1.5 p-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 rounded-lg skeleton-shimmer dark:skeleton-shimmer" />
                    ))}
                  </div>
                )}
                {!loading && results.length === 0 && (
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="px-3 py-8 text-center text-sm text-stone-400 dark:text-stone-500"
                  >
                    No videos match "{query}".
                  </motion.p>
                )}
                <motion.ul
                  initial="initial"
                  animate="animate"
                  variants={staggerContainer({ delay: 0.03 })}
                  className="space-y-1"
                >
                  {results.map((v, i) => (
                    <motion.li
                      key={v._id}
                      variants={staggerItem()}
                      style={{ viewTransitionName: `palette-${v._id}` }}
                    >
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => {
                          close()
                          navigate(`/video/${v._id}`)
                        }}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${i === active ? 'bg-[#2BA6A0]/10 dark:bg-[#2BA6A0]/10' : 'hover:bg-stone-50 dark:hover:bg-stone-800/60'}`}
                      >
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 25, delay: i * 0.02 }}
                          className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOTS[v.status]}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-stone-800 dark:text-stone-100">{v.originalName}</span>
                          <span className="block text-xs text-stone-400 dark:text-stone-500">
                            {STATUS_LABELS[v.status]}
                            {v.duration > 0 && ` · ${formatTime(v.duration)}`}
                          </span>
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-widest text-stone-300 dark:text-stone-600">{v.source === 'url' ? 'URL' : 'Upload'}</span>
                      </button>
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center gap-4 border-t border-stone-100 px-4 py-2 text-[10px] text-stone-400 dark:border-white/10 dark:text-stone-500">
              <span className="flex items-center gap-1"><kbd className="rounded border border-stone-200 px-1 font-mono dark:border-white/10">↑↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="rounded border border-stone-200 px-1 font-mono dark:border-white/10">↵</kbd> open</span>
              <span className="ml-auto flex items-center gap-1"><kbd className="rounded border border-stone-200 px-1 font-mono dark:border-white/10">⌘K</kbd> reopen</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}