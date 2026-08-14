import { Component, type ErrorInfo, type ReactNode } from 'react'
import { GlassCard } from './ui/GlassCard'
import { Eyebrow } from './ui/Eyebrow'
import { Button } from './ui/Button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Catches render crashes and failed lazy chunk loads so the app never
// freezes on a blank screen. Resets on "Try again" (soft) or full reload.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('KnoVid caught an error:', error, info.componentStack)
  }

  private handleRetry = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children

    const isChunkError = /ChunkLoadError|Loading chunk|dynamically imported module/i.test(
      this.state.error.message
    )

    return (
      <div className="app-atmosphere premium-atmosphere relative flex min-h-screen items-center justify-center px-6">
        <div aria-hidden className="grain-overlay" />
        <GlassCard className="w-full max-w-lg px-8 py-12 text-center">
          <Eyebrow tone="tangerine" className="justify-center">
            {isChunkError ? 'Connection lost' : 'Transmission lost'}
          </Eyebrow>
          <h1 className="font-display mt-3 text-2xl font-bold tracking-tight text-stone-900 dark:text-white">
            The glow <span className="font-serif italic font-normal title-gradient">flickered</span>.
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-stone-500 dark:text-stone-400">
            {isChunkError
              ? 'A piece of the workspace failed to load — likely a dropped network connection.'
              : 'Something went wrong while rendering this view. Your videos are safe.'}
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button onClick={this.handleRetry}>Try again</Button>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </div>
        </GlassCard>
      </div>
    )
  }
}
