import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, ChevronRight, PackageMinus, ClipboardCheck, ArrowRightLeft, Gauge, ShoppingCart, CalendarClock, CircleDot, Hash, User, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import FilterSelect from '../components/ui/FilterSelect'
import GridHead from '../components/ui/GridHead'
import Pagination from '../components/ui/Pagination'
import TableEmptyState from '../components/ui/TableEmptyState'
import PersonCell from '../components/ui/PersonCell'
import { Card, Field } from '../components/ui/DetailCard'
import ExportButton from '../components/ui/ExportButton'
import type { ExportColumn } from '../lib/exportExcel'
import { unitFor } from '../lib/units'
import {
  MOVEMENT_BADGE, STATE_BADGE, MIN_HISTORY_DAYS, loadStockOverview, loadUsage, stockState, stockTurnover, stockValue, suggestedQty,
  type MovementType, type StockRow, type UsageInfo,
} from '../lib/stock'
import { MovementModal, CountModal, LimitsModal, TransferModal, type StockItem, type StockLocation } from '../components/stock/StockModals'

interface Movement {
  id: string; created_at: string; movement_type: MovementType; quantity: number; reason: string | null; created_by: string | null
  receipt_id: string | null; related_location_id: string | null; receipts: { receipt_number: string } | null
}
interface OpenOrder { id: string; quantity: number; purchase_orders: { id: string; po_number: string; expected_delivery_date: string | null } }
type Tab = 'movements' | 'orders' | 'analysis'
type Dlg = null | 'usage' | 'count' | 'transfer' | 'limits'

const fmtQty = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n)

/** One item at one location: the figures, what can be done with it, and the full history. */
export default function StockDetailPage() {
  const { itemId, locationId } = useParams<{ itemId: string; locationId: string }>()
  const navigate = useNavigate()
  const { company, isAdmin, hasPerm, loading: companyLoading } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.stock
  const canView = isAdmin || hasPerm('stock', 'view')
  const canEdit = isAdmin || hasPerm('stock', 'create')
  const currency = company?.currency ?? 'EUR'
  const money = (n: number, digits = 0) => new Intl.NumberFormat('de-DE', { style: 'currency', currency, maximumFractionDigits: digits }).format(n)

  const [item, setItem] = useState<StockItem | null>(null)
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [itemRows, setItemRows] = useState<StockRow[]>([])
  const [usage, setUsage] = useState<UsageInfo | undefined>()
  const [moves, setMoves] = useState<Movement[]>([])
  const [orders, setOrders] = useState<OpenOrder[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('movements')
  const [typeFilter, setTypeFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [dlg, setDlg] = useState<Dlg>(null)

  async function load() {
    if (!company || !itemId || !locationId) return
    const [it, lo, overview, mv, po] = await Promise.all([
      supabase.from('items').select('id, item_number, name, default_unit, category_id').eq('id', itemId).single(),
      supabase.from('locations').select('id, name').eq('company_id', company.id).eq('status', 'active').order('name'),
      loadStockOverview(),
      supabase.from('stock_movements').select('id, created_at, movement_type, quantity, reason, created_by, receipt_id, related_location_id, receipts(receipt_number)')
        .eq('item_id', itemId).eq('location_id', locationId).order('created_at', { ascending: false }).limit(5000),
      supabase.from('po_line_items').select('id, quantity, purchase_orders!inner(id, po_number, status, location_id, expected_delivery_date)')
        .eq('item_id', itemId).in('purchase_orders.status', ['issued', 'sent']).eq('purchase_orders.location_id', locationId),
    ])
    if (!it.data) { toast.error(t.common.notFound); navigate('/stock'); return }
    setItem(it.data as StockItem)
    setLocations((lo.data as StockLocation[]) ?? [])
    const mine = overview.filter(r => r.item_id === itemId)
    setItemRows(mine)
    const list = (mv.data as unknown as Movement[]) ?? []
    setMoves(list)
    setOrders((po.data as unknown as OpenOrder[]) ?? [])
    const row = mine.find(r => r.location_id === locationId)
    if (row) setUsage((await loadUsage(company.id, [row])).get(`${itemId}:${locationId}`))
    const ids = [...new Set(list.map(x => x.created_by).filter(Boolean))] as string[]
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, first_name, last_name').in('id', ids)
      setNames(Object.fromEntries((us ?? []).map(u => [u.id, `${u.first_name} ${u.last_name}`])))
    }
    setLoading(false)
  }
  useEffect(() => { if (company && canView) load() }, [company, canView, itemId, locationId])

  const loc = locations.find(l => l.id === locationId)
  const row: StockRow = itemRows.find(r => r.location_id === locationId) ?? { item_id: itemId ?? '', location_id: locationId ?? '', on_hand: 0, min_qty: null, unit_cost: null, on_order: 0 }
  const state = stockState(row)
  const min = Number(row.min_qty ?? 0)
  const unitOf = (n: number) => (item ? unitFor(item.default_unit, lang, n) : '')
  const turnover = useMemo(() => (usage ? stockTurnover([row], new Map([[`${row.item_id}:${row.location_id}`, usage]])) : undefined), [row, usage])

  const since = periodFilter === 'all' ? null : Date.now() - (periodFilter === '1m' ? 30 : periodFilter === '3m' ? 90 : 365) * 86400000
  const filtered = moves.filter(m => (typeFilter === 'all' || m.movement_type === typeFilter) && (!since || new Date(m.created_at).getTime() >= since))
  useEffect(() => { setPage(1) }, [typeFilter, periodFilter])
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const reasonOf = (m: Movement) => m.receipts ? `${s.fromReceipt} ${m.receipts.receipt_number}`
    : m.movement_type === 'transfer' ? [(Number(m.quantity) < 0 ? s.transferTo : s.transferFrom).replace('{name}', locations.find(l => l.id === m.related_location_id)?.name ?? '-'), m.reason].filter(Boolean).join(' · ')
    : (m.reason ?? '')
  const exportCols: ExportColumn<Movement>[] = [
    { header: s.date, get: m => m.created_at, kind: 'date', width: 14 },
    { header: s.type, get: m => s.mt[m.movement_type], kind: 'text', width: 18 },
    { header: s.quantity, get: m => Number(m.quantity), kind: 'number', width: 12 },
    { header: s.by, get: m => (m.created_by ? names[m.created_by] : ''), kind: 'text', width: 22 },
    { header: s.reason, get: m => reasonOf(m), kind: 'text', width: 34 },
  ]

  async function applyMin(qty: number) {
    if (!company || !itemId || !locationId) return
    const { error } = await supabase.from('stock_limits').upsert({ company_id: company.id, item_id: itemId, location_id: locationId, min_qty: qty }, { onConflict: 'item_id,location_id' })
    if (error) toast.error(error.message); else { toast.success(s.saved); load() }
  }

  if (companyLoading) return null
  if (!canView) return <Navigate to="/dashboard" replace />
  if (loading || !item) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>

  const common = { items: [item], locations, rows: itemRows, onSaved: load }
  const preset = { itemId: item.id, locationId }
  const value = stockValue(row)
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'movements', label: s.historyTitle, count: moves.length },
    { id: 'orders', label: s.openOrders, count: orders.length },
    { id: 'analysis', label: s.analysis },
  ]

  return (
    <div className="p-4 lg:p-6">
      <nav className="flex items-center gap-2 text-sm text-ink2 mb-5">
        <button type="button" onClick={() => navigate('/stock')} aria-label={s.title} title={s.title}
          className="w-7 h-7 -ml-1.5 mr-1 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <Link to="/stock" className="hover:text-ink transition-colors">{s.title}</Link>
        <ChevronRight className="w-3.5 h-3.5 text-icon" />
        <span className="text-ink font-medium truncate">{item.name}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-ink tracking-tight">{item.name}</h1>
            <span className={`badge ${STATE_BADGE[state]}`}>{s.st[state]}</span>
          </div>
          <p className="mt-2 text-sm text-ink2">{item.item_number} · {loc?.name}</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="secondary" onClick={() => setDlg('limits')} className="gap-2"><Gauge className="w-4 h-4" />{s.limits}</Button>
            {locations.length > 1 && <Button variant="secondary" onClick={() => setDlg('transfer')} className="gap-2"><ArrowRightLeft className="w-4 h-4" />{s.transfer}</Button>}
            <Button variant="secondary" onClick={() => setDlg('count')} className="gap-2"><ClipboardCheck className="w-4 h-4" />{s.count}</Button>
            {state === 'low'
              ? <Button variant="secondary" onClick={() => navigate(`/requests/new?stockItem=${item.id}&location=${locationId}&qty=${String(suggestedQty(row)).replace('.', ',')}`)} className="gap-2"><ShoppingCart className="w-4 h-4" />{s.order}</Button>
              : null}
            <Button onClick={() => setDlg('usage')} className="gap-2"><PackageMinus className="w-4 h-4" />{s.usage}</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div className="bg-white rounded-lg border border-line p-4 pb-5">
          <span className="text-sm font-semibold text-ink2 block mb-2">{s.onHand}</span>
          <span className={`text-2xl font-semibold tracking-tight tabular-nums ${row.on_hand < 0 || state === 'low' ? 'text-danger' : 'text-ink'}`}>{fmtQty(row.on_hand)}</span>
          <span className="text-sm text-ink2 ml-1.5">{unitOf(row.on_hand)}</span>
        </div>
        <div className="bg-white rounded-lg border border-line p-4 pb-5">
          <span className="text-sm font-semibold text-ink2 block mb-2">{s.minimum}</span>
          <span className="text-2xl font-semibold tracking-tight tabular-nums text-ink">{min > 0 ? fmtQty(min) : '-'}</span>
          {min > 0 && <span className="text-sm text-ink2 ml-1.5">{unitOf(min)}</span>}
        </div>
        <div className="bg-white rounded-lg border border-line p-4 pb-5">
          <span className="text-sm font-semibold text-ink2 block mb-2">{s.openOrdersCard}</span>
          <span className="text-2xl font-semibold tracking-tight tabular-nums text-ink">{row.on_order > 0 ? fmtQty(row.on_order) : '-'}</span>
          {row.on_order > 0 && <span className="text-sm text-ink2 ml-1.5">{unitOf(row.on_order)}</span>}
          {usage && <span className="block text-xs text-ink2 mt-1.5" title={usage.leadSamples > 0 ? s.leadNote.replace('{n}', String(usage.leadSamples)) : s.leadNoteNone}>{s.leadTime}: {usage.lead} {unitFor('day', lang, usage.lead)}{usage.leadSamples === 0 ? ` (${s.leadNoteNone})` : ''}</span>}
        </div>
        <div className="bg-white rounded-lg border border-line p-4 pb-5" title={s.costHint}>
          <span className="text-sm font-semibold text-ink2 block mb-2">{s.value}</span>
          <span className="text-2xl font-semibold tracking-tight tabular-nums text-ink">{value != null ? money(value) : '-'}</span>
          {row.unit_cost != null && <span className="text-sm text-ink2 ml-1.5">{money(Number(row.unit_cost), 2)}/{unitFor(item.default_unit, lang, 1)}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-4">
        {tabs.map(x => (
          <button key={x.id} onClick={() => setTab(x.id)}
            className={`inline-flex items-center gap-2 h-8 px-3 rounded-lg border text-sm font-medium transition-colors ${tab === x.id ? 'border-field bg-surface text-ink' : 'border-transparent text-ink2 hover:bg-hover'}`}>
            {x.label}
            {x.count != null && <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-md bg-surface border border-field text-[11px] text-ink2">{x.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'movements' && (
        <Card tall title={s.historyTitle} className="overflow-hidden" action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <FilterSelect label={s.type} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="all">{s.allTypes}</option>
              {(['receipt', 'usage', 'waste', 'count', 'transfer', 'reversal'] as MovementType[]).map(k => <option key={k} value={k}>{s.mt[k]}</option>)}
            </FilterSelect>
            <FilterSelect label={t.filters.labels.period} value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}>
              <option value="all">{t.filters.allTime}</option>
              <option value="1m">{t.filters.lastMonth}</option>
              <option value="3m">{t.filters.last3Months}</option>
              <option value="12m">{t.filters.last12Months}</option>
            </FilterSelect>
            <ExportButton fileName={`zaloga-${item.item_number}`} columns={exportCols} rows={filtered} />
          </div>
        }>
          <div className="overflow-x-auto"><table className="table-grid w-full text-sm min-w-[720px] table-fixed [&_thead]:border-b [&_thead]:border-line">
            {/* fixed widths, so the columns stay tight and only the reason takes what is left */}
            <colgroup><col className="w-[11rem]" /><col className="w-[9rem]" /><col className="w-[9.5rem]" /><col className="w-[13rem]" /><col /></colgroup>
            <GridHead cols={[[s.date, CalendarClock], [s.type, CircleDot], [s.quantity, Hash, 'right'], [s.by, User], [s.reason, FileText]]} />
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={FileText} colSpan={5} title={s.noMovements} subtitle={moves.length === 0 ? s.noMovementsHint : t.common.empty.noResults.text} />
              ) : paged.map(m => (
                <tr key={m.id} className="hover:bg-surface transition-colors">
                  <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{format(new Date(m.created_at), 'dd.MM.yyyy HH:mm')}</td>
                  <td className="px-4 py-3"><span className={`badge ${MOVEMENT_BADGE[m.movement_type]}`}>{s.mt[m.movement_type]}</span></td>
                  <td className={`px-4 py-3 text-right whitespace-nowrap tabular-nums font-medium ${Number(m.quantity) < 0 ? 'text-danger' : 'text-ink'}`}>
                    <span className="inline-flex items-baseline justify-end"><span className="w-16 text-right">{Number(m.quantity) > 0 ? '+' : ''}{fmtQty(Number(m.quantity))}</span><span className="w-[4.75rem] pl-1.5 text-left text-ink2 font-normal">{unitOf(Math.abs(Number(m.quantity)))}</span></span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap"><PersonCell name={m.created_by ? names[m.created_by] : null} /></td>
                  <td className="px-4 py-3 text-ink2 max-w-[420px] truncate" title={reasonOf(m)}>
                    {m.receipts ? <Link to={`/receipts/${m.receipt_id}`} className="hover:underline hover:text-ink">{reasonOf(m)}</Link> : (reasonOf(m) || '-')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <Pagination total={filtered.length} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={n => { setPageSize(n); setPage(1) }} />
        </Card>
      )}

      {tab === 'orders' && (
        <Card tall title={s.openOrders}>
          {orders.length === 0 ? <p className="p-5 text-sm text-ink2">{s.noOpenOrders}</p> : (
            <ul className="divide-y divide-field">
              {orders.map(o => (
                <li key={o.id}>
                  <Link to={`/purchase-orders/${o.purchase_orders.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-surface transition-colors">
                    <span className="font-medium text-ink">{o.purchase_orders.po_number}</span>
                    <span className="text-ink2 tabular-nums">{fmtQty(Number(o.quantity))} {unitOf(Number(o.quantity))}{o.purchase_orders.expected_delivery_date ? ` · ${format(new Date(o.purchase_orders.expected_delivery_date), 'dd.MM.yyyy')}` : ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'analysis' && (
        <Card tall title={s.usageAnalysis}>
          {usage && <div className="px-5 pt-5"><Field label={s.leadTime}>{usage.lead} {unitFor('day', lang, usage.lead)} <span className="text-ink2">({usage.leadSamples > 0 ? s.leadNote.replace('{n}', String(usage.leadSamples)) : s.leadNoteNone})</span></Field></div>}
          {usage && !usage.enough ? (
            <p className="p-5 text-sm text-ink2">{s.collecting.replace('{n}', String(MIN_HISTORY_DAYS))}</p>
          ) : !usage || usage.perDay <= 0 ? (
            <p className="p-5 text-sm text-ink2">{s.noUsageData}</p>
          ) : (
            <div className="p-5 flex flex-col gap-6">
              {usage.suggestedMin != null && (
                <div className="flex items-center justify-between gap-4 flex-wrap rounded-lg border border-field p-4">
                  <div>
                    <p className="text-sm font-medium text-ink">{s.suggestedMin}: {fmtQty(usage.suggestedMin)} {unitOf(usage.suggestedMin)}</p>
                    <p className="text-xs text-ink2 mt-0.5">{s.suggestionBasis}</p>
                  </div>
                  {canEdit && usage.suggestedMin !== min && <Button variant="secondary" onClick={() => applyMin(usage.suggestedMin!)}>{s.applySuggestion}</Button>}
                </div>
              )}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
                <Field label={s.avgUsage}>{fmtQty(Math.round(usage.perDay * 100) / 100)} {unitOf(usage.perDay)} {s.perDay}<span className="block text-xs text-ink2">{s.basisDays.replace('{n}', String(usage.windowDays))}</span></Field>
                <Field label={s.cover}>{usage.daysLeft != null ? `${Math.floor(usage.daysLeft)} ${unitFor('day', lang, Math.floor(usage.daysLeft))}` : null}</Field>
                <Field label={s.suggestedSafety}>{usage.safetyStock != null ? `${fmtQty(usage.safetyStock)} ${unitOf(usage.safetyStock)}` : null}</Field>
                <Field label={s.turnover}>{turnover?.turnover != null ? `${String(turnover.turnover).replace('.', ',')}× ${s.perYear}` : null}</Field>
                <Field label={s.suggestedTurnover}>{usage.targetTurnover != null ? `${String(usage.targetTurnover).replace('.', ',')}× ${s.perYear}` : null}</Field>
                <Field label={s.daysOfStock}>{turnover?.daysOfStock != null ? `${turnover.daysOfStock} ${unitFor('day', lang, turnover.daysOfStock)}` : null}</Field>
              </div>
              {usage.windowDays < 30 && <p className="text-xs text-ink2">{s.shortHistory}</p>}
            </div>
          )}
        </Card>
      )}

      <MovementModal {...common} open={dlg === 'usage'} onClose={() => setDlg(null)} preset={preset} />
      <CountModal {...common} open={dlg === 'count'} onClose={() => setDlg(null)} preset={preset} />
      <TransferModal {...common} open={dlg === 'transfer'} onClose={() => setDlg(null)} preset={preset} />
      <LimitsModal {...common} open={dlg === 'limits'} onClose={() => setDlg(null)} preset={preset} />
    </div>
  )
}
