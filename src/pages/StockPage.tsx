import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Search, X, Hourglass, Coins, Boxes, Package, MapPin, Hash, Gauge, Repeat, CircleDot, PackageMinus, ShoppingCart, Plus, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import Button from '../components/ui/Button'
import Pagination from '../components/ui/Pagination'
import PageToolbar from '../components/layout/PageToolbar'
import { useHeaderCounts, useHeaderInfo } from '../components/layout/HeaderCounts'
import FilterSelect from '../components/ui/FilterSelect'
import { mainCategoryId } from '../lib/categories'
import TableEmptyState from '../components/ui/TableEmptyState'
import GridHead from '../components/ui/GridHead'
import RowMenu from '../components/ui/RowMenu'
import MinSuggestion, { suggestionDirection } from '../components/stock/MinSuggestion'
import SortFilter from '../components/ui/SortFilter'
import ExportButton from '../components/ui/ExportButton'
import type { ExportColumn } from '../lib/exportExcel'
import { matchesSearch } from '../lib/search'
import { applySort, text, rev, type SortDef } from '../lib/sort'
import { unitLabel, unitFor } from '../lib/units'
import { STATE_BADGE, loadStockOverview, loadUsage, stockTurnover, stockState, stockValue, suggestedQty, type StockRow, type StockState, type UsageInfo } from '../lib/stock'
import { MovementModal, CountModal, LimitsModal, TransferModal, type StockItem, type StockLocation } from '../components/stock/StockModals'

interface View { key: string; item: StockItem; loc: StockLocation; row: StockRow; state: StockState }

const fmtQty = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n)
type Dialog = null | { kind: 'usage' | 'count' | 'limits' | 'add' | 'transfer'; itemId?: string; locationId?: string }

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
  const [usage, setUsage] = useState<Map<string, UsageInfo>>(new Map())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [locFilter, setLocFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState<'all' | StockState>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [categories, setCategories] = useState<{ id: string; name: string; parent_id: string | null; status: 'active' | 'inactive' }[]>([])
  const [sort, setSort] = useState('low')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [dialog, setDialog] = useState<Dialog>(null)

  async function load() {
    if (!company) return
    // spinner only on the first load: later reloads refresh the data in place
    const [it, lo, list, cat] = await Promise.all([
      supabase.from('items').select('id, item_number, name, default_unit, category_id').eq('company_id', company.id).eq('track_stock', true).order('name'),
      supabase.from('locations').select('id, name').eq('company_id', company.id).eq('status', 'active').order('name'),
      loadStockOverview(),
      supabase.from('categories').select('id, name, parent_id, status').eq('company_id', company.id),
    ])
    setCategories((cat.data as typeof categories) ?? [])
    setItems((it.data as StockItem[]) ?? [])
    setLocations((lo.data as StockLocation[]) ?? [])
    setRows(list)
    setUsage(await loadUsage(company.id, list))
    setLoading(false)
  }
  useEffect(() => { if (company && canView) load() }, [company, canView])

  const views: View[] = useMemo(() => {
    const itemById = new Map(items.map(i => [i.id, i]))
    const locById = new Map(locations.map(l => [l.id, l]))
    const base: View[] = rows.flatMap(r => {
      const item = itemById.get(r.item_id); const loc = locById.get(r.location_id)
      return item && loc ? [{ key: `${r.item_id}:${r.location_id}`, item, loc, row: r, state: stockState(r) }] : []
    })
    // a tracked item that is not in stock anywhere yet still shows up, once, so it does not seem to be missing
    const withRows = new Set(rows.map(r => r.item_id))
    const missing: View[] = items.filter(i => !withRows.has(i.id)).map(item => ({
      key: `${item.id}:-`, item, loc: { id: '', name: '-' },
      row: { item_id: item.id, location_id: '', on_hand: 0, min_qty: null, unit_cost: null, on_order: 0 }, state: 'missing' as StockState,
    }))
    return [...base, ...missing]
  }, [rows, items, locations])

  const rank: Record<StockState, number> = { low: 0, ordered: 1, ok: 2, none: 3, missing: 4 }
  // a number column sorted both ways, the rows that have no value always at the end
  const numCol = (value: string, label: string, get: (v: View) => number | null): SortDef<View>[] => [
    { value: value + 'Asc', label: `${label}: ${s.sortAsc}`, cmp: (a, b) => (get(a) ?? Infinity) - (get(b) ?? Infinity) || 0 },
    { value: value + 'Desc', label: `${label}: ${s.sortDesc}`, cmp: (a, b) => (get(b) ?? -Infinity) - (get(a) ?? -Infinity) || 0 },
  ]
  const textCol = (value: string, label: string, get: (v: View) => string): SortDef<View>[] => [
    { value: value + 'Asc', label: `${label}: ${s.sortAsc}`, cmp: text(get) },
    { value: value + 'Desc', label: `${label}: ${s.sortDesc}`, cmp: rev(text(get)) },
  ]
  const turnoverOf = (v: View) => (v.state === 'missing' ? null : stockTurnover([v.row], usage).turnover)
  const cover = (v: View) => (usage.get(v.key)?.daysLeft ?? null)
  const sortDefs: SortDef<View>[] = [
    { value: 'low', label: `${s.state}: ${s.st.low}`, cmp: (a, b) => rank[a.state] - rank[b.state] || a.item.name.localeCompare(b.item.name) },
    { value: 'stateOk', label: `${s.state}: ${s.st.ok}`, cmp: (a, b) => rank[b.state] - rank[a.state] || a.item.name.localeCompare(b.item.name) },
    ...textCol('code', s.itemCode, v => v.item.item_number),
    ...textCol('name', s.item, v => v.item.name),
    ...textCol('location', s.location, v => v.loc.name),
    ...numCol('onHand', s.onHand, v => (v.state === 'missing' ? null : v.row.on_hand)),
    ...numCol('min', s.minimum, v => (Number(v.row.min_qty ?? 0) > 0 ? Number(v.row.min_qty) : null)),
    ...numCol('turnover', s.turnover, turnoverOf),
    ...numCol('cover', s.cover, cover),
    ...numCol('value', s.value, v => stockValue(v.row)),
  ]
  const base = views.filter(v => matchesSearch(search, [v.item.name, v.item.item_number, v.loc.name]) && (locFilter === 'all' || v.loc.id === locFilter)
    && (categoryFilter === 'all' || mainCategoryId(v.item.category_id, categories) === categoryFilter))
  const filtered = base.filter(v => stateFilter === 'all' || v.state === stateFilter)
  useEffect(() => { setPage(1) }, [search, locFilter, categoryFilter, stateFilter, sort])
  const sorted = applySort(filtered, sortDefs, sort)
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize)
  const filtering = search !== '' || locFilter !== 'all' || categoryFilter !== 'all' || stateFilter !== 'all'
  useHeaderCounts(loading ? [] : [{ value: filtered.length }])
  // the value of what is shown, at the right end of the top bar
  useHeaderInfo(loading ? [] : [{ label: s.valueTotal, value: new Intl.NumberFormat('de-DE', { style: 'currency', currency: company?.currency ?? 'EUR', maximumFractionDigits: 0 }).format(filtered.reduce((n, v) => n + (stockValue(v.row) ?? 0), 0)) }])

  const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: company?.currency ?? 'EUR', maximumFractionDigits: 0 }).format(n)
  const exportCols: ExportColumn<View>[] = [
    { header: s.itemCode, get: v => v.item.item_number, kind: 'text', width: 12 },
    { header: s.item, get: v => v.item.name, kind: 'text', width: 34 },
    { header: s.location, get: v => v.loc.name, kind: 'text', width: 24 },
    { header: s.onHand, get: v => v.row.on_hand, kind: 'number', width: 12 },
    { header: t.po.unit, get: v => unitLabel(v.item.default_unit, lang), kind: 'text', width: 10 },
    { header: s.minimum, get: v => v.row.min_qty, kind: 'number', width: 12 },
    { header: s.onOrder, get: v => v.row.on_order, kind: 'number', width: 12 },
    { header: s.cover, get: v => { const d = usage.get(v.key)?.daysLeft; return d == null ? null : Math.floor(d) }, kind: 'number', width: 14 },
    { header: s.turnover, get: turnoverOf, kind: 'number', width: 14 },
    { header: s.unitCost, get: v => v.row.unit_cost ?? null, kind: 'money', width: 14 },
    { header: s.value, get: v => stockValue(v.row), kind: 'money', width: 14 },
    { header: s.state, get: v => s.st[v.state], kind: 'text', width: 16 },
  ]

  if (companyLoading) return null
  if (!canView) return <Navigate to="/dashboard" replace />

  const reorder = (v: View) => navigate(`/requests/new?stockItem=${v.item.id}&location=${v.loc.id}&qty=${String(suggestedQty(v.row)).replace('.', ',')}`)
  const open = (kind: NonNullable<Dialog>['kind'], v?: View) => setDialog({ kind, itemId: v?.item.id, locationId: v?.loc.id })
  const preset = { itemId: dialog?.itemId, locationId: dialog?.locationId }
  const common = { items, locations, rows, onSaved: load }

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached actions={<>
        <ExportButton fileName="zaloga" columns={exportCols} rows={sorted} />
        {canEdit && <>
          <Button variant="secondary" onClick={() => open('usage')} className="gap-2"><PackageMinus className="w-4 h-4" />{s.usage}</Button>
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
        <FilterSelect label={s.state} value={stateFilter} onChange={e => setStateFilter(e.target.value as 'all' | StockState)}>
          <option value="all">{s.allStates}</option>
          {(['low', 'ordered', 'ok', 'none', 'missing'] as StockState[]).map(k => <option key={k} value={k}>{s.st[k]}</option>)}
        </FilterSelect>
        {categories.length > 0 && (
          <FilterSelect label={s.category} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="all">{s.allCategories}</option>
            {categories.filter(c => !c.parent_id && c.status !== 'inactive').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </FilterSelect>
        )}
        {filtering && (
          <button onClick={() => { setSearch(''); setLocFilter('all'); setCategoryFilter('all'); setStateFilter('all') }} className="flex items-center gap-1.5 text-sm text-ink2 hover:text-ink bg-white border border-field hover:border-field-hover rounded-lg px-2.5 py-1.5 font-medium whitespace-nowrap transition-colors">
            <X className="w-3.5 h-3.5" />{t.common.clearFilters}
          </button>
        )}
      </PageToolbar>

      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[960px]">
            <GridHead cols={[[s.item, Package], [s.location, MapPin], [s.onHand, Hash, 'right'], [s.minShort, Gauge, 'right'], [s.turnover, Repeat, 'right'], [s.cover, Hourglass, 'right'], [s.value, Coins, 'right'], [s.state, CircleDot], ['']]} />
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={Boxes} colSpan={9}
                  title={filtering ? t.common.empty.noResults.title : t.common.empty.stock.title}
                  subtitle={filtering ? t.common.empty.noResults.text : t.common.empty.stock.text}
                  action={!filtering && canEdit ? <Button onClick={() => open('add')} className="gap-2 mt-2"><Plus className="w-4 h-4" />{s.add}</Button> : undefined} />
              ) : paged.map(v => {
                const unit = unitFor(v.item.default_unit, lang, v.row.on_hand)
                const min = Number(v.row.min_qty ?? 0)
                return (
                  <tr key={v.key} className={`hover:bg-surface transition-colors ${v.state !== 'missing' ? 'cursor-pointer' : ''}`} onClick={() => v.state !== 'missing' && navigate(`/stock/${v.item.id}/${v.loc.id}`)}>
                    <td className="px-3 py-3 max-w-[300px] truncate" title={`${v.item.name} (${v.item.item_number})`}><span className="font-medium text-ink">{v.item.name}</span> <span className="text-xs text-ink2 ml-1">{v.item.item_number}</span></td>
                    <td className="px-3 py-3 text-ink2 max-w-[190px] truncate" title={v.loc.name}>{v.loc.name}</td>
                    <td className={`px-3 py-3 text-right whitespace-nowrap tabular-nums ${v.row.on_hand < 0 || v.state === 'low' ? 'text-danger font-medium' : 'text-ink'}`}>{v.state === 'missing' ? <span className="text-ink2">-</span> : <span className="inline-flex items-baseline justify-end"><span className="w-12 text-right">{fmtQty(v.row.on_hand)}</span><span className="w-[4.75rem] pl-1.5 text-left text-ink2 font-normal">{unit}</span></span>}</td>
                    <td className="px-3 py-3 text-right text-ink2 whitespace-nowrap tabular-nums">
                      {(() => {
                        const u = usage.get(v.key)
                        const dir = v.state === 'missing' ? null : suggestionDirection(min, u)
                        const num = min > 0 ? fmtQty(min) : '-'
                        if (!dir || !u) return num
                        const body = s.hintBody.replace('{days}', String(u.windowDays)).replace('{perDay}', fmtQty(Math.round(u.perDay * 100) / 100)).replace('{unit}', unitFor(v.item.default_unit, lang, u.perDay))
                          .replace('{lead}', String(Math.round(u.lead))).replace('{leadNote}', u.leadSamples > 0 ? s.leadNote.replace('{n}', String(u.leadSamples)) : s.leadNoteNone).replace('{safety}', fmtQty(u.safetyStock ?? 0)).replace('{min}', fmtQty(u.suggestedMin!)).replace('{now}', min > 0 ? fmtQty(min) : '-')
                        return <span className="inline-flex items-center justify-end gap-1.5"><MinSuggestion direction={dir} title={min <= 0 ? s.hintNew : dir === 'up' ? s.hintUp : s.hintDown} body={body} footer={s.hintFooter} />{num}</span>
                      })()}
                    </td>
                    <td className="px-3 py-3 text-right text-ink whitespace-nowrap tabular-nums" title={s.turnoverHint}>{(() => { const n = turnoverOf(v); return n == null ? <span className="text-ink2">-</span> : `${String(n).replace('.', ',')}×` })()}</td>
                    <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums" title={s.coverHint}>
                      {(() => {
                        const u = usage.get(v.key)
                        if (v.state === 'missing' || !u) return <span className="text-ink2">-</span>
                        if (!u.enough) return <span className="text-ink2" title={s.collecting.replace('{n}', String(u.daysToGo))}>-</span>
                        if (u.daysLeft == null) return <span className="text-ink2">-</span>
                        const d = Math.floor(u.daysLeft)
                        // it will run out before a new delivery can arrive
                        return <span className={d < u.lead ? 'text-danger font-medium' : d < u.lead + 3 ? 'text-warn font-medium' : 'text-ink'}>{d} {unitFor('day', lang, d)}</span>
                      })()}
                    </td>
                    <td className="px-3 py-3 text-right text-ink whitespace-nowrap tabular-nums">{stockValue(v.row) != null ? money(stockValue(v.row)!) : <span className="text-ink2">-</span>}</td>
                    <td className="px-3 py-3"><span className={`badge ${STATE_BADGE[v.state]}`}>{s.st[v.state]}</span></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                        {/* two fixed places: usage (every row that has stock) and what is missing next (order / add to a location) */}
                        <span className="w-[5.75rem] flex justify-end">
                          {canEdit && v.state !== 'missing' && <button onClick={() => open('usage', v)} className="inline-flex items-center justify-center gap-1 badge hover:brightness-95 transition-all whitespace-nowrap badge-neutral w-full"><PackageMinus className="w-3 h-3" />{s.usageShort}</button>}
                        </span>
                        <span className="w-[5.75rem] flex justify-end">
                          {canEdit && v.state === 'missing' && <button onClick={() => setDialog({ kind: 'add', itemId: v.item.id })} className="inline-flex items-center justify-center gap-1 badge hover:brightness-95 transition-all whitespace-nowrap badge-warn w-full"><Plus className="w-3 h-3" />{s.addShort}</button>}
                          {canEdit && v.state === 'low' && <button onClick={() => reorder(v)} className="inline-flex items-center justify-center gap-1 badge hover:brightness-95 transition-all whitespace-nowrap badge-warn w-full"><ShoppingCart className="w-3 h-3" />{s.order}</button>}
                        </span>
                        {v.state !== 'missing' && <RowMenu items={[
                          { label: t.common.edit, icon: Pencil, onClick: () => navigate(`/stock/${v.item.id}/${v.loc.id}`) },
                        ]} />}
                        {v.state === 'missing' && <span className="w-7 shrink-0" />}
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
      <LimitsModal {...common} open={dialog?.kind === 'limits' || dialog?.kind === 'add'} onClose={() => setDialog(null)} preset={dialog?.kind === 'limits' || (dialog?.kind === 'add' && dialog.itemId) ? preset : undefined} />
      <TransferModal {...common} open={dialog?.kind === 'transfer'} onClose={() => setDialog(null)} preset={preset} />
    </div>
  )
}
