import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '../../lib/cn'

export function Card({ title, children, action, className }: { title: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white rounded-lg border border-line p-5 overflow-hidden', className)}>
      <div className="flex items-center justify-between gap-3 mb-5">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

/** Change against the previous period. `goodWhen` says which direction is good (spend going up is neither, so it is neutral). */
export function Delta({ pct, goodWhen }: { pct: number | null; goodWhen?: 'up' | 'down' }) {
  if (pct == null) return null
  const up = pct > 0
  const good = goodWhen == null || pct === 0 ? null : (goodWhen === 'up') === up
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium tabular-nums', good == null ? 'text-ink2' : good ? 'text-success' : 'text-danger')}>
      {pct !== 0 && <Icon className="w-3.5 h-3.5" strokeWidth={2} />}{pct > 0 ? '+' : ''}{pct} %
    </span>
  )
}

export function Kpi({ label, value, delta, goodWhen, tone, to, hint }: {
  label: string; value: string; delta?: number | null; goodWhen?: 'up' | 'down'; tone?: 'danger' | 'success'; to?: string; hint?: string
}) {
  const body = (
    <div className="bg-white rounded-lg border border-line p-4 pb-5 h-full hover:border-field-hover transition-colors">
      <span className="text-sm font-semibold text-ink2 block mb-2">{label}</span>
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <span className={cn('text-2xl font-semibold tracking-tight', tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-ink')}>{value}</span>
        <Delta pct={delta ?? null} goodWhen={goodWhen} />
      </div>
      {hint && <p className="text-xs text-ink2 mt-1.5">{hint}</p>}
    </div>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

/** Horizontal bars: one row per entry, the bar is relative to the largest value. */
export function HBars({ rows, format, color = 'bg-primary' }: { rows: { label: string; value: number; sub?: string }[]; format: (n: number) => string; color?: string }) {
  const max = Math.max(...rows.map(r => r.value), 0)
  if (rows.length === 0) return null
  return (
    <div className="flex flex-col gap-3">
      {rows.map(r => (
        <div key={r.label}>
          <div className="flex justify-between gap-3 text-sm mb-1">
            <span className="text-ink truncate">{r.label}{r.sub && <span className="text-ink2"> · {r.sub}</span>}</span>
            <span className="tabular-nums text-ink shrink-0">{format(r.value)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-selected overflow-hidden"><div className={cn('h-full rounded-full', color)} style={{ width: `${max > 0 ? Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100) : 0}%` }} /></div>
        </div>
      ))}
    </div>
  )
}
