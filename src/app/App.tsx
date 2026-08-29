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
import { AppErrorBoundary } from './AppErrorBoundary'

const ImportsPage = lazy(() => import('../pages/ImportsPage').then((module) => ({ default: module.ImportsPage })))
const PracticePage = lazy(() => import('../pages/PracticePage').then((module) => ({ default: module.PracticePage })))
const HistoricalResultPage = lazy(() => import('../pages/HistoricalResultPage').then((module) => ({ default: module.HistoricalResultPage })))
const TechniquePage = lazy(() => import('../pages/TechniquePage').then((module) => ({ default: module.TechniquePage })))
const TechniqueWorkspacePage = lazy(() => import('../pages/TechniqueWorkspacePage').then((module) => ({ default: module.TechniqueWorkspacePage })))
const TechniqueHistoryPage = lazy(() => import('../pages/TechniqueHistoryPage').then((module) => ({ default: module.TechniqueHistoryPage })))
const Phase13QaPage = import.meta.env.DEV ? lazy(() => import('../pages/Phase13QaPage').then((module) => ({ default: module.Phase13QaPage }))) : null
const Phase152QaPage = import.meta.env.DEV ? lazy(() => import('../pages/Phase152QaPage').then((module) => ({ default: module.Phase152QaPage }))) : null

function RouteLoader() {
  return <div className="route-loader"><strong>Opening score workspace…</strong></div>
}

export function App() {
  return (
    <AppErrorBoundary><Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="repertoire" element={<RepertoirePage />} />
        <Route path="repertoire/:arrangementId" element={<PieceDetailPage />} />
        <Route path="practice/:arrangementId" element={<Suspense fallback={<RouteLoader />}><PracticePage /></Suspense>} />
        <Route path="history/:attemptId" element={<Suspense fallback={<RouteLoader />}><HistoricalResultPage /></Suspense>} />
        <Route path="technique" element={<Suspense fallback={<RouteLoader />}><TechniquePage /></Suspense>} />
        <Route path="technique/history/:attemptId" element={<Suspense fallback={<RouteLoader />}><TechniqueHistoryPage /></Suspense>} />
        <Route path="technique/:moduleId" element={<Suspense fallback={<RouteLoader />}><TechniqueWorkspacePage /></Suspense>} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="imports" element={<Suspense fallback={<RouteLoader />}><ImportsPage /></Suspense>} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="settings" element={<SettingsPage />} />
        {Phase13QaPage && <Route path="qa/phase-13" element={<Suspense fallback={<RouteLoader />}><Phase13QaPage /></Suspense>} />}
        {Phase152QaPage && <Route path="qa/phase-15-2" element={<Suspense fallback={<RouteLoader />}><Phase152QaPage /></Suspense>} />}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes></AppErrorBoundary>
  )
}
