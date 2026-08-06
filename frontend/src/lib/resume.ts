// Local "resume playback" positions per video (seconds).
const PREFIX = 'knovid-resume'

export function resumeKey(id: string): string {
  return `${PREFIX}-${id}`
}

/** Saved position in seconds, or null. */
export function getResume(id: string): number | null {
  try {
    const raw = window.localStorage.getItem(resumeKey(id))
    if (!raw) return null
    const v = Number(raw)
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

export function setResume(id: string, seconds: number) {
  try {
    if (seconds > 15) window.localStorage.setItem(resumeKey(id), String(Math.round(seconds)))
  } catch {
    /* ignore quota / privacy errors */
  }
}

export function clearResume(id: string) {
  try {
    window.localStorage.removeItem(resumeKey(id))
  } catch {
    /* ignore */
  }
}