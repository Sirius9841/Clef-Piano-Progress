import { AlertCircle, Cable, CircleDot, RefreshCw, Unplug } from 'lucide-react'
import { Button, StatusPill } from '../../components/ui'
import { useMidi } from './MidiContext'

export function MidiControls({ compact = false }: { compact?: boolean }) {
  const midi = useMidi()
  const tone = !midi.supported ? 'warning' : midi.accessState === 'granted' ? 'positive' : 'neutral'

  return (
    <div className={`midi-controls ${compact ? 'compact' : ''}`}>
      <div className="midi-status-row">
        <div className="midi-status-icon"><Cable /></div>
        <div>
          <strong>MIDI input</strong>
          <span>{midi.selectedDevice ? `Listening to ${midi.selectedDevice.name}` : midi.accessState === 'granted' ? 'Access ready — select an input' : 'Connect a digital piano to begin'}</span>
        </div>
        <StatusPill tone={tone}><CircleDot size={11} />{midi.accessState === 'granted' ? 'Access ready' : midi.supported ? 'Not connected' : 'Unsupported'}</StatusPill>
      </div>

      {midi.accessState !== 'granted' ? (
        <Button onClick={() => void midi.requestAccess()} disabled={!midi.supported || midi.accessState === 'requesting'} icon={midi.accessState === 'requesting' ? RefreshCw : Cable}>
          {midi.accessState === 'requesting' ? 'Requesting access…' : 'Enable MIDI'}
        </Button>
      ) : (
        <label className="select-field">
          <span>Input device</span>
          <select value={midi.selectedDeviceId ?? ''} onChange={(event) => void midi.selectDevice(event.target.value || null)}>
            <option value="">Select a MIDI input</option>
            {midi.devices.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.manufacturer}</option>)}
          </select>
        </label>
      )}

      {midi.accessState === 'granted' && midi.devices.length === 0 && <div className="inline-notice"><Unplug size={17} /><span>No MIDI inputs found. Connect a keyboard, then check again.</span></div>}
      {midi.error && <div className="inline-notice warning"><AlertCircle size={17} /><span>{midi.error}</span></div>}
    </div>
  )
}
