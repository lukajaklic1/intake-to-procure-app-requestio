import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, ReceiptText, Building2, FileText, CalendarClock, Coins, Scale, CircleDot } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import Button from '../components/ui/Button'
import Pagination from '../components/ui/Pagination'
import PageToolbar from '../components/layout/PageToolbar'
import { useHeaderCounts } from '../components/layout/HeaderCounts'
import FilterSelect from '../components/ui/FilterSelect'
import TableEmptyState from '../components/ui/TableEmptyState'
import { INVOICE_BADGE, MATCH_BADGE, dueState, type InvoiceStatus } from '../lib/invoices'
import { daysUntil } from '../lib/contracts'
import GridHead from '../components/ui/GridHead'
import { matchesSearch } from '../lib/search'
import SortFilter from '../components/ui/SortFilter'
import { applySort, text, num, date, dateLast, rev, type SortDef } from '../lib/sort'

interface Row {
  id: string; created_at: string; invoice_number: string; supplier_invoice_number: string; supplier_id: string; po_id: string | null
  invoice_date: string; due_date: string | null; total_amount: number; status: InvoiceStatus; match_status: string
  suppliers: { name: string } | null; purchase_orders: { po_number: string } | null
}

const fmtDate = (d: string | null) => (d ? format(new Date(d + 'T00:00:00'), 'dd.MM.yyyy') : '—')

export default function InvoicesPage() {
  const { company, isAdmin, hasPerm } = useCompany()
  const { t } = useLanguage()
  const s = t.invoices
  const navigate = useNavigate()
  const canCreate = isAdmin || hasPerm('invoices', 'create')
  const currency = company?.currency ?? 'EUR'
  const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)

  const [rows, setRows] = useState<Row[]>([])
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('invoiceDesc')
  useEffect(() => { setPage(1) }, [sort])
  const [statusFilter, setStatusFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [matchFilter, setMatchFilter] = useState('all')
  const [dueFilter, setDueFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    if (!company) return
    ;(async () => {
      // spinner only on the first load: later reloads refresh the data in place
      const [{ data }, { data: sup }] = await Promise.all([
        supabase.from('invoices').select('id, created_at, invoice_number, supplier_invoice_number, supplier_id, po_id, invoice_date, due_date, total_amount, status, match_status, suppliers(name), purchase_orders(po_number)').eq('company_id', company.id).order('invoice_date', { ascending: false }),
        supabase.from('suppliers').select('id, name').eq('company_id', company.id).order('name'),
      ])
      setRows((data as unknown as Row[]) ?? [])
      setSuppliers(sup ?? [])
      setLoading(false)
    })()
  }, [company])

  const q = search.toLowerCase()
  const sortDefs: SortDef<(typeof rows)[number]>[] = [
    { value: 'invoiceDesc', label: t.sort.invoiceDateDesc, cmp: rev(date(r => r.invoice_date)) },
    { value: 'invoiceAsc', label: t.sort.invoiceDateAsc, cmp: date(r => r.invoice_date) },
    { value: 'newest', label: t.sort.newest, cmp: rev(date(r => r.created_at)) },
    { value: 'oldest', label: t.sort.oldest, cmp: date(r => r.created_at) },
    { value: 'amountDesc', label: t.sort.amountDesc, cmp: rev(num(r => r.total_amount)) },
    { value: 'amountAsc', label: t.sort.amountAsc, cmp: num(r => r.total_amount) },
    { value: 'dueDate', label: t.sort.dueDate, cmp: dateLast(r => r.due_date) },
    { value: 'supplier', label: t.sort.supplierAsc, cmp: text(r => r.suppliers?.name) },
  ]
  const filtered = useMemo(() => rows.filter(r => {
    if (!matchesSearch(search, [r.supplier_invoice_number, r.invoice_number, r.suppliers?.name, r.purchase_orders?.po_number])) return false
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (supplierFilter !== 'all' && r.supplier_id !== supplierFilter) return false
    if (matchFilter !== 'all' && r.match_status !== matchFilter) return false
    if (dueFilter !== 'all') {
      if (r.status === 'paid' || r.status === 'rejected') return false
      const d = daysUntil(r.due_date)
      if (dueFilter === 'overdue' ? !(d != null && d < 0) : !(d != null && d >= 0 && d <= Number(dueFilter))) return false
    }
    return true
  }), [rows, q, statusFilter, supplierFilter, matchFilter, dueFilter])

  useEffect(() => { setPage(1) }, [search, statusFilter, supplierFilter, matchFilter, dueFilter])
  const paged = applySort(filtered, sortDefs, sort).slice((page - 1) * pageSize, page * pageSize)
  const filtering = q !== '' || statusFilter !== 'all' || supplierFilter !== 'all' || matchFilter !== 'all' || dueFilter !== 'all'
  useHeaderCounts(loading ? [] : [{ value: filtered.length }])

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached actions={canCreate ? <Button onClick={() => navigate('/invoices/new')} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button> : undefined}>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-filter-label" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.common.search + '…'}
            className="w-full pl-9 pr-4 h-9 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:border-field-hover bg-white text-ink placeholder:text-filter-label" />
        </div>
        <SortFilter defs={sortDefs} value={sort} onChange={setSort} />
        <FilterSelect label={s.status} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">{t.filters.allM}</option>
          {(['draft', 'in_review', 'approved', 'rejected', 'paid'] as InvoiceStatus[]).map(v => <option key={v} value={v}>{s.st[v]}</option>)}
        </FilterSelect>
        <FilterSelect label={s.supplier} value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
          <option value="all">{t.filters.allM}</option>
          {suppliers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </FilterSelect>
        <FilterSelect label={s.match} value={matchFilter} onChange={e => setMatchFilter(e.target.value)}>
          <option value="all">{t.filters.allM}</option>
          {(['matched', 'mismatch', 'unmatched'] as const).map(v => <option key={v} value={v}>{s.matchSt[v]}</option>)}
        </FilterSelect>
        <FilterSelect label={s.due} value={dueFilter} onChange={e => setDueFilter(e.target.value)}>
          <option value="all">{s.dueAll}</option>
          <option value="overdue">{s.dueOverdue}</option>
          <option value="7">{s.due7}</option>
          <option value="30">{s.due30}</option>
        </FilterSelect>
      </PageToolbar>

      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[980px]">
            <GridHead cols={[[s.invoiceNo, ReceiptText], [s.supplier, Building2], [s.po, FileText], [s.invoiceDate, CalendarClock], [s.dueDate, CalendarClock], [s.amount, Coins, 'right'], [s.match, Scale], [s.status, CircleDot]]} />
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={ReceiptText} colSpan={8}
                  title={filtering ? t.common.empty.noResults.title : t.common.empty.invoices.title}
                  subtitle={filtering ? t.common.empty.noResults.text : t.common.empty.invoices.text} />
              ) : paged.map(r => {
                const ds = dueState(r)
                return (
                  <tr key={r.id} className="hover:bg-surface transition-colors cursor-pointer" onClick={() => navigate(`/invoices/${r.id}`)}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{r.supplier_invoice_number}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{r.invoice_number}</p>
                    </td>
                    <td className="px-4 py-3 text-ink2 max-w-[220px] truncate">{r.suppliers?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-ink2">{r.purchase_orders?.po_number ?? '—'}</td>
                    <td className="px-4 py-3 text-ink2 whitespace-nowrap">{fmtDate(r.invoice_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-sm text-ink2">{fmtDate(r.due_date)}</p>
                      {ds === 'overdue' && <p className="text-xs text-danger mt-0.5">{s.overdue}</p>}
                      {ds === 'soon' && <p className="text-xs text-warn mt-0.5">{s.dueSoon}</p>}
                    </td>
                    <td className="px-4 py-3 text-right text-ink whitespace-nowrap">{money(Number(r.total_amount))}</td>
                    <td className="px-4 py-3"><span className={`badge ${MATCH_BADGE[r.match_status] ?? 'badge-neutral'}`}>{s.matchSt[r.match_status as keyof typeof s.matchSt] ?? r.match_status}</span></td>
                    <td className="px-4 py-3"><span className={`badge ${INVOICE_BADGE[r.status]}`}>{s.st[r.status]}</span></td>
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
