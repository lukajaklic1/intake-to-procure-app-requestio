import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, FileText, Eye, Search, X, ClipboardList, Tag, Building2, CalendarClock, User, Coins, CircleDot, ShoppingCart } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import Button from '../components/ui/Button'
import Pagination from '../components/ui/Pagination'
import PageToolbar from '../components/layout/PageToolbar'
import { useHeaderCounts } from '../components/layout/HeaderCounts'
import FilterSelect from '../components/ui/FilterSelect'
import { categoryOptions, categoryAndChildren } from '../lib/categories'
import TableEmptyState from '../components/ui/TableEmptyState'
import { format, subMonths, startOfMonth } from 'date-fns'
import type { RequestStatus } from '../types/database'
import PersonCell from '../components/ui/PersonCell'
import GridHead from '../components/ui/GridHead'
import RowMenu from '../components/ui/RowMenu'
import { matchesSearch } from '../lib/search'
import SortFilter from '../components/ui/SortFilter'
import { applySort, text, num, date, dateLast, rev, docNumber, type SortDef } from '../lib/sort'
import ExportButton from '../components/ui/ExportButton'
import type { ExportColumn } from '../lib/exportExcel'

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-neutral',
  pending: 'badge-warn',
  approved: 'badge-success',
  rejected: 'badge-danger',
  cancelled: 'badge-neutral',
  completed: 'badge-info',
}

const STATUSES: RequestStatus[] = ['draft', 'pending', 'approved', 'rejected', 'cancelled', 'completed']

// Distinct line categories of a document: "Food", or "Food +2" when mixed.
function catLabel(lines: { categories: { name: string } | null }[] | null | undefined) {
  const names = [...new Set((lines ?? []).map(l => l.categories?.name).filter(Boolean) as string[])]
  if (names.length === 0) return '—'
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`
}

interface Row {
  id: string
  request_number: string
  title: string | null
  status: RequestStatus
  total_estimate: number
  created_at: string
  created_by: string
  approver_id: string | null
  po_id: string | null
  needed_by_date: string | null
  supplier_id: string | null
  supplier_name: string | null
  department_id: string | null
  request_line_items: { category_id: string | null; categories: { name: string } | null }[]
  suppliers: { name: string } | null
  locations: { name: string } | null
}

function fmt(n: number, currency = 'EUR') {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
}

function getDateFrom(range: string): string | null {
  if (range === 'all') return null
  const months = range === '1m' ? 1 : range === '3m' ? 3 : range === '6m' ? 6 : 12
  return startOfMonth(subMonths(new Date(), months - 1)).toISOString()
}

export default function RequestsPage() {
  const { company, profile, hasPerm, isAdmin } = useCompany()
  const { t } = useLanguage()
  const s = t.requests
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [poNums, setPoNums] = useState<Record<string, { po_number: string; created_at: string; status: string }>>({})
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Filters
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  useEffect(() => { setPage(1) }, [sort])
  const [status, setStatus] = useState('all')
  const [dateRange, setDateRange] = useState('all')
  const [supplierId, setSupplierId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [poFilter, setPoFilter] = useState('all')
  const [creatorId, setCreatorId] = useState('')

  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; parent_id: string | null; status: 'active' | 'inactive' }[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [members, setMembers] = useState<{ id: string; first_name: string; last_name: string }[]>([])

  const canViewAll = hasPerm('requests', 'view')

  useEffect(() => { if (company && profile) { load(); loadRefs() } }, [company, profile])

  async function loadRefs() {
    if (!company) return
    const cid = company.id
    const [sp, c, d, u] = await Promise.all([
      supabase.from('suppliers').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('categories').select('id, name, parent_id, status').eq('company_id', cid).order('name'),
      supabase.from('departments').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('users').select('id, first_name, last_name').eq('company_id', cid).order('first_name'),
    ])
    setSuppliers(sp.data ?? []); setCategories(c.data ?? []); setDepartments(d.data ?? []); setMembers(u.data ?? [])
  }

  async function load() {
    if (!company || !profile) return
    // spinner only on the first load: later reloads refresh the data in place
    let query = supabase
      .from('requests')
      .select('id, request_number, title, status, total_estimate, created_at, created_by, approver_id, po_id, needed_by_date, supplier_id, supplier_name, department_id, request_line_items(category_id, categories(name)), suppliers(name), locations(name)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
    if (!canViewAll) query = query.eq('created_by', profile.id)
    const { data } = await query
    const list = (data as unknown as Row[]) ?? []
    setRows(list)
    const ids = [...new Set(list.flatMap(r => [r.created_by, r.approver_id]).filter(Boolean) as string[])]
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, first_name, last_name').in('id', ids)
      const m: Record<string, string> = {}
      for (const u of us ?? []) m[u.id] = `${u.first_name} ${u.last_name}`
      setNames(m)
    }
    const poIds = list.map(r => r.po_id).filter(Boolean) as string[]
    if (poIds.length) {
      const { data: pos } = await supabase.from('purchase_orders').select('id, po_number, created_at, status').in('id', poIds)
      const pm: Record<string, { po_number: string; created_at: string; status: string }> = {}
      for (const p of pos ?? []) pm[p.id] = { po_number: p.po_number, created_at: p.created_at, status: p.status }
      setPoNums(pm)
    }
    setLoading(false)
  }

  function clearFilters() {
    setSearch(''); setStatus('all'); setDateRange('all')
    setSupplierId(''); setCategoryId(''); setDepartmentId(''); setPoFilter('all'); setCreatorId(''); setPage(1)
  }
  const hasActiveFilters = search || status !== 'all' || dateRange !== 'all' || supplierId || categoryId || departmentId || poFilter !== 'all' || creatorId

  const dateFrom = getDateFrom(dateRange)
  useEffect(() => { setPage(1) }, [search, status, dateRange, supplierId, categoryId, departmentId, poFilter, creatorId])

  const sortDefs: SortDef<(typeof rows)[number]>[] = [
    { value: 'newest', label: t.sort.newest, cmp: rev(date(r => r.created_at)) },
    { value: 'oldest', label: t.sort.oldest, cmp: date(r => r.created_at) },
    { value: 'numberAsc', label: t.sort.numberAsc, cmp: docNumber(r => r.request_number) },
    { value: 'numberDesc', label: t.sort.numberDesc, cmp: rev(docNumber(r => r.request_number)) },
    { value: 'amountDesc', label: t.sort.amountDesc, cmp: rev(num(r => r.total_estimate)) },
    { value: 'amountAsc', label: t.sort.amountAsc, cmp: num(r => r.total_estimate) },
    { value: 'neededBy', label: t.sort.neededBy, cmp: dateLast(r => r.needed_by_date) },
    { value: 'supplier', label: t.sort.supplierAsc, cmp: text(r => r.suppliers?.name ?? r.supplier_name) },
  ]
  const filtered = rows.filter(r => {
    if (!matchesSearch(search, [r.request_number, r.title, r.suppliers?.name ?? r.supplier_name, r.locations?.name, names[r.created_by], ...r.request_line_items.map(l => l.categories?.name)])) return false
    if (status !== 'all' && r.status !== status) return false
    if (dateFrom && r.created_at < dateFrom) return false
    if (supplierId && r.supplier_id !== supplierId) return false
    if (categoryId) { const ids = categoryAndChildren(categoryId, categories); if (!r.request_line_items?.some(l => ids.has(l.category_id ?? ''))) return false }
    if (departmentId && r.department_id !== departmentId) return false
    if (poFilter === 'ordered' && !r.po_id) return false
    if (poFilter === 'not' && r.po_id) return false
    if (creatorId && r.created_by !== creatorId) return false
    return true
  })

  const sortedRows = applySort(filtered, sortDefs, sort)
  const exportCols: ExportColumn<Row>[] = [
    { header: s.requestNumber, get: r => r.request_number, kind: 'text', width: 14 },
    { header: s.requestTitle, get: r => r.title, kind: 'text', width: 40 },
    { header: s.category, get: r => catLabel(r.request_line_items), kind: 'text', width: 24 },
    { header: s.supplier, get: r => r.suppliers?.name ?? r.supplier_name, kind: 'text', width: 30 },
    { header: s.neededBy, get: r => r.needed_by_date, kind: 'date', width: 14 },
    { header: s.requestedBy, get: r => names[r.created_by], kind: 'text', width: 22 },
    { header: s.estTotalCol, get: r => r.total_estimate, kind: 'money', width: 14 },
    { header: t.common.status, get: r => s.st[r.status], kind: 'text', width: 14 },
    { header: t.common.created, get: r => r.created_at, kind: 'date', width: 14 },
  ]
  const paginated = sortedRows.slice((page - 1) * pageSize, page * pageSize)
  function handlePageSizeChange(n: number) { setPageSize(n); setPage(1) }

  useHeaderCounts(loading ? [] : [{ value: filtered.length }])

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached actions={<><ExportButton fileName="zahtevki" columns={exportCols} rows={sortedRows} /><Button onClick={() => navigate('/requests/new')} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button></>}>
          <div className="relative min-w-40 flex-1 max-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-filter-label" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={s.requestNumber + ' / ' + s.supplier}
              className="w-full pl-9 pr-3 h-9 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:border-field-hover bg-white text-ink placeholder:text-filter-label" />
          </div>
          <SortFilter defs={sortDefs} value={sort} onChange={setSort} />
        <FilterSelect label={t.filters.labels.status} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="all">{t.filters.allM}</option>
            {STATUSES.map(st => <option key={st} value={st}>{s.st[st]}</option>)}
          </FilterSelect>
          <FilterSelect label={t.filters.labels.period} value={dateRange} onChange={e => setDateRange(e.target.value)}>
            <option value="all">{t.filters.allTime}</option>
            <option value="1m">{t.filters.lastMonth}</option>
            <option value="3m">{t.filters.last3Months}</option>
            <option value="6m">{t.filters.last6Months}</option>
            <option value="1y">{t.filters.last12Months}</option>
          </FilterSelect>
          <FilterSelect label={t.filters.labels.supplier} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
            <option value="">{t.filters.allM}</option>
            {suppliers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </FilterSelect>
          <FilterSelect label={t.filters.labels.category} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="">{t.filters.allF}</option>
            {categoryOptions(categories).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </FilterSelect>
          <FilterSelect label={t.filters.labels.department} value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
            <option value="">{t.filters.allM}</option>
            {departments.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </FilterSelect>
          <FilterSelect label={t.filters.labels.requester} value={creatorId} onChange={e => setCreatorId(e.target.value)}>
            <option value="">{t.filters.allM}</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
          </FilterSelect>
          <FilterSelect label={t.filters.labels.poStatus} value={poFilter} onChange={e => setPoFilter(e.target.value)}>
            <option value="all">{t.filters.allM}</option>
            <option value="ordered">{s.ordered}</option>
            <option value="not">{s.notOrdered}</option>
          </FilterSelect>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 text-sm text-ink2 hover:text-ink bg-white border border-field hover:border-field-hover rounded-lg px-2.5 py-1.5 font-medium whitespace-nowrap transition-colors">
              <X className="w-3.5 h-3.5" />{t.common.clearFilters}
            </button>
          )}
      </PageToolbar>

      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[1000px]">
            <GridHead cols={[[s.requestNumber, ClipboardList], [s.category, Tag], [s.supplier, Building2], [s.neededBy, CalendarClock], [s.requestedBy, User], [s.estTotalCol, Coins], [t.common.status, CircleDot], [s.poCol, ShoppingCart], ['']]} />
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={FileText} colSpan={10} title={hasActiveFilters ? t.common.empty.noResults.title : t.common.empty.requests.title} subtitle={hasActiveFilters ? t.common.empty.noResults.text : t.common.empty.requests.text} />
              ) : paginated.map(r => (
                <tr key={r.id} className="hover:bg-surface transition-colors cursor-pointer" onClick={() => navigate(`/requests/${r.id}`)}>
                  <td className="px-4 py-3 max-w-[300px]">
                    {r.title && <p className="text-sm font-medium text-ink truncate" title={r.title}>{r.title}</p>}
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <Link to={`/requests/${r.id}`} className={`font-medium hover:text-ink ${r.title ? 'text-xs text-gray-400' : 'text-sm text-gray-400'}`} onClick={e => e.stopPropagation()}>{r.request_number}</Link>
                      <span className="text-xs text-gray-400">{format(new Date(r.created_at), 'dd.MM.yyyy')}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink2">{catLabel(r.request_line_items)}</td>
                  <td className="px-4 py-3 text-ink2 max-w-[200px] truncate" title={r.suppliers?.name ?? r.supplier_name ?? undefined}>{r.suppliers?.name ?? r.supplier_name ?? '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-sm text-ink">{r.needed_by_date ? format(new Date(r.needed_by_date), 'dd.MM.yyyy') : '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{r.locations?.name ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3"><PersonCell name={names[r.created_by]} /></td>
                  <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{fmt(r.total_estimate ?? 0, company?.currency)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`badge ${STATUS_BADGE[r.status]}`}>{s.st[r.status]}</span>
                    {r.status === 'pending' && r.approver_id && names[r.approver_id] && (
                      <p className="text-xs text-gray-400 mt-1">{names[r.approver_id]}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.po_id && poNums[r.po_id]
                      ? (poNums[r.po_id].status === 'cancelled'
                        ? <>
                            <Link to={`/purchase-orders/${r.po_id}`} onClick={e => e.stopPropagation()} className="text-sm font-medium text-gray-400 line-through decoration-gray-300 hover:text-gray-600">{poNums[r.po_id].po_number}</Link>
                            <p className="text-xs text-gray-400 mt-0.5">{format(new Date(poNums[r.po_id].created_at), 'dd.MM.yyyy')}</p>
                          </>
                        : <>
                            <Link to={`/purchase-orders/${r.po_id}`} onClick={e => e.stopPropagation()} className=" text-sm font-medium text-gray-400 hover:text-gray-600">{poNums[r.po_id].po_number}</Link>
                            <p className="text-xs text-gray-400 mt-0.5">{format(new Date(poNums[r.po_id].created_at), 'dd.MM.yyyy')}</p>
                          </>)
                      : r.status === 'approved' && (hasPerm('purchase_orders', 'create') || isAdmin)
                        ? <button onClick={e => { e.stopPropagation(); navigate(`/requests/${r.id}`) }}
                            className="inline-flex items-center gap-1 badge badge-warn hover:brightness-95 transition-all whitespace-nowrap">
                            <Plus className="w-3 h-3" />{t.requests.createPO}
                          </button>
                        : r.status === 'approved'
                          ? <span className="badge badge-neutral">{t.requests.pendingPO}</span>
                          : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                      <RowMenu items={[{ label: t.common.view, icon: Eye, onClick: () => navigate(`/requests/${r.id}`) }]} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={handlePageSizeChange} />
      </div>
    </div>
  )
}
