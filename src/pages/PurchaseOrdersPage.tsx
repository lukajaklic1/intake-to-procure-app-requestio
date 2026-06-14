import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Eye, Pencil, Trash2, FileText, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { stNarocil, stOdprtihNarocil } from '../utils/pluralize'
import { toast } from '../components/ui/Toast'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import Pagination from '../components/ui/Pagination'
import { format, subMonths, startOfMonth } from 'date-fns'

const PAGE_SIZE = 20

interface PO {
  id: string
  po_number: string
  status: string
  total_amount: number
  created_at: string
  created_by: string
  expected_delivery_date: string | null
  supplier_id: string
  category_id: string
  project_id: string
  department_id: string | null
  request_id: string | null
  suppliers: { name: string } | null
  categories: { name: string } | null
  projects: { name: string } | null
  locations: { name: string } | null
}

const STATUS_BADGE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  issued:    'bg-amber-100 text-amber-700',
  sent:      'bg-blue-100 text-blue-700',
  closed:    'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
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
  const { t, lang } = useLanguage()
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
  const [projectId, setProjectId]     = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [creatorId, setCreatorId]     = useState('')

  // Reference data for dropdowns
  const [suppliers, setSuppliers]     = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories]   = useState<{ id: string; name: string }[]>([])
  const [projects, setProjects]       = useState<{ id: string; name: string }[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [members, setMembers]         = useState<{ id: string; first_name: string; last_name: string }[]>([])

  const [page, setPage] = useState(1)
  const [confirmDelete, setConfirmDelete] = useState<PO | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => { if (company) { load(); loadRefs() } }, [company])

  async function loadRefs() {
    if (!company) return
    const cid = company.id
    const [s, c, p, d, u] = await Promise.all([
      supabase.from('suppliers').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('categories').select('id, name').eq('company_id', cid).order('name'),
      supabase.from('projects').select('id, name').eq('company_id', cid).order('name'),
      supabase.from('departments').select('id, name').eq('company_id', cid).order('name'),
      supabase.from('users').select('id, first_name, last_name').eq('company_id', cid).order('first_name'),
    ])
    setSuppliers(s.data ?? [])
    setCategories(c.data ?? [])
    setProjects(p.data ?? [])
    setDepartments(d.data ?? [])
    setMembers(u.data ?? [])
  }

  async function load() {
    if (!company) return
    setLoading(true)
    const { data } = await supabase
      .from('purchase_orders')
      .select('id, po_number, status, total_amount, created_at, created_by, expected_delivery_date, supplier_id, category_id, project_id, department_id, request_id, suppliers(name), categories(name), projects(name), locations(name)')
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
    setSupplierId(''); setCategoryId(''); setProjectId(''); setDepartmentId(''); setCreatorId('')
    setPage(1)
  }

  const hasActiveFilters = search || status !== 'all' || dateRange !== 'all' || supplierId || categoryId || projectId || departmentId || creatorId

  const dateFrom = getDateFrom(dateRange)

  // Reset page on any filter change
  useEffect(() => { setPage(1) }, [search, status, dateRange, supplierId, categoryId, projectId, departmentId, creatorId])

  const filtered = pos.filter(po => {
    const q = search.toLowerCase()
    if (search && !po.po_number.toLowerCase().includes(q) && !(po.suppliers?.name ?? '').toLowerCase().includes(q)) return false
    if (status !== 'all' && po.status !== status) return false
    if (dateFrom && po.created_at < dateFrom) return false
    if (supplierId && po.supplier_id !== supplierId) return false
    if (categoryId && po.category_id !== categoryId) return false
    if (projectId && po.project_id !== projectId) return false
    if (departmentId && po.department_id !== departmentId) return false
    if (creatorId && po.created_by !== creatorId) return false
    return true
  })

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const selectCls = 'text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700'

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{s.title}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {lang === 'sl' ? stNarocil(filtered.length) : `${filtered.length} ${t.po.shown}`} · {lang === 'sl' ? stOdprtihNarocil(pos.filter(p => ['issued','sent'].includes(p.status)).length) : `${pos.filter(p => ['issued','sent'].includes(p.status)).length} ${t.common.open}`}
          </p>
        </div>
        <Button onClick={() => navigate('/purchase-orders/new')} className="gap-2">
          <Plus className="w-4 h-4" />{s.new}
        </Button>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
        <div className="flex items-center gap-3 flex-wrap">

          {/* Search */}
          <div className="relative min-w-48 flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={s.poNumber + " / " + s.supplier}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>

          {/* Status */}
          <select value={status} onChange={e => setStatus(e.target.value)} className={selectCls}>
            <option value="all">{t.filters.allStatuses}</option>
            {['draft','issued','sent','closed','cancelled'].map(s => (
              <option key={s} value={s}>{t.status[s as keyof typeof t.status]}</option>
            ))}
          </select>

          {/* Date range */}
          <select value={dateRange} onChange={e => setDateRange(e.target.value)} className={selectCls}>
            <option value="all">{t.filters.allTime}</option>
            <option value="1m">{t.filters.lastMonth}</option>
            <option value="3m">{t.filters.last3Months}</option>
            <option value="6m">{t.filters.last6Months}</option>
            <option value="1y">{t.filters.last12Months}</option>
          </select>

          {/* Supplier */}
          <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={selectCls}>
            <option value="">{t.filters.allSuppliers}</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          {/* Category */}
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={selectCls}>
            <option value="">{t.filters.allCategories}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Project */}
          <select value={projectId} onChange={e => setProjectId(e.target.value)} className={selectCls}>
            <option value="">{t.filters.allProjects}</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {/* Department */}
          <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className={selectCls}>
            <option value="">{t.filters.allDepartments}</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          {/* Creator */}
          <select value={creatorId} onChange={e => setCreatorId(e.target.value)} className={selectCls}>
            <option value="">{s.creatorAll}</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
          </select>

          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 font-medium ml-auto whitespace-nowrap">
              <X className="w-3.5 h-3.5" />{t.common.clearFilters}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <FileText className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">{hasActiveFilters ? s.noMatch : s.noData}</p>
            {!hasActiveFilters && (
              <button onClick={() => navigate('/purchase-orders/new')} className="mt-3 text-sm text-blue-600 hover:underline font-medium">{t.po.createFirst}</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {[s.poNumber, s.supplier, s.project, s.category, s.deliveryDate, s.total, t.common.status, s.requestCol, ''].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(po => (
                <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/purchase-orders/${po.id}`} className="font-mono text-sm font-semibold text-blue-600 hover:underline">
                      {po.po_number}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5">{format(new Date(po.created_at), 'dd.MM.yyyy')}</p>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{po.suppliers?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{po.projects?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{po.categories?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {po.expected_delivery_date ? format(new Date(po.expected_delivery_date), 'dd.MM.yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{fmt(po.total_amount ?? 0, company?.currency)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[po.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {t.status[po.status as keyof typeof t.status] ?? po.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {po.request_id
                      ? <Link to={`/requests/${po.request_id}`} className="font-mono text-xs font-semibold text-blue-600 hover:underline">{reqNums[po.request_id] ?? '—'}</Link>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {po.status === 'draft' ? (
                        <>
                          <Link to={`/purchase-orders/${po.id}/edit`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title={t.common.editEntity}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Link>
                          <button onClick={() => setConfirmDelete(po)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={t.common.deleteEntity}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <Link to={`/purchase-orders/${po.id}`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title={t.common.view}>
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
        <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onChange={setPage} />
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
