import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LabelList,
} from 'recharts'
import { FileText, TrendingUp, Clock, BarChart2, X, CheckCircle2, Circle, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { cn } from '../lib/cn'
import { format, subMonths, startOfMonth } from 'date-fns'
import Pagination from '../components/ui/Pagination'
import TableEmptyState from '../components/ui/TableEmptyState'
import EmptyState from '../components/ui/EmptyState'
import PageToolbar from '../components/layout/PageToolbar'
import { categoryOptions } from '../lib/categories'
import FilterSelect from '../components/ui/FilterSelect'

const SANS = '"Inter Variable", ui-sans-serif, system-ui, sans-serif'
const CHART_BLUE = 'var(--chart-bar-stroke)'
const SHOW_SETUP_BANNER = false // hidden for now — flip back to true to bring it back

// ─── Types ───────────────────────────────────────────────────────────────────

interface Filters {
  dateRange: '1m' | '3m' | '6m' | '1y' | 'all'
  supplierId: string
  categoryId: string
  departmentId: string
}

const DEFAULT_FILTERS: Filters = {
  dateRange: '1y', supplierId: '', categoryId: '', departmentId: '',
}

interface BreakdownRow {
  name: string
  sentAmount: number
  sentCount: number
  receivedAmount: number
  receivedCount: number
}




// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, currency = 'EUR') {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

// Short format for chart axes — no € symbol (axis has no room)
function fmtShort(n: number) {
  if (n >= 1_000_000) {
    const v = (n / 1_000_000).toFixed(2).replace('.', ',').replace(/,?0+$/, '')
    return `${v}M`
  }
  // Always show in thousands, even below 1k, so labels on the same chart
  // stay consistent (never mixes "806" with "1,5k").
  const v = (n / 1_000).toFixed(2).replace('.', ',').replace(/,?0+$/, '')
  return `${v || '0'}k`
}

function getDateFrom(range: string): string | null {
  if (range === 'all') return null
  const months = range === '1m' ? 1 : range === '3m' ? 3 : range === '6m' ? 6 : 12
  return startOfMonth(subMonths(new Date(), months - 1)).toISOString()
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function OverviewBar({ items }: { items: { icon: React.ElementType; label: string; value: string; primary?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      {items.map((item, i) => (
        <div key={i} className="bg-white rounded-lg border border-line p-4 pb-6">
          <div className="mb-2">
            <span className="text-sm font-semibold text-ink2">{item.label}</span>
          </div>
          <div className={cn('font-semibold tracking-tight text-ink', item.primary ? 'text-3xl' : 'text-2xl')}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-line p-5 overflow-hidden">
      <h2 className="text-sm font-semibold text-ink2 mb-5">{title}</h2>
      {children}
    </div>
  )
}

type SortKey = 'name' | 'sentAmount' | 'sentCount' | 'receivedAmount' | 'receivedCount'

function BreakdownTable({ rows, currency }: { rows: BreakdownRow[]; currency: string }) {
  const { t } = useLanguage()
  const [sortKey, setSortKey] = useState<SortKey>('sentAmount')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey]
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return sortDir === 'asc' ? cmp : -cmp
  })
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize)
  function handlePageSizeChange(n: number) { setPageSize(n); setPage(1) }

  const columns: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
    { key: 'name', label: t.dashboard.colName, align: 'left' },
    { key: 'sentAmount', label: t.dashboard.colSentValue, align: 'right' },
    { key: 'receivedAmount', label: t.dashboard.colReceivedValue, align: 'right' },
    { key: 'sentCount', label: t.dashboard.colSentCount, align: 'right' },
    { key: 'receivedCount', label: t.dashboard.colReceivedCount, align: 'right' },
  ]

  return (
    <div className="data-flat -mx-5 -mb-5 border-t border-field">
      <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
        <thead className="bg-surface border-b border-field">
          <tr>
            {columns.map(col => (
              <th key={col.key} onClick={() => toggleSort(col.key)}
                className={`px-4 py-3 text-sm font-medium text-ink2 cursor-pointer select-none whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                <span className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'flex-row-reverse' : ''}`}>
                  {col.label}
                  <span className={sortKey === col.key ? 'text-ink' : 'text-gray-300'}>↕</span>
                </span>
              </th>
            ))}
            <th className="px-4 py-3 text-right text-sm font-medium text-ink2 whitespace-nowrap">{t.dashboard.colSuccess}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-field">
          {rows.length === 0 ? (
            <TableEmptyState icon={BarChart2} colSpan={columns.length + 1} title={t.common.empty.analytics.title} subtitle={t.common.empty.analytics.text} />
          ) : paginated.map((r, i) => {
            const pct = r.sentCount > 0 ? (r.receivedCount / r.sentCount) * 100 : 0
            return (
              <tr key={i} className="hover:bg-surface transition-colors">
                <td className="px-4 py-3 font-medium text-ink max-w-[220px] truncate" title={r.name}>{r.name}</td>
                <td className="px-4 py-3 text-right text-ink2" style={{ fontFamily: SANS }}>{fmt(r.sentAmount, currency)}</td>
                <td className="px-4 py-3 text-right text-ink2" style={{ fontFamily: SANS }}>{fmt(r.receivedAmount, currency)}</td>
                <td className="px-4 py-3 text-right text-ink2" style={{ fontFamily: SANS }}>{r.sentCount}</td>
                <td className="px-4 py-3 text-right text-success font-semibold" style={{ fontFamily: SANS }}>{r.receivedCount}</td>
                <td className="px-4 py-3 text-right text-ink2" style={{ fontFamily: SANS }}>{pct.toFixed(1).replace('.', ',')}%</td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
      <Pagination total={rows.length} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={handlePageSizeChange} pageSizeOptions={[10, 20, 50]} />
    </div>
  )
}

const CustomTooltip = ({ active, payload, label, currency }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-line rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="text-ink2 mb-1">{label}</p>}
      <p className="font-semibold text-ink" style={{ fontFamily: SANS }}>{fmt(payload[0].value, currency)}</p>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { company } = useCompany()
  const { t } = useLanguage()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  // Reference data for dropdowns
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; parent_id: string | null; status: 'active' | 'inactive' }[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])

  // Chart data
  const [spendByMonth, setSpendByMonth] = useState<{ month: string; amount: number }[]>([])
  const [spendBySupplier, setSpendBySupplier] = useState<BreakdownRow[]>([])
  const [spendByCategory, setSpendByCategory] = useState<BreakdownRow[]>([])
  const [spendBySubcategory, setSpendBySubcategory] = useState<BreakdownRow[]>([])
  const [spendByDepartment, setSpendByDepartment] = useState<BreakdownRow[]>([])
  const [spendByMaterial, setSpendByMaterial] = useState<BreakdownRow[]>([])

  // Stats
  const [stats, setStats] = useState({ total: 0, poCount: 0, openPos: 0, receivedPos: 0, avgPo: 0 })

  // Checklist
  const [checklist, setChecklist] = useState({ companyInfo: false, supplier: false, category: false, location: false, department: false, teamMember: false, firstRequest: false, firstPo: false })
  const [checklistLoaded, setChecklistLoaded] = useState(false)

  const currency = company?.currency ?? 'EUR'

  useEffect(() => {
    if (!company) return
    loadRefs()
    loadChecklist()
  }, [company])

  useEffect(() => {
    if (!company) return
    loadCharts()
  }, [company, filters])

  async function loadRefs() {
    const cid = company!.id
    const [s, c, d] = await Promise.all([
      supabase.from('suppliers').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
      supabase.from('categories').select('id, name, parent_id, status').eq('company_id', cid).order('name'),
      supabase.from('departments').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
    ])
    setSuppliers(s.data ?? [])
    setCategories(c.data ?? [])
    setDepartments(d.data ?? [])
  }

  async function loadChecklist() {
    const cid = company!.id
    const comp = company!
    const [{ count: sc }, { count: cc }, { count: locc }, { count: deptc }, { count: poc }, { count: uc }, { count: invc }, { count: reqc }] = await Promise.all([
      supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('categories').select('*', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('locations').select('*', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('departments').select('*', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('company_id', cid),
      supabase.from('user_invitations').select('*', { count: 'exact', head: true }).eq('company_id', cid).eq('status', 'pending'),
      supabase.from('requests').select('*', { count: 'exact', head: true }).eq('company_id', cid),
    ])
    setChecklist({
      companyInfo: !!(comp.address_street && comp.tax_id),
      supplier: (sc ?? 0) > 0,
      category: (cc ?? 0) > 0,
      location: (locc ?? 0) > 0,
      department: (deptc ?? 0) > 0,
      teamMember: (uc ?? 0) > 1 || (invc ?? 0) > 0,
      firstRequest: (reqc ?? 0) > 0,
      firstPo: (poc ?? 0) > 0,
    })
    setChecklistLoaded(true)
  }

  async function loadCharts() {
    if (!company) return
    const dateFrom = getDateFrom(filters.dateRange)
    // Short ranges get finer buckets — a single month of monthly buckets is
    // basically useless (1-2 data points), so bucket by day/week instead.
    const periodUnit: 'day' | 'week' | 'month' =
      filters.dateRange === '1m' ? 'day' : filters.dateRange === '3m' ? 'week' : 'month'
    const periodCount =
      filters.dateRange === '1m' ? 30 : filters.dateRange === '3m' ? 13 : filters.dateRange === '6m' ? 6 : 12

    const { data, error } = await supabase.rpc('get_dashboard_stats', {
      p_company_id:    company.id,
      p_date_from:     dateFrom ?? undefined,
      p_supplier_id:   filters.supplierId   || undefined,
      p_category_id:   filters.categoryId   || undefined,
      p_department_id: filters.departmentId || undefined,
      p_months:        periodCount,
      p_period_unit:   periodUnit,
    })

    if (error) { console.error('Dashboard RPC error', error); return }
    const d = data as any

    // Summary
    const summary = d.summary ?? {}
    setStats({
      total:   summary.total_spend ?? 0,
      poCount: summary.po_count    ?? 0,
      openPos: d.open_pos          ?? 0,
      receivedPos: d.received_pos  ?? 0,
      avgPo:   summary.avg_po      ?? 0,
    })

    // Spend by period — bucket date formatted per the active granularity
    const monthRows: { month: string; amount: number }[] = (d.spend_by_month ?? []).map((r: any) => ({
      month:  format(new Date(r.month), periodUnit === 'month' ? 'MMM yy' : 'd MMM'),
      amount: r.amount,
    }))
    setSpendByMonth(monthRows)

    // Breakdown tables — sent vs received value + count
    const toBreakdown = (rows: any[], fallbackName: string): BreakdownRow[] =>
      (rows ?? []).map((r) => ({
        name:           r.name ?? fallbackName,
        sentAmount:     r.sent_amount ?? 0,
        sentCount:      r.sent_count ?? 0,
        receivedAmount: r.received_amount ?? 0,
        receivedCount:  r.received_count ?? 0,
      }))
    setSpendBySupplier(toBreakdown(d.spend_by_supplier, t.dashboard.unknown))
    setSpendByCategory(toBreakdown(d.spend_by_category, t.dashboard.noCategory))
    setSpendBySubcategory(toBreakdown(d.spend_by_subcategory, t.dashboard.noCategory))
    setSpendByDepartment(toBreakdown(d.spend_by_department, t.dashboard.noDepartment))
    setSpendByMaterial(toBreakdown(d.spend_by_material, t.dashboard.unknown))
  }

  function setFilter(key: keyof Filters, value: string) {
    setFilters(f => ({ ...f, [key]: value }))
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS)
  }

  const hasActiveFilters = filters.supplierId || filters.categoryId || filters.departmentId || filters.dateRange !== '1y'

  const dateRanges: { value: Filters['dateRange']; label: string }[] = [
    { value: '1m', label: t.filters.lastMonth },
    { value: '3m', label: t.filters.last3Months },
    { value: '6m', label: t.filters.last6Months },
    { value: '1y', label: t.filters.last12Months },
    { value: 'all', label: t.filters.allTime },
  ]

  const checklistItems = [
    { done: true,                    label: t.checklist.companyCreated,                  to: null },
    { done: checklist.companyInfo,   label: t.checklist.addAddress,        to: '/settings' },
    { done: checklist.supplier,      label: t.checklist.createSupplier,       to: '/suppliers' },
    { done: checklist.category,      label: t.checklist.createCategory,                to: '/catalog' },
    { done: checklist.location,      label: t.checklist.createLocation,       to: '/locations' },
    { done: checklist.department,    label: t.checklist.createDepartment,              to: '/departments' },
    { done: checklist.teamMember,    label: t.checklist.inviteTeam,                    to: '/users' },
    { done: checklist.firstRequest,  label: t.checklist.createFirstRequest,            to: '/requests' },
    { done: checklist.firstPo,       label: t.checklist.createFirstPO, to: '/purchase-orders' },
  ]
  const doneCount = checklistItems.filter(i => i.done).length
  const allDone = doneCount === checklistItems.length

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar>

          <FilterSelect label={t.filters.labels.period} value={filters.dateRange} defaultValue={DEFAULT_FILTERS.dateRange} onChange={e => setFilter('dateRange', e.target.value as Filters['dateRange'])}>
            {dateRanges.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </FilterSelect>

          <FilterSelect label={t.filters.labels.supplier} value={filters.supplierId} onChange={e => setFilter('supplierId', e.target.value)}>
            <option value="">{t.filters.allM}</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </FilterSelect>

          <FilterSelect label={t.filters.labels.category} value={filters.categoryId} onChange={e => setFilter('categoryId', e.target.value)}>
            <option value="">{t.filters.allF}</option>
            {categoryOptions(categories).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </FilterSelect>

          <FilterSelect label={t.filters.labels.department} value={filters.departmentId} onChange={e => setFilter('departmentId', e.target.value)}>
            <option value="">{t.filters.allM}</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </FilterSelect>

          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 text-sm text-ink2 hover:text-ink bg-white border border-field hover:border-field-hover rounded-lg px-2.5 py-1.5 font-medium whitespace-nowrap transition-colors">
              <X className="w-3.5 h-3.5" />{t.common.clearFilters}
            </button>
          )}
      </PageToolbar>

      {/* Setup banner — only show after checklist is loaded to avoid flash */}
      {SHOW_SETUP_BANNER && checklistLoaded && !allDone && !bannerDismissed && (
        <div className="bg-white border border-line rounded-lg p-5 mb-5 relative">
          <button onClick={() => setBannerDismissed(true)} className="absolute top-4 right-4 text-gray-400 hover:text-ink2"><X className="w-4 h-4" /></button>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-ink">{t.dashboard.completeSetup}</span>
            <span className="text-xs text-gray-400">{doneCount} / {checklistItems.length} {t.dashboard.done}</span>
          </div>
          <div className="h-1.5 bg-selected rounded-full mb-4 overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${(doneCount / checklistItems.length) * 100}%` }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {checklistItems.map(item => (
              <div key={item.label} className="flex items-center gap-2">
                {item.done ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> : <Circle className="w-4 h-4 text-gray-300 shrink-0" />}
                {item.to && !item.done
                  ? <Link to={item.to} className="text-sm text-accent hover:underline flex items-center gap-1">{item.label} <ChevronRight className="w-3 h-3" /></Link>
                  : <span className={`text-sm ${item.done ? 'text-gray-400 line-through' : 'text-ink2'}`}>{item.label}</span>
                }
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Overview */}
      <OverviewBar items={[
        { icon: TrendingUp, label: t.dashboard.totalSpend, value: fmt(stats.total, currency), primary: true },
        { icon: FileText,   label: t.dashboard.poCount,     value: String(stats.poCount) },
        { icon: Clock,      label: t.dashboard.openPos,     value: String(stats.openPos) },
        { icon: BarChart2,  label: t.dashboard.receivedPos, value: String(stats.receivedPos) },
      ]} />

      {/* Spend over time — full width */}
      <div className="mb-4">
        <ChartCard title={t.dashboard.spendOverTime}>
          {spendByMonth.some(m => m.amount > 0) ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={spendByMonth} margin={{ top: 24, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--chart-axis)', fontFamily: SANS }} axisLine={false} tickLine={false} interval={Math.max(0, Math.ceil(spendByMonth.length / 10) - 1)} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--chart-axis)', fontFamily: SANS }} axisLine={false} tickLine={false} tickFormatter={fmtShort} width={40} />
                  <Tooltip content={<CustomTooltip currency={currency} />} cursor={{ fill: 'var(--chart-cursor)' }} />
                  <Bar dataKey="amount" fill="var(--chart-bar-fill)" stroke={CHART_BLUE} strokeWidth={1.5} radius={[3, 3, 0, 0]}>
                    <LabelList dataKey="amount" position="top" offset={6}
                      style={{ fontSize: 10, fill: 'var(--chart-axis)', fontFamily: SANS }}
                      formatter={(v: any) => v > 0 ? fmtShort(v) : ''} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : <div className="py-12"><EmptyState icon={BarChart2} title={t.common.empty.analytics.title} subtitle={t.common.empty.analytics.text} /></div>}
        </ChartCard>
      </div>

      {/* Breakdown tables — stacked one below another */}
      <div className="flex flex-col gap-4 mb-4">
        <ChartCard title={t.dashboard.spendByCategory}>
          <BreakdownTable rows={spendByCategory} currency={currency} />
        </ChartCard>

        {spendBySubcategory.length > 0 && (
          <ChartCard title={t.dashboard.spendBySubcategory}>
            <BreakdownTable rows={spendBySubcategory} currency={currency} />
          </ChartCard>
        )}

        <ChartCard title={t.dashboard.spendBySupplier}>
          <BreakdownTable rows={spendBySupplier} currency={currency} />
        </ChartCard>

        <ChartCard title={t.dashboard.spendByDepartment}>
          <BreakdownTable rows={spendByDepartment} currency={currency} />
        </ChartCard>

        <ChartCard title={t.dashboard.spendByMaterial}>
          <BreakdownTable rows={spendByMaterial} currency={currency} />
        </ChartCard>
      </div>
    </div>
  )
}
