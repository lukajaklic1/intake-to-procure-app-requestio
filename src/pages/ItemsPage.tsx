import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { toast } from '../components/ui/Toast'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Pagination from '../components/ui/Pagination'
import type { Item, Category } from '../types/database'
import { useLanguage } from '../hooks/useLanguage'
import { stArtiklov } from '../utils/pluralize'

interface ItemWithCategory extends Item {
  categories: { name: string } | null
}

const PAGE_SIZE = 20

const EMPTY: Partial<Item> = { name: '', long_description: '', category_id: undefined, default_unit: '', default_unit_price: null, status: 'active' }

export default function ItemsPage() {
  const { company } = useCompany()
  const { t } = useLanguage()
  const s = t.items
  const [items, setItems] = useState<ItemWithCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Item>>(EMPTY)
  const [priceStr, setPriceStr] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<ItemWithCategory | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => { if (company) { load(); loadCategories() } }, [company])

  async function load() {
    if (!company) return
    setLoading(true)
    const { data } = await supabase
      .from('items')
      .select('*, categories(name)')
      .eq('company_id', company.id)
      .order('item_number')
    setItems((data as ItemWithCategory[]) ?? [])
    setLoading(false)
  }

  async function loadCategories() {
    if (!company) return
    const { data } = await supabase.from('categories').select('*').eq('company_id', company.id).order('name')
    setCategories(data ?? [])
  }

  async function nextItemNumber(): Promise<string> {
    const { data } = await supabase
      .from('items')
      .select('item_number')
      .eq('company_id', company!.id)
      .order('item_number', { ascending: false })
      .limit(1)
    if (!data || data.length === 0) return '100001'
    const last = parseInt(data[0].item_number, 10)
    return String(isNaN(last) ? 100001 : last + 1)
  }

  function openNew() { setEditing({ ...EMPTY }); setPriceStr(''); setModalOpen(true) }
  function openEdit(i: ItemWithCategory) { setEditing({ ...i }); setPriceStr(i.default_unit_price != null ? String(i.default_unit_price).replace('.', ',') : ''); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing(EMPTY); setPriceStr('') }

  async function save() {
    if (!company || !editing.name?.trim()) { toast.error(t.common.nameRequired); return }
    setSaving(true)

    if (editing.id) {
      const { error } = await supabase.from('items').update({
        name: editing.name,
        long_description: editing.long_description || null,
        category_id: editing.category_id || null,
        default_unit: editing.default_unit || null,
        default_unit_price: editing.default_unit_price ?? null,
        status: editing.status,
        updated_at: new Date().toISOString(),
      }).eq('id', editing.id)
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success(t.common.saved)
    } else {
      const itemNumber = await nextItemNumber()
      const { error } = await supabase.from('items').insert({
        company_id: company.id,
        item_number: itemNumber,
        name: editing.name,
        long_description: editing.long_description || null,
        category_id: editing.category_id || null,
        default_unit: editing.default_unit || null,
        default_unit_price: editing.default_unit_price ?? null,
        status: 'active',
      })
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success(t.common.saved)
    }

    setSaving(false); closeModal(); load()
  }

  async function handleDelete(item: ItemWithCategory) {
    setActionLoading(true)
    const { count } = await supabase
      .from('po_line_items')
      .select('*', { count: 'exact', head: true })
      .eq('item_id', item.id)

    if ((count ?? 0) > 0) {
      setActionLoading(false); setConfirmDelete(null)
      toast.error(`Cannot delete — used on ${count} PO line(s). Set status to Inactive instead.`)
      return
    }
    const { error } = await supabase.from('items').delete().eq('id', item.id)
    setActionLoading(false); setConfirmDelete(null)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.deleted); load()
  }

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    const matchSearch = i.name.toLowerCase().includes(q) || i.item_number.includes(q)
    const matchCat = categoryFilter === 'all' || i.category_id === categoryFilter
    const matchStatus = statusFilter === 'all' || i.status === statusFilter
    return matchSearch && matchCat && matchStatus
  })

  useEffect(() => { setPage(1) }, [search, categoryFilter, statusFilter])
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{s.title}</h1>
          <p className="text-gray-500 text-sm mt-1">{stArtiklov(items.filter(i => i.status === 'active').length)}</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={"Išči artikle..."}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
        >
          <option value="all">Vse kategorije</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {(['all', 'active', 'inactive'] as const).map(v => (
          <button key={v} onClick={() => setStatusFilter(v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === v ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {v === 'all' ? t.common.allM : v === 'active' ? t.common.activeM : t.common.inactiveM}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Package className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">{search ? s.noMatch : s.noData}</p>
            {!search && <button onClick={openNew} className="mt-3 text-sm text-blue-600 hover:underline font-medium">{s.createFirst}</button>}
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {[s.itemNumber, t.common.name, t.categories.title, s.defaultUnit, s.defaultUnitPrice, t.common.status, ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 font-medium">{item.item_number}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{item.name}</p>
                    {item.long_description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{item.long_description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{item.categories?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{item.default_unit ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{item.default_unit_price != null ? `${item.default_unit_price.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{item.status === 'active' ? t.common.active : t.common.inactive}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setConfirmDelete(item)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      {/* Modal */}
      <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onChange={setPage} />

      <Modal open={modalOpen} onClose={closeModal} title={editing.id ? 'Uredi artikel' : s.new} size="md">
        <div className="flex flex-col gap-4">
          {/* Item number — read-only when editing */}
          {editing.id && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Šifra artikla</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-500">
                {editing.item_number}
              </div>
            </div>
          )}

          <Input id="i-name" label={t.common.name + " *"}
            value={editing.name ?? ''}
            onChange={e => setEditing(f => ({ ...f, name: e.target.value }))}
          />

          <div className="flex flex-col gap-1">
            <label htmlFor="i-desc" className="text-sm font-medium text-gray-700">Podrobni opis</label>
            <textarea
              id="i-desc"
              rows={3}
              value={editing.long_description ?? ''}
              onChange={e => setEditing(f => ({ ...f, long_description: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Tehnični opis, specifikacije..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="i-cat" className="text-sm font-medium text-gray-700">Kategorija</label>
              <select id="i-cat"
                value={editing.category_id ?? ''}
                onChange={e => setEditing(f => ({ ...f, category_id: e.target.value || undefined }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{s.allCategories}</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Input id="i-unit" label={s.defaultUnit}
              placeholder="npr. kos, kg, m"
              value={editing.default_unit ?? ''}
              onChange={e => setEditing(f => ({ ...f, default_unit: e.target.value }))}
            />
            <Input id="i-price" label={s.defaultUnitPrice}
              placeholder="0,00"
              value={priceStr}
              onChange={e => {
                const v = e.target.value
                if (/^[0-9]*[,.]?[0-9]*$/.test(v)) {
                  setPriceStr(v)
                  setEditing(f => ({ ...f, default_unit_price: v === '' ? null : parseFloat(v.replace(',', '.')) || null }))
                }
              }}
            />
          </div>

          {/* Status toggle — only when editing */}
          {editing.id && (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {editing.status === 'active' ? t.common.statusActive : t.common.statusInactive}
                </p>
                <p className="text-xs text-gray-400">
                  {editing.status === 'active'
                    ? 'Artikel je na voljo v katalogu pri ustvarjanju naročil.'
                    : 'Artikel je skrit iz kataloga. Obstoječa naročila niso prizadeta.'}
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
        message={`Izbriši "${confirmDelete?.name}" (${confirmDelete?.item_number})? Brisanje ne bo mogoče, če je artikel v uporabi na naročilih.`}
        confirmLabel="Izbriši"
      />
    </div>
  )
}
