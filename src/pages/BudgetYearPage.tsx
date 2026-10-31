import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Wallet, ShoppingCart, ClipboardList, Gauge, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import { dbError } from '../lib/dbError'
import GridHead from '../components/ui/GridHead'
import TableEmptyState from '../components/ui/TableEmptyState'
import { loadBudgetUsage, usageOf, usedPercent, type UsageRow } from '../lib/budget'
import { UsedBar } from './BudgetsPage'
import AmountInput from '../components/budget/AmountInput'
import type { Budget, Department } from '../types/database'

/** One year of the budget: every department with an amount to type in (empty = no budget), by year or by month. */
export default function BudgetYearPage() {
  const { year: yearParam } = useParams<{ year: string }>()
  const year = Number(yearParam)
  const navigate = useNavigate()
  const { company, isAdmin, hasPerm } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.budgets
  const canEdit = isAdmin || hasPerm('budgets', 'create')
  const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: company?.currency ?? 'EUR', maximumFractionDigits: 0 }).format(n)
  const monthName = (m: number) => new Date(2026, m - 1, 1).toLocaleString(lang === 'sl' ? 'sl-SI' : 'en-GB', { month: 'short' })

  const [departments, setDepartments] = useState<Department[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [monthly, setMonthly] = useState(false)

  useEffect(() => { if (company && year) load() }, [company, year])

  async function load() {
    if (!company) return
    const [{ data: d }, { data: b }, u] = await Promise.all([
      supabase.from('departments').select('*').eq('company_id', company.id).order('name'),
      supabase.from('budgets').select('*').eq('company_id', company.id).eq('year', year).is('category_id', null),
      loadBudgetUsage(year),
    ])
    setDepartments((d as Department[]) ?? []); setBudgets((b as Budget[]) ?? []); setUsage(u)
    setLoading(false)
  }

  const budgetOf = (deptId: string) => budgets.find(b => b.department_id === deptId)
  // departments that count: active ones, and inactive ones that still have a budget or spend
  const shown = departments.filter(d => d.status === 'active' || Number(budgetOf(d.id)?.amount ?? 0) > 0)

  /** Saves a department's amount (and optionally its months). A budget row stays, with amount 0, so the year does not disappear. */
  async function save(deptId: string, amount: number, months: number[] | null) {
    if (!company) return
    const existing = budgetOf(deptId)
    const payload = { amount: Math.round(amount * 100) / 100, months }
    // show the new amount at once; the table is refreshed from the database afterwards (no flicker of an empty cell)
    setBudgets(list => existing
      ? list.map(b => (b.id === existing.id ? { ...b, ...payload } : b))
      : [...list, { id: 'new-' + deptId, company_id: company.id, year, department_id: deptId, category_id: null, created_at: '', updated_at: '', ...payload }])
    const { error } = existing
      ? await supabase.from('budgets').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id)
      : await supabase.from('budgets').insert({ ...payload, company_id: company.id, year, department_id: deptId, category_id: null })
    if (error) { toast.error(dbError(error, t)); load(); return }
    load()
  }

  /** The twelve months of a department: the saved split, or the yearly amount spread evenly. */
  const monthsOf = (deptId: string): number[] => {
    const b = budgetOf(deptId)
    if (b?.months && b.months.length === 12) return b.months.map(Number)
    const part = Math.round((Number(b?.amount ?? 0) / 12) * 100) / 100
    return Array<number>(12).fill(part)
  }
  const saveMonth = (deptId: string, i: number, n: number) => {
    const months = monthsOf(deptId); months[i] = n
    save(deptId, months.reduce((a, x) => a + x, 0), months)
  }

  const totals = shown.reduce((a, d) => {
    const amount = Number(budgetOf(d.id)?.amount ?? 0)
    return { amount: a.amount + amount, ordered: a.ordered + (amount > 0 ? usageOf(usage, d.id, null, 'ordered') : 0), requested: a.requested + (amount > 0 ? usageOf(usage, d.id, null, 'requested') : 0) }
  }, { amount: 0, ordered: 0, requested: 0 })

  return (
    <div className="p-4 lg:p-6">
      <nav className="flex items-center gap-2 text-sm text-ink2 mb-5">
        <button type="button" onClick={() => navigate('/budgets')} aria-label={s.title} title={s.title}
          className="w-7 h-7 -ml-1.5 mr-1 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <Link to="/budgets" className="hover:text-ink transition-colors">{s.title}</Link>
        <ChevronRight className="w-3.5 h-3.5 text-icon" />
        <span className="text-ink font-medium">{year}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="text-xl font-semibold text-ink tracking-tight">{s.yearTitle.replace('{year}', String(year))}</h1>
          <p className="mt-1.5 text-sm text-ink2">{s.yearHint}</p>
        </div>
        {canEdit && (
          <div className="inline-flex rounded-lg border border-field p-0.5 bg-white">
            {([false, true] as const).map(m => (
              <button key={String(m)} type="button" onClick={() => setMonthly(m)}
                className={`h-8 px-3 rounded-md text-sm font-medium transition-colors ${monthly === m ? 'bg-surface text-ink' : 'text-ink2 hover:text-ink'}`}>
                {m ? s.byMonthShort : s.byYear}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : monthly ? (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[1300px]">
            <GridHead cols={[[s.department, Users], ...Array.from({ length: 12 }, (_, i) => [monthName(i + 1), undefined, 'right'] as [string, undefined, 'right']), [s.yearTotal, Wallet, 'right']]} />
            <tbody className="divide-y divide-field">
              {shown.length === 0 ? <TableEmptyState icon={Wallet} colSpan={14} title={t.common.empty.departments.title} subtitle={t.common.empty.departments.text} /> : shown.map(d => {
                const months = monthsOf(d.id)
                return (
                  <tr key={d.id}>
                    <td className="px-4 py-2 font-medium text-ink whitespace-nowrap">{d.name}</td>
                    {months.map((m, i) => (
                      <td key={i} className="px-1 py-1.5 w-[84px]"><AmountInput value={m} format={n => money(n)} disabled={!canEdit} placeholder="-" onSave={n => saveMonth(d.id, i, n)} /></td>
                    ))}
                    <td className="px-4 py-2 text-right text-ink tabular-nums whitespace-nowrap">{Number(budgetOf(d.id)?.amount ?? 0) > 0 ? money(Number(budgetOf(d.id)?.amount)) : '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[860px]">
            <GridHead cols={[[s.department, Users], [s.budget, Wallet, 'right'], [s.ordered, ShoppingCart, 'right'], [s.requested, ClipboardList, 'right'], [s.remaining, Wallet, 'right'], [s.used, Gauge]]} />
            <tbody className="divide-y divide-field">
              {shown.length === 0 ? <TableEmptyState icon={Wallet} colSpan={6} title={t.common.empty.departments.title} subtitle={t.common.empty.departments.text} /> : (
                <>
                  {shown.map(d => {
                    const amount = Number(budgetOf(d.id)?.amount ?? 0)
                    const ordered = usageOf(usage, d.id, null, 'ordered')
                    const requested = usageOf(usage, d.id, null, 'requested')
                    const remaining = amount - ordered - requested
                    return (
                      <tr key={d.id} className="hover:bg-surface transition-colors">
                        <td className="px-4 py-2.5 font-medium text-ink">{d.name}</td>
                        <td className="px-2 py-1.5 w-[170px]">
                          <AmountInput value={amount} format={money} disabled={!canEdit} placeholder={s.noBudget} onSave={n => save(d.id, n, null)} />
                        </td>
                        <td className="px-4 py-2.5 text-right text-ink2 tabular-nums whitespace-nowrap">{fmtUsage(ordered, money)}</td>
                        <td className="px-4 py-2.5 text-right text-ink2 tabular-nums whitespace-nowrap">{fmtUsage(requested, money)}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums whitespace-nowrap ${amount > 0 && remaining < 0 ? 'text-danger' : 'text-ink'}`}>{amount > 0 ? money(remaining) : '-'}</td>
                        <td className="px-4 py-2.5">{amount > 0 ? <UsedBar pct={usedPercent(ordered + requested, amount)} /> : <span className="text-ink2">-</span>}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-surface">
                    <td className="px-4 py-3 font-medium text-ink">{s.total}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink tabular-nums whitespace-nowrap">{money(totals.amount)}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink tabular-nums whitespace-nowrap">{money(totals.ordered)}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink tabular-nums whitespace-nowrap">{money(totals.requested)}</td>
                    <td className={`px-4 py-3 text-right font-medium tabular-nums whitespace-nowrap ${totals.amount - totals.ordered - totals.requested < 0 ? 'text-danger' : 'text-ink'}`}>{money(totals.amount - totals.ordered - totals.requested)}</td>
                    <td className="px-4 py-3"><UsedBar pct={usedPercent(totals.ordered + totals.requested, totals.amount)} /></td>
                  </tr>
                </>
              )}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}

const fmtUsage = (n: number, money: (n: number) => string) => (n > 0 ? money(n) : '-')
