import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCompany } from '../../hooks/useCompany'
import { useLanguage } from '../../hooks/useLanguage'
import { loadBudgetUsage, usageOf, usedPercent, usedTone, type UsageRow } from '../../lib/budget'
import type { Budget } from '../../types/database'

interface Props {
  departmentId: string
  /** What the document adds, in total and per main category (sum of its lines); both are optional for a document already counted. */
  amount?: number
  byCategory?: Record<string, number>
  /** The document being edited is left out of the usage so it is not counted twice. */
  excludeRequestId?: string | null
  excludePoId?: string | null
  className?: string
}

/** Shows how much of the department's budget (and of its category budgets) is used this year, with and without the
 *  document being filled in. Only an information: exceeding a budget never blocks a request or an order. Nothing is shown
 *  when the department has no budget. */
export default function BudgetStatus({ departmentId, amount = 0, byCategory = {}, excludeRequestId, excludePoId, className = '' }: Props) {
  const { company } = useCompany()
  const { t } = useLanguage()
  const s = t.budgets
  const year = new Date().getFullYear()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [names, setNames] = useState<{ dept: string; cats: Record<string, string> }>({ dept: '', cats: {} })

  useEffect(() => {
    if (!company || !departmentId) { setBudgets([]); return }
    let cancelled = false
    Promise.all([
      supabase.from('budgets').select('*').eq('company_id', company.id).eq('year', year).eq('department_id', departmentId),
      loadBudgetUsage(year, excludeRequestId, excludePoId),
      supabase.from('departments').select('name').eq('id', departmentId).single(),
      supabase.from('categories').select('id, name').eq('company_id', company.id).is('parent_id', null),
    ]).then(([b, u, d, c]) => {
      if (cancelled) return
      setBudgets((b.data as Budget[]) ?? []); setUsage(u)
      setNames({ dept: d.data?.name ?? '', cats: Object.fromEntries((c.data ?? []).map(x => [x.id, x.name])) })
    })
    return () => { cancelled = true }
  }, [company, departmentId, year, excludeRequestId, excludePoId])

  if (!budgets.length) return null
  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: company?.currency ?? 'EUR', maximumFractionDigits: 0 }).format(n)

  // the whole-department budget first, then the category budgets this document touches
  const shown = budgets.filter(b => b.category_id === null && Number(b.amount) > 0)
  void byCategory
  if (shown.length === 0) return null

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {shown.map(b => {
        const budget = Number(b.amount)
        const used = usageOf(usage, b.department_id, b.category_id, 'ordered') + usageOf(usage, b.department_id, b.category_id, 'requested')
        const add = b.category_id === null ? amount : byCategory[b.category_id] ?? 0
        const now = usedPercent(used, budget)
        const after = usedPercent(used + add, budget)
        const tone = usedTone(after)
        return (
          <div key={b.id}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 text-ink2 min-w-0">
                <Wallet className="w-3.5 h-3.5 text-icon shrink-0" strokeWidth={1.75} />
                <span className="truncate">{s.hint.replace('{name}', b.category_id ? `${names.dept} · ${names.cats[b.category_id] ?? ''}` : names.dept).replace('{year}', String(year))}</span>
              </span>
              <span className={`tabular-nums whitespace-nowrap ${tone === 'danger' ? 'text-danger font-medium' : 'text-ink'}`}>
                {fmt(used + add)} / {fmt(budget)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-selected mt-1.5 overflow-hidden">
              <div className={`h-full rounded-full ${tone === 'danger' ? 'bg-danger' : tone === 'warn' ? 'bg-warn' : 'bg-primary'}`} style={{ width: `${Math.min(100, after)}%` }} />
            </div>
            <p className={`text-xs mt-1 tabular-nums ${tone === 'danger' ? 'text-danger' : 'text-ink2'}`}>
              {add > 0 ? `${now} % → ${after} % ${s.afterThis}` : `${after} %`}{tone === 'danger' ? ` · ${s.over}` : ''}
            </p>
          </div>
        )
      })}
    </div>
  )
}
