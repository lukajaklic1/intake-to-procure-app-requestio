import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Wallet, Users, Trash2, Copy, CalendarRange, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import { dbError } from '../lib/dbError'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Modal from '../components/ui/Modal'
import ModalActions from '../components/ui/ModalActions'
import Select from '../components/ui/Select'
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

/** What has been spent against a budget as a bar with the amount and the share: "598 € [=====---] 1 %" (yellow above 80 %, red over the budget). */
function SpentBar({ used, budget, fmt }: { used: number; budget: number; fmt: (n: number) => string }) {
  if (budget <= 0) return <span className="block pr-2 text-right text-ink2 tabular-nums">{used > 0 ? fmt(used) : '-'}</span>
  const pct = usedPercent(used, budget)
  const tone = usedTone(pct)
  return (
    <div className="flex items-center gap-3 px-1">
      <span className="w-[76px] shrink-0 text-right text-ink2 tabular-nums whitespace-nowrap">{used > 0 ? fmt(used) : '-'}</span>
      <div className="h-2 flex-1 min-w-[56px] rounded-full bg-selected overflow-hidden">
        <div className={`h-full rounded-full ${tone === 'danger' ? 'bg-danger' : tone === 'warn' ? 'bg-warn' : 'bg-primary'}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`w-10 shrink-0 text-right text-xs tabular-nums ${tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-ink2'}`}>{pct} %</span>
    </div>
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
  const [newOpen, setNewOpen] = useState(false)
  const [newYear, setNewYear] = useState('')
  const [copyYear, setCopyYear] = useState('')   // '' = start with empty cells
  const [creating, setCreating] = useState(false)

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

  const thisYear = new Date().getFullYear()
  // years that can still be added: from last year to five years ahead
  const freeYears = Array.from({ length: 7 }, (_, i) => thisYear - 1 + i).filter(y => !years.includes(y))

  function openNew() {
    setNewYear(String(freeYears.find(y => y > (years[years.length - 1] ?? 0)) ?? freeYears[0] ?? ''))
    setCopyYear(''); setNewOpen(true)
  }

  /** A new year: an empty cell for every active department, or the amounts of another year when one is chosen. */
  async function createYear() {
    if (!company || !newYear) return
    const y = Number(newYear)
    const copyFrom = copyYear ? Number(copyYear) : null
    const rows = departments.filter(d => d.status === 'active').map(d => ({
      company_id: company.id, year: y, department_id: d.id, category_id: null,
      amount: copyFrom ? amountOf(d.id, copyFrom) : 0, months: null as number[] | null,
    }))
    if (rows.length === 0) { toast.error(t.common.empty.departments.title); return }
    setCreating(true)
    const { error } = await supabase.from('budgets').insert(rows)
    setCreating(false)
    if (error) { toast.error(dbError(error, t)); return }
    setNewOpen(false); load()
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
      <PageToolbar attached actions={canEdit ? <Button onClick={openNew} disabled={freeYears.length === 0} className="gap-2"><Plus className="w-4 h-4" />{s.newYear}</Button> : undefined} />

      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm table-fixed" style={{ minWidth: 220 + Math.max(years.length, 1) * 400 }}>
            <colgroup>
              <col style={{ width: 220 }} />
              {years.map(y => <Fragment key={y}><col style={{ width: 150 }} /><col /></Fragment>)}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2} className="text-left whitespace-nowrap sticky left-0 z-20 bg-surface border-r border-field"><span className="inline-flex items-center gap-2"><Users className="w-3.5 h-3.5 text-icon" strokeWidth={1.75} />{s.department}</span></th>
                {years.map(y => (
                  <th key={y} colSpan={2} className="text-left whitespace-nowrap border-l border-field !pl-4 !pr-2">
                    <span className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 text-[15px] text-ink font-semibold"><CalendarRange className="w-4 h-4 text-icon" strokeWidth={1.75} />{y}</span>
                      {canEdit && (
                        <RowMenu label={t.common.editEntity} icon={Pencil} items={[
                          { label: s.detail, icon: CalendarRange, onClick: () => navigate(`/budgets/${y}`) },
                          ...(years.some(p => p < y) ? [{ label: s.copyPrevious, icon: Copy, onClick: () => copyFromPrevious(y) }] : []),
                          // deleting a whole year is for the admin only
                          ...(isAdmin ? [{ label: s.deleteYear, icon: Trash2, onClick: () => setConfirmDelete(y) }] : []),
                        ]} />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
              <tr>
                {years.map(y => (
                  <Fragment key={y}>
                    <th className="text-right !h-7 !text-xs !font-normal border-l border-field !pr-4">{s.budget}</th>
                    <th className="text-left !h-7 !text-xs !font-normal !pl-5">{s.used}</th>
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
                      <td className="px-4 py-1 font-medium text-ink truncate sticky left-0 z-10 bg-white border-r border-field">{d.name}</td>
                      {years.map(y => {
                        const amount = amountOf(d.id, y)
                        return (
                          <Fragment key={y}>
                            <td className="px-1 py-0.5 w-[150px] border-l border-field">
                              <AmountInput value={amount} format={fmt} disabled={!canEdit} placeholder={s.noBudget} onSave={n => save(d.id, y, n)} />
                            </td>
                            <td className="px-3 py-1"><SpentBar used={usedOf(d.id, y)} budget={amount} fmt={fmt} /></td>
                          </Fragment>
                        )
                      })}
                    </tr>
                  ))}
                  <tr className="bg-surface">
                    <td className="px-4 py-3 font-medium text-ink sticky left-0 z-10 bg-surface border-r border-field">{s.total}</td>
                    {years.map(y => (
                      <Fragment key={y}>
                        <td className="px-3 py-1 text-right font-medium text-ink tabular-nums border-l border-field">{fmt(totalOf(y))}</td>
                        <td className="px-3 py-1"><SpentBar used={totalUsed(y)} budget={totalOf(y)} fmt={fmt} /></td>
                      </Fragment>
                    ))}
                  </tr>
                </>
              )}
            </tbody>
          </table></div>
        )}
      </div>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title={s.newYear} size="sm" icon={Wallet}>
        <div className="flex flex-col gap-4">
          <Select id="b-year" label={s.year} required value={newYear} options={freeYears.map(y => ({ value: String(y), label: String(y) }))} onChange={setNewYear} />
          {years.length > 0 && (
            <Select id="b-copy" label={s.copyAmounts} value={copyYear} placeholder={s.startEmpty}
              options={[{ value: '', label: s.startEmpty }, ...years.map(y => ({ value: String(y), label: String(y) }))]} onChange={setCopyYear} />
          )}
        </div>
        <ModalActions className="justify-end">
          <Button variant="secondary" onClick={() => setNewOpen(false)}>{t.common.cancel}</Button>
          <Button loading={creating} disabled={!newYear} onClick={createYear}>{t.common.create}</Button>
        </ModalActions>
      </Modal>

      <ConfirmDialog open={confirmDelete != null} onClose={() => setConfirmDelete(null)} onConfirm={() => confirmDelete != null && deleteYear(confirmDelete)}
        title={s.deleteTitle} message={s.deleteQuestion} name={confirmDelete != null ? String(confirmDelete) : ''} danger confirmLabel={t.common.deleteEntity} />
    </div>
  )
}
