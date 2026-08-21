import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app/App'
import { MidiProvider } from './features/midi/MidiProvider'
import { PersistenceProvider } from './features/persistence/PersistenceProvider'
import { PracticeSessionProvider } from './features/practice/PracticeSessionProvider'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <PersistenceProvider><MidiProvider><PracticeSessionProvider><App /></PracticeSessionProvider></MidiProvider></PersistenceProvider>
    </BrowserRouter>
  </StrictMode>,
)
