import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Eye, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { format, subMonths, startOfMonth } from 'date-fns'

interface Row {
  id: string
  request_number: string
  total_estimate: number
  created_at: string
  needed_by_date: string | null
  created_by: string
  approver_id: string | null
  project_id: string
  projects: { name: string } | null
}

function fmt(n: number, currency = 'EUR') {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
}

function getDateFrom(range: string): string | null {
  if (range === 'all') return null
  const months = range === '1m' ? 1 : range === '3m' ? 3 : range === '6m' ? 6 : 12
  return startOfMonth(subMonths(new Date(), months - 1)).toISOString()
}

export default function ApprovalsPage() {
  const { company, profile, isAdmin } = useCompany()
  const { t } = useLanguage()
  const a = t.approvals
  const s = t.requests
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [projectId, setProjectId] = useState('')
  const [dateRange, setDateRange] = useState('all')
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])

  useEffect(() => { if (company && profile) { load(); loadProjects() } }, [company, profile, isAdmin])

  async function loadProjects() {
    if (!company) return
    const { data } = await supabase.from('projects').select('id, name').eq('company_id', company.id).order('name')
    setProjects(data ?? [])
  }

  async function load() {
    if (!company || !profile) return
    setLoading(true)
    let query = supabase
      .from('requests')
      .select('id, request_number, total_estimate, created_at, needed_by_date, created_by, approver_id, project_id, projects(name)')
      .eq('company_id', company.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (!isAdmin) query = query.eq('approver_id', profile.id)
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
    setLoading(false)
  }

  function clearFilters() { setSearch(''); setProjectId(''); setDateRange('all') }
  const hasActiveFilters = search || projectId || dateRange !== 'all'
  const dateFrom = getDateFrom(dateRange)

  const filtered = rows.filter(r => {
    const q = search.toLowerCase()
    if (search && !r.request_number.toLowerCase().includes(q) && !(r.projects?.name ?? '').toLowerCase().includes(q)) return false
    if (projectId && r.project_id !== projectId) return false
    if (dateFrom && r.created_at < dateFrom) return false
    return true
  })

  const selectCls = 'text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700'

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">{a.title}</h1>
        <p className="text-gray-500 text-sm mt-1">{a.subtitle}</p>
      </div>

      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative min-w-48 flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={s.requestNumber + ' / ' + s.project}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            </div>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className={selectCls}>
              <option value="">{t.filters.allProjects}</option>
              {projects.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <select value={dateRange} onChange={e => setDateRange(e.target.value)} className={selectCls}>
              <option value="all">{t.filters.allTime}</option>
              <option value="1m">{t.filters.lastMonth}</option>
              <option value="3m">{t.filters.last3Months}</option>
              <option value="6m">{t.filters.last6Months}</option>
              <option value="1y">{t.filters.last12Months}</option>
            </select>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 font-medium ml-auto whitespace-nowrap">
                <X className="w-3.5 h-3.5" />{t.common.clearFilters}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <CheckCircle2 className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">{hasActiveFilters ? s.noMatch : a.noData}</p>
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[680px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{[s.requestNumber, s.project, a.requestedBy, ...(isAdmin ? [s.approver] : []), s.neededBy, s.estTotal, ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/requests/${r.id}`)}>
                  <td className="px-4 py-3">
                    <Link to={`/requests/${r.id}`} onClick={e => e.stopPropagation()} className="font-mono text-sm font-semibold text-blue-600 hover:underline">{r.request_number}</Link>
                    <p className="text-xs text-gray-400 mt-0.5">{format(new Date(r.created_at), 'dd.MM.yyyy')}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.projects?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{names[r.created_by] ?? '—'}</td>
                  {isAdmin && <td className="px-4 py-3 text-gray-600">{r.approver_id ? names[r.approver_id] ?? '—' : '—'}</td>}
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.needed_by_date ? format(new Date(r.needed_by_date), 'dd.MM.yyyy') : '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{fmt(r.total_estimate ?? 0, company?.currency)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Link to={`/requests/${r.id}`} onClick={e => e.stopPropagation()} title={t.common.view}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Eye className="w-3.5 h-3.5" /></Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}
