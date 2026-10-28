import { useEffect, useState } from 'react'
import { Upload, Plus, Search, Pencil, MapPin, Building, Globe, CircleDot } from 'lucide-react'
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
import type { Location } from '../types/database'
import { useLanguage } from '../hooks/useLanguage'
import { useRequired } from '../lib/useRequired'
import { dbError } from '../lib/dbError'
import { USAGE, loadUsage, usageFor, recheckUsage, isUsed, usageMessage, type UsageMaps } from '../lib/usage'
import GridHead from '../components/ui/GridHead'
import { matchesSearch } from '../lib/search'
import StatusSelect from '../components/ui/StatusSelect'
import { localizeCountry } from '../lib/countries'

const EMPTY: Partial<Location> = { name: '', address_street: '', address_city: '', address_postal_code: '', address_country: '', status: 'active' }

export default function LocationsPage() {
  const { company } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.locations
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const req = useRequired(t.common.fieldRequired)
  const [importOpen, setImportOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Location>>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Location | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [usage, setUsage] = useState<UsageMaps>({})

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    if (!company) return
    setLoading(true)
    const [{ data }, usageMaps] = await Promise.all([
      supabase.from('locations').select('*').eq('company_id', company.id).order('name'),
      loadUsage(company.id, USAGE.location),
    ])
    setLocations(data ?? [])
    setUsage(usageMaps)
    setLoading(false)
  }

  function openNew() { req.reset(); setEditing({ ...EMPTY }); setModalOpen(true) }
  function openEdit(l: Location) { req.reset(); setEditing({ ...l }); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing(EMPTY) }

  function field(key: keyof Location) {
    return { value: (editing[key] as string) ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => { req.clear(key); setEditing(f => ({ ...f, [key]: e.target.value })) }, error: req.errors[key] }
  }

  async function save() {
    if (!company) return
    if (!req.check(editing as Record<string, unknown>, ['name', 'address_street', 'address_city', 'address_postal_code', 'address_country'],
      { name: 'l-name', address_street: 'l-street', address_city: 'l-city', address_postal_code: 'l-postal', address_country: 'l-country' })) return
    setSaving(true)
    if (editing.id) {
      const { error } = await supabase.from('locations').update({ ...editing, updated_at: new Date().toISOString() }).eq('id', editing.id)
      if (error) { toast.error(dbError(error, t)); setSaving(false); return }
      toast.success(t.common.saved)
    } else {
      const { error } = await supabase.from('locations').insert({ ...editing, company_id: company.id, status: 'active' })
      if (error) { toast.error(dbError(error, t)); setSaving(false); return }
      toast.success(t.common.saved)
    }
    setSaving(false); closeModal(); load()
  }

  async function handleDelete(l: Location) {
    setActionLoading(true)
    const fresh = await recheckUsage(USAGE.location, l.id)
    if (isUsed(fresh)) {
      setActionLoading(false); setConfirmDelete(null)
      toast.error(usageMessage(t, fresh, t.common.deactivateInstead)); load(); return
    }
    const { error } = await supabase.from('locations').delete().eq('id', l.id)
    setActionLoading(false); setConfirmDelete(null)
    if (error) { toast.error(dbError(error, t)); return }
    toast.success(t.common.deleted); load()
  }

  const filtered = locations.filter(l => {
    return matchesSearch(search, [l.name, l.address_street, l.address_postal_code, l.address_city, l.address_country, localizeCountry(l.address_country, lang)])
      && (statusFilter === 'all' || l.status === statusFilter)
  })

  useEffect(() => { setPage(1) }, [search, statusFilter])
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)
  function handlePageSizeChange(n: number) { setPageSize(n); setPage(1) }

  useHeaderCounts(loading ? [] : [{ value: filtered.length }])

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached actions={<><Button variant="secondary" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" />{t.common.import.button}</Button><Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button></>}>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-filter-label" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.common.search + '…'}
            className="w-full pl-9 pr-4 h-9 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:border-field-hover bg-white text-ink placeholder:text-filter-label" />
        </div>
        <FilterSelect label={t.filters.labels.status} value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}>
          {(['all', 'active', 'inactive'] as const).map(v => <option key={v} value={v}>{v === 'all' ? t.common.all : v === 'active' ? t.common.activeFPl : t.common.inactiveFPl}</option>)}
        </FilterSelect>
      </PageToolbar>

      <div className="data-card table-bleed table-grid bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
            <GridHead cols={[[t.common.name, MapPin], [t.common.city, Building], [t.common.country, Globe], [t.common.status, CircleDot], ['']]} />
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={MapPin} colSpan={5} title={search ? t.common.empty.noResults.title : t.common.empty.locations.title} subtitle={search ? t.common.empty.noResults.text : t.common.empty.locations.text} />
              ) : paginated.map(l => (
                <tr key={l.id} className="hover:bg-surface transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{l.name}</td>
                  <td className="px-4 py-3 text-ink2">{l.address_city ?? '—'}</td>
                  <td className="px-4 py-3 text-ink2">{localizeCountry(l.address_country, lang) || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${l.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>{l.status === 'active' ? t.common.activeF : t.common.inactiveF}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end"><RowMenu items={[{ label: t.common.editEntity, icon: Pencil, onClick: () => openEdit(l) }]} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={handlePageSizeChange} />
      </div>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} title={t.common.import.title}
        templateName="locations"
        columns={[
          { key: 'name', label: t.common.import.cols.name, required: true, example: 'Hotel Jezero' },
          { key: 'street', label: t.common.import.cols.street, required: true, example: 'Cesta 1' },
          { key: 'postalCode', label: t.common.import.cols.postalCode, required: true, example: '4264' },
          { key: 'city', label: t.common.import.cols.city, required: true, example: 'Bohinjsko jezero' },
          { key: 'country', label: t.common.import.cols.country, required: true, example: 'Slovenija' },
        ]}
        existing={new Set(locations.map(l => l.name.toLowerCase()))}
        keyOf={row => row.name.toLowerCase()}
        onImport={async rows => {
          const { error } = await supabase.from('locations').insert(rows.map(r => ({
            company_id: company!.id, name: r.name, status: 'active',
            address_street: r.street || null, address_postal_code: r.postalCode || null,
            address_city: r.city || null, address_country: r.country || null,
          })))
          if (error) throw error
          load()
        }} />

      <Modal open={modalOpen} onClose={closeModal} title={editing.id ? s.edit : s.new} size="md" icon={MapPin}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><Input id="l-name" placeholder={t.common.ph.locationName} label={s.locationName + " *"} {...field('name')} /></div>
          <div className="sm:col-span-2"><Input id="l-street" placeholder={t.common.ph.street} label={t.common.streetAddress + ' *'} {...field('address_street')} /></div>
          <Input id="l-city" placeholder={t.common.ph.city} label={t.common.city + ' *'} {...field('address_city')} />
          <Input id="l-postal" placeholder={t.common.ph.postal} label={t.common.postalCode + ' *'} {...field('address_postal_code')} />
          <div className="sm:col-span-2"><CountrySelect id="l-country" label={t.common.country} required value={editing.address_country ?? ''} onChange={v => { req.clear('address_country'); setEditing(f => ({ ...f, address_country: v })) }} error={req.errors.address_country} /></div>

          {editing.id && (
          <StatusSelect active={editing.status === 'active'} activeLabel={t.common.statusActiveF} inactiveLabel={t.common.statusInactiveF}
            onChange={on => setEditing(f => ({ ...f, status: on ? 'active' : 'inactive' }))} />
        )}
        </div>
        <ModalFooter onCancel={closeModal} onSave={save} saving={saving} saveLabel={editing.id ? t.common.saveChanges : s.new}
          onDelete={editing.id ? () => { const target = editing as Location; closeModal(); setConfirmDelete(target) } : undefined}
          deleteBlocked={editing.id && isUsed(usageFor(usage, editing.id)) ? s.deleteBlockedMsg : null} />
      </Modal>

      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title={s.deleteTitle} message={s.deleteQuestion} name={confirmDelete?.name ?? ''} danger loading={actionLoading} confirmLabel={t.common.deleteEntity} />
    </div>
  )
}
