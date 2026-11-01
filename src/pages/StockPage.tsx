import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Search, Boxes, IdCard, Package, MapPin, Hash, Gauge, PackageCheck, CircleDot, ArrowDownToLine, ClipboardCheck, History, ShoppingCart, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import Button from '../components/ui/Button'
import Pagination from '../components/ui/Pagination'
import PageToolbar from '../components/layout/PageToolbar'
import { useHeaderCounts } from '../components/layout/HeaderCounts'
import FilterSelect from '../components/ui/FilterSelect'
import TableEmptyState from '../components/ui/TableEmptyState'
import GridHead from '../components/ui/GridHead'
import RowMenu from '../components/ui/RowMenu'
import SortFilter from '../components/ui/SortFilter'
import ExportButton from '../components/ui/ExportButton'
import type { ExportColumn } from '../lib/exportExcel'
import { matchesSearch } from '../lib/search'
import { applySort, text, num, type SortDef } from '../lib/sort'
import { unitLabel } from '../lib/units'
import { STATE_BADGE, stockState, suggestedQty, type StockRow, type StockState } from '../lib/stock'
import { MovementModal, CountModal, LimitsModal, HistoryModal, type StockItem, type StockLocation } from '../components/stock/StockModals'

interface View { key: string; item: StockItem; loc: StockLocation; row: StockRow; state: StockState }

const fmtQty = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n)
type Dialog = null | { kind: 'usage' | 'count' | 'limits' | 'add' | 'history'; itemId?: string; locationId?: string }

/** Stock of the catalog items marked "keep the stock": per item and delivery location, with the minimum and what is already on order. */
export default function StockPage() {
  const { company, isAdmin, hasPerm, loading: companyLoading } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.stock
  const navigate = useNavigate()
  const canView = isAdmin || hasPerm('stock', 'view')
  const canEdit = isAdmin || hasPerm('stock', 'create')

  const [items, setItems] = useState<StockItem[]>([])
  const [locations, setLocations] = useState<StockLocation[]>([])
  const [rows, setRows] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [locFilter, setLocFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')
  const [sort, setSort] = useState('low')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [dialog, setDialog] = useState<Dialog>(null)

  async function load() {
    if (!company) return
    // spinner only on the first load: later reloads refresh the data in place
    const [it, lo, ov] = await Promise.all([
      supabase.from('items').select('id, item_number, name, default_unit').eq('company_id', company.id).eq('track_stock', true).order('name'),
      supabase.from('locations').select('id, name').eq('company_id', company.id).eq('status', 'active').order('name'),
      supabase.rpc('stock_overview'),
    ])
    setItems((it.data as StockItem[]) ?? [])
    setLocations((lo.data as StockLocation[]) ?? [])
    setRows(((ov.data ?? []) as StockRow[]).map(r => ({ ...r, on_hand: Number(r.on_hand), on_order: Number(r.on_order), min_qty: r.min_qty != null ? Number(r.min_qty) : null, target_qty: r.target_qty != null ? Number(r.target_qty) : null })))
    setLoading(false)
  }
  useEffect(() => { if (company && canView) load() }, [company, canView])

  const views: View[] = useMemo(() => {
    const itemById = new Map(items.map(i => [i.id, i]))
    const locById = new Map(locations.map(l => [l.id, l]))
    return rows.flatMap(r => {
      const item = itemById.get(r.item_id); const loc = locById.get(r.location_id)
      return item && loc ? [{ key: `${r.item_id}:${r.location_id}`, item, loc, row: r, state: stockState(r) }] : []
    })
  }, [rows, items, locations])

  const rank: Record<StockState, number> = { low: 0, ordered: 1, ok: 2, none: 3 }
  const sortDefs: SortDef<View>[] = [
    { value: 'low', label: `${s.state}: ${s.st.low}`, cmp: (a, b) => rank[a.state] - rank[b.state] || a.item.name.localeCompare(b.item.name) },
    { value: 'nameAsc', label: t.sort.nameAsc, cmp: text(v => v.item.name) },
    { value: 'codeAsc', label: t.sort.codeAsc, cmp: text(v => v.item.item_number) },
    { value: 'location', label: s.location, cmp: text(v => v.loc.name) },
    { value: 'stockAsc', label: s.onHand, cmp: num(v => v.row.on_hand) },
  ]
  const filtered = views.filter(v => {
    if (!matchesSearch(search, [v.item.name, v.item.item_number, v.loc.name])) return false
    if (locFilter !== 'all' && v.loc.id !== locFilter) return false
    if (stateFilter === 'low' && v.state !== 'low' && v.state !== 'ordered') return false
    return true
  })
  useEffect(() => { setPage(1) }, [search, locFilter, stateFilter, sort])
  const sorted = applySort(filtered, sortDefs, sort)
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize)
  const filtering = search !== '' || locFilter !== 'all' || stateFilter !== 'all'
  useHeaderCounts(loading ? [] : [{ value: filtered.length }])

  const exportCols: ExportColumn<View>[] = [
    { header: s.itemCode, get: v => v.item.item_number, kind: 'text', width: 12 },
    { header: s.item, get: v => v.item.name, kind: 'text', width: 34 },
    { header: s.location, get: v => v.loc.name, kind: 'text', width: 24 },
    { header: s.onHand, get: v => v.row.on_hand, kind: 'number', width: 12 },
    { header: t.po.unit, get: v => unitLabel(v.item.default_unit, lang), kind: 'text', width: 10 },
    { header: s.minimum, get: v => v.row.min_qty, kind: 'number', width: 12 },
    { header: s.onOrder, get: v => v.row.on_order, kind: 'number', width: 12 },
    { header: s.state, get: v => s.st[v.state], kind: 'text', width: 16 },
  ]

  if (companyLoading) return null
  if (!canView) return <Navigate to="/dashboard" replace />

  const reorder = (v: View) => navigate(`/requests/new?stockItem=${v.item.id}&location=${v.loc.id}&qty=${String(suggestedQty(v.row)).replace('.', ',')}`)
  const open = (kind: NonNullable<Dialog>['kind'], v?: View) => setDialog({ kind, itemId: v?.item.id, locationId: v?.loc.id })
  const preset = { itemId: dialog?.itemId, locationId: dialog?.locationId }
  const common = { items, locations, rows, onSaved: load }
  const dialogView = views.find(v => v.item.id === dialog?.itemId && v.loc.id === dialog?.locationId)

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached actions={<>
        <ExportButton fileName="zaloga" columns={exportCols} rows={sorted} />
        {canEdit && <>
          <Button variant="secondary" onClick={() => open('usage')} className="gap-2"><ArrowDownToLine className="w-4 h-4" />{s.usage}</Button>
          <Button onClick={() => open('add')} className="gap-2"><Plus className="w-4 h-4" />{s.add}</Button>
        </>}
      </>}>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-filter-label" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.common.search + '…'}
            className="w-full pl-9 pr-4 h-9 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:border-field-hover bg-white text-ink placeholder:text-filter-label" />
        </div>
        <SortFilter defs={sortDefs} value={sort} onChange={setSort} />
        {locations.length > 1 && (
          <FilterSelect label={s.location} value={locFilter} onChange={e => setLocFilter(e.target.value)}>
            <option value="all">{s.allLocations}</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </FilterSelect>
        )}
        <FilterSelect label={s.filterState} value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
          <option value="all">{s.allStates}</option>
          <option value="low">{s.onlyLow}</option>
        </FilterSelect>
      </PageToolbar>

      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[980px]">
            <GridHead cols={[[s.itemCode, IdCard], [s.item, Package], [s.location, MapPin], [s.onHand, Hash, 'right'], [s.minimum, Gauge, 'right'], [s.onOrder, PackageCheck, 'right'], [s.state, CircleDot], ['']]} />
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={Boxes} colSpan={8}
                  title={filtering ? t.common.empty.noResults.title : t.common.empty.stock.title}
                  subtitle={filtering ? t.common.empty.noResults.text : t.common.empty.stock.text}
                  action={!filtering && canEdit ? <Button onClick={() => open('add')} className="gap-2 mt-2"><Plus className="w-4 h-4" />{s.add}</Button> : undefined} />
              ) : paged.map(v => {
                const unit = unitLabel(v.item.default_unit, lang)
                const min = Number(v.row.min_qty ?? 0)
                return (
                  <tr key={v.key} className="hover:bg-surface transition-colors">
                    <td className="px-4 py-3 text-ink2 whitespace-nowrap">{v.item.item_number}</td>
                    <td className="px-4 py-3 font-medium text-ink max-w-[320px] truncate" title={v.item.name}>{v.item.name}</td>
                    <td className="px-4 py-3 text-ink2 whitespace-nowrap">{v.loc.name}</td>
                    <td className={`px-4 py-3 text-right whitespace-nowrap tabular-nums ${v.row.on_hand < 0 || v.state === 'low' ? 'text-danger font-medium' : 'text-ink'}`}>{fmtQty(v.row.on_hand)} <span className="text-ink2 font-normal">{unit}</span></td>
                    <td className="px-4 py-3 text-right text-ink2 whitespace-nowrap tabular-nums">{min > 0 ? fmtQty(min) : '-'}</td>
                    <td className="px-4 py-3 text-right text-ink2 whitespace-nowrap tabular-nums">{v.row.on_order > 0 ? fmtQty(v.row.on_order) : '-'}</td>
                    <td className="px-4 py-3"><span className={`badge ${STATE_BADGE[v.state]}`}>{s.st[v.state]}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {v.state === 'low' && (
                          <button onClick={() => reorder(v)} className="inline-flex items-center gap-1 badge badge-warn hover:brightness-95 transition-all whitespace-nowrap"><ShoppingCart className="w-3 h-3" />{s.order}</button>
                        )}
                        <RowMenu items={[
                          ...(canEdit ? [
                            { label: s.usage, icon: ArrowDownToLine, onClick: () => open('usage', v) },
                            { label: s.count, icon: ClipboardCheck, onClick: () => open('count', v) },
                            { label: s.limits, icon: Gauge, onClick: () => open('limits', v) },
                          ] : []),
                          { label: s.history, icon: History, onClick: () => open('history', v) },
                          ...(v.state !== 'low' ? [{ label: s.order, icon: ShoppingCart, onClick: () => reorder(v) }] : []),
                        ]} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={n => { setPageSize(n); setPage(1) }} />
      </div>

      <MovementModal {...common} open={dialog?.kind === 'usage'} onClose={() => setDialog(null)} preset={preset} />
      <CountModal {...common} open={dialog?.kind === 'count'} onClose={() => setDialog(null)} preset={preset} />
      <LimitsModal {...common} open={dialog?.kind === 'limits' || dialog?.kind === 'add'} onClose={() => setDialog(null)} preset={dialog?.kind === 'limits' ? preset : undefined} />
      <HistoryModal open={dialog?.kind === 'history'} onClose={() => setDialog(null)} item={dialogView?.item} location={dialogView?.loc} />
    </div>
  )
}
