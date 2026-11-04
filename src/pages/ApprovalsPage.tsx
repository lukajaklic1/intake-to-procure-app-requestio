import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Search, X, ClipboardList, IdCard, Wallet, MapPin, User, UserCheck, CalendarClock, Coins, MessageSquare, Eye, ReceiptText, Building2, FileText, Scale } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import Pagination from '../components/ui/Pagination'
import PageToolbar from '../components/layout/PageToolbar'
import { useHeaderCounts, useHeaderTabs } from '../components/layout/HeaderCounts'
import FilterSelect from '../components/ui/FilterSelect'
import TableEmptyState from '../components/ui/TableEmptyState'
import { format, subMonths, startOfMonth } from 'date-fns'
import PersonCell from '../components/ui/PersonCell'
import RowMenu from '../components/ui/RowMenu'
import GridHead, { type GridCol } from '../components/ui/GridHead'
import { matchesSearch } from '../lib/search'
import SortFilter from '../components/ui/SortFilter'
import { applySort, num, date, dateLast, rev, docNumber, type SortDef } from '../lib/sort'
import ExportButton from '../components/ui/ExportButton'
import type { ExportColumn } from '../lib/exportExcel'
import { loadBudgetUsage, usageOf, usedPercent } from '../lib/budget'
import { UsedBar } from './BudgetsPage'
import { invoicesToDecide, MATCH_BADGE } from '../lib/invoices'

interface Row {
  id: string
  request_number: string
  title: string | null
  total_estimate: number
  created_at: string
  needed_by_date: string | null
  department_id: string | null
  created_by: string
  approver_id: string | null
  locations: { name: string } | null
}

interface InvRow {
  id: string; created_at: string; invoice_number: string; supplier_invoice_number: string; total_amount: number; due_date: string | null
  match_status: string; created_by: string | null
  suppliers: { name: string } | null; purchase_orders: { po_number: string } | null
  invoice_approvals: { step: number; approver_id: string; status: string }[]
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
  const { company, profile, isAdmin, hasPerm } = useCompany()
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
  // how full the budget of each department is this year (percent), for departments that have one
  const [budgetPct, setBudgetPct] = useState<Record<string, number>>({})
  useEffect(() => { if (company && profile) { load(); loadRefs(); loadInvoices() } }, [company, profile, isAdmin])

  // the invoices that wait for this person: a second tab next to the requests
  const [invoiceRows, setInvoiceRows] = useState<InvRow[]>([])
  const [tabState, setTabState] = useState<'requests' | 'invoices' | null>(null)
  const [invSearch, setInvSearch] = useState('')
  const [invSort, setInvSort] = useState('due')
  async function loadInvoices() {
    if (!company || !profile) return
    const ids = await invoicesToDecide(company.id, profile.id, isAdmin, hasPerm('invoices', 'approve'))
    if (ids.length === 0) { setInvoiceRows([]); return }
    const { data } = await supabase.from('invoices')
      .select('id, created_at, invoice_number, supplier_invoice_number, total_amount, due_date, match_status, created_by, suppliers(name), purchase_orders(po_number), invoice_approvals(step, approver_id, status)')
      .in('id', ids)
    setInvoiceRows((data as unknown as InvRow[]) ?? [])
  }

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
      .select('id, request_number, title, total_estimate, created_at, needed_by_date, department_id, created_by, approver_id, locations(name)')
      .eq('company_id', company.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (!isAdmin) query = query.eq('approver_id', profile.id)
    const { data } = await query
    const list = (data as unknown as Row[]) ?? []
    setRows(list)
    if (list.length) {
      const year = new Date().getFullYear()
      const [{ data: bs }, us] = await Promise.all([
        supabase.from('budgets').select('department_id, amount').eq('company_id', company.id).eq('year', year).is('category_id', null).gt('amount', 0),
        loadBudgetUsage(year),
      ])
      setBudgetPct(Object.fromEntries((bs ?? []).map(b => [b.department_id, usedPercent(usageOf(us, b.department_id, null, 'ordered') + usageOf(us, b.department_id, null, 'requested'), Number(b.amount))])))
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

  // which tab is open: the one that has something to decide, unless one was chosen
  const tab = tabState ?? (!loading && rows.length === 0 && invoiceRows.length > 0 ? 'invoices' : 'requests')
  useHeaderTabs([
    { id: 'requests', label: s.title, count: rows.length, active: tab === 'requests' },
    { id: 'invoices', label: t.invoices.title, count: invoiceRows.length, active: tab === 'invoices' },
  ], id => { setTabState(id as 'requests' | 'invoices'); setPage(1) })
  const nameOf = (id: string | null | undefined) => (id ? names[id] ?? (members.find(m => m.id === id) ? `${members.find(m => m.id === id)!.first_name} ${members.find(m => m.id === id)!.last_name}` : undefined) : undefined)
  const invSortDefs: SortDef<InvRow>[] = [
    { value: 'due', label: t.sort.dueDate, cmp: dateLast(r => r.due_date) },
    { value: 'newest', label: t.sort.newest, cmp: rev(date(r => r.created_at)) },
    { value: 'amountDesc', label: t.sort.amountDesc, cmp: rev(num(r => r.total_amount)) },
    { value: 'amountAsc', label: t.sort.amountAsc, cmp: num(r => r.total_amount) },
  ]
  const invFiltered = invoiceRows.filter(r => matchesSearch(invSearch, [r.supplier_invoice_number, r.invoice_number, r.suppliers?.name, r.purchase_orders?.po_number]))
  const invSorted = applySort(invFiltered, invSortDefs, invSort)
  const invPaged = invSorted.slice((page - 1) * pageSize, page * pageSize)
  const currentApprover = (r: InvRow) => r.invoice_approvals.filter(x => x.status === 'pending').sort((x, y) => x.step - y.step)[0]?.approver_id ?? null
  const invExportCols: ExportColumn<InvRow>[] = [
    { header: t.invoices.invoiceNo, get: r => r.invoice_number, kind: 'text', width: 14 },
    { header: t.invoices.supplierInvoiceNo, get: r => r.supplier_invoice_number, kind: 'text', width: 20 },
    { header: t.invoices.supplier, get: r => r.suppliers?.name, kind: 'text', width: 32 },
    { header: t.invoices.po, get: r => r.purchase_orders?.po_number, kind: 'text', width: 14 },
    { header: t.invoices.dueDate, get: r => r.due_date, kind: 'date', width: 14 },
    { header: t.invoices.amount, get: r => r.total_amount, kind: 'money', width: 14 },
  ]

  return (
    <div className="p-4 lg:p-6">
      {tab === 'requests' && rows.length > 0 && (
      <PageToolbar attached actions={<ExportButton fileName="potrditve" columns={exportCols} rows={sortedRows} />}>
            <div className="relative min-w-40 flex-1 max-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-filter-label" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.common.search + '…'}
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

      {tab === 'requests' && (
      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[1250px]">
            <GridHead cols={[[s.requestNumber, IdCard], [s.requestTitle, ClipboardList], [s.location, MapPin], [t.requests.commentCol, MessageSquare], [t.budgets.title, Wallet], [a.requestedBy, User], ...(isAdmin ? [[s.approver, UserCheck] as GridCol] : []), [s.neededBy, CalendarClock], [s.estTotalCol, Coins], ['']]} />
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={CheckCircle2} colSpan={isAdmin ? 11 : 10} title={hasActiveFilters ? t.common.empty.noResults.title : t.common.empty.approvals.title} subtitle={hasActiveFilters ? t.common.empty.noResults.text : t.common.empty.approvals.text} />
              ) : paginated.map(r => (
                <tr key={r.id} className="hover:bg-surface transition-colors cursor-pointer" onClick={() => navigate(`/requests/${r.id}`, { state: { from: '/approvals' } })}>
                  <td className="px-4 py-3 text-ink2 whitespace-nowrap">{r.request_number}</td>
                  <td className="px-4 py-3 max-w-[300px]"><p className="font-medium text-ink truncate" title={r.title ?? undefined}>{r.title || '-'}</p></td>
                  <td className="px-4 py-3 text-ink2">{r.locations?.name ?? '-'}</td>
                  <td className="px-4 py-3 text-ink2 max-w-[260px] truncate" title={comments[r.id]}>{comments[r.id] ?? '-'}</td>
                  <td className="px-4 py-3">{r.department_id && budgetPct[r.department_id] !== undefined ? <UsedBar pct={budgetPct[r.department_id]} /> : <span className="text-ink2">-</span>}</td>
                  <td className="px-4 py-3"><PersonCell name={names[r.created_by]} /></td>
                  {isAdmin && <td className="px-4 py-3"><PersonCell name={r.approver_id ? names[r.approver_id] : null} /></td>}
                  <td className="px-4 py-3 text-ink whitespace-nowrap">{r.needed_by_date ? format(new Date(r.needed_by_date), 'dd.MM.yyyy') : '-'}</td>
                  <td className="px-4 py-3 text-ink whitespace-nowrap tabular-nums">{fmt(r.total_estimate ?? 0, company?.currency)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                      <RowMenu items={[{ label: a.review, icon: Eye, onClick: () => navigate(`/requests/${r.id}`, { state: { from: '/approvals' } }) }]} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={handlePageSizeChange} />
      </div>
      )}

      {tab === 'invoices' && (
        <>
          {invoiceRows.length > 0 && (
            <PageToolbar attached actions={<ExportButton fileName="potrditve-racuni" columns={invExportCols} rows={invSorted} />}>
              <div className="relative min-w-40 flex-1 max-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-filter-label" />
                <input value={invSearch} onChange={e => { setInvSearch(e.target.value); setPage(1) }} placeholder={t.common.search + '…'}
                  className="w-full pl-9 pr-3 h-9 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:border-field-hover bg-white text-ink placeholder:text-filter-label" />
              </div>
              <SortFilter defs={invSortDefs} value={invSort} onChange={v => { setInvSort(v); setPage(1) }} />
            </PageToolbar>
          )}
          <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[1180px]">
              <GridHead cols={[[t.invoices.invoiceNo, IdCard], [t.invoices.supplierInvoiceNo, ReceiptText], [t.invoices.supplier, Building2], [t.invoices.po, FileText], [t.invoices.match, Scale], [t.invoices.enteredBy, User], ...(isAdmin ? [[t.invoices.approverCol, UserCheck]] as GridCol[] : []), [t.invoices.dueDate, CalendarClock], [t.invoices.amount, Coins, 'right'], ['']]} />
              <tbody className="divide-y divide-field">
                {invFiltered.length === 0 ? (
                  <TableEmptyState icon={CheckCircle2} colSpan={isAdmin ? 10 : 9}
                    title={invSearch ? t.common.empty.noResults.title : t.invoices.noToApprove}
                    subtitle={invSearch ? t.common.empty.noResults.text : t.invoices.noToApproveText} />
                ) : invPaged.map(r => (
                  <tr key={r.id} className="hover:bg-surface transition-colors cursor-pointer" onClick={() => navigate(`/invoices/${r.id}`, { state: { from: '/approvals' } })}>
                    <td className="px-4 py-3 text-ink2 whitespace-nowrap">{r.invoice_number}</td>
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{r.supplier_invoice_number}</td>
                    <td className="px-4 py-3 text-ink2 max-w-[260px] truncate" title={r.suppliers?.name}>{r.suppliers?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-ink2 whitespace-nowrap">{r.purchase_orders?.po_number ?? '-'}</td>
                    <td className="px-4 py-3"><span className={`badge ${MATCH_BADGE[r.match_status] ?? 'badge-neutral'}`}>{t.invoices.matchSt[r.match_status as keyof typeof t.invoices.matchSt] ?? r.match_status}</span></td>
                    <td className="px-4 py-3"><PersonCell name={nameOf(r.created_by)} /></td>
                    {isAdmin && <td className="px-4 py-3"><PersonCell name={nameOf(currentApprover(r))} /></td>}
                    <td className="px-4 py-3 text-ink whitespace-nowrap">{r.due_date ? format(new Date(r.due_date + 'T00:00:00'), 'dd.MM.yyyy') : '-'}</td>
                    <td className="px-4 py-3 text-right text-ink whitespace-nowrap tabular-nums">{fmt(Number(r.total_amount), company?.currency)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                        <RowMenu items={[{ label: a.review, icon: Eye, onClick: () => navigate(`/invoices/${r.id}`, { state: { from: '/approvals' } }) }]} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Pagination total={invFiltered.length} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={handlePageSizeChange} />
          </div>
        </>
      )}
    </div>
  )
}
