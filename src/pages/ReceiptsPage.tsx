import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PackageCheck, Eye, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import Button from '../components/ui/Button'
import { format, subMonths, startOfMonth } from 'date-fns'

const RS_BADGE: Record<string, string> = {
  none: 'bg-gray-100 text-gray-600',
  partial: 'bg-amber-100 text-amber-700',
  full: 'bg-green-100 text-green-700',
}

interface QueueRow {
  id: string
  po_number: string
  total_amount: number
  received_status: 'none' | 'partial' | 'full'
  suppliers: { name: string } | null
  projects: { name: string } | null
}

interface ReceiptRow {
  id: string
  receipt_number: string
  received_date: string
  received_by: string
  supplier_receipt_no: string | null
  purchase_orders: { po_number: string; suppliers: { name: string } | null } | null
}

function fmt(n: number, currency = 'EUR') {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
}

function getDateFrom(range: string): string | null {
  if (range === 'all') return null
  const months = range === '1m' ? 1 : range === '3m' ? 3 : range === '6m' ? 6 : 12
  return startOfMonth(subMonths(new Date(), months - 1)).toISOString().slice(0, 10)
}

export default function ReceiptsPage() {
  const { company } = useCompany()
  const { t } = useLanguage()
  const s = t.receipts
  const navigate = useNavigate()
  const [tab, setTab] = useState<'queue' | 'history'>('queue')
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState('all')

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    if (!company) return
    setLoading(true)
    const [{ data: q }, { data: r }] = await Promise.all([
      supabase.from('purchase_orders')
        .select('id, po_number, total_amount, received_status, suppliers(name), projects(name)')
        .eq('company_id', company.id).eq('status', 'sent').neq('received_status', 'full')
        .order('created_at', { ascending: false }),
      supabase.from('receipts')
        .select('id, receipt_number, received_date, received_by, supplier_receipt_no, purchase_orders(po_number, suppliers(name))')
        .eq('company_id', company.id).order('received_date', { ascending: false }),
    ])
    setQueue((q as unknown as QueueRow[]) ?? [])
    const rList = (r as unknown as ReceiptRow[]) ?? []
    setReceipts(rList)
    const ids = [...new Set(rList.map(x => x.received_by))]
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, first_name, last_name').in('id', ids)
      const m: Record<string, string> = {}
      for (const u of us ?? []) m[u.id] = `${u.first_name} ${u.last_name}`
      setNames(m)
    }
    setLoading(false)
  }

  const dateFrom = getDateFrom(dateRange)
  const filteredReceipts = receipts.filter(r => {
    const q = search.toLowerCase()
    if (search && !r.receipt_number.toLowerCase().includes(q) && !(r.purchase_orders?.po_number ?? '').toLowerCase().includes(q)) return false
    if (dateFrom && r.received_date < dateFrom) return false
    return true
  })
  const hasFilters = search || dateRange !== 'all'
  const selectCls = 'text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700'

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">{s.title}</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {(['queue', 'history'] as const).map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === tb ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {tb === 'queue' ? `${s.toReceive} (${queue.length})` : s.history}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : tab === 'queue' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <PackageCheck className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">{s.noToReceive}</p>
            </div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
              <thead className="bg-gray-50 border-b border-gray-100"><tr>
                {[t.po.poNumber, t.po.supplier, t.po.project, t.po.total, t.common.status, ''].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {queue.map(po => (
                  <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3"><Link to={`/purchase-orders/${po.id}`} className="font-mono text-sm font-semibold text-blue-600 hover:underline">{po.po_number}</Link></td>
                    <td className="px-4 py-3 text-gray-700">{po.suppliers?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{po.projects?.name ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{fmt(po.total_amount ?? 0, company?.currency)}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RS_BADGE[po.received_status]}`}>{po.received_status === 'partial' ? s.rsPartial : s.rsNone}</span></td>
                    <td className="px-4 py-3 text-right">
                      <Button onClick={() => navigate(`/receive/${po.id}`)} className="gap-1.5"><PackageCheck className="w-3.5 h-3.5" />{s.receive}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      ) : (
        <div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative min-w-48 flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={s.receiptNumber + ' / ' + t.po.poNumber}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
              </div>
              <select value={dateRange} onChange={e => setDateRange(e.target.value)} className={selectCls}>
                <option value="all">{t.filters.allTime}</option>
                <option value="1m">{t.filters.lastMonth}</option>
                <option value="3m">{t.filters.last3Months}</option>
                <option value="6m">{t.filters.last6Months}</option>
                <option value="1y">{t.filters.last12Months}</option>
              </select>
              {hasFilters && (
                <button onClick={() => { setSearch(''); setDateRange('all') }} className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 font-medium ml-auto">
                  <X className="w-3.5 h-3.5" />{t.common.clearFilters}
                </button>
              )}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {filteredReceipts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <PackageCheck className="w-10 h-10 text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">{s.noReceipts}</p>
              </div>
            ) : (
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
                <thead className="bg-gray-50 border-b border-gray-100"><tr>
                  {[s.receiptNumber, t.po.title, t.po.supplier, s.receivedDate, s.receivedBy, ''].map((h, i) => (
                    <th key={i} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredReceipts.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/receipts/${r.id}`)}>
                      <td className="px-4 py-3"><Link to={`/receipts/${r.id}`} onClick={e => e.stopPropagation()} className="font-mono text-sm font-semibold text-blue-600 hover:underline">{r.receipt_number}</Link></td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.purchase_orders?.po_number ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{r.purchase_orders?.suppliers?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{format(new Date(r.received_date), 'dd.MM.yyyy')}</td>
                      <td className="px-4 py-3 text-gray-600">{names[r.received_by] ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/receipts/${r.id}`} onClick={e => e.stopPropagation()} title={t.common.view} className="inline-flex p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Eye className="w-3.5 h-3.5" /></Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
