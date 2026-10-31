import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, Search, X, ClipboardList, MapPin, User, UserCheck, CalendarClock, Coins, MessageSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import Pagination from '../components/ui/Pagination'
import PageToolbar from '../components/layout/PageToolbar'
import { useHeaderCounts } from '../components/layout/HeaderCounts'
import FilterSelect from '../components/ui/FilterSelect'
import TableEmptyState from '../components/ui/TableEmptyState'
import { format, subMonths, startOfMonth } from 'date-fns'
import PersonCell from '../components/ui/PersonCell'
import GridHead, { type GridCol } from '../components/ui/GridHead'
import { matchesSearch } from '../lib/search'
import SortFilter from '../components/ui/SortFilter'
import { applySort, num, date, dateLast, rev, docNumber, type SortDef } from '../lib/sort'
import ExportButton from '../components/ui/ExportButton'
import type { ExportColumn } from '../lib/exportExcel'

interface Row {
  id: string
  request_number: string
  title: string | null
  total_estimate: number
  created_at: string
  needed_by_date: string | null
  created_by: string
  approver_id: string | null
  locations: { name: string } | null
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
  const [sort, setSort] = useState('newest')
  useEffect(() => { setPage(1) }, [sort])
  const [dateRange, setDateRange] = useState('all')
  const [approverId, setApproverId] = useState('')
  const [members, setMembers] = useState<{ id: string; first_name: string; last_name: string }[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [comments, setComments] = useState<Record<string, string>>({})
  useEffect(() => { if (company && profile) { load(); loadRefs() } }, [company, profile, isAdmin])

  async function loadRefs() {
    if (!company) return
    const [{ data: u }] = await Promise.all([
      supabase.from('users').select('id, first_name, last_name').eq('company_id', company.id).order('first_name'),
    ])
    setMembers(u ?? [])
  }

  async function load() {
    if (!company || !profile) return
    // spinner only on the first load: later reloads refresh the data in place
    let query = supabase
      .from('requests')
      .select('id, request_number, title, total_estimate, created_at, needed_by_date, created_by, approver_id, locations(name)')
      .eq('company_id', company.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (!isAdmin) query = query.eq('approver_id', profile.id)
    const { data } = await query
    const list = (data as unknown as Row[]) ?? []
    setRows(list)
    if (list.length) {
      const { data: acts } = await supabase.from('activity_log').select('request_id, note, created_at').in('request_id', list.map(r => r.id)).eq('action', 'submitted').not('note', 'is', null).order('created_at')
      const cm: Record<string, string> = {}
      for (const a of acts ?? []) if (a.note) cm[a.request_id as string] = a.note as string
      setComments(cm)
    }
    const ids = [...new Set(list.flatMap(r => [r.created_by, r.approver_id]).filter(Boolean) as string[])]
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, first_name, last_name').in('id', ids)
      const m: Record<string, string> = {}
      for (const u of us ?? []) m[u.id] = `${u.first_name} ${u.last_name}`
      setNames(m)
    }
    setLoading(false)
  }

  function clearFilters() { setSearch(''); setDateRange('all'); setApproverId('') }
  const hasActiveFilters = search || dateRange !== 'all' || approverId
  const dateFrom = getDateFrom(dateRange)

  const sortDefs: SortDef<(typeof rows)[number]>[] = [
    { value: 'newest', label: t.sort.newest, cmp: rev(date(r => r.created_at)) },
    { value: 'oldest', label: t.sort.oldest, cmp: date(r => r.created_at) },
    { value: 'numberAsc', label: t.sort.numberAsc, cmp: docNumber(r => r.request_number) },
    { value: 'numberDesc', label: t.sort.numberDesc, cmp: rev(docNumber(r => r.request_number)) },
    { value: 'amountDesc', label: t.sort.amountDesc, cmp: rev(num(r => r.total_estimate)) },
    { value: 'amountAsc', label: t.sort.amountAsc, cmp: num(r => r.total_estimate) },
    { value: 'neededBy', label: t.sort.neededBy, cmp: dateLast(r => r.needed_by_date) },
  ]
  const filtered = rows.filter(r => {
    if (!matchesSearch(search, [r.request_number, r.title, r.locations?.name, names[r.created_by], r.approver_id ? names[r.approver_id] : null])) return false
    if (dateFrom && r.created_at < dateFrom) return false
    if (approverId && r.approver_id !== approverId) return false
    return true
  })

  useEffect(() => { setPage(1) }, [search, dateRange, approverId])
  const sortedRows = applySort(filtered, sortDefs, sort)
  const exportCols: ExportColumn<Row>[] = [
    { header: s.requestNumber, get: r => r.request_number, kind: 'text', width: 14 },
    { header: s.requestTitle, get: r => r.title, kind: 'text', width: 40 },
    { header: s.location, get: r => r.locations?.name, kind: 'text', width: 26 },
    { header: a.requestedBy, get: r => names[r.created_by], kind: 'text', width: 22 },
    { header: s.approver, get: r => (r.approver_id ? names[r.approver_id] : null), kind: 'text', width: 22 },
    { header: s.neededBy, get: r => r.needed_by_date, kind: 'date', width: 14 },
    { header: s.estTotalCol, get: r => r.total_estimate, kind: 'money', width: 14 },
    { header: t.common.created, get: r => r.created_at, kind: 'date', width: 14 },
  ]
  const paginated = sortedRows.slice((page - 1) * pageSize, page * pageSize)
  function handlePageSizeChange(n: number) { setPageSize(n); setPage(1) }

  useHeaderCounts(loading ? [] : [{ value: filtered.length }])

  return (
    <div className="p-4 lg:p-6">
      {rows.length > 0 && (
      <PageToolbar attached actions={<ExportButton fileName="odobritve" columns={exportCols} rows={sortedRows} />}>
            <div className="relative min-w-40 flex-1 max-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-filter-label" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={s.requestNumber + ' / ' + a.requestedBy}
                className="w-full pl-9 pr-3 h-9 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:border-field-hover bg-white text-ink placeholder:text-filter-label" />
            </div>
            <SortFilter defs={sortDefs} value={sort} onChange={setSort} />
        <FilterSelect label={t.filters.labels.period} value={dateRange} onChange={e => setDateRange(e.target.value)}>
              <option value="all">{t.filters.allTime}</option>
              <option value="1m">{t.filters.lastMonth}</option>
              <option value="3m">{t.filters.last3Months}</option>
              <option value="6m">{t.filters.last6Months}</option>
              <option value="1y">{t.filters.last12Months}</option>
            </FilterSelect>
            {isAdmin && (
              <FilterSelect label={t.filters.labels.approver} value={approverId} onChange={e => setApproverId(e.target.value)}>
                <option value="">{t.filters.allM}</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
              </FilterSelect>
            )}
            {hasActiveFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1.5 text-sm text-ink2 hover:text-ink bg-white border border-field hover:border-field-hover rounded-lg px-2.5 py-1.5 font-medium whitespace-nowrap transition-colors">
                <X className="w-3.5 h-3.5" />{t.common.clearFilters}
              </button>
            )}
      </PageToolbar>
      )}

      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[900px]">
            <GridHead cols={[[s.requestNumber, ClipboardList], [s.location, MapPin], [t.requests.commentCol, MessageSquare], [a.requestedBy, User], ...(isAdmin ? [[s.approver, UserCheck] as GridCol] : []), [s.neededBy, CalendarClock], [s.estTotalCol, Coins], ['']]} />
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={CheckCircle2} colSpan={isAdmin ? 9 : 8} title={hasActiveFilters ? t.common.empty.noResults.title : t.common.empty.approvals.title} subtitle={hasActiveFilters ? t.common.empty.noResults.text : t.common.empty.approvals.text} />
              ) : paginated.map(r => (
                <tr key={r.id} className="hover:bg-surface transition-colors cursor-pointer" onClick={() => navigate(`/requests/${r.id}`)}>
                  <td className="px-4 py-3 max-w-[300px]">
                    {r.title && <p className="text-sm font-medium text-ink truncate" title={r.title}>{r.title}</p>}
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <Link to={`/requests/${r.id}`} onClick={e => e.stopPropagation()} className={`font-medium hover:text-ink ${r.title ? 'text-xs text-gray-400' : 'text-sm text-gray-400'}`}>{r.request_number}</Link>
                      <span className="text-xs text-gray-400">{format(new Date(r.created_at), 'dd.MM.yyyy')}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink2">{r.locations?.name ?? '-'}</td>
                  <td className="px-4 py-3 text-ink2 max-w-[260px] truncate" title={comments[r.id]}>{comments[r.id] ?? '-'}</td>
                  <td className="px-4 py-3"><PersonCell name={names[r.created_by]} /></td>
                  {isAdmin && <td className="px-4 py-3"><PersonCell name={r.approver_id ? names[r.approver_id] : null} /></td>}
                  <td className="px-4 py-3 text-gray-500 text-xs">{r.needed_by_date ? format(new Date(r.needed_by_date), 'dd.MM.yyyy') : '—'}</td>
                  <td className="px-4 py-3 font-medium text-ink">{fmt(r.total_estimate ?? 0, company?.currency)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <Link to={`/requests/${r.id}`} onClick={e => e.stopPropagation()}
                        className="badge badge-warn hover:brightness-95 transition-all whitespace-nowrap">
                        {a.review}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={handlePageSizeChange} />
      </div>
    </div>
  )
}
