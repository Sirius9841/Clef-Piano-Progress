import {
  BarChart3,
  BookOpen,
  FlaskConical,
  FolderUp,
  Home,
  Library,
  Menu,
  Music2,
  Settings,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const navigation = [
  { label: 'Home', to: '/', icon: Home, end: true },
  { label: 'Repertoire', to: '/repertoire', icon: Music2 },
  { label: 'Technique Lab', to: '/technique', icon: FlaskConical },
  { label: 'Library', to: '/library', icon: Library },
  { label: 'Imports', to: '/imports', icon: FolderUp },
  { label: 'Progress', to: '/progress', icon: BarChart3 },
]

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)

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
        <p className="nav-label">Workspace</p>
        <nav className="main-nav">
          {navigation.map(({ label, to, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}>
              <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="practice-mini">
            <div className="practice-mini-top"><BookOpen size={16} /><span>This week</span></div>
            <strong>5h 09m</strong>
            <div className="mini-track"><span style={{ width: '72%' }} /></div>
            <small>72% of weekly goal</small>
          </div>
          <NavLink to="/settings" onClick={() => setMobileOpen(false)} className={({ isActive }) => `settings-link ${isActive ? 'active' : ''}`}>
            <Settings size={19} /><span>Settings</span>
          </NavLink>
          <div className="profile-row">
            <div className="avatar">JS</div>
            <div><strong>Jonas</strong><span>Intermediate · 14 week streak</span></div>
          </div>
        </div>
      </aside>
      <main className="main-content"><Outlet /></main>
    </div>
  )
}
