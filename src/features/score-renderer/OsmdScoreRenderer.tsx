import { AlertTriangle, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import type { ScoreHighlightModel } from '../performance-results/highlightModel'
import { ScoreResultOverlay } from './ScoreResultOverlay'

export type ScoreRenderState = 'loading' | 'ready' | 'error'

export interface OsmdScoreRendererProps {
  musicXmlText: string
  zoom: number
  highlights?: ScoreHighlightModel | null
  onStateChange?: (state: ScoreRenderState, message?: string) => void
}

export function OsmdScoreRenderer({ musicXmlText, zoom, highlights = null, onStateChange }: OsmdScoreRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<OpenSheetMusicDisplay | null>(null)
  const generationRef = useRef(0)
  const zoomRef = useRef(zoom)
  const [state, setState] = useState<ScoreRenderState>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const highlightFocusKey = highlights?.focusKey ?? null
  const hasSelectedHighlights = (highlights?.selectedMeasureResultIds.length ?? 0) > 0

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const generation = ++generationRef.current
    let instance: OpenSheetMusicDisplay | null = null
    setState('loading')
    setMessage(null)
    onStateChange?.('loading')

    const renderScore = async () => {
      try {
        const { OpenSheetMusicDisplay: Osmd } = await import('opensheetmusicdisplay')
        if (generation !== generationRef.current) return
        instance = new Osmd(container, { autoResize: true, backend: 'svg', drawTitle: true, drawingParameters: 'compacttight' })
        instance.setLogLevel('warn')
        instanceRef.current = instance
        await instance.load(musicXmlText)
        if (generation !== generationRef.current) return
        instance.Zoom = zoomRef.current
        instance.render()
        setState('ready')
        onStateChange?.('ready')
      } catch (cause) {
        if (generation !== generationRef.current) return
        const detail = cause instanceof Error ? cause.message : 'The notation engine could not render this score.'
        setMessage(detail)
        setState('error')
        onStateChange?.('error', detail)
      }
    }

    void renderScore()
    return () => {
      generationRef.current += 1
      if (instance) {
        instance.setOptions({ autoResize: false })
        instance.clear()
      }
      if (instanceRef.current === instance) instanceRef.current = null
      container.replaceChildren()
    }
  }, [musicXmlText, onStateChange])

  useEffect(() => {
    const instance = instanceRef.current
    if (!instance || state !== 'ready') return
    instance.Zoom = zoom
    instance.render()
  }, [state, zoom])

  useEffect(() => {
    if (!hasSelectedHighlights) return
    containerRef.current?.closest('.notation-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [hasSelectedHighlights, highlightFocusKey])

  return (
    <div className={`osmd-renderer ${state}`}>
      {highlights && <ScoreResultOverlay model={highlights} />}
      {state === 'loading' && <div className="osmd-loading"><LoaderCircle className="spin" /><strong>Engraving notation</strong><span>Loading the isolated score renderer…</span></div>}
      {state === 'error' && <div className="osmd-error"><AlertTriangle /><strong>Notation preview unavailable</strong><span>{message}</span></div>}
      <div ref={containerRef} className="osmd-container" aria-label="Rendered sheet music" />
    </div>
  )
}
