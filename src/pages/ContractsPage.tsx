import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Pencil, FileSignature, Building2, CircleDot, CalendarClock, Coins, User } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { toast } from '../components/ui/Toast'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import ContractFormModal from '../components/contracts/ContractFormModal'
import Pagination from '../components/ui/Pagination'
import PageToolbar from '../components/layout/PageToolbar'
import { useHeaderCounts } from '../components/layout/HeaderCounts'
import FilterSelect from '../components/ui/FilterSelect'
import TableEmptyState from '../components/ui/TableEmptyState'
import type { Contract } from '../types/database'
import { useLanguage } from '../hooks/useLanguage'
import { dbError } from '../lib/dbError'
import { daysUntil, effectiveStatus, noticeDate, STATUS_BADGE, type EffectiveStatus } from '../lib/contracts'
import PersonCell from '../components/ui/PersonCell'
import GridHead from '../components/ui/GridHead'
import RowMenu from '../components/ui/RowMenu'
import { matchesSearch } from '../lib/search'
import SortFilter from '../components/ui/SortFilter'
import { applySort, text, num, date, dateLast, rev, type SortDef } from '../lib/sort'

interface Row extends Contract { suppliers: { name: string; payment_terms: string | null } | null }
interface Person { id: string; first_name: string; last_name: string }

const fmtDate = (d: string | null) => (d ? format(new Date(d + 'T00:00:00'), 'dd.MM.yyyy') : null)

export default function ContractsPage() {
  const { company, isAdmin, hasPerm } = useCompany()
  const { t } = useLanguage()
  const s = t.contracts
  const navigate = useNavigate()
  const canEdit = isAdmin || hasPerm('purchase_orders', 'create')
  const currency = company?.currency ?? 'EUR'
  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

  const [rows, setRows] = useState<Row[]>([])
  const [spent, setSpent] = useState<Map<string, number>>(new Map())
  const [orderCount, setOrderCount] = useState<Map<string, number>>(new Map())
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; payment_terms: string | null }[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  useEffect(() => { setPage(1) }, [sort])
  const [statusFilter, setStatusFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [expiresFilter, setExpiresFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Row | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null)

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    if (!company) return
    // spinner only on the first load: later reloads refresh the data in place
    const [{ data: c }, { data: sup }, { data: us }, { data: pos }] = await Promise.all([
      supabase.from('contracts').select('*, suppliers(name, payment_terms)').eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, name, payment_terms').eq('company_id', company.id).eq('status', 'active').order('name'),
      supabase.from('users').select('id, first_name, last_name').eq('company_id', company.id).order('first_name'),
      supabase.from('purchase_orders').select('contract_id, total_amount, status').eq('company_id', company.id).not('contract_id', 'is', null),
    ])
    setRows((c as Row[]) ?? [])
    setSuppliers(sup ?? [])
    setPeople(us ?? [])
    const sp = new Map<string, number>(); const cnt = new Map<string, number>()
    for (const p of pos ?? []) {
      const id = p.contract_id as string
      cnt.set(id, (cnt.get(id) ?? 0) + 1)
      if (['issued', 'sent', 'closed'].includes(p.status as string)) sp.set(id, (sp.get(id) ?? 0) + Number(p.total_amount ?? 0))
    }
    setSpent(sp); setOrderCount(cnt)
    setLoading(false)
  }

  function openNew() { setEditing(null); setModalOpen(true) }
  function openEdit(c: Row) { setEditing(c); setModalOpen(true) }

  async function handleDelete(c: Row) {
    const { error } = await supabase.from('contracts').delete().eq('id', c.id)
    setConfirmDelete(null)
    if (error) { toast.error(dbError(error, t)); return }
    toast.success(t.common.deleted); load()
  }

  const q = search.toLowerCase()
  const sortDefs: SortDef<(typeof rows)[number]>[] = [
    { value: 'newest', label: t.sort.newest, cmp: rev(date(c => c.created_at)) },
    { value: 'oldest', label: t.sort.oldest, cmp: date(c => c.created_at) },
    { value: 'endDate', label: t.sort.endDate, cmp: dateLast(c => c.end_date) },
    { value: 'valueDesc', label: t.sort.valueDesc, cmp: rev(num(c => c.total_value)) },
    { value: 'valueAsc', label: t.sort.valueAsc, cmp: num(c => c.total_value) },
    { value: 'title', label: t.sort.titleAsc, cmp: text(c => c.title) },
    { value: 'supplier', label: t.sort.supplierAsc, cmp: text(c => c.suppliers?.name) },
  ]
  const filtered = useMemo(() => rows.filter(c => {
    const st = effectiveStatus(c)
    if (!matchesSearch(search, [c.title, c.contract_number, c.suppliers?.name, personName(c.owner_id)])) return false
    if (statusFilter !== 'all' && st !== statusFilter) return false
    if (supplierFilter !== 'all' && c.supplier_id !== supplierFilter) return false
    if (expiresFilter !== 'all') {
      const d = daysUntil(c.end_date)
      if (expiresFilter === 'expired') { if (st !== 'expired') return false }
      else if (c.status !== 'active' || d == null || d < 0 || d > Number(expiresFilter)) return false
    }
    return true
  }), [rows, q, statusFilter, supplierFilter, expiresFilter])

  useEffect(() => { setPage(1) }, [search, statusFilter, supplierFilter, expiresFilter])
  const paginated = applySort(filtered, sortDefs, sort).slice((page - 1) * pageSize, page * pageSize)
  const filtering = q !== '' || statusFilter !== 'all' || supplierFilter !== 'all' || expiresFilter !== 'all'
  useHeaderCounts(loading ? [] : [{ value: filtered.length }])

  function validity(c: Row) {
    const st = effectiveStatus(c)
    const d = daysUntil(c.end_date)
    return (
      <>
        <p className="text-sm text-ink">{fmtDate(c.start_date)} – {c.end_date ? fmtDate(c.end_date) : s.openEnded}</p>
        {st === 'active' && d != null && d >= 0 && d <= 90 && <p className="text-xs text-warn mt-0.5">{d} {s.daysLeft}</p>}
        {st === 'expired' && <p className="text-xs text-danger mt-0.5">{s.expiredOn}</p>}
      </>
    )
  }

  function valueCell(c: Row) {
    const used = spent.get(c.id) ?? 0
    if (c.total_value == null) return <span className="text-ink2">{used > 0 ? fmt(used) : '—'}</span>
    const pct = c.total_value > 0 ? Math.min(100, Math.round((used / c.total_value) * 100)) : 0
    const over = used > c.total_value
    return (
      <div className="min-w-[150px]">
        <p className="text-sm text-ink">{fmt(used)} <span className="text-gray-400">/ {fmt(c.total_value)}</span></p>
        <div className="h-1 rounded-full bg-selected mt-1.5 overflow-hidden"><div className={`h-full rounded-full ${over ? 'bg-danger' : pct >= 80 ? 'bg-warn' : 'bg-primary'}`} style={{ width: `${pct}%` }} /></div>
      </div>
    )
  }

  const personName = (id: string | null) => { const p = people.find(x => x.id === id); return p ? `${p.first_name} ${p.last_name}` : '—' }

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached actions={canEdit ? <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button> : undefined}>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-filter-label" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.common.search + '…'}
            className="w-full pl-9 pr-4 h-9 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:border-field-hover bg-white text-ink placeholder:text-filter-label" />
        </div>
        <SortFilter defs={sortDefs} value={sort} onChange={setSort} />
        <FilterSelect label={s.status} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">{t.filters.allM}</option>
          {(['draft', 'active', 'expired', 'terminated'] as EffectiveStatus[]).map(v => <option key={v} value={v}>{s.st[v]}</option>)}
        </FilterSelect>
        <FilterSelect label={s.supplier} value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
          <option value="all">{t.filters.allM}</option>
          {suppliers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </FilterSelect>
        <FilterSelect label={s.expiresFilter} value={expiresFilter} onChange={e => setExpiresFilter(e.target.value)}>
          <option value="all">{t.filters.allM}</option>
          <option value="30">{s.in30}</option>
          <option value="60">{s.in60}</option>
          <option value="90">{s.in90}</option>
          <option value="expired">{s.expiredFilter}</option>
        </FilterSelect>
      </PageToolbar>

      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[980px]">
            <GridHead cols={[[s.contractTitle, FileSignature], [s.supplier, Building2], [s.status, CircleDot], [s.validity, CalendarClock], [`${s.spent} / ${s.totalValue}`, Coins], [s.owner, User], ['']]} />
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={FileSignature} colSpan={7}
                  title={filtering ? t.common.empty.noResults.title : t.common.empty.contracts.title}
                  subtitle={filtering ? t.common.empty.noResults.text : t.common.empty.contracts.text} />
              ) : paginated.map(c => {
                const st = effectiveStatus(c)
                const nd = noticeDate(c)
                const noticeIn = daysUntil(nd)
                return (
                  <tr key={c.id} className="hover:bg-surface transition-colors cursor-pointer" onClick={() => navigate(`/contracts/${c.id}`)}>
                    <td className="px-4 py-3 max-w-[300px]">
                      <p className="font-medium text-ink truncate" title={c.title}>{c.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{c.contract_number}</p>
                    </td>
                    <td className="px-4 py-3 text-ink2 max-w-[200px] truncate">{c.suppliers?.name ?? '—'}</td>
                    <td className="px-4 py-3"><span className={`badge ${STATUS_BADGE[st]}`}>{s.st[st]}</span></td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {validity(c)}
                      {c.status === 'active' && noticeIn != null && noticeIn >= 0 && noticeIn <= 30 && <p className="text-xs text-warn mt-0.5">{s.noticeDue}: {fmtDate(nd)}</p>}
                    </td>
                    <td className="px-4 py-3">{valueCell(c)}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><PersonCell name={personName(c.owner_id)} /></td>
                    <td className="px-4 py-3">
                      {canEdit && (
                        <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                          <RowMenu items={[{ label: t.common.editEntity, icon: Pencil, onClick: () => openEdit(c) }]} />
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={n => { setPageSize(n); setPage(1) }} />
      </div>

      <ContractFormModal open={modalOpen} onClose={() => setModalOpen(false)} contract={editing} suppliers={suppliers} people={people} onSaved={load}
        onDelete={editing ? () => setConfirmDelete(editing) : undefined}
        deleteBlocked={editing && (orderCount.get(editing.id) ?? 0) > 0 ? s.deleteBlockedMsg : null} />

      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title={s.deleteTitle} message={s.deleteQuestion} name={confirmDelete ? `${confirmDelete.contract_number} · ${confirmDelete.title}` : ''} danger confirmLabel={t.common.deleteEntity} />
    </div>
  )
}
