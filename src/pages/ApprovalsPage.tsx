import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { format } from 'date-fns'

interface Row {
  id: string
  request_number: string
  total_estimate: number
  created_at: string
  needed_by_date: string | null
  created_by: string
  approver_id: string | null
  projects: { name: string } | null
}

function fmt(n: number, currency = 'EUR') {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
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

  useEffect(() => { if (company && profile) load() }, [company, profile, isAdmin])

  async function load() {
    if (!company || !profile) return
    setLoading(true)
    let query = supabase
      .from('requests')
      .select('id, request_number, total_estimate, created_at, needed_by_date, created_by, approver_id, projects(name)')
      .eq('company_id', company.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    // Admins see every pending request; others only those assigned to them.
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

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{a.title}</h1>
        <p className="text-gray-500 text-sm mt-1">{a.subtitle}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <CheckCircle2 className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">{a.noData}</p>
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{[s.requestNumber, s.project, a.requestedBy, ...(isAdmin ? [s.approver] : []), s.neededBy, s.estTotal].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/requests/${r.id}`)}>
                  <td className="px-4 py-3 font-mono text-sm font-semibold text-blue-600">{r.request_number}
                    <p className="text-xs text-gray-400 mt-0.5 font-sans">{format(new Date(r.created_at), 'dd.MM.yyyy')}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.projects?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{names[r.created_by] ?? '—'}</td>
                  {isAdmin && <td className="px-4 py-3 text-gray-600">{r.approver_id ? names[r.approver_id] ?? '—' : '—'}</td>}
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.needed_by_date ? format(new Date(r.needed_by_date), 'dd.MM.yyyy') : '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{fmt(r.total_estimate ?? 0, company?.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}
