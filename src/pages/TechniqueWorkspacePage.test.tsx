import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { MidiContext, type MidiContextValue } from '../features/midi/MidiContext'
import { PersistenceContext } from '../features/persistence/PersistenceContext'
import { TechniqueWorkspacePage } from './TechniqueWorkspacePage'

const midi: MidiContextValue = { supported: false, accessState: 'idle', devices: [], selectedDeviceId: null, selectedDevice: null, activeNotes: [], sustainDown: false, sustainValue: null, sustainObserved: false, recentEvents: [], error: null, requestAccess: async () => undefined, selectDevice: async () => undefined, subscribeToEvents: () => () => undefined, clearEvents: () => undefined }

function renderWorkspace(moduleId: string): string {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[`/technique/${moduleId}`]}><PersistenceContext.Provider value={{ repository: null, status: 'loading', error: null, revision: 0, retry: () => undefined }}><MidiContext.Provider value={midi}><Routes><Route path="/technique/:moduleId" element={<TechniqueWorkspacePage />} /></Routes></MidiContext.Provider></PersistenceContext.Provider></MemoryRouter>)
}

describe('Technique workspace configuration', () => {
  it('shows purpose-specific friendly scale controls and a disabled Start without MIDI', () => {
    const html = renderWorkspace('scales')
    expect(html).toContain('Tonic')
    expect(html).toContain('C♯ / D♭')
    expect(html).toContain('Natural minor')
    expect(html).toContain('One octave')
    expect(html).toContain('Up and down')
    expect(html).toContain('Exact pattern length: 15 events')
    expect(html).not.toContain('<span>Events</span>')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Start take/s)
  })

  it('exposes inversion only for chords and generates sight-reading seed through a button', () => {
    expect(renderWorkspace('chord-fluency')).toContain('Second inversion')
    expect(renderWorkspace('keyboard-jumps')).not.toContain('Second inversion')
    expect(renderWorkspace('sight-reading')).toContain('New sight-reading exercise')
  })
})
