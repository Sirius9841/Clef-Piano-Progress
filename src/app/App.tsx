import { Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'
import { HomePage } from '../pages/HomePage'
import { ImportsPage } from '../pages/ImportsPage'
import { LibraryPage } from '../pages/LibraryPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { PieceDetailPage } from '../pages/PieceDetailPage'
import { PracticePage } from '../pages/PracticePage'
import { ProgressPage } from '../pages/ProgressPage'
import { RepertoirePage } from '../pages/RepertoirePage'
import { SettingsPage } from '../pages/SettingsPage'
import { TechniquePage } from '../pages/TechniquePage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="repertoire" element={<RepertoirePage />} />
        <Route path="repertoire/:arrangementId" element={<PieceDetailPage />} />
        <Route path="practice/:arrangementId" element={<PracticePage />} />
        <Route path="technique" element={<TechniquePage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="imports" element={<ImportsPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
