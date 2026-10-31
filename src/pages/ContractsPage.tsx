import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Plus, Search, Pencil, IdCard, FileSignature, Building2, CircleDot, CalendarClock, Timer, Coins, User, RefreshCw, Paperclip } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { toast } from '../components/ui/Toast'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import ContractFormModal from '../components/contracts/ContractFormModal'
import Pagination from '../components/ui/Pagination'
import PageToolbar from '../components/layout/PageToolbar'
import { useHeaderCounts } from '../components/layout/HeaderCounts'
import FilterSelect from '../components/ui/FilterSelect'
import TableEmptyState from '../components/ui/TableEmptyState'
import type { Contract } from '../types/database'
import { useLanguage } from '../hooks/useLanguage'
import { dbError } from '../lib/dbError'
import { closingDate, daysUntil, deleteContractCompletely, effectiveStatus, STATUS_BADGE, type EffectiveStatus } from '../lib/contracts'
import PersonCell from '../components/ui/PersonCell'
import GridHead from '../components/ui/GridHead'
import RowMenu from '../components/ui/RowMenu'
import { matchesSearch } from '../lib/search'
import SortFilter from '../components/ui/SortFilter'
import { applySort, text, num, date, dateLast, rev, docNumber, type SortDef } from '../lib/sort'
import ImportModal from '../components/ui/ImportModal'
import ExportButton from '../components/ui/ExportButton'
import type { ExportColumn } from '../lib/exportExcel'

interface Row extends Contract { suppliers: { name: string; payment_terms: string | null } | null }
interface Person { id: string; first_name: string; last_name: string }

const contractKey = (supplier: string, title: string) => `${supplier.trim().toLowerCase()}›${title.trim().toLowerCase()}`
/** dd.mm.yyyy, yyyy-mm-dd, or whatever Date understands -> yyyy-mm-dd (null when it isn't a date). */
function parseDate(v: string): string | null {
  const t = v.trim()
  let m = t.match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const toNumber = (v: string) => Number(v.replace(/\s/g, '').includes(',') ? v.replace(/\s/g, '').replace(/\./g, '').replace(',', '.') : v.replace(/\s/g, ''))
const parseStatus = (v: string): 'draft' | 'active' | 'terminated' => /^(aktiv|veljav|active)/i.test(v.trim()) ? 'active' : /^(prekin|terminated)/i.test(v.trim()) ? 'terminated' : 'draft'

const fmtDate = (d: string | null) => (d ? format(new Date(d + 'T00:00:00'), 'dd.MM.yyyy') : null)

export default function ContractsPage() {
  const { company, profile, isAdmin, hasPerm } = useCompany()
  const { t } = useLanguage()
  const s = t.contracts
  const navigate = useNavigate()
  const canEdit = isAdmin || hasPerm('purchase_orders', 'create')
  const currency = company?.currency ?? 'EUR'
  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

  const [rows, setRows] = useState<Row[]>([])
  const [spent, setSpent] = useState<Map<string, number>>(new Map())
  const [orderCount, setOrderCount] = useState<Map<string, number>>(new Map())
  const [docCount, setDocCount] = useState<Map<string, number>>(new Map())
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; payment_terms: string | null }[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [sort, setSort] = useState('newest')
  useEffect(() => { setPage(1) }, [sort])
  const [statusFilter, setStatusFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [expiresFilter, setExpiresFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Row | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null)

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    if (!company) return
    // spinner only on the first load: later reloads refresh the data in place
    const [{ data: c }, { data: sup }, { data: us }, { data: pos }, { data: docs }] = await Promise.all([
      supabase.from('contracts').select('*, suppliers(name, payment_terms)').eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, name, payment_terms').eq('company_id', company.id).eq('status', 'active').order('name'),
      supabase.from('users').select('id, first_name, last_name').eq('company_id', company.id).order('first_name'),
      supabase.from('purchase_orders').select('contract_id, total_amount, status').eq('company_id', company.id).not('contract_id', 'is', null),
      supabase.from('contract_attachments').select('contract_id').eq('company_id', company.id),
    ])
    const dc = new Map<string, number>()
    for (const d of docs ?? []) dc.set(d.contract_id as string, (dc.get(d.contract_id as string) ?? 0) + 1)
    setDocCount(dc)
    setRows((c as Row[]) ?? [])
    setSuppliers(sup ?? [])
    setPeople(us ?? [])
    const sp = new Map<string, number>(); const cnt = new Map<string, number>()
    for (const p of pos ?? []) {
      const id = p.contract_id as string
      cnt.set(id, (cnt.get(id) ?? 0) + 1)
      if (['issued', 'sent', 'closed'].includes(p.status as string)) sp.set(id, (sp.get(id) ?? 0) + Number(p.total_amount ?? 0))
    }
    setSpent(sp); setOrderCount(cnt)
    setLoading(false)
  }

  function openNew() { setEditing(null); setModalOpen(true) }
  function openEdit(c: Row) { setEditing(c); setModalOpen(true) }

  async function handleDelete(c: Row) {
    const error = await deleteContractCompletely(c.id)
    setConfirmDelete(null)
    if (error) { toast.error(dbError(error, t)); return }
    toast.success(t.common.deleted); load()
  }

  const personName = (id: string | null) => { const p = people.find(x => x.id === id); return p ? `${p.first_name} ${p.last_name}` : '-' }
  const q = search.toLowerCase()
  const sortDefs: SortDef<(typeof rows)[number]>[] = [
    { value: 'newest', label: t.sort.newest, cmp: rev(date(c => c.created_at)) },
    { value: 'oldest', label: t.sort.oldest, cmp: date(c => c.created_at) },
    { value: 'numberAsc', label: t.sort.numberAsc, cmp: docNumber(c => c.contract_number) },
    { value: 'numberDesc', label: t.sort.numberDesc, cmp: rev(docNumber(c => c.contract_number)) },
    { value: 'endDate', label: t.sort.endDate, cmp: dateLast(c => c.end_date) },
    { value: 'valueDesc', label: t.sort.valueDesc, cmp: rev(num(c => c.total_value)) },
    { value: 'valueAsc', label: t.sort.valueAsc, cmp: num(c => c.total_value) },
    { value: 'title', label: t.sort.titleAsc, cmp: text(c => c.title) },
    { value: 'supplier', label: t.sort.supplierAsc, cmp: text(c => c.suppliers?.name) },
  ]
  const filtered = useMemo(() => rows.filter(c => {
    const st = effectiveStatus(c)
    if (!matchesSearch(search, [c.title, c.contract_number, c.suppliers?.name, personName(c.owner_id)])) return false
    if (statusFilter !== 'all' && st !== statusFilter) return false
    if (supplierFilter !== 'all' && c.supplier_id !== supplierFilter) return false
    if (expiresFilter !== 'all') {
      const d = daysUntil(c.end_date)
      if (expiresFilter === 'expired') { if (st !== 'expired') return false }
      else if (c.status !== 'active' || d == null || d < 0 || d > Number(expiresFilter)) return false
    }
    return true
  }), [rows, q, statusFilter, supplierFilter, expiresFilter])

  useEffect(() => { setPage(1) }, [search, statusFilter, supplierFilter, expiresFilter])
  const sortedRows = applySort(filtered, sortDefs, sort)
  const exportCols: ExportColumn<Row>[] = [
    { header: s.number, get: c => c.contract_number, kind: 'text', width: 12 },
    { header: s.contractTitle, get: c => c.title, kind: 'text', width: 44 },
    { header: s.supplier, get: c => c.suppliers?.name, kind: 'text', width: 34 },
    { header: s.status, get: c => s.st[effectiveStatus(c)], kind: 'text', width: 14 },
    { header: s.startDate, get: c => c.start_date, kind: 'date', width: 14 },
    { header: s.endDate, get: c => c.end_date, kind: 'date', width: 16 },
    { header: s.totalValue, get: c => c.total_value, kind: 'money', width: 16 },
    { header: s.spent, get: c => spent.get(c.id) ?? 0, kind: 'money', width: 14 },
    { header: s.noticeDays, get: c => c.notice_days, kind: 'number', width: 16 },
    { header: s.autoRenew, get: c => (c.auto_renew ? t.common.yes ?? 'Da' : ''), kind: 'text', width: 18 },
    { header: s.paymentTerms, get: c => c.payment_terms, kind: 'text', width: 16 },
    { header: s.owner, get: c => personName(c.owner_id), kind: 'text', width: 20 },
  ]
  const paginated = sortedRows.slice((page - 1) * pageSize, page * pageSize)
  const filtering = q !== '' || statusFilter !== 'all' || supplierFilter !== 'all' || expiresFilter !== 'all'
  useHeaderCounts(loading ? [] : [{ value: filtered.length }])

  const validity = (c: Row) => `${fmtDate(c.start_date)} - ${c.end_date ? fmtDate(c.end_date) : s.openEnded}`

  /** Days until the end date; the notice deadline is only on the contract page. */
  function remainingCell(c: Row) {
    const st = effectiveStatus(c)
    // a contract in notice ends on notice date + notice period
    const d = daysUntil(st === 'in_notice' ? closingDate(c) : c.end_date)
    if (st === 'expired') return <span className="text-ink2">{s.expiredOn}</span>
    if ((st !== 'active' && st !== 'expiring' && st !== 'in_notice') || d == null || d < 0) return <span className="text-ink2">-</span>
    return <span className="text-ink">{d} {s.daysShort}</span>
  }

  /** Spent / contract value, a slim progress bar and the share spent. */
  function valueCell(c: Row) {
    const used = spent.get(c.id) ?? 0
    if (c.total_value == null) return <span className="text-ink2">{used > 0 ? fmt(used) : '-'}</span>
    const pct = c.total_value > 0 ? Math.round((used / c.total_value) * 100) : 0
    const over = used > c.total_value
    return (
      <div className="flex items-center gap-3 whitespace-nowrap">
        <span className="tabular-nums text-ink">{fmt(used)} <span className="text-ink2">/ {fmt(c.total_value)}</span></span>
        <div className="w-12 h-1 rounded-full bg-selected overflow-hidden shrink-0"><div className={`h-full rounded-full ${over ? 'bg-danger' : 'bg-primary'}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
        <span className={`text-xs tabular-nums ${over ? 'text-danger' : 'text-ink2'}`}>{pct} %</span>
      </div>
    )
  }


  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached actions={<><ExportButton fileName="pogodbe" columns={exportCols} rows={sortedRows} />{canEdit && <><Button variant="secondary" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" />{t.common.import.button}</Button><Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button></>}</>}>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-filter-label" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.common.search + '…'}
            className="w-full pl-9 pr-4 h-9 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:border-field-hover bg-white text-ink placeholder:text-filter-label" />
        </div>
        <SortFilter defs={sortDefs} value={sort} onChange={setSort} />
        <FilterSelect label={s.status} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">{t.filters.allM}</option>
          {(['draft', 'active', 'expiring', 'in_notice', 'cancelled', 'expired', 'terminated'] as EffectiveStatus[]).map(v => <option key={v} value={v}>{s.st[v]}</option>)}
        </FilterSelect>
        <FilterSelect label={s.supplier} value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
          <option value="all">{t.filters.allM}</option>
          {suppliers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </FilterSelect>
        <FilterSelect label={s.expiresFilter} value={expiresFilter} onChange={e => setExpiresFilter(e.target.value)}>
          <option value="all">{t.filters.allM}</option>
          <option value="30">{s.in30}</option>
          <option value="60">{s.in60}</option>
          <option value="90">{s.in90}</option>
          <option value="expired">{s.expiredFilter}</option>
        </FilterSelect>
      </PageToolbar>

      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[1160px]">
            <GridHead cols={[[s.number, IdCard], [s.contractTitle, FileSignature], [s.supplier, Building2], [s.status, CircleDot], [s.validity, CalendarClock], [s.timeLeft, Timer], [`${s.spent} / ${s.totalValue}`, Coins], [s.owner, User], ['']]} />
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={FileSignature} colSpan={9}
                  title={filtering ? t.common.empty.noResults.title : t.common.empty.contracts.title}
                  subtitle={filtering ? t.common.empty.noResults.text : t.common.empty.contracts.text} />
              ) : paginated.map(c => {
                const st = effectiveStatus(c)
                return (
                  <tr key={c.id} className="hover:bg-surface transition-colors cursor-pointer" onClick={() => navigate(`/contracts/${c.id}`)}>
                    <td className="px-4 py-3 text-ink2 whitespace-nowrap">{c.contract_number}</td>
                    <td className="px-4 py-3 max-w-[300px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-medium text-ink truncate" title={c.title}>{c.title}</p>
                        {(docCount.get(c.id) ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-ink2 shrink-0" title={`${s.documents}: ${docCount.get(c.id)}`}>
                            <Paperclip className="w-3.5 h-3.5 text-icon" strokeWidth={1.75} />{docCount.get(c.id)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink2 max-w-[200px] truncate">{c.suppliers?.name ?? '-'}</td>
                    <td className="px-4 py-3"><span className={`badge ${STATUS_BADGE[st]}`}>{s.st[st]}</span></td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink">
                      <span className="inline-flex items-center gap-1.5">
                        {validity(c)}
                        {c.auto_renew && (
                          <span className="group relative inline-flex">
                            <RefreshCw className="w-3.5 h-3.5 text-icon shrink-0" strokeWidth={1.75} aria-label={s.autoRenew} />
                            <span role="tooltip" className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-20 whitespace-nowrap rounded-lg bg-ink px-3 py-1.5 text-[13px] leading-5 font-normal text-white shadow-[0_8px_30px_rgba(16,17,18,0.25)] opacity-0 transition-opacity group-hover:opacity-100">
                              {c.renewal_months ? `${s.autoRenew}: ${c.renewal_months} ${s.monthsShort}` : s.autoRenew}
                            </span>
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{remainingCell(c)}</td>
                    <td className="px-4 py-3">{valueCell(c)}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><PersonCell name={personName(c.owner_id)} /></td>
                    <td className="px-4 py-3">
                      {canEdit && (
                        <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                          <RowMenu items={[{ label: t.common.editEntity, icon: Pencil, onClick: () => openEdit(c) }]} />
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={n => { setPageSize(n); setPage(1) }} />
      </div>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} title={t.common.import.title}
        templateName="contracts" duplicateRule="contract"
        columns={[
          { key: 'number', label: s.number, example: 'POG-0001' },
          { key: 'title', label: s.contractTitle, required: true, example: 'Okvirna pogodba za dobavo mesa' },
          { key: 'supplier', label: s.supplier, required: true, example: 'Mesarija Kranjc d.o.o.' },
          { key: 'start', label: s.startDate, required: true, example: '01.01.2026' },
          { key: 'end', label: s.endDate, example: '31.12.2026' },
          { key: 'status', label: s.status, example: 'aktivna' },
          { key: 'value', label: s.totalValue, example: '24000' },
          { key: 'notice', label: s.noticeDays, example: '60' },
          { key: 'autoRenew', label: s.autoRenew, example: 'da' },
          { key: 'renewal', label: s.renewalMonths, example: '12' },
          { key: 'terms', label: s.paymentTerms, example: '30 dni' },
          { key: 'owner', label: s.owner, example: 'Janez Novak' },
          { key: 'description', label: s.description, example: '' },
        ]}
        existing={new Set(rows.flatMap(c => [contractKey(c.suppliers?.name ?? '', c.title), `#${c.contract_number.toUpperCase()}`]))}
        keyOf={row => [contractKey(row.supplier, row.title), ...(row.number ? [`#${row.number.trim().toUpperCase()}`] : [])]}
        validate={row => {
          if (!suppliers.some(x => x.name.toLowerCase() === row.supplier.toLowerCase())) return `${t.common.import.unknownSupplier}: ${row.supplier}`
          const start = parseDate(row.start)
          if (!start) return `${t.common.import.invalidDate}: ${row.start}`
          if (row.end) { const end = parseDate(row.end); if (!end) return `${t.common.import.invalidDate}: ${row.end}`; if (end < start) return `${s.endDate} < ${s.startDate}` }
          for (const v of [row.value, row.notice, row.renewal]) if (v && Number.isNaN(toNumber(v))) return `${t.common.import.invalidNumber}: ${v}`
          return null
        }}
        onImport={async list => {
          const sup = new Map(suppliers.map(x => [x.name.toLowerCase(), x.id]))
          const own = new Map(people.map(p => [`${p.first_name} ${p.last_name}`.toLowerCase(), p.id]))
          const { error } = await supabase.from('contracts').insert(list.map(r => ({
            company_id: company!.id, created_by: profile?.id ?? null, ...(r.number ? { contract_number: r.number.trim() } : {}),
            title: r.title, supplier_id: sup.get(r.supplier.toLowerCase())!, status: parseStatus(r.status),
            start_date: parseDate(r.start)!, end_date: r.end ? parseDate(r.end) : null,
            total_value: r.value ? toNumber(r.value) : null, notice_days: r.notice ? toNumber(r.notice) : null,
            auto_renew: /^(da|yes|true|1)$/i.test(r.autoRenew), renewal_months: r.renewal ? toNumber(r.renewal) : null,
            payment_terms: r.terms || null, owner_id: own.get(r.owner.toLowerCase()) ?? null, description: r.description || null,
          })))
          if (error) throw error
          load()
        }} />

      <ContractFormModal open={modalOpen} onClose={() => setModalOpen(false)} contract={editing} suppliers={suppliers} people={people} onSaved={load}
        onDelete={editing && isAdmin ? () => setConfirmDelete(editing) : undefined}
        deleteBlocked={editing && (orderCount.get(editing.id) ?? 0) > 0 ? s.deleteBlockedMsg : null} />

      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title={s.deleteTitle} message={s.deleteQuestion} name={confirmDelete ? `${confirmDelete.contract_number} · ${confirmDelete.title}` : ''} danger confirmLabel={t.common.deleteEntity} />
    </div>
  )
}
