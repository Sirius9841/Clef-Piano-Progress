import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, Home, RefreshCw, Settings } from 'lucide-react'

interface State { readonly failed: boolean }

export class AppErrorBoundary extends Component<{ readonly children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error('Clef route failed to render.', error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children
    const storageReachable = typeof globalThis.indexedDB !== 'undefined'
    return <main className="app-failure" role="alert"><AlertTriangle /><span className="eyebrow">Unexpected application error</span><h1>Clef could not show this screen.</h1><p>Your local data has not been cleared or changed. Return to a safe page, reload once, or open Local Data recovery settings.</p><div><a className="button primary" href="/"><Home size={16} /> Return Home</a><button className="button secondary" onClick={() => globalThis.location.reload()}><RefreshCw size={16} /> Reload application</button>{storageReachable && <a className="button secondary" href="/settings"><Settings size={16} /> Open Settings / Recovery</a>}</div></main>
  }
}
