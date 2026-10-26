import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, FileText, Eye, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import Button from '../components/ui/Button'
import Pagination from '../components/ui/Pagination'
import PageToolbar from '../components/layout/PageToolbar'
import TableEmptyState from '../components/ui/TableEmptyState'
import { format, subMonths, startOfMonth } from 'date-fns'
import type { RequestStatus } from '../types/database'

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-selected text-ink2',
  pending: 'bg-warn-light text-warn',
  approved: 'bg-success-light text-success',
  rejected: 'bg-danger-light text-danger',
  cancelled: 'bg-selected text-muted',
  completed: 'bg-accent-light text-accent-hover',
}

const STATUSES: RequestStatus[] = ['draft', 'pending', 'approved', 'rejected', 'cancelled', 'completed']

interface Row {
  id: string
  request_number: string
  status: RequestStatus
  total_estimate: number
  created_at: string
  created_by: string
  approver_id: string | null
  po_id: string | null
  needed_by_date: string | null
  supplier_id: string | null
  supplier_name: string | null
  category_id: string | null
  department_id: string | null
  categories: { name: string } | null
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
  const [status, setStatus] = useState('all')
  const [dateRange, setDateRange] = useState('all')
  const [supplierId, setSupplierId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [poFilter, setPoFilter] = useState('all')
  const [creatorId, setCreatorId] = useState('')

  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [members, setMembers] = useState<{ id: string; first_name: string; last_name: string }[]>([])

  const canViewAll = hasPerm('requests', 'view')

  useEffect(() => { if (company && profile) { load(); loadRefs() } }, [company, profile])

  async function loadRefs() {
    if (!company) return
    const cid = company.id
    const [sp, c, d, u] = await Promise.all([
      supabase.from('suppliers').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('categories').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('departments').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('users').select('id, first_name, last_name').eq('company_id', cid).order('first_name'),
    ])
    setSuppliers(sp.data ?? []); setCategories(c.data ?? []); setDepartments(d.data ?? []); setMembers(u.data ?? [])
  }

  async function load() {
    if (!company || !profile) return
    setLoading(true)
    let query = supabase
      .from('requests')
      .select('id, request_number, status, total_estimate, created_at, created_by, approver_id, po_id, needed_by_date, supplier_id, supplier_name, category_id, department_id, categories(name), suppliers(name), locations(name)')
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

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    if (search && !r.request_number.toLowerCase().includes(q) && !(r.suppliers?.name ?? r.supplier_name ?? '').toLowerCase().includes(q)) return false
    if (status !== 'all' && r.status !== status) return false
    if (dateFrom && r.created_at < dateFrom) return false
    if (supplierId && r.supplier_id !== supplierId) return false
    if (categoryId && r.category_id !== categoryId) return false
    if (departmentId && r.department_id !== departmentId) return false
    if (poFilter === 'ordered' && !r.po_id) return false
    if (poFilter === 'not' && r.po_id) return false
    if (creatorId && r.created_by !== creatorId) return false
    return true
  })

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)
  function handlePageSizeChange(n: number) { setPageSize(n); setPage(1) }
  const selectCls = 'text-sm border border-field rounded-lg hover:border-field-hover px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent bg-white text-ink truncate max-w-[150px]'

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar actions={<Button onClick={() => navigate('/requests/new')} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button>}>
          <div className="relative min-w-40 flex-1 max-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={s.requestNumber + ' / ' + s.supplier}
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:ring-2 focus:ring-accent bg-white text-ink placeholder:text-placeholder" />
          </div>
          <select value={status} onChange={e => setStatus(e.target.value)} className={selectCls}>
            <option value="all">{t.filters.allStatuses}</option>
            {STATUSES.map(st => <option key={st} value={st}>{s.st[st]}</option>)}
          </select>
          <select value={dateRange} onChange={e => setDateRange(e.target.value)} className={selectCls}>
            <option value="all">{t.filters.allTime}</option>
            <option value="1m">{t.filters.lastMonth}</option>
            <option value="3m">{t.filters.last3Months}</option>
            <option value="6m">{t.filters.last6Months}</option>
            <option value="1y">{t.filters.last12Months}</option>
          </select>
          <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={selectCls}>
            <option value="">{t.filters.allSuppliers}</option>
            {suppliers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={selectCls}>
            <option value="">{t.filters.allCategories}</option>
            {categories.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className={selectCls}>
            <option value="">{t.filters.allDepartments}</option>
            {departments.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <select value={creatorId} onChange={e => setCreatorId(e.target.value)} className={selectCls}>
            <option value="">{s.allRequesters}</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
          </select>
          <select value={poFilter} onChange={e => setPoFilter(e.target.value)} className={selectCls}>
            <option value="all">{s.poFilterAll}</option>
            <option value="ordered">{s.ordered}</option>
            <option value="not">{s.notOrdered}</option>
          </select>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 text-sm text-ink2 hover:text-ink bg-white border border-field hover:border-field-hover rounded-lg px-2.5 py-1.5 font-medium whitespace-nowrap transition-colors">
              <X className="w-3.5 h-3.5" />{t.common.clearFilters}
            </button>
          )}
      </PageToolbar>

      <div className="bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[1000px]">
            <thead className="bg-surface border-b border-field">
              <tr>{[s.requestNumber, s.category, s.supplier, s.neededBy, s.requestedBy, s.estTotalCol, t.common.status, s.poCol, ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-sm font-medium text-ink2 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={FileText} colSpan={10} subtitle={hasActiveFilters ? s.noMatch : s.noData} />
              ) : paginated.map(r => (
                <tr key={r.id} className="hover:bg-surface transition-colors cursor-pointer" onClick={() => navigate(`/requests/${r.id}`)}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link to={`/requests/${r.id}`} className=" text-sm font-medium text-gray-400 hover:text-gray-600" onClick={e => e.stopPropagation()}>{r.request_number}</Link>
                    <p className="text-xs text-gray-400 mt-0.5">{format(new Date(r.created_at), 'dd.MM.yyyy')}</p>
                  </td>
                  <td className="px-4 py-3 text-ink2">{r.categories?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-ink2 max-w-[200px] truncate" title={r.suppliers?.name ?? r.supplier_name ?? undefined}>{r.suppliers?.name ?? r.supplier_name ?? '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-sm text-ink">{r.needed_by_date ? format(new Date(r.needed_by_date), 'dd.MM.yyyy') : '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{r.locations?.name ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-ink2">{names[r.created_by] ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{fmt(r.total_estimate ?? 0, company?.currency)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[r.status]}`}>{s.st[r.status]}</span>
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
                            className="inline-flex items-center gap-1 text-xs font-medium text-warn bg-warn-light hover:brightness-95 rounded-full px-2 py-0.5 transition-all whitespace-nowrap">
                            <Plus className="w-3 h-3" />{t.requests.createPO}
                          </button>
                        : r.status === 'approved'
                          ? <span className="text-xs font-medium text-ink2 bg-selected rounded-full px-2 py-0.5 whitespace-nowrap">{t.requests.pendingPO}</span>
                          : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Link to={`/requests/${r.id}`} onClick={e => e.stopPropagation()} title={t.common.view}
                        className="p-1.5 text-gray-400 hover:text-accent hover:bg-accent-light rounded-lg transition-colors"><Eye className="w-3.5 h-3.5" /></Link>
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
