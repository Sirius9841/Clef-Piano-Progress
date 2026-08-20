import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app/App'
import { MidiProvider } from './features/midi/MidiProvider'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <MidiProvider><App /></MidiProvider>
    </BrowserRouter>
  </StrictMode>,
)
