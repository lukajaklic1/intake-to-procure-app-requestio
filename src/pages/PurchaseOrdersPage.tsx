import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Eye, Pencil, Trash2, FileText, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import Pagination from '../components/ui/Pagination'
import PageToolbar from '../components/layout/PageToolbar'
import { useHeaderCounts } from '../components/layout/HeaderCounts'
import FilterSelect from '../components/ui/FilterSelect'
import TableEmptyState from '../components/ui/TableEmptyState'
import { format, subMonths, startOfMonth } from 'date-fns'

// Distinct line categories of a document: "Food", or "Food +2" when mixed.
function catLabel(lines: { categories: { name: string } | null }[] | null | undefined) {
  const names = [...new Set((lines ?? []).map(l => l.categories?.name).filter(Boolean) as string[])]
  if (names.length === 0) return '—'
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`
}

interface PO {
  id: string
  po_number: string
  status: string
  received_status: 'none' | 'partial' | 'full'
  total_amount: number
  created_at: string
  created_by: string
  expected_delivery_date: string | null
  supplier_id: string
  department_id: string | null
  request_id: string | null
  suppliers: { name: string } | null
  po_line_items: { category_id: string | null; categories: { name: string } | null }[]
  locations: { name: string } | null
}

const STATUS_BADGE: Record<string, string> = {
  draft:     'badge-neutral',
  issued:    'badge-warn',
  sent:      'badge-info',
  closed:    'badge-success',
  cancelled: 'badge-danger',
}

// Date options are rendered inline with t.filters.*

function fmt(n: number, currency = 'EUR') {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
}

function getDateFrom(range: string): string | null {
  if (range === 'all') return null
  const months = range === '1m' ? 1 : range === '3m' ? 3 : range === '6m' ? 6 : 12
  return startOfMonth(subMonths(new Date(), months - 1)).toISOString()
}

export default function PurchaseOrdersPage() {
  const { company } = useCompany()
  const { t } = useLanguage()
  const s = t.po
  const navigate = useNavigate()
  const [pos, setPos] = useState<PO[]>([])
  const [reqNums, setReqNums] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch]           = useState('')
  const [status, setStatus]           = useState('all')
  const [dateRange, setDateRange]     = useState('all')
  const [supplierId, setSupplierId]   = useState('')
  const [categoryId, setCategoryId]   = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [creatorId, setCreatorId]     = useState('')

  // Reference data for dropdowns
  const [suppliers, setSuppliers]     = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories]   = useState<{ id: string; name: string }[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [members, setMembers]         = useState<{ id: string; first_name: string; last_name: string }[]>([])

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [confirmDelete, setConfirmDelete] = useState<PO | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => { if (company) { load(); loadRefs() } }, [company])

  async function loadRefs() {
    if (!company) return
    const cid = company.id
    const [s, c, d, u] = await Promise.all([
      supabase.from('suppliers').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('categories').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('departments').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('users').select('id, first_name, last_name').eq('company_id', cid).order('first_name'),
    ])
    setSuppliers(s.data ?? [])
    setCategories(c.data ?? [])
    setDepartments(d.data ?? [])
    setMembers(u.data ?? [])
  }

  async function load() {
    if (!company) return
    setLoading(true)
    const { data } = await supabase
      .from('purchase_orders')
      .select('id, po_number, status, received_status, total_amount, created_at, created_by, expected_delivery_date, supplier_id, department_id, request_id, suppliers(name), po_line_items(category_id, categories(name)), locations(name)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
    const list = (data as unknown as PO[]) ?? []
    setPos(list)
    const reqIds = list.map(p => p.request_id).filter(Boolean) as string[]
    if (reqIds.length) {
      const { data: reqs } = await supabase.from('requests').select('id, request_number').in('id', reqIds)
      const rm: Record<string, string> = {}
      for (const r of reqs ?? []) rm[r.id] = r.request_number
      setReqNums(rm)
    }
    setLoading(false)
  }

  async function handleDelete(po: PO) {
    setActionLoading(true)
    const { error } = await supabase.from('purchase_orders').delete().eq('id', po.id)
    setActionLoading(false); setConfirmDelete(null)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.deleted); load()
  }

  function clearFilters() {
    setSearch(''); setStatus('all'); setDateRange('all')
    setSupplierId(''); setCategoryId(''); setDepartmentId(''); setCreatorId('')
    setPage(1)
  }

  const hasActiveFilters = search || status !== 'all' || dateRange !== 'all' || supplierId || categoryId || departmentId || creatorId

  const dateFrom = getDateFrom(dateRange)

  // Reset page on any filter change
  useEffect(() => { setPage(1) }, [search, status, dateRange, supplierId, categoryId, departmentId, creatorId])

  const filtered = pos.filter(po => {
    const q = search.toLowerCase()
    if (search && !po.po_number.toLowerCase().includes(q) && !(po.suppliers?.name ?? '').toLowerCase().includes(q)) return false
    if (status !== 'all' && po.status !== status) return false
    if (dateFrom && po.created_at < dateFrom) return false
    if (supplierId && po.supplier_id !== supplierId) return false
    if (categoryId && !po.po_line_items?.some(l => l.category_id === categoryId)) return false
    if (departmentId && po.department_id !== departmentId) return false
    if (creatorId && po.created_by !== creatorId) return false
    return true
  })

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)
  function handlePageSizeChange(n: number) { setPageSize(n); setPage(1) }

  useHeaderCounts(loading ? [] : [{ value: filtered.length }])

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached actions={<Button onClick={() => navigate('/purchase-orders/new')} className="gap-2"> <Plus className="w-4 h-4" />{s.new} </Button>}>

          {/* Search */}
          <div className="relative min-w-40 flex-1 max-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-filter-label" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={s.poNumber + " / " + s.supplier}
              className="w-full pl-9 pr-3 h-8 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:border-field-hover bg-white text-ink placeholder:text-filter-label" />
          </div>

          {/* Status */}
          <FilterSelect label={t.filters.labels.status} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="all">{t.filters.allM}</option>
            {['draft','issued','sent','closed','cancelled'].map(s => (
              <option key={s} value={s}>{t.status[s as keyof typeof t.status]}</option>
            ))}
          </FilterSelect>

          {/* Date range */}
          <FilterSelect label={t.filters.labels.period} value={dateRange} onChange={e => setDateRange(e.target.value)}>
            <option value="all">{t.filters.allTime}</option>
            <option value="1m">{t.filters.lastMonth}</option>
            <option value="3m">{t.filters.last3Months}</option>
            <option value="6m">{t.filters.last6Months}</option>
            <option value="1y">{t.filters.last12Months}</option>
          </FilterSelect>

          {/* Supplier */}
          <FilterSelect label={t.filters.labels.supplier} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
            <option value="">{t.filters.allM}</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </FilterSelect>

          {/* Category */}
          <FilterSelect label={t.filters.labels.category} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="">{t.filters.allF}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </FilterSelect>

          {/* Department */}
          <FilterSelect label={t.filters.labels.department} value={departmentId} onChange={e => setDepartmentId(e.target.value)}>
            <option value="">{t.filters.allM}</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </FilterSelect>

          {/* Creator */}
          <FilterSelect label={t.filters.labels.requester} value={creatorId} onChange={e => setCreatorId(e.target.value)}>
            <option value="">{s.creatorAll}</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
          </FilterSelect>

          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 text-sm text-ink2 hover:text-ink bg-white border border-field hover:border-field-hover rounded-lg px-2.5 py-1.5 font-medium whitespace-nowrap transition-colors">
              <X className="w-3.5 h-3.5" />{t.common.clearFilters}
            </button>
          )}
      </PageToolbar>

      {/* Table */}
      <div className="data-card table-bleed bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
            <thead className="bg-surface border-b border-field">
              <tr>
                {[s.poNumber, s.supplier, s.location, s.category, s.deliveryDate, s.total, t.common.status, s.requestCol, ''].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-sm font-medium text-ink2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={FileText} colSpan={10} title={hasActiveFilters ? t.common.empty.noResults.title : t.common.empty.purchaseOrders.title} subtitle={hasActiveFilters ? t.common.empty.noResults.text : t.common.empty.purchaseOrders.text} />
              ) : paginated.map(po => (
                <tr key={po.id} className="hover:bg-surface transition-colors cursor-pointer" onClick={() => navigate(`/purchase-orders/${po.id}`)}>
                  <td className="px-4 py-3">
                    <Link to={`/purchase-orders/${po.id}`} onClick={e => e.stopPropagation()} className=" text-sm font-medium text-gray-400 hover:text-gray-600">
                      {po.po_number}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5">{format(new Date(po.created_at), 'dd.MM.yyyy')}</p>
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{po.suppliers?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-ink2">{po.locations?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{catLabel(po.po_line_items)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {po.expected_delivery_date ? format(new Date(po.expected_delivery_date), 'dd.MM.yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{fmt(po.total_amount ?? 0, company?.currency)}</td>
                  <td className="px-4 py-3">
                    {po.status === 'sent' && po.received_status === 'partial'
                      ? <span className="badge badge-warn">{t.receipts.rsPartial}</span>
                      : po.status === 'closed' && po.received_status !== 'full'
                      ? <span className="badge badge-info">{t.po.statusFinalized}</span>
                      : <span className={`badge capitalize ${STATUS_BADGE[po.status] ?? 'badge-neutral'}`}>
                          {t.status[po.status as keyof typeof t.status] ?? po.status}
                        </span>}
                  </td>
                  <td className="px-4 py-3">
                    {po.request_id
                      ? <Link to={`/requests/${po.request_id}`} onClick={e => e.stopPropagation()} className=" text-xs font-medium text-gray-400 hover:text-gray-600">{reqNums[po.request_id] ?? '—'}</Link>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {po.status === 'draft' ? (
                        <>
                          <Link to={`/purchase-orders/${po.id}/edit`} onClick={e => e.stopPropagation()} className="p-1.5 text-gray-400 hover:text-accent hover:bg-accent-light rounded-lg transition-colors" title={t.common.editEntity}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Link>
                          <button onClick={e => { e.stopPropagation(); setConfirmDelete(po) }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={t.common.deleteEntity}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <Link to={`/purchase-orders/${po.id}`} onClick={e => e.stopPropagation()} className="p-1.5 text-gray-400 hover:text-accent hover:bg-accent-light rounded-lg transition-colors" title={t.common.view}>
                          <Eye className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={handlePageSizeChange} />
      </div>

      <ConfirmDialog
        open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title={t.common.deleteEntity} danger loading={actionLoading}
        message={`${t.common.deleteEntity} ${confirmDelete?.po_number}? ${t.common.cannotUndo}`}
        confirmLabel={t.common.deleteEntity}
      />
    </div>
  )
}
