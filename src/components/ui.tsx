import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="page-header reveal">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="page-action">{action}</div>}
    </header>
  )
}

export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function ProgressBar({ value, tone = 'mint', label }: { value: number; tone?: 'mint' | 'violet' | 'amber'; label?: string }) {
  const safeValue = Math.max(0, Math.min(100, value))
  return (
    <div className="progress-wrap" aria-label={label ?? `${safeValue}%`}>
      <div className="progress-track">
        <span className={`progress-fill ${tone}`} style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  )
}

export function ScoreRing({ value, label, size = 'large' }: { value: number; label: string; size?: 'small' | 'large' }) {
  const safeValue = Math.max(0, Math.min(100, value))
  return (
    <div className={`score-ring ${size}`} style={{ '--score': `${safeValue * 3.6}deg` } as React.CSSProperties}>
      <div>
        <strong>{Number.isInteger(value) ? value : value.toFixed(1)}</strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

export function Stat({ label, value, detail, icon: Icon }: { label: string; value: string; detail?: string; icon?: LucideIcon }) {
  return (
    <div className="stat">
      <div className="stat-label">{Icon && <Icon size={15} />}{label}</div>
      <strong>{value}</strong>
      {detail && <span>{detail}</span>}
    </div>
  )
}

export function Button({ children, variant = 'primary', icon: Icon, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; icon?: LucideIcon }) {
  return (
    <button className={`button ${variant}`} {...props}>
      {children}{Icon && <Icon size={17} />}
    </button>
  )
}

export function Change({ value, suffix = '' }: { value: number; suffix?: string }) {
  return <span className={`change ${value >= 0 ? 'positive' : 'negative'}`}><ArrowUpRight size={13} />{value > 0 ? '+' : ''}{value}{suffix}</span>
}

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'positive' | 'warning' | 'neutral' | 'violet' }) {
  return <span className={`status-pill ${tone}`}>{children}</span>
}
