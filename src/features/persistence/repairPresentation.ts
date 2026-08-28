import type { IntegrityReport } from './backup'

export function summaryRepairPresentation(report: Pick<IntegrityReport, 'status' | 'totalIssueCount'>): { readonly message: string | null; readonly error: string | null } {
  if (report.status === 'healthy') return { message: 'Derived summaries rebuilt and integrity verified.', error: null }
  return { message: null, error: `Summary repair did not pass final integrity verification; ${report.totalIssueCount} issue${report.totalIssueCount === 1 ? '' : 's'} remain.` }
}
