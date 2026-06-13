import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, MapPin } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { toast } from '../components/ui/Toast'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Pagination from '../components/ui/Pagination'
import type { Location } from '../types/database'
import { useLanguage } from '../hooks/useLanguage'
import { stLokacij } from '../utils/pluralize'

const PAGE_SIZE = 20

const EMPTY: Partial<Location> = { name: '', address_street: '', address_city: '', address_postal_code: '', address_country: '', status: 'active' }

export default function LocationsPage() {
  const { company } = useCompany()
  const { t } = useLanguage()
  const s = t.locations
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Location>>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Location | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    if (!company) return
    setLoading(true)
    const { data } = await supabase.from('locations').select('*').eq('company_id', company.id).order('name')
    setLocations(data ?? [])
    setLoading(false)
  }

  function openNew() { setEditing({ ...EMPTY }); setModalOpen(true) }
  function openEdit(l: Location) { setEditing({ ...l }); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing(EMPTY) }

  function field(key: keyof Location) {
    return { value: (editing[key] as string) ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setEditing(f => ({ ...f, [key]: e.target.value })) }
  }

  async function save() {
    if (!company || !editing.name?.trim()) { toast.error('Ime lokacije je obvezno'); return }
    if (!editing.address_street?.trim()) { toast.error('Ulica je obvezna'); return }
    if (!editing.address_city?.trim()) { toast.error('Kraj je obvezen'); return }
    setSaving(true)
    if (editing.id) {
      const { error } = await supabase.from('locations').update({ ...editing, updated_at: new Date().toISOString() }).eq('id', editing.id)
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success(t.common.saved)
    } else {
      const { error } = await supabase.from('locations').insert({ ...editing, company_id: company.id, status: 'active' })
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success(t.common.saved)
    }
    setSaving(false); closeModal(); load()
  }

  async function handleDelete(l: Location) {
    setActionLoading(true)
    const { count } = await supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).eq('location_id', l.id)
    if ((count ?? 0) > 0) {
      setActionLoading(false); setConfirmDelete(null)
      toast.error(`Cannot delete — used on ${count} PO(s). Deactivate instead.`); return
    }
    const { error } = await supabase.from('locations').delete().eq('id', l.id)
    setActionLoading(false); setConfirmDelete(null)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.deleted); load()
  }

  const filtered = locations.filter(l => {
    const q = search.toLowerCase()
    return (l.name.toLowerCase().includes(q) || (l.address_city ?? '').toLowerCase().includes(q))
      && (statusFilter === 'all' || l.status === statusFilter)
  })

  useEffect(() => { setPage(1) }, [search, statusFilter])
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{s.title}</h1>
          <p className="text-gray-500 text-sm mt-1">{stLokacij(locations.filter(l => l.status === 'active').length)}</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.common.search + '…'}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        {(['all', 'active', 'inactive'] as const).map(v => (
          <button key={v} onClick={() => setStatusFilter(v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === v ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {v === 'all' ? t.common.all : v === 'active' ? t.common.activeFPl : t.common.inactiveFPl}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <MapPin className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">{search ? s.noMatch : s.noData}</p>
            {!search && <button onClick={openNew} className="mt-3 text-sm text-blue-600 hover:underline font-medium">{s.createFirst}</button>}
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{[t.common.name, t.common.city, t.common.country, t.common.status, ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(l => (
                <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{l.name}</td>
                  <td className="px-4 py-3 text-gray-600">{l.address_city ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{l.address_country ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${l.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{l.status === 'active' ? t.common.activeF : t.common.inactiveF}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(l)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setConfirmDelete(l)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onChange={setPage} />

      <Modal open={modalOpen} onClose={closeModal} title={editing.id ? t.common.editEntity : s.new} size="md">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Input id="l-name" label={s.locationName + " *"} {...field('name')} /></div>
          <div className="col-span-2"><Input id="l-street" label={t.common.streetAddress + ' *'} {...field('address_street')} /></div>
          <Input id="l-city" label={t.common.city + ' *'} {...field('address_city')} />
          <Input id="l-postal" label={t.common.postalCode} {...field('address_postal_code')} />
          <div className="col-span-2"><Input id="l-country" label={t.common.country} {...field('address_country')} /></div>

          {editing.id && (
            <div className="col-span-2 flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {editing.status === 'active' ? t.common.statusActiveF : t.common.statusInactiveF}
                </p>
                <p className="text-xs text-gray-400">
                  {editing.status === 'active'
                    ? s.statusHelp
                    : s.statusHelp}
                </p>
              </div>
              <button type="button"
                onClick={() => setEditing(f => ({ ...f, status: f.status === 'active' ? 'inactive' : 'active' }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${editing.status === 'active' ? 'bg-blue-600' : 'bg-gray-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editing.status === 'active' ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-3 justify-end mt-5">
          <Button variant="secondary" onClick={closeModal}>{t.common.cancel}</Button>
          <Button loading={saving} onClick={save}>{editing.id ? t.common.saveChanges : s.new}</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title={t.common.deleteEntity} danger loading={actionLoading}
        message={`${t.common.deleteEntity} "${confirmDelete?.name}"? ${t.common.cannotUndo} ${t.common.deleteInUse}`} confirmLabel={t.common.deleteEntity} />
    </div>
  )
}
