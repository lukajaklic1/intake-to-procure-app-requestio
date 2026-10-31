import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Wallet, Users, Trash2, Copy, CalendarRange, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import { dbError } from '../lib/dbError'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import RowMenu from '../components/ui/RowMenu'
import TableEmptyState from '../components/ui/TableEmptyState'
import PageToolbar from '../components/layout/PageToolbar'
import { useHeaderCounts } from '../components/layout/HeaderCounts'
import AmountInput from '../components/budget/AmountInput'
import { loadBudgetUsage, usageOf, usedPercent, usedTone, type UsageRow } from '../lib/budget'
import type { Budget, Department } from '../types/database'

/** Progress bar of a used share: calm up to 80 %, yellow above, red over the budget. */
export function UsedBar({ pct }: { pct: number }) {
  const tone = usedTone(pct)
  return (
    <div className="flex items-center gap-2.5 min-w-[130px]">
      <div className="h-1.5 w-20 rounded-full bg-selected overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${tone === 'danger' ? 'bg-danger' : tone === 'warn' ? 'bg-warn' : 'bg-primary'}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`text-xs tabular-nums ${tone === 'danger' ? 'text-danger' : 'text-ink2'}`}>{pct} %</span>
    </div>
  )
}

/** What has been spent against a budget: "8.200 € · 68 %" (yellow above 80 %, red over the budget). */
function SpentText({ used, budget, fmt }: { used: number; budget: number; fmt: (n: number) => string }) {
  if (used <= 0) return <span className="text-ink2">-</span>
  if (budget <= 0) return <span className="text-ink2 tabular-nums">{fmt(used)}</span>
  const pct = usedPercent(used, budget)
  const tone = usedTone(pct)
  return (
    <span className="tabular-nums whitespace-nowrap">
      <span className="text-ink2">{fmt(used)}</span>
      <span className={`ml-1.5 text-xs ${tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-ink2'}`}>{pct} %</span>
    </span>
  )
}

/** The budget of all years in one table: departments in rows, one column per year, amounts typed straight into the cells.
 *  A new year is a new column next to the past ones, so last year's figures stay in view while you enter the new ones. */
export default function BudgetsPage() {
  const { company, isAdmin, hasPerm } = useCompany()
  const { t } = useLanguage()
  const s = t.budgets
  const navigate = useNavigate()
  const canEdit = isAdmin || hasPerm('budgets', 'create')
  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: company?.currency ?? 'EUR', maximumFractionDigits: 0 }).format(n)

  const [departments, setDepartments] = useState<Department[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [usage, setUsage] = useState<Record<number, UsageRow[]>>({})
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    if (!company) return
    // spinner only on the first load: later reloads refresh the data in place
    const [{ data: d }, { data: b }] = await Promise.all([
      supabase.from('departments').select('*').eq('company_id', company.id).order('name'),
      supabase.from('budgets').select('*').eq('company_id', company.id).is('category_id', null),
    ])
    const list = (b as Budget[]) ?? []
    const years = [...new Set(list.map(x => x.year))]
    const us = await Promise.all(years.map(y => loadBudgetUsage(y)))
    setDepartments((d as Department[]) ?? []); setBudgets(list)
    setUsage(Object.fromEntries(years.map((y, i) => [y, us[i]])))
    setLoading(false)
  }

  const years = [...new Set(budgets.map(b => b.year))].sort((a, b) => a - b)
  useHeaderCounts(loading ? [] : [{ value: years.length }])
  const budgetOf = (deptId: string, year: number) => budgets.find(b => b.department_id === deptId && b.year === year)
  const amountOf = (deptId: string, year: number) => Number(budgetOf(deptId, year)?.amount ?? 0)
  const usedOf = (deptId: string, year: number) => usageOf(usage[year] ?? [], deptId, null, 'ordered') + usageOf(usage[year] ?? [], deptId, null, 'requested')
  // active departments, and inactive ones that still have a budget somewhere
  const shown = departments.filter(d => d.status === 'active' || years.some(y => amountOf(d.id, y) > 0))

  /** Saves one cell at once on screen and then in the database; the budget row stays at 0 so the year does not disappear. */
  async function save(deptId: string, year: number, amount: number) {
    if (!company) return
    const existing = budgetOf(deptId, year)
    const payload = { amount: Math.round(amount * 100) / 100, months: null as number[] | null }
    setBudgets(list => existing
      ? list.map(b => (b.id === existing.id ? { ...b, ...payload } : b))
      : [...list, { id: `new-${deptId}-${year}`, company_id: company.id, year, department_id: deptId, category_id: null, created_at: '', updated_at: '', ...payload }])
    const { error } = existing
      ? await supabase.from('budgets').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id)
      : await supabase.from('budgets').insert({ ...payload, company_id: company.id, year, department_id: deptId, category_id: null })
    if (error) toast.error(dbError(error, t))
    load()
  }

  /** A new year: the next one after the last (or this year when there is none), with an empty cell for every active department. */
  async function addYear(copyFrom?: number) {
    if (!company) return
    const y = years.length ? years[years.length - 1] + 1 : new Date().getFullYear()
    const rows = departments.filter(d => d.status === 'active').map(d => ({
      company_id: company.id, year: y, department_id: d.id, category_id: null,
      amount: copyFrom ? amountOf(d.id, copyFrom) : 0, months: null as number[] | null,
    }))
    if (rows.length === 0) { toast.error(t.common.empty.departments.title); return }
    const { error } = await supabase.from('budgets').insert(rows)
    if (error) { toast.error(dbError(error, t)); return }
    load()
  }

  /** Fills a year with the amounts of the year before it (only where it is still empty). */
  async function copyFromPrevious(year: number) {
    if (!company) return
    const prev = [...years].filter(y => y < year).pop()
    if (!prev) return
    const fill = shown.filter(d => amountOf(d.id, year) === 0 && amountOf(d.id, prev) > 0)
    for (const d of fill) await save(d.id, year, amountOf(d.id, prev))
    toast.success(`${s.copied}: ${fill.length}`)
  }

  async function deleteYear(year: number) {
    if (!company) return
    const { error } = await supabase.from('budgets').delete().eq('company_id', company.id).eq('year', year)
    setConfirmDelete(null)
    if (error) { toast.error(dbError(error, t)); return }
    toast.success(t.common.deleted); load()
  }

  const totalOf = (year: number) => shown.reduce((n, d) => n + amountOf(d.id, year), 0)
  const totalUsed = (year: number) => shown.reduce((n, d) => n + (amountOf(d.id, year) > 0 ? usedOf(d.id, year) : 0), 0)

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached actions={canEdit ? <Button onClick={() => addYear()} className="gap-2"><Plus className="w-4 h-4" />{s.newYear}</Button> : undefined} />

      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm" style={{ minWidth: 220 + Math.max(years.length, 1) * 300 }}>
            <thead>
              <tr>
                <th rowSpan={2} className="text-left whitespace-nowrap"><span className="inline-flex items-center gap-2"><Users className="w-3.5 h-3.5 text-icon" strokeWidth={1.75} />{s.department}</span></th>
                {years.map(y => (
                  <th key={y} colSpan={2} className="text-center whitespace-nowrap border-l border-field">
                    <span className="inline-flex items-center justify-center gap-3">
                      <span className="inline-flex items-center gap-2 text-ink font-medium"><CalendarRange className="w-3.5 h-3.5 text-icon" strokeWidth={1.75} />{y}</span>
                      {canEdit && (
                        <RowMenu label={t.common.editEntity} icon={Pencil} items={[
                          { label: s.detail, icon: CalendarRange, onClick: () => navigate(`/budgets/${y}`) },
                          ...(years.some(p => p < y) ? [{ label: s.copyPrevious, icon: Copy, onClick: () => copyFromPrevious(y) }] : []),
                          { label: s.deleteYear, icon: Trash2, onClick: () => setConfirmDelete(y) },
                        ]} />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
              <tr>
                {years.map(y => (
                  <Fragment key={y}>
                    <th className="text-right !h-7 !text-xs !font-normal border-l border-field">{s.budget}</th>
                    <th className="text-right !h-7 !text-xs !font-normal">{s.used}</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-field">
              {years.length === 0 ? (
                <TableEmptyState icon={Wallet} colSpan={2} title={s.emptyTitle} subtitle={s.emptyText} />
              ) : (
                <>
                  {shown.map(d => (
                    <tr key={d.id}>
                      <td className="px-4 py-1 font-medium text-ink whitespace-nowrap">{d.name}</td>
                      {years.map(y => {
                        const amount = amountOf(d.id, y)
                        return (
                          <Fragment key={y}>
                            <td className="px-1 py-0.5 w-[150px] border-l border-field">
                              <AmountInput value={amount} format={fmt} disabled={!canEdit} placeholder={s.noBudget} onSave={n => save(d.id, y, n)} />
                            </td>
                            <td className="px-3 py-1 text-right w-[150px]"><SpentText used={usedOf(d.id, y)} budget={amount} fmt={fmt} /></td>
                          </Fragment>
                        )
                      })}
                    </tr>
                  ))}
                  <tr className="bg-surface">
                    <td className="px-4 py-3 font-medium text-ink">{s.total}</td>
                    {years.map(y => (
                      <Fragment key={y}>
                        <td className="px-3 py-1 text-right font-medium text-ink tabular-nums border-l border-field">{fmt(totalOf(y))}</td>
                        <td className="px-3 py-1 text-right"><SpentText used={totalUsed(y)} budget={totalOf(y)} fmt={fmt} /></td>
                      </Fragment>
                    ))}
                  </tr>
                </>
              )}
            </tbody>
          </table></div>
        )}
      </div>

      <ConfirmDialog open={confirmDelete != null} onClose={() => setConfirmDelete(null)} onConfirm={() => confirmDelete != null && deleteYear(confirmDelete)}
        title={s.deleteTitle} message={s.deleteQuestion} name={confirmDelete != null ? String(confirmDelete) : ''} danger confirmLabel={t.common.deleteEntity} />
    </div>
  )
}
