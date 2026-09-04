import { useRef, forwardRef, useImperativeHandle, useEffect, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { isYouTubeUrl, parseYouTubeUrl, formatTime } from '../utils'
import { mediaUrl } from '../api/client'
import { DURATION, transitions } from '../lib/motion'

export interface VideoPlayerHandle {
  seekTo: (seconds: number) => void
}

interface Props {
  url?: string
  filePath?: string
  title?: string
  onTimeUpdate?: (seconds: number) => void
}

const IDLE_MS = 3000
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const YT_ORIGIN = 'https://www.youtube-nocookie.com'

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
  document: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  ),
  globe: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  external: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
}

const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(({ url, filePath, title, onTimeUpdate }, ref) => {
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
  const [ytReady] = useState(true)

  const isYT = !!url && isYouTubeUrl(url)
  const ext = (filePath || '').split('.').pop()?.toLowerCase() || ''
  const isDocument = ['pdf', 'txt', 'docx', 'doc', 'md', 'json', 'csv'].includes(ext) || (!isYT && !filePath && !!url)
  const isAudio = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus'].includes(ext)

  const baseFileUrl = filePath && !isDocument ? `/api/files/${encodeURIComponent(filePath.split('/').pop() || '')}` : null
  const [fileSrc, setFileSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!baseFileUrl) {
      setFileSrc(null)
      return
    }
    let cancelled = false
    mediaUrl(baseFileUrl).then((withToken) => {
      if (!cancelled) setFileSrc(withToken)
    })
    return () => { cancelled = true }
  }, [baseFileUrl])

  const src = isYT ? undefined : fileSrc || undefined

  // Expose seekTo to the transcript / graph
  useImperativeHandle(ref, () => ({
    seekTo(seconds: number) {
      setCurrentTime(seconds)
      onTimeUpdate?.(seconds)
      const v = videoRef.current
      if (v) {
        v.currentTime = Math.max(0, seconds)
        v.play()
      } else if (ytReady && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'seekTo', args: [seconds, true] }),
          YT_ORIGIN
        )
      }
    },
  }), [ytReady, onTimeUpdate])

  // Simulation timer for Document read-along mode
  useEffect(() => {
    if (!isDocument || !playing) return
    const interval = setInterval(() => {
      setCurrentTime((t) => {
        const next = t + rate
        onTimeUpdate?.(next)
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [isDocument, playing, rate, onTimeUpdate])

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

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.()
  }, [])

  const togglePlay = useCallback(() => {
    if (isDocument) {
      setPlaying((p) => !p)
      return
    }
    const v = videoRef.current
    if (v) {
      if (v.paused) void v.play()
      else v.pause()
      return
    }
    if (ytReady && iframeRef.current?.contentWindow) {
      const func = playing ? 'pauseVideo' : 'playVideo'
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func }),
        YT_ORIGIN
      )
      setPlaying((p) => !p)
    }
  }, [isDocument, ytReady, playing])

  const poke = () => {
    setIdle(false)
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => {
      if (playing) setIdle(true)
    }, IDLE_MS)
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER 1: Document / Web Article Hero Card
  // ─────────────────────────────────────────────────────────────
  if (isDocument) {
    const isWeb = !!url
    const badgeText = isWeb ? 'Web Article' : ext ? `${ext.toUpperCase()} Document` : 'Document'
    const docTitle = title || (isWeb ? url : 'Document Reader')

    return (
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-stone-950/80 p-6 shadow-2xl backdrop-blur-2xl sm:p-8"
      >
        {/* Glow ambient */}
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-[#2BA6A0]/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-[#C17EF9]/15 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-5">
          {/* Top row: badge + link */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[#2BA6A0] to-[#C17EF9] text-white shadow-md">
                {isWeb ? Icons.globe : Icons.document}
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-[#73CEC2]">
                {badgeText}
              </span>
            </div>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-stone-400 transition-colors hover:text-white"
              >
                <span>Visit original source</span>
                {Icons.external}
              </a>
            )}
          </div>

          {/* Title & read-along controls */}
          <div>
            <h2 className="font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
              {docTitle}
            </h2>
            <p className="mt-1 text-xs text-stone-400">
              Interactive knowledge universe with full transcript, speaker awareness, and knowledge graph.
            </p>
          </div>

          {/* Audio / Read-along transport bar */}
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-md">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'Pause read-along' : 'Play read-along'}
              className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#2BA6A0] to-[#C17EF9] text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
            >
              <span className="h-5 w-5">{playing ? Icons.pause : Icons.play}</span>
            </button>

            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-xs font-semibold text-white">
                {formatTime(currentTime)}
              </span>
              <span className="text-[10px] text-stone-400">
                {playing ? 'Read-along active' : 'Read-along tracker'}
              </span>
            </div>

            {/* Quick Speed toggle */}
            <div className="ml-auto flex items-center gap-1">
              {SPEED_OPTIONS.slice(1, 5).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRate(s)}
                  className={`rounded-lg px-2 py-1 font-mono text-xs transition-colors ${
                    rate === s ? 'bg-[#2BA6A0] font-bold text-white' : 'text-stone-400 hover:text-white'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER 2: YouTube Embed Player
  // ─────────────────────────────────────────────────────────────
  if (isYT) {
    const videoId = parseYouTubeUrl(url!)
    return (
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden rounded-lg bg-black"
      >
        <iframe
          ref={iframeRef}
          src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
          title={title || 'YouTube video'}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER 3: HTML5 Media Player (Video or Audio)
  // ─────────────────────────────────────────────────────────────
  const showControls = !playing || !idle
  const pct = duration ? Math.min(100, (currentTime / duration) * 100) : 0

  return (
    <div
      ref={containerRef}
      onMouseMove={poke}
      onMouseLeave={() => { if (videoRef.current && !videoRef.current.paused) setIdle(true) }}
      onClick={togglePlay}
      className={`user-select-none group relative w-full overflow-hidden rounded-lg bg-black ${
        isAudio ? 'h-48' : 'aspect-video'
      }`}
    >
      <video
        ref={videoRef}
        src={src}
        aria-label={title || (isAudio ? 'Audio player' : 'Video player')}
        className={`h-full w-full ${isAudio ? 'hidden' : 'object-contain'}`}
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

      {/* Audio Visualizer Card when media is audio-only */}
      {isAudio && (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#2BA6A0]/20 via-transparent to-[#C17EF9]/20" />
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#2BA6A0] to-[#C17EF9] text-white shadow-xl">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
          </span>
          <p className="font-display text-lg font-bold text-white">{title || 'Audio Recording'}</p>
        </div>
      )}

      {/* Big Play overlay */}
      <AnimatePresence>
        {(!playing || idle) && currentTime === 0 && !isAudio && (
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
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={duration || 0}
          aria-valuenow={currentTime}
          aria-valuetext={formatTime(currentTime)}
          tabIndex={0}
          className="relative -mb-1 flex h-6 cursor-pointer items-center pt-3 focus:outline-none"
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
              void v.play()
            }
          }}
        >
          <div className="relative h-1.5 w-full overflow-visible rounded-full bg-white/25">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: `${buffered}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-[#2BA6A0]" style={{ width: `${pct}%` }} />
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
            <button
              type="button"
              onClick={() => { const v = videoRef.current; if (v) { v.muted = !v.muted; setMuted(v.muted) } }}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="grid h-8 w-8 place-items-center text-white/90 hover:text-white"
            >
              <span className="h-[18px] w-[18px]">{muted || volume === 0 ? Icons.volumeMuted : Icons.volume}</span>
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const val = Number(e.target.value)
                const v = videoRef.current
                if (v) {
                  v.volume = val
                  v.muted = val === 0
                  setVolume(val)
                  setMuted(val === 0)
                }
              }}
              aria-label="Volume"
              className="h-1 w-16 cursor-pointer accent-[#2BA6A0]"
            />
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setMenu((m) => (m === 'speed' ? null : 'speed'))
                  if (idleTimer.current) clearTimeout(idleTimer.current)
                }}
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
                        onClick={(e) => {
                          e.stopPropagation()
                          setRate(s)
                          const v = videoRef.current
                          if (v) v.playbackRate = s
                          setMenu(null)
                        }}
                        className={`flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors hover:bg-white/10 ${
                          rate === s ? 'text-[#73CEC2]' : 'text-white/85'
                        }`}
                      >
                        {s}x
                        {rate === s && <span className="h-1.5 w-1.5 rounded-full bg-[#2BA6A0]" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {!isAudio && (
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label="Fullscreen"
                className="grid h-8 w-8 place-items-center rounded-full text-white/90 hover:text-white"
              >
                <span className="h-[18px] w-[18px]">{Icons.fullscreen}</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
})

VideoPlayer.displayName = 'VideoPlayer'
export default VideoPlayer
