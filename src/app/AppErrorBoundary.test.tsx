import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

describe('AppErrorBoundary', () => {
  it('turns a thrown route into a non-destructive recovery screen instead of a white page', () => {
    const boundary = new AppErrorBoundary({ children: <div>Route content</div> })
    boundary.state = AppErrorBoundary.getDerivedStateFromError()
    const markup = renderToStaticMarkup(boundary.render())
    expect(markup).toContain('Clef could not show this screen')
    expect(markup).toContain('Your local data has not been cleared or changed')
    expect(markup).toContain('Return Home')
    expect(markup).toContain('Reload application')
    expect(markup).not.toContain('Clear all')
  })
})
