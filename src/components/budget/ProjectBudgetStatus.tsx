import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCompany } from '../../hooks/useCompany'
import { useLanguage } from '../../hooks/useLanguage'
import { BarFill } from '../../pages/BudgetsPage'
import { loadProjectUsage, projectUsageOf, usedPercent, usedTone, type ProjectUsageRow } from '../../lib/budget'

interface Props {
  projectId: string
  /** What the document adds (it is not counted yet). */
  amount?: number
  /** The document being edited is left out of the usage so it is not counted twice. */
  excludeRequestId?: string | null
  excludePoId?: string | null
  className?: string
}

/** How much of the budget of a project is used: paid, invoiced, ordered and requested, and what a document in the making adds.
 *  Only an information: exceeding the budget never blocks anything. Without a budget only what is spent is shown. */
export default function ProjectBudgetStatus({ projectId, amount = 0, excludeRequestId, excludePoId, className = '' }: Props) {
  const { company } = useCompany()
  const { t } = useLanguage()
  const s = t.budgets
  const p = t.projects
  const [project, setProject] = useState<{ id: string; name: string; project_code: string | null; budget_amount: number | null } | null>(null)
  const [usage, setUsage] = useState<ProjectUsageRow[]>([])

  useEffect(() => {
    if (!company || !projectId) { setProject(null); return }
    let cancelled = false
    Promise.all([
      supabase.from('projects').select('id, name, project_code, budget_amount').eq('id', projectId).single(),
      loadProjectUsage(excludeRequestId, excludePoId),
    ]).then(([pr, u]) => { if (!cancelled) { setProject(pr.data as typeof project); setUsage(u) } })
    return () => { cancelled = true }
  }, [company, projectId, excludeRequestId, excludePoId])

  if (!project) return null
  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: company?.currency ?? 'EUR', maximumFractionDigits: 0 }).format(n)
  const budget = Number(project.budget_amount ?? 0)
  const ordered = projectUsageOf(usage, projectId, 'ordered')   // out through orders and invoices
  const paid = projectUsageOf(usage, projectId, 'paid')
  const invoiced = projectUsageOf(usage, projectId, 'invoiced')
  const openOrdered = projectUsageOf(usage, projectId, 'open')
  const requested = projectUsageOf(usage, projectId, 'requested')
  const used = ordered + requested
  const tone = budget > 0 ? usedTone(usedPercent(used + amount, budget)) : 'ok'
  const Row = ({ label, value, swatch }: { label: string; value: number; swatch?: string }) => (
    <div className="flex justify-between gap-3"><dt className="inline-flex items-center gap-2 text-ink2">{swatch && <span className={`w-2 h-2 rounded-sm ${swatch}`} />}{label}</dt><dd className="tabular-nums text-ink">{fmt(value)}</dd></div>
  )

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <Link to={`/projects/${project.id}`} className="inline-flex items-center gap-1.5 text-ink2 hover:text-ink min-w-0 transition-colors">
          <Briefcase className="w-3.5 h-3.5 text-icon shrink-0" strokeWidth={1.75} />
          <span className="truncate">{p.project}: {project.project_code ? `${project.project_code} · ` : ''}{project.name}</span>
        </Link>
        <span className={`tabular-nums whitespace-nowrap ${tone === 'danger' ? 'text-danger font-medium' : 'text-ink'}`}>{budget > 0 ? `${fmt(used + amount)} / ${fmt(budget)}` : fmt(used + amount)}</span>
      </div>
      {budget > 0 ? (
        <>
          <div className="h-1.5 rounded-full bg-selected mt-1.5 overflow-hidden">
            <BarFill orderedPct={(ordered / budget) * 100} requestedPct={((requested + amount) / budget) * 100} paidPct={(paid / budget) * 100} invoicedPct={(invoiced / budget) * 100} />
          </div>
          <p className={`text-xs mt-1 tabular-nums ${tone === 'danger' ? 'text-danger' : 'text-ink2'}`}>
            {amount > 0 ? `${usedPercent(used, budget)} % → ${usedPercent(used + amount, budget)} % ${s.afterThis}` : `${usedPercent(used, budget)} %`}{tone === 'danger' ? ` · ${s.over}` : ''}
          </p>
        </>
      ) : <p className="text-xs text-ink2 mt-1">{p.noBudgetSet}</p>}
      <dl className="mt-3 pt-3 border-t border-field flex flex-col gap-1.5 text-sm">
        <Row label={s.paid} value={paid} swatch="bg-success" />
        <Row label={s.invoiced} value={invoiced} swatch="bg-success opacity-50" />
        <Row label={s.openOrdered} value={openOrdered} swatch="bg-primary" />
        <Row label={s.requested} value={requested} swatch="bg-primary opacity-40" />
        {amount > 0 && <Row label={s.thisDoc} value={amount} />}
        {budget > 0 && (
          <div className="flex justify-between gap-3 pt-1.5 border-t border-field font-medium">
            <dt className="text-ink">{s.remaining}</dt>
            <dd className={`tabular-nums ${budget - used - amount < 0 ? 'text-danger' : 'text-ink'}`}>{fmt(budget - used - amount)}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}
