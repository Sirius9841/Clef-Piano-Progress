import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'
import { HomePage } from '../pages/HomePage'
import { LibraryPage } from '../pages/LibraryPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { PieceDetailPage } from '../pages/PieceDetailPage'
import { ProgressPage } from '../pages/ProgressPage'
import { RepertoirePage } from '../pages/RepertoirePage'
import { SettingsPage } from '../pages/SettingsPage'
import { TechniquePage } from '../pages/TechniquePage'

const ImportsPage = lazy(() => import('../pages/ImportsPage').then((module) => ({ default: module.ImportsPage })))
const PracticePage = lazy(() => import('../pages/PracticePage').then((module) => ({ default: module.PracticePage })))
const HistoricalResultPage = lazy(() => import('../pages/HistoricalResultPage').then((module) => ({ default: module.HistoricalResultPage })))

function RouteLoader() {
  return <div className="route-loader"><strong>Opening score workspace…</strong></div>
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="repertoire" element={<RepertoirePage />} />
        <Route path="repertoire/:arrangementId" element={<PieceDetailPage />} />
        <Route path="practice/:arrangementId" element={<Suspense fallback={<RouteLoader />}><PracticePage /></Suspense>} />
        <Route path="history/:attemptId" element={<Suspense fallback={<RouteLoader />}><HistoricalResultPage /></Suspense>} />
        <Route path="technique" element={<TechniquePage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="imports" element={<Suspense fallback={<RouteLoader />}><ImportsPage /></Suspense>} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
