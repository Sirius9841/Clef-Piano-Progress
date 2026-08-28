import {
  BarChart3,
  FlaskConical,
  FolderUp,
  Home,
  Library,
  Menu,
  Music2,
  Settings,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useMidi } from '../features/midi/MidiContext'

interface NavigationItem { readonly label: string; readonly to: string; readonly icon: typeof Home; readonly end?: boolean }
const navigation: readonly { readonly label: string; readonly items: readonly NavigationItem[] }[] = [
  { label: 'Practice', items: [
    { label: 'Home', to: '/', icon: Home, end: true },
    { label: 'Repertoire', to: '/repertoire', icon: Music2 },
    { label: 'Technique Lab', to: '/technique', icon: FlaskConical },
  ] },
  { label: 'Catalogue', items: [
    { label: 'Library', to: '/library', icon: Library },
    { label: 'Imports', to: '/imports', icon: FolderUp },
  ] },
  { label: 'System', items: [
    { label: 'Progress', to: '/progress', icon: BarChart3 },
    { label: 'Settings', to: '/settings', icon: Settings },
  ] },
]

export function AppShell() {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const midi = useMidi()

  useEffect(() => { window.scrollTo({ top: 0, left: 0 }) }, [location.pathname])

  return (
    <div className="app-shell">
      <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu /></button>
      {mobileOpen && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="brand-row">
          <NavLink to="/" className="brand" onClick={() => setMobileOpen(false)}>
            <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
            <span>CLEF</span>
          </NavLink>
          <button className="close-menu" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X /></button>
        </div>
        <nav className="main-nav">
          {navigation.map((group) => <div className="nav-group" key={group.label}><p className="nav-label">{group.label}</p>{group.items.map(({ label, to, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} title={label} aria-label={label} onClick={() => setMobileOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
            </NavLink>
          ))}</div>)}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/settings" className="midi-shell-state" title={midi.selectedDevice ? `MIDI connected: ${midi.selectedDevice.name}` : 'MIDI not connected'}>
            <span className={`midi-dot ${midi.selectedDevice ? 'connected' : ''}`} aria-hidden="true" />
            <div><strong>{midi.selectedDevice ? 'MIDI connected' : 'MIDI not connected'}</strong><span>{midi.selectedDevice?.name ?? 'Open Settings to connect'}</span></div>
          </NavLink>
          <p className="local-workspace-note">Local workspace · no cloud sync</p>
        </div>
      </aside>
      <main className="main-content"><Outlet /></main>
    </div>
  )
}
