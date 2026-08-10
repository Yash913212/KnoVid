import { useRef, forwardRef, useImperativeHandle, useEffect, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { isYouTubeUrl, parseYouTubeUrl, formatTime } from '../utils'
import { DURATION, transitions } from '../lib/motion'

export interface VideoPlayerHandle {
  seekTo: (seconds: number) => void
}

interface Props {
  url?: string
  filePath?: string
  onTimeUpdate?: (seconds: number) => void
}

const YT_POLL_INTERVAL = 300
const SEEK_STEP = 5
const IDLE_MS = 3000
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2]

const Icons = {
  play: (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" />
    </svg>
  ),
  pause: (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ),
  volume: (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  ),
  volumeMuted: (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="m22 9-6 6M16 9l6 6" />
    </svg>
  ),
  fullscreen: (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  ),
  rate: (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2-6 4 12 2-6h4" />
    </svg>
  ),
}

const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(({ url, filePath, onTimeUpdate }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [idle, setIdle] = useState(false)
  const [menu, setMenu] = useState<null | 'speed'>(null)
  const [scrubHover, setScrubHover] = useState<number | null>(null)
  const [ytReady, setYtReady] = useState(false)

  const isYT = !!url && isYouTubeUrl(url)
  const src = filePath ? `/api/files/${encodeURIComponent(filePath.split('/').pop() || '')}` : url

  // Expose seekTo to the transcript / graph
  useImperativeHandle(ref, () => ({
    seekTo(seconds: number) {
      const v = videoRef.current
      if (v) {
        v.currentTime = Math.max(0, seconds)
        v.play()
      } else if (ytReady && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'seekTo', args: [seconds, true] }),
          '*'
        )
      }
    },
  }), [ytReady])

  // ── Play/pause + time + buffering (HTML5 video) ────────────────
  const syncTime = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    setCurrentTime(v.currentTime)
    onTimeUpdate?.(v.currentTime)
  }, [onTimeUpdate])

  const syncBuffered = useCallback(() => {
    const v = videoRef.current
    if (!v || !v.duration) return
    let end = 0
    for (let i = 0; i < v.buffered.length; i++) {
      end = Math.max(end, v.buffered.end(i))
    }
    setBuffered(v.duration ? Math.min(100, (end / v.duration) * 100) : 0)
  }, [])

  // ── Keyboard shortcuts ─────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const v = videoRef.current
      if (!v) return
      const target = e.target as HTMLElement | null
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')) return
      const key = e.key.toLowerCase()

      switch (key) {
        case ' ':
        case 'k':
          e.preventDefault()
          if (v.paused) v.play()
          else v.pause()
          break
        case 'arrowright':
          v.currentTime = Math.min(v.currentTime + SEEK_STEP, v.duration || 0)
          break
        case 'arrowleft':
          v.currentTime = Math.max(v.currentTime - SEEK_STEP, 0)
          break
        case 'arrowup':
          e.preventDefault()
          v.muted = false
          v.volume = Math.min(1, v.volume + 0.1)
          setMuted(false)
          setVolume(v.volume)
          break
        case 'arrowdown':
          e.preventDefault()
          v.volume = Math.max(0, v.volume - 0.1)
          setVolume(v.volume)
          break
        case 'm':
          v.muted = !v.muted
          setMuted(v.muted)
          break
        case 'f':
          toggleFullscreen()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleFullscreen])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play()
    else v.pause()
  }, [])

  // ── Volume / rate sync the media element ───────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.volume = volume
    v.muted = muted
  }, [volume, muted])

  useEffect(() => {
    const v = videoRef.current
    if (v) v.playbackRate = rate
  }, [rate])

  // ── Auto-hide controls while playing ───────────────────────────
  const poke = useCallback(() => {
    if (!videoRef.current?.paused) {
      setIdle(false)
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS)
    }
  }, [])

  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current) }, [])

  // ── YouTube time polling ───────────────────────────────────────
  useEffect(() => {
    if (!isYT || !onTimeUpdate || !ytReady) return
    const interval = setInterval(() => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'getCurrentTime', args: [] }),
        '*'
      )
    }, YT_POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [isYT, onTimeUpdate, ytReady])

  useEffect(() => {
    if (!isYT) return
    const handler = (e: MessageEvent) => {
      if (e.origin !== 'https://www.youtube-nocookie.com' && e.origin !== 'https://www.youtube.com') return
      let data = e.data as { event?: string; info?: { currentTime?: number } } | null
      if (typeof e.data === 'string') {
        try { data = JSON.parse(e.data) as typeof data } catch { return }
      }
      if (data && typeof data === 'object' && data.event === 'onReady') {
        setYtReady(true)
        return
      }
      if (
        data && typeof data === 'object' &&
        data.event === 'infoDelivery' &&
        typeof data.info?.currentTime === 'number' && onTimeUpdate
      ) {
        onTimeUpdate(data.info.currentTime)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [isYT, onTimeUpdate])

  useEffect(() => setYtReady(false), [url, isYT])

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  // ── YouTube: keep native iframe wrapper ────────────────────────
  if (isYT) {
    const videoId = parseYouTubeUrl(url)
    const origin = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''
    return (
      <div className="aspect-video bg-black rounded-lg overflow-hidden">
        <iframe
          ref={iframeRef}
          src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0&origin=${origin}`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          title="YouTube video player"
          allowFullScreen
        />
      </div>
    )
  }

  const showControls = !playing || !idle

  return (
    <div
      ref={containerRef}
      onMouseMove={poke}
      onMouseLeave={() => { if (videoRef.current && !videoRef.current.paused) setIdle(true) }}
      onClick={togglePlay}
      className="user-select-none group relative aspect-video w-full overflow-hidden rounded-lg bg-black"
    >
      <video
        ref={videoRef}
        src={src}
        className="h-full w-full object-contain"
        playsInline
        preload="metadata"
        onClick={(e) => { e.stopPropagation(); togglePlay() }}
        onPlay={() => { setPlaying(true); poke() }}
        onPause={() => { setPlaying(false); setIdle(false) }}
        onTimeUpdate={syncTime}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onProgress={syncBuffered}
        onEnded={() => setPlaying(false)}
      />

      {/* Center hover play overlay when idle/paused */}
      <AnimatePresence>
        {(!playing || idle) && currentTime === 0 && (
          <motion.button
            type="button"
            key="bigplay"
            aria-label="Play"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={transitions.content}
            onClick={(e) => { e.stopPropagation(); togglePlay() }}
            className="absolute inset-0 z-10 grid place-items-center"
          >
            <span className="grid h-20 w-20 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md transition-transform duration-200 hover:scale-110">
              <span className="h-9 w-9">{Icons.play}</span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Buffering spinner */}
      <AnimatePresence>
        {playing && videoRef.current && videoRef.current.readyState < 3 && (
          <motion.span
            key="buffering"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
          >
            <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          </motion.span>
        )}
      </AnimatePresence>

      {/* Controls */}
      <motion.div
        initial={false}
        animate={{ opacity: showControls ? 1 : 0, translateY: showControls ? 0 : 16 }}
        transition={{ duration: DURATION.micro }}
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3 pt-12 ${showControls ? '' : 'pointer-events-none'}`}
      >
        {/* Scrub bar */}
        <div
          className="relative h-6 -mb-1 flex cursor-pointer items-center pt-3"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
            setScrubHover(frac * duration)
          }}
          onMouseLeave={() => setScrubHover(null)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const frac = (e.clientX - rect.left) / rect.width
            const v = videoRef.current
            if (v) {
              v.currentTime = frac * v.duration
              v.play()
            }
          }}
        >
          <div className="relative h-1.5 w-full overflow-visible rounded-full bg-white/25">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: `${buffered}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-[#FF6B35]" style={{ width: `${pct}%` }} />
            <div className="absolute -top-1.5 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white shadow transition-transform duration-150" style={{ left: `${pct}%` }} />
          </div>
          <AnimatePresence>
            {scrubHover != null && (
              <motion.span
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DURATION.micro }}
                className="pointer-events-none absolute -top-1 -translate-x-1/2 rounded-md bg-black/85 px-1.5 py-0.5 font-mono text-[10px] text-white"
                style={{ left: `${(scrubHover / (duration || 1)) * 100}%` }}
              >
                {formatTime(scrubHover)}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3 text-white">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
            className="grid h-8 w-8 place-items-center rounded-full transition-transform hover:scale-110"
          >
            <span className="h-5 w-5">{playing ? Icons.pause : Icons.play}</span>
          </button>

          <span className="font-mono text-xs text-white/90">
            {formatTime(currentTime)}
            <span className="mx-1 text-white/40">/</span>
            {formatTime(duration)}
          </span>

          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => { const v = videoRef.current; if (v) { v.muted = !v.muted; setMuted(v.muted) } }} aria-label={muted ? 'Unmute' : 'Mute'} className="grid h-8 w-8 place-items-center text-white/90 hover:text-white">
              <span className="h-[18px] w-[18px]">{muted || volume === 0 ? Icons.volumeMuted : Icons.volume}</span>
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => { const val = Number(e.target.value); const v = videoRef.current; if (v) { v.volume = val; v.muted = val === 0; setVolume(val); setMuted(val === 0) } }}
              aria-label="Volume"
              className="h-1 w-16 cursor-pointer accent-[#FF6B35]"
            />
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Speed menu */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMenu((m) => (m === 'speed' ? null : 'speed')); if (idleTimer.current) clearTimeout(idleTimer.current) }}
                aria-label="Playback speed"
                aria-expanded={menu === 'speed'}
                className="grid h-8 w-8 place-items-center rounded-full text-white/90 hover:text-white"
              >
                <span className="h-[18px] w-[18px]">{Icons.rate}</span>
                <span className="absolute font-mono text-[9px] font-semibold">{rate.toFixed(rate % 1 === 0 ? 0 : 2)}</span>
              </button>
              <AnimatePresence>
                {menu === 'speed' && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.96 }}
                    transition={{ duration: DURATION.micro }}
                    className="absolute bottom-10 right-0 w-28 overflow-hidden rounded-xl border border-white/15 bg-stone-900/95 py-1 backdrop-blur-md"
                  >
                    {SPEED_OPTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setRate(s); setMenu(null) }}
                        className={`flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors hover:bg-white/10 ${rate === s ? 'text-[#FF8A5C]' : 'text-white/85'}`}
                      >
                        {s}x
                        {rate === s && <span className="h-1.5 w-1.5 rounded-full bg-[#FF6B35]" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button type="button" onClick={toggleFullscreen} aria-label="Fullscreen" className="grid h-8 w-8 place-items-center rounded-full text-white/90 hover:text-white">
              <span className="h-[18px] w-[18px]">{Icons.fullscreen}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
})

VideoPlayer.displayName = 'VideoPlayer'
export default VideoPlayer
