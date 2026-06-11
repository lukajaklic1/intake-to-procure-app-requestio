import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Building2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { toast } from '../components/ui/Toast'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Pagination from '../components/ui/Pagination'
import type { Supplier } from '../types/database'
import { useLanguage } from '../hooks/useLanguage'
import { stDobaviteljev } from '../utils/pluralize'

const PAGE_SIZE = 20

const EMPTY: Partial<Supplier> = { name: '', contact_name: '', email: '', phone: '', vat_number: '', address_street: '', address_city: '', address_postal_code: '', address_country: '', payment_terms: '', status: 'active' }

export default function SuppliersPage() {
  const { company } = useCompany()
  const { t } = useLanguage()
  const s = t.suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Supplier>>(EMPTY)
  const [page, setPage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    if (!company) return
    setLoading(true)
    const { data } = await supabase.from('suppliers').select('*').eq('company_id', company.id).order('name')
    setSuppliers(data ?? [])
    setLoading(false)
  }

  function openNew() { setEditing({ ...EMPTY }); setModalOpen(true) }
  function openEdit(s: Supplier) { setEditing({ ...s }); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing(EMPTY) }

  function field(key: keyof Supplier) {
    return {
      value: (editing[key] as string) ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setEditing(f => ({ ...f, [key]: e.target.value })),
    }
  }

  async function save() {
    if (!company || !editing.name?.trim()) { toast.error('Ime podjetja je obvezno'); return }
    if (!editing.vat_number?.trim()) { toast.error('Davčna številka je obvezna'); return }
    if (!editing.address_street?.trim()) { toast.error('Ulica je obvezna'); return }
    if (!editing.address_city?.trim()) { toast.error('Kraj je obvezen'); return }
    setSaving(true)
    if (editing.id) {
      const { error } = await supabase.from('suppliers').update({ ...editing, updated_at: new Date().toISOString() }).eq('id', editing.id)
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success(t.common.saved)
    } else {
      const { error } = await supabase.from('suppliers').insert({ ...editing, company_id: company.id, status: 'active' })
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success(t.common.saved)
    }
    setSaving(false); closeModal(); load()
  }

  async function handleDelete(s: Supplier) {
    setActionLoading(true)
    const { count } = await supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).eq('supplier_id', s.id)
    if ((count ?? 0) > 0) {
      setActionLoading(false); setConfirmDelete(null)
      toast.error(`Cannot delete — used on ${count} PO(s). Set status to Inactive instead.`)
      return
    }
    const { error } = await supabase.from('suppliers').delete().eq('id', s.id)
    setActionLoading(false); setConfirmDelete(null)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.deleted); load()
  }

  useEffect(() => { setPage(1) }, [search, statusFilter])

  const filtered = suppliers.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || (s.email ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || s.status === statusFilter
    return matchSearch && matchStatus
  })
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{s.title}</h1>
          <p className="text-gray-500 text-sm mt-1">{stDobaviteljev(suppliers.filter(s => s.status === 'active').length)}</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={"Išči dobavitelje..."}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        {(['all', 'active', 'inactive'] as const).map(v => (
          <button key={v} onClick={() => setStatusFilter(v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === v ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {v === 'all' ? t.common.allM : v === 'active' ? t.common.activeM : t.common.inactiveM}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Building2 className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">{search ? s.noMatch : s.noData}</p>
            {!search && <button onClick={openNew} className="mt-3 text-sm text-blue-600 hover:underline font-medium">{s.createFirst}</button>}
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {[t.common.name, s.contact, t.common.email, t.common.phone, s.paymentTerms, t.common.status, ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {s.name}
                    {s.vat_number && <span className="ml-2 text-xs text-gray-400">{s.vat_number}</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.contact_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.payment_terms ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{s.status === 'active' ? t.common.active : t.common.inactive}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(s)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setConfirmDelete(s)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onChange={setPage} />

      {/* Create / Edit Modal */}
      <Modal open={modalOpen} onClose={closeModal} title={editing.id ? 'Uredi dobavitelja' : s.new} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Input id="s-name" label={s.companyName + ' *'} {...field('name')} /></div>
          <Input id="s-vat" label={s.vatNumber + ' *'} {...field('vat_number')} />
          <Input id="s-contact" label={s.contactName} {...field('contact_name')} />
          <Input id="s-street" label={t.common.streetAddress + ' *'} {...field('address_street')} />
          <Input id="s-city" label={t.common.city + ' *'} {...field('address_city')} />
          <Input id="s-postal" label={t.common.postalCode} {...field('address_postal_code')} />
          <Input id="s-country" label={t.common.country} {...field('address_country')} />
          <Input id="s-email" label={t.common.email} type="email" {...field('email')} />
          <Input id="s-phone" label={t.common.phone} {...field('phone')} />
          <div className="col-span-2"><Input id="s-terms" label={s.paymentTerms} placeholder="npr. 30 dni" {...field('payment_terms')} /></div>

          {/* Status toggle — only shown when editing */}
          {editing.id && (
            <div className="col-span-2 flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {editing.status === 'active' ? t.common.statusActive : t.common.statusInactive}
                </p>
                <p className="text-xs text-gray-400">
                  {editing.status === 'active'
                    ? t.suppliers.statusHelp.split('.')[0]
                    : t.suppliers.statusHelp}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(f => ({ ...f, status: f.status === 'active' ? 'inactive' : 'active' }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${editing.status === 'active' ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
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

      <ConfirmDialog
        open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title="Izbriši" danger loading={actionLoading}
        message={`Izbriši "${confirmDelete?.name}"? Tega ni mogoče razveljaviti. Brisanje ne bo mogoče, če ima dobavitelj naročila.`}
        confirmLabel="Izbriši"
      />
    </div>
  )
}
