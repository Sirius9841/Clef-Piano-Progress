import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog accessibility', () => {
  it('uses modal semantics, named controls, and an explicit destructive action', () => {
    const markup = renderToStaticMarkup(<ConfirmDialog open title="Clear all local Clef data?" confirmLabel="Clear everything" onCancel={() => undefined} onConfirm={() => undefined}><p>This cannot be undone.</p></ConfirmDialog>)
    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toContain('aria-label="Close confirmation"')
    expect(markup).toContain('Clear everything')
    expect(markup).toContain('Cancel')
  })
})
