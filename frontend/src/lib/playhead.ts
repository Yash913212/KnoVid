import { useSyncExternalStore } from 'react'

let currentTime = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return currentTime
}

export function setPlayhead(seconds: number) {
  currentTime = seconds
  for (const listener of listeners) listener()
}

export function usePlayhead(): number {
  return useSyncExternalStore(subscribe, getSnapshot)
}