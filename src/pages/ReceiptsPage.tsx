import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PackageCheck, Eye, Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import Button from '../components/ui/Button'
import Pagination from '../components/ui/Pagination'
import PageToolbar from '../components/layout/PageToolbar'
import TableEmptyState from '../components/ui/TableEmptyState'
import { format, subMonths, startOfMonth } from 'date-fns'

const RS_BADGE: Record<string, string> = {
  none: 'bg-selected text-ink2',
  partial: 'bg-warn-light text-warn',
  full: 'bg-success-light text-success',
}

interface QueueRow {
  id: string
  po_number: string
  total_amount: number
  received_status: 'none' | 'partial' | 'full'
  suppliers: { name: string } | null
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
  const [queuePage, setQueuePage] = useState(1)
  const [queuePageSize, setQueuePageSize] = useState(20)
  const [histPage, setHistPage] = useState(1)
  const [histPageSize, setHistPageSize] = useState(20)

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    if (!company) return
    setLoading(true)
    const [{ data: q }, { data: r }] = await Promise.all([
      supabase.from('purchase_orders')
        .select('id, po_number, total_amount, received_status, suppliers(name)')
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

  useEffect(() => { setHistPage(1) }, [search, dateRange])
  const dateFrom = getDateFrom(dateRange)
  const filteredReceipts = receipts.filter(r => {
    const q = search.toLowerCase()
    if (search && !r.receipt_number.toLowerCase().includes(q) && !(r.purchase_orders?.po_number ?? '').toLowerCase().includes(q)) return false
    if (dateFrom && r.received_date < dateFrom) return false
    return true
  })
  const hasFilters = search || dateRange !== 'all'
  const paginatedQueue = queue.slice((queuePage - 1) * queuePageSize, queuePage * queuePageSize)
  function handleQueuePageSizeChange(n: number) { setQueuePageSize(n); setQueuePage(1) }
  const paginatedReceipts = filteredReceipts.slice((histPage - 1) * histPageSize, histPage * histPageSize)
  function handleHistPageSizeChange(n: number) { setHistPageSize(n); setHistPage(1) }
  const selectCls = 'text-sm border border-field rounded-lg hover:border-field-hover px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent bg-white text-ink truncate max-w-[150px]'

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached>
        {(['queue', 'history'] as const).map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === tb ? 'bg-selected text-ink' : 'text-ink2 hover:bg-hover'}`}>
            {tb === 'queue' ? `${s.toReceive} (${queue.length})` : s.history}
          </button>
        ))}
        {tab === 'history' && (<>
              <div className="relative min-w-40 flex-1 max-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={s.receiptNumber + ' / ' + t.po.poNumber}
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:ring-2 focus:ring-accent bg-white text-ink placeholder:text-placeholder" />
              </div>
              <select value={dateRange} onChange={e => setDateRange(e.target.value)} className={selectCls}>
                <option value="all">{t.filters.allTime}</option>
                <option value="1m">{t.filters.lastMonth}</option>
                <option value="3m">{t.filters.last3Months}</option>
                <option value="6m">{t.filters.last6Months}</option>
                <option value="1y">{t.filters.last12Months}</option>
              </select>
              {hasFilters && (
                <button onClick={() => { setSearch(''); setDateRange('all') }} className="flex items-center gap-1.5 text-sm text-ink2 hover:text-ink bg-white border border-field hover:border-field-hover rounded-lg px-2.5 py-1.5 font-medium whitespace-nowrap transition-colors">
                  <X className="w-3.5 h-3.5" />{t.common.clearFilters}
                </button>
              )}
        </>)}
      </PageToolbar>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
      ) : tab === 'queue' ? (
        <div className="data-card table-bleed bg-white rounded-lg border border-field overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
              <thead className="bg-surface border-b border-field"><tr>
                {[t.po.poNumber, t.po.supplier, t.po.total, t.common.status, ''].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-sm font-medium text-ink2">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-field">
                {queue.length === 0 ? (
                  <TableEmptyState icon={PackageCheck} colSpan={6} title={t.common.empty.toReceive.title} subtitle={t.common.empty.toReceive.text} />
                ) : paginatedQueue.map(po => (
                  <tr key={po.id} className="hover:bg-surface transition-colors">
                    <td className="px-4 py-3"><Link to={`/purchase-orders/${po.id}`} className=" text-sm font-medium text-gray-400 hover:text-gray-600">{po.po_number}</Link></td>
                    <td className="px-4 py-3 text-ink2">{po.suppliers?.name ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-ink">{fmt(po.total_amount ?? 0, company?.currency)}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RS_BADGE[po.received_status]}`}>{po.received_status === 'partial' ? s.rsPartial : s.rsNone}</span></td>
                    <td className="px-4 py-3 text-right">
                      <Button onClick={() => navigate(`/receive/${po.id}`)} className="gap-1.5"><PackageCheck className="w-3.5 h-3.5" />{s.receive}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          <Pagination total={queue.length} page={queuePage} pageSize={queuePageSize} onChange={setQueuePage} onPageSizeChange={handleQueuePageSizeChange} />
        </div>
      ) : (
        <div>
          <div className="data-card table-bleed bg-white rounded-lg border border-field overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
                <thead className="bg-surface border-b border-field"><tr>
                  {[s.receiptNumber, t.po.title, t.po.supplier, s.receivedDate, s.receivedBy, ''].map((h, i) => (
                    <th key={i} className="text-left px-4 py-3 text-sm font-medium text-ink2">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-field">
                  {filteredReceipts.length === 0 ? (
                    <TableEmptyState icon={PackageCheck} colSpan={6} title={hasFilters ? t.common.empty.noResults.title : t.common.empty.receipts.title} subtitle={hasFilters ? t.common.empty.noResults.text : t.common.empty.receipts.text} />
                  ) : paginatedReceipts.map(r => (
                    <tr key={r.id} className="hover:bg-surface transition-colors cursor-pointer" onClick={() => navigate(`/receipts/${r.id}`)}>
                      <td className="px-4 py-3"><Link to={`/receipts/${r.id}`} onClick={e => e.stopPropagation()} className=" text-sm font-medium text-gray-400 hover:text-gray-600">{r.receipt_number}</Link></td>
                      <td className="px-4 py-3 text-xs text-ink2">{r.purchase_orders?.po_number ?? '—'}</td>
                      <td className="px-4 py-3 text-ink2">{r.purchase_orders?.suppliers?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-ink2">{format(new Date(r.received_date), 'dd.MM.yyyy')}</td>
                      <td className="px-4 py-3 text-ink2">{names[r.received_by] ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/receipts/${r.id}`} onClick={e => e.stopPropagation()} title={t.common.view} className="inline-flex p-1.5 text-gray-400 hover:text-accent hover:bg-accent-light rounded-lg transition-colors"><Eye className="w-3.5 h-3.5" /></Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            <Pagination total={filteredReceipts.length} page={histPage} pageSize={histPageSize} onChange={setHistPage} onPageSizeChange={handleHistPageSizeChange} />
          </div>
        </div>
      )}
    </div>
  )
}
