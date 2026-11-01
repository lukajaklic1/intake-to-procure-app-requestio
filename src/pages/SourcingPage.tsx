import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Plus, Search, FileSearch, IdCard, FileText, Users, MessageSquareReply, CalendarClock, User, CircleDot, PiggyBank, Pencil, Eye, Tag } from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'
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
import PersonCell from '../components/ui/PersonCell'
import SortFilter from '../components/ui/SortFilter'
import ExportButton from '../components/ui/ExportButton'
import type { ExportColumn } from '../lib/exportExcel'
import { matchesSearch } from '../lib/search'
import { applySort, text, num, date, dateLast, rev, docNumber, type SortDef } from '../lib/sort'
import { STATUS_BADGE, TYPE_BADGE, type SEvent, type EventStatus, type EventType } from '../lib/sourcing'

interface Row extends SEvent { sourcing_invitations: { id: string; status: string }[] }

const fmtDate = (d: string | null) => (d ? format(new Date(d + 'T00:00:00'), 'dd.MM.yyyy') : '-')

/** Tracking of all sourcing events: who was asked, how many answered, what is waiting for a decision and what it saved. */
export default function SourcingPage() {
  const { company, isAdmin, hasPerm, loading: companyLoading } = useCompany()
  const { t } = useLanguage()
  const s = t.sourcing
  const navigate = useNavigate()
  const canView = isAdmin || hasPerm('purchase_orders', 'view')
  const canCreate = isAdmin || hasPerm('purchase_orders', 'create')
  const currency = company?.currency ?? 'EUR'
  const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)

  const [rows, setRows] = useState<Row[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    if (!company || !canView) return
    ;(async () => {
      const { data } = await supabase.from('sourcing_events').select('*, sourcing_invitations(id, status)').eq('company_id', company.id).order('created_at', { ascending: false })
      const list = (data as unknown as Row[]) ?? []
      setRows(list)
      const ids = [...new Set(list.map(r => r.created_by).filter(Boolean))] as string[]
      if (ids.length) {
        const { data: us } = await supabase.from('users').select('id, first_name, last_name').in('id', ids)
        setNames(Object.fromEntries((us ?? []).map(u => [u.id, `${u.first_name} ${u.last_name}`])))
      }
      setLoading(false)
    })()
  }, [company, canView])

  const saving = (r: Row) => (r.status === 'awarded' && r.baseline_total != null && r.awarded_total != null ? Number(r.baseline_total) - Number(r.awarded_total) : null)
  const sortDefs: SortDef<Row>[] = [
    { value: 'newest', label: t.sort.newest, cmp: rev(date(r => r.created_at)) },
    { value: 'oldest', label: t.sort.oldest, cmp: date(r => r.created_at) },
    { value: 'numberDesc', label: t.sort.numberDesc, cmp: rev(docNumber(r => r.event_number)) },
    { value: 'numberAsc', label: t.sort.numberAsc, cmp: docNumber(r => r.event_number) },
    { value: 'deadline', label: s.deadline, cmp: dateLast(r => r.deadline) },
    { value: 'savings', label: s.savings, cmp: rev(num(r => saving(r))) },
    { value: 'nameAsc', label: t.sort.nameAsc, cmp: text(r => r.title) },
  ]
  const filtered = useMemo(() => rows.filter(r => {
    if (!matchesSearch(search, [r.event_number, r.title, names[r.created_by ?? '']])) return false
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (typeFilter !== 'all' && r.event_type !== typeFilter) return false
    return true
  }), [rows, search, statusFilter, typeFilter, names])
  useEffect(() => { setPage(1) }, [search, statusFilter, typeFilter, sort])
  const sorted = applySort(filtered, sortDefs, sort)
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize)
  const filtering = search !== '' || statusFilter !== 'all' || typeFilter !== 'all'
  useHeaderCounts(loading ? [] : [{ value: filtered.length }])

  const exportCols: ExportColumn<Row>[] = [
    { header: s.number, get: r => r.event_number, kind: 'text', width: 14 },
    { header: s.name, get: r => r.title, kind: 'text', width: 38 },
    { header: s.type, get: r => s.types[r.event_type], kind: 'text', width: 8 },
    { header: s.invited, get: r => r.sourcing_invitations.length, kind: 'number', width: 10 },
    { header: s.responses, get: r => r.sourcing_invitations.filter(i => i.status === 'responded').length, kind: 'number', width: 10 },
    { header: s.deadline, get: r => r.deadline, kind: 'date', width: 14 },
    { header: s.owner, get: r => names[r.created_by ?? ''], kind: 'text', width: 22 },
    { header: s.status, get: r => s.st[r.status], kind: 'text', width: 14 },
    { header: s.savings, get: r => saving(r), kind: 'money', width: 14 },
  ]

  if (companyLoading) return null
  if (!canView) return <Navigate to="/dashboard" replace />

  const today = new Date()
  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached actions={<>
        <ExportButton fileName="povprasevanja" columns={exportCols} rows={sorted} />
        {canCreate && <Button onClick={() => navigate('/sourcing/new')} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button>}
      </>}>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-filter-label" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.common.search + '…'}
            className="w-full pl-9 pr-4 h-9 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:border-field-hover bg-white text-ink placeholder:text-filter-label" />
        </div>
        <SortFilter defs={sortDefs} value={sort} onChange={setSort} />
        <FilterSelect label={s.status} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">{t.filters.allM}</option>
          {(['draft', 'sent', 'evaluation', 'awarded', 'cancelled'] as EventStatus[]).map(v => <option key={v} value={v}>{s.st[v]}</option>)}
        </FilterSelect>
        <FilterSelect label={s.filterType} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">{s.allTypes}</option>
          {(['rfq', 'rfp', 'rfi'] as EventType[]).map(v => <option key={v} value={v}>{s.types[v]}</option>)}
        </FilterSelect>
      </PageToolbar>

      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[1100px]">
            <GridHead cols={[[s.number, IdCard], [s.name, FileText], [s.type, Tag], [s.invited, Users, 'right'], [s.responses, MessageSquareReply, 'right'], [s.deadline, CalendarClock], [s.owner, User], [s.status, CircleDot], [s.savings, PiggyBank, 'right'], ['']]} />
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={FileSearch} colSpan={10}
                  title={filtering ? t.common.empty.noResults.title : t.common.empty.sourcing.title}
                  subtitle={filtering ? t.common.empty.noResults.text : t.common.empty.sourcing.text}
                  action={!filtering && canCreate ? <Button onClick={() => navigate('/sourcing/new')} className="gap-2 mt-2"><Plus className="w-4 h-4" />{s.new}</Button> : undefined} />
              ) : paged.map(r => {
                const invited = r.sourcing_invitations.length
                const answered = r.sourcing_invitations.filter(i => i.status === 'responded').length
                const open = r.status === 'sent' || r.status === 'evaluation'
                const late = open && r.deadline ? differenceInCalendarDays(today, new Date(r.deadline + 'T00:00:00')) > 0 : false
                const sv = saving(r)
                return (
                  <tr key={r.id} className="hover:bg-surface transition-colors cursor-pointer" onClick={() => navigate(`/sourcing/${r.id}`)}>
                    <td className="px-4 py-3 text-ink2 whitespace-nowrap">{r.event_number}</td>
                    <td className="px-4 py-3 font-medium text-ink max-w-[320px] truncate" title={r.title}>{r.title}</td>
                    <td className="px-4 py-3"><span className={`badge ${TYPE_BADGE[r.event_type]}`}>{s.types[r.event_type]}</span></td>
                    <td className="px-4 py-3 text-right text-ink2 tabular-nums">{invited}</td>
                    <td className={`px-4 py-3 text-right tabular-nums whitespace-nowrap ${open && invited > 0 && answered === invited ? 'text-success font-medium' : 'text-ink2'}`}>{answered} / {invited}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={late ? 'text-danger font-medium' : 'text-ink'}>{fmtDate(r.deadline)}</span>
                    </td>
                    <td className="px-4 py-3"><PersonCell name={names[r.created_by ?? '']} /></td>
                    <td className="px-4 py-3"><span className={`badge ${STATUS_BADGE[r.status]}`}>{s.st[r.status]}</span></td>
                    <td className={`px-4 py-3 text-right whitespace-nowrap tabular-nums ${sv != null && sv > 0 ? 'text-success font-medium' : sv != null && sv < 0 ? 'text-danger' : 'text-ink2'}`}>{sv != null ? money(sv) : '-'}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <RowMenu items={r.status === 'draft' && canCreate
                          ? [{ label: t.common.editEntity, icon: Pencil, onClick: () => navigate(`/sourcing/${r.id}/edit`) }]
                          : [{ label: t.common.view, icon: Eye, onClick: () => navigate(`/sourcing/${r.id}`) }]} />
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
    </div>
  )
}
