import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export function ConfirmDialog({ open, title, children, confirmLabel, busy = false, onConfirm, onCancel }: {
  readonly open: boolean
  readonly title: string
  readonly children: React.ReactNode
  readonly confirmLabel: string
  readonly busy?: boolean
  readonly onConfirm: () => void
  readonly onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable.item(0)
      const last = focusable.item(focusable.length - 1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus() }
  }, [onCancel, open])
  if (!open) return null
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onCancel() }}>
    <div ref={dialogRef} className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <header><h2 id="confirm-dialog-title">{title}</h2><button aria-label="Close confirmation" onClick={onCancel}><X /></button></header>
      <div className="confirm-dialog-body">{children}</div>
      <footer><button ref={cancelRef} className="button secondary" disabled={busy} onClick={onCancel}>Cancel</button><button className="button danger" disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : confirmLabel}</button></footer>
    </div>
  </div>
}
