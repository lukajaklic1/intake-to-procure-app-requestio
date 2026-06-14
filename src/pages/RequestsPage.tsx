import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, FileText, Eye } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import Button from '../components/ui/Button'
import Pagination from '../components/ui/Pagination'
import { format } from 'date-fns'
import type { RequestStatus } from '../types/database'

const PAGE_SIZE = 20

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
  cancelled: 'bg-gray-100 text-gray-500',
}

interface Row {
  id: string
  request_number: string
  status: RequestStatus
  total_estimate: number
  created_at: string
  created_by: string
  projects: { name: string } | null
}

function fmt(n: number, currency = 'EUR') {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
}

export default function RequestsPage() {
  const { company, profile, hasPerm } = useCompany()
  const { t } = useLanguage()
  const s = t.requests
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const canViewAll = hasPerm('requests', 'view')

  useEffect(() => { if (company && profile) load() }, [company, profile])

  async function load() {
    if (!company || !profile) return
    setLoading(true)
    let query = supabase
      .from('requests')
      .select('id, request_number, status, total_estimate, created_at, created_by, projects(name)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
    if (!canViewAll) query = query.eq('created_by', profile.id)
    const { data } = await query
    const list = (data as unknown as Row[]) ?? []
    setRows(list)
    const ids = [...new Set(list.map(r => r.created_by))]
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, first_name, last_name').in('id', ids)
      const m: Record<string, string> = {}
      for (const u of us ?? []) m[u.id] = `${u.first_name} ${u.last_name}`
      setNames(m)
    }
    setLoading(false)
  }

  const paginated = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{s.title}</h1>
          <p className="text-gray-500 text-sm mt-1">{s.subtitle}</p>
        </div>
        <Button onClick={() => navigate('/requests/new')} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <FileText className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">{s.noData}</p>
            <button onClick={() => navigate('/requests/new')} className="mt-3 text-sm text-blue-600 hover:underline font-medium">{s.createFirst}</button>
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{[s.requestNumber, s.project, s.requestedBy, s.estTotal, t.common.status, ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/requests/${r.id}`)}>
                  <td className="px-4 py-3">
                    <Link to={`/requests/${r.id}`} className="font-mono text-sm font-semibold text-blue-600 hover:underline" onClick={e => e.stopPropagation()}>{r.request_number}</Link>
                    <p className="text-xs text-gray-400 mt-0.5">{format(new Date(r.created_at), 'dd.MM.yyyy')}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.projects?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{names[r.created_by] ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{fmt(r.total_estimate ?? 0, company?.currency)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[r.status]}`}>{s.st[r.status]}</span>
                  </td>
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
        <Pagination total={rows.length} page={page} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  )
}
