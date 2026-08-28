import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PersistenceContext } from '../features/persistence/PersistenceContext'
import { MidiContext, type MidiContextValue } from '../features/midi/MidiContext'
import { AppShell } from './AppShell'

const midi: MidiContextValue = {
  supported: true, accessState: 'idle', devices: [], selectedDeviceId: null, selectedDevice: null, activeNotes: [], sustainDown: false, sustainValue: null, sustainObserved: false, recentEvents: [], error: null,
  requestAccess: async () => undefined, selectDevice: async () => undefined, subscribeToEvents: () => () => undefined, clearEvents: () => undefined,
}

describe('AppShell progress range copy', () => {
  it('labels the rolling seven-day repository query truthfully', () => {
    const markup = renderToStaticMarkup(
      <PersistenceContext.Provider value={{ repository: null, status: 'loading', error: null, revision: 0, retry: () => undefined }}>
        <MidiContext.Provider value={midi}><MemoryRouter><AppShell /></MemoryRouter></MidiContext.Provider>
      </PersistenceContext.Provider>,
    )
    expect(markup).toContain('Practice')
    expect(markup).toContain('Catalogue')
    expect(markup).toContain('System')
    expect(markup).toContain('MIDI not connected')
    expect(markup).not.toContain('This week')
  })
})
