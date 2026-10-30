import { useEffect, useState } from 'react'
import { Upload, Plus, Search, Pencil, Building2, IdCard, User, Mail, Phone, CalendarClock, CircleDot } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { toast } from '../components/ui/Toast'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import RowMenu from '../components/ui/RowMenu'
import ModalFooter from '../components/ui/ModalFooter'
import Input from '../components/ui/Input'
import CountrySelect from '../components/ui/CountrySelect'
import Pagination from '../components/ui/Pagination'
import ImportModal from '../components/ui/ImportModal'
import PageToolbar from '../components/layout/PageToolbar'
import { useHeaderCounts } from '../components/layout/HeaderCounts'
import FilterSelect from '../components/ui/FilterSelect'
import TableEmptyState from '../components/ui/TableEmptyState'
import PersonCell from '../components/ui/PersonCell'
import type { Supplier } from '../types/database'
import { useLanguage } from '../hooks/useLanguage'
import { useRequired } from '../lib/useRequired'
import { dbError } from '../lib/dbError'
import { USAGE, loadUsage, usageFor, recheckUsage, isUsed, usageMessage, type UsageMaps } from '../lib/usage'
import { matchesSearch } from '../lib/search'
import StatusSelect from '../components/ui/StatusSelect'
import Select from '../components/ui/Select'
import { incotermOptions } from '../lib/incoterms'
import ExportButton from '../components/ui/ExportButton'
import type { ExportColumn } from '../lib/exportExcel'
import { localizeCountry } from '../lib/countries'

/** Duplicate keys of a supplier: its name and (when set) its VAT number, ignoring case and spaces. */
const dupKeys = (name: string, vat?: string | null) => [`n:${name.trim().toLowerCase()}`, ...(vat?.trim() ? [`v:${vat.replace(/\s+/g, '').toUpperCase()}`] : [])]

const EMPTY: Partial<Supplier> = { name: '', contact_name: '', email: '', phone: '', vat_number: '', address_street: '', address_city: '', address_postal_code: '', address_country: '', payment_terms: '', incoterm: '', status: 'active' }

export default function SuppliersPage() {
  const { company } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const req = useRequired(t.common.fieldRequired)
  const [importOpen, setImportOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [sort, setSort] = useState<'name-asc' | 'name-desc' | 'number-asc' | 'number-desc' | 'created-desc' | 'created-asc'>('name-asc')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Supplier>>(EMPTY)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [usage, setUsage] = useState<UsageMaps>({})

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    if (!company) return
    // spinner only on the first load: later reloads refresh the data in place
    const [{ data }, usageMaps] = await Promise.all([
      supabase.from('suppliers').select('*').eq('company_id', company.id).order('name'),
      loadUsage(company.id, USAGE.supplier),
    ])
    setSuppliers(data ?? [])
    setUsage(usageMaps)
    setLoading(false)
  }

  function openNew() { req.reset(); setEditing({ ...EMPTY }); setModalOpen(true) }
  function openEdit(s: Supplier) { req.reset(); setEditing({ ...s }); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing(EMPTY) }

  function field(key: keyof Supplier) {
    return {
      value: (editing[key] as string) ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => { req.clear(key); setEditing(f => ({ ...f, [key]: e.target.value })) },
      error: req.errors[key],
    }
  }

  async function save() {
    if (!company) return
    if (!req.check(editing as Record<string, unknown>, ['name', 'vat_number', 'address_street', 'address_city', 'address_postal_code', 'address_country'],
      { name: 's-name', vat_number: 's-vat', address_street: 's-street', address_city: 's-city', address_postal_code: 's-postal', address_country: 's-country' })) return
    setSaving(true)
    if (editing.id) {
      const { error } = await supabase.from('suppliers').update({ ...editing, updated_at: new Date().toISOString() }).eq('id', editing.id)
      if (error) { toast.error(dbError(error, t)); setSaving(false); return }
      toast.success(t.common.saved)
    } else {
      const { error } = await supabase.from('suppliers').insert({ ...editing, company_id: company.id, status: 'active' })
      if (error) { toast.error(dbError(error, t)); setSaving(false); return }
      toast.success(t.common.saved)
    }
    setSaving(false); closeModal(); load()
  }

  async function handleDelete(s: Supplier) {
    setActionLoading(true)
    const fresh = await recheckUsage(USAGE.supplier, s.id)
    if (isUsed(fresh)) {
      setActionLoading(false); setConfirmDelete(null)
      toast.error(usageMessage(t, fresh, t.common.setInactiveInstead))
      load()
      return
    }
    const { error } = await supabase.from('suppliers').delete().eq('id', s.id)
    setActionLoading(false); setConfirmDelete(null)
    if (error) { toast.error(dbError(error, t)); return }
    toast.success(t.common.deleted); load()
  }

  useEffect(() => { setPage(1) }, [search, statusFilter, sort])

  const filtered = suppliers.filter(s => {
    const matchSearch = matchesSearch(search, [s.supplier_number, s.name, s.vat_number, s.contact_name, s.email, s.phone, s.payment_terms])
    const matchStatus = statusFilter === 'all' || s.status === statusFilter
    return matchSearch && matchStatus
  })
  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.endsWith('desc') ? -1 : 1
    if (sort.startsWith('created')) return dir * a.created_at.localeCompare(b.created_at)
    return dir * (sort.startsWith('number') ? Number(a.supplier_number) - Number(b.supplier_number) : a.name.localeCompare(b.name, 'sl', { sensitivity: 'base' }))
  })
  const exportCols: ExportColumn<Supplier>[] = [
    { header: s.number, get: x => x.supplier_number, kind: 'text', width: 10 },
    { header: t.common.name, get: x => x.name, kind: 'text', width: 36 },
    { header: s.vatNumber, get: x => x.vat_number, kind: 'text', width: 16 },
    { header: s.contact, get: x => x.contact_name, kind: 'text', width: 22 },
    { header: t.common.email, get: x => x.email, kind: 'text', width: 34 },
    { header: t.common.phone, get: x => x.phone, kind: 'text', width: 18 },
    { header: t.common.streetAddress, get: x => x.address_street, kind: 'text', width: 26 },
    { header: t.common.postalCode, get: x => x.address_postal_code, kind: 'text', width: 12 },
    { header: t.common.city, get: x => x.address_city, kind: 'text', width: 20 },
    { header: t.common.country, get: x => localizeCountry(x.address_country, lang), kind: 'text', width: 14 },
    { header: s.paymentTerms, get: x => x.payment_terms, kind: 'text', width: 16 },
    { header: s.incoterm, get: x => x.incoterm, kind: 'text', width: 10 },
    { header: t.common.status, get: x => (x.status === 'active' ? t.common.active : t.common.inactive), kind: 'text', width: 12 },
    { header: t.common.created, get: x => x.created_at, kind: 'date', width: 14 },
  ]
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize)
  function handlePageSizeChange(n: number) { setPageSize(n); setPage(1) }

  useHeaderCounts(loading ? [] : [{ value: filtered.length }])

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached actions={<><ExportButton fileName="dobavitelji" columns={exportCols} rows={sorted} /><Button variant="secondary" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" />{t.common.import.button}</Button><Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button></>}>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-filter-label" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.common.search + '…'}
            className="w-full pl-9 pr-4 h-9 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:border-field-hover bg-white text-ink placeholder:text-filter-label" />
        </div>
        <FilterSelect label={t.filters.labels.sort} value={sort} defaultValue="name-asc" onChange={e => setSort(e.target.value as typeof sort)}>
          <option value="name-asc">{s.sortNameAsc}</option>
          <option value="name-desc">{s.sortNameDesc}</option>
          <option value="number-asc">{s.sortNumberAsc}</option>
          <option value="number-desc">{s.sortNumberDesc}</option>
          <option value="created-desc">{t.sort.newest}</option>
          <option value="created-asc">{t.sort.oldest}</option>
        </FilterSelect>
        <FilterSelect label={t.filters.labels.status} value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}>
          {(['all', 'active', 'inactive'] as const).map(v => <option key={v} value={v}>{v === 'all' ? t.common.allM : v === 'active' ? t.common.activeM : t.common.inactiveM}</option>)}
        </FilterSelect>
      </PageToolbar>

      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[760px]">
            <thead className="bg-surface border-b border-field">
              <tr>
                {([[s.number, IdCard], [t.common.name, Building2], [s.contact, User], [t.common.email, Mail], [t.common.phone, Phone], [s.paymentTerms, CalendarClock], [t.common.status, CircleDot], ['', null]] as const).map(([h, Icon], i) => (
                  <th key={i} className="text-left whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">{Icon && <Icon className="w-3.5 h-3.5 text-icon" strokeWidth={1.75} />}{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={Building2} colSpan={8} title={search ? t.common.empty.noResults.title : t.common.empty.suppliers.title} subtitle={search ? t.common.empty.noResults.text : t.common.empty.suppliers.text} />
              ) : paginated.map(s => (
                <tr key={s.id} className="hover:bg-surface transition-colors">
                  <td className="px-4 py-3 text-ink2 whitespace-nowrap">{s.supplier_number}</td>
                  <td className="px-4 py-3 font-medium text-ink">
                    {s.name}
                    {s.vat_number && <span className="ml-2 text-xs text-gray-400">{s.vat_number}</span>}
                  </td>
                  <td className="px-4 py-3"><PersonCell name={s.contact_name} /></td>
                  <td className="px-4 py-3">{s.email ? <a href={`mailto:${s.email}`} className="cell-chip cell-chip-link">{s.email}</a> : <span className="text-ink2">—</span>}</td>
                  <td className="px-4 py-3 text-ink2">{s.phone ?? '—'}</td>
                  <td className="px-4 py-3">{s.payment_terms ? <span className="cell-chip">{s.payment_terms}</span> : <span className="text-ink2">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${s.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>{s.status === 'active' ? t.common.active : t.common.inactive}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end"><RowMenu items={[{ label: t.common.editEntity, icon: Pencil, onClick: () => openEdit(s) }]} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={handlePageSizeChange} />
      </div>

      {/* Create / Edit Modal */}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} title={t.common.import.title}
        templateName="suppliers"
        columns={[
          { key: 'name', label: t.common.import.cols.name, required: true, example: 'Mesarija Kranjc d.o.o.' },
          { key: 'vat', label: t.common.import.cols.vat, example: 'SI12345678' },
          { key: 'contact', label: t.common.import.cols.contact, example: 'Janez Novak' },
          { key: 'email', label: t.common.import.cols.email, example: 'info@dobavitelj.si' },
          { key: 'phone', label: t.common.import.cols.phone, example: '+386 40 123 456' },
          { key: 'street', label: t.common.import.cols.street, example: 'Cesta 1' },
          { key: 'postalCode', label: t.common.import.cols.postalCode, example: '4000' },
          { key: 'city', label: t.common.import.cols.city, example: 'Kranj' },
          { key: 'country', label: t.common.import.cols.country, example: 'Slovenija' },
          { key: 'paymentTerms', label: t.common.import.cols.paymentTerms, example: '30 dni' },
          { key: 'incoterm', label: t.common.import.cols.incoterm, example: 'DAP' },
        ]}
        duplicateRule="nameVat" keyLabels={{ n: t.common.name.toLowerCase(), v: s.vatNumber.toLowerCase() }}
        existing={new Set(suppliers.flatMap(x => dupKeys(x.name, x.vat_number)))}
        keyOf={row => dupKeys(row.name, row.vat)}
        validate={row => row.email && !/^\S+@\S+\.\S+$/.test(row.email) ? t.common.import.invalidEmail + ': ' + row.email : null}
        onImport={async rows => {
          const { error } = await supabase.from('suppliers').insert(rows.map(r => ({
            company_id: company!.id, name: r.name, status: 'active',
            vat_number: r.vat || null, contact_name: r.contact || null, email: r.email || null, phone: r.phone || null,
            address_street: r.street || null, address_postal_code: r.postalCode || null,
            address_city: r.city || null, address_country: r.country || null,
            payment_terms: r.paymentTerms || null, incoterm: r.incoterm || null,
          })))
          if (error) throw error
          load()
        }} />

      <Modal open={modalOpen} onClose={closeModal} title={editing.id ? s.edit : s.new} size="lg" icon={Building2}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><Input id="s-name" placeholder={t.common.ph.companyName} label={s.companyName + ' *'} {...field('name')} /></div>
          <div className="sm:col-span-2"><Input id="s-vat" placeholder={t.common.ph.vat} label={s.vatNumber + ' *'} {...field('vat_number')} /></div>
          <div className="sm:col-span-2"><Input id="s-street" placeholder={t.common.ph.street} label={t.common.streetAddress + ' *'} {...field('address_street')} /></div>
          <Input id="s-postal" placeholder={t.common.ph.postal} label={t.common.postalCode + ' *'} {...field('address_postal_code')} />
          <Input id="s-city" placeholder={t.common.ph.city} label={t.common.city + ' *'} {...field('address_city')} />
          <CountrySelect id="s-country" label={t.common.country} required value={editing.address_country ?? ''} onChange={v => { req.clear('address_country'); setEditing(f => ({ ...f, address_country: v })) }} error={req.errors.address_country} />
          <Input id="s-contact" placeholder={t.common.ph.contact} label={s.contactName} {...field('contact_name')} />
          <Input id="s-email" placeholder={t.common.ph.email} label={t.common.email} type="email" {...field('email')} />
          <Input id="s-phone" placeholder={t.common.ph.phone} label={t.common.phone} {...field('phone')} />
          <Input id="s-terms" label={s.paymentTerms} placeholder={t.common.ph.paymentTerms} {...field('payment_terms')} />
          <Select id="s-incoterm" label={s.incoterm} value={editing.incoterm ?? ''} onChange={v => setEditing(f => ({ ...f, incoterm: v }))} options={incotermOptions(editing.incoterm)} />

          {/* Status toggle — only shown when editing */}
          {editing.id && (
          <StatusSelect active={editing.status === 'active'} activeLabel={t.common.statusActive} inactiveLabel={t.common.statusInactive}
            onChange={on => setEditing(f => ({ ...f, status: on ? 'active' : 'inactive' }))} />
        )}
        </div>

        <ModalFooter onCancel={closeModal} onSave={save} saving={saving} saveLabel={editing.id ? t.common.saveChanges : s.new}
          onDelete={editing.id ? () => { const target = editing as Supplier; closeModal(); setConfirmDelete(target) } : undefined}
          deleteBlocked={editing.id && isUsed(usageFor(usage, editing.id)) ? s.deleteBlockedMsg : null} />
      </Modal>

      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title={s.deleteTitle} message={s.deleteQuestion} name={confirmDelete?.name ?? ''} danger loading={actionLoading} confirmLabel={t.common.deleteEntity} />
    </div>
  )
}
