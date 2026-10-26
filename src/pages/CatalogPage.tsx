import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Package, Tag } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { toast } from '../components/ui/Toast'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Pagination from '../components/ui/Pagination'
import PageToolbar from '../components/layout/PageToolbar'
import TableEmptyState from '../components/ui/TableEmptyState'
import type { Item, Category } from '../types/database'
import { useLanguage } from '../hooks/useLanguage'
import { poLineLocSl, poLineCountEn } from '../utils/pluralize'
import { countByKey, mergeUsage } from '../lib/usageCounts'

interface ItemWithCategory extends Item {
  categories: { name: string } | null
}

const EMPTY: Partial<Item> = { name: '', long_description: '', category_id: undefined, default_unit: '', default_unit_price: null, status: 'active' }

export default function CatalogPage() {
  const { company } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.items
  const [items, setItems] = useState<ItemWithCategory[]>([])
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [catUsage, setCatUsage] = useState<Map<string, number>>(new Map())
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [catEditing, setCatEditing] = useState<{ id?: string; name: string; status: 'active' | 'inactive' }>({ name: '', status: 'active' })
  const [catSaving, setCatSaving] = useState(false)
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<Category | null>(null)
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
  const [pageSize, setPageSize] = useState(20)
  const [usage, setUsage] = useState<Map<string, number>>(new Map())

  useEffect(() => { if (company) { load(); loadCategories() } }, [company])

  async function load() {
    if (!company) return
    setLoading(true)
    const [{ data }, { data: lineRows }] = await Promise.all([
      supabase.from('items').select('*, categories(name)').eq('company_id', company.id).order('item_number'),
      supabase.from('po_line_items').select('item_id, purchase_orders!inner(company_id)').eq('purchase_orders.company_id', company.id),
    ])
    setItems((data as ItemWithCategory[]) ?? [])
    setUsage(countByKey(lineRows, 'item_id'))
    setLoading(false)
  }

  async function loadCategories() {
    if (!company) return
    const [{ data }, { data: poLines }, { data: reqLines }] = await Promise.all([
      supabase.from('categories').select('*').eq('company_id', company.id).order('name'),
      supabase.from('po_line_items').select('category_id, purchase_orders!inner(company_id)').eq('purchase_orders.company_id', company.id),
      supabase.from('request_line_items').select('category_id, requests!inner(company_id)').eq('requests.company_id', company.id),
    ])
    setAllCategories(data ?? [])
    setCatUsage(mergeUsage(countByKey(poLines, 'category_id'), countByKey(reqLines, 'category_id')))
  }

  function openNewCategory() { setCatEditing({ name: '', status: 'active' }); setCatModalOpen(true) }
  function openEditCategory(c: Category) { setCatEditing({ id: c.id, name: c.name, status: c.status }); setCatModalOpen(true) }
  function closeCategoryModal() { setCatModalOpen(false); setCatEditing({ name: '', status: 'active' }) }

  async function saveCategory() {
    if (!company || !catEditing.name.trim()) { toast.error(t.common.nameRequired); return }
    setCatSaving(true)
    const { error } = catEditing.id
      ? await supabase.from('categories').update({ name: catEditing.name, status: catEditing.status, updated_at: new Date().toISOString() }).eq('id', catEditing.id)
      : await supabase.from('categories').insert({ name: catEditing.name, company_id: company.id, status: 'active' })
    setCatSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.saved); closeCategoryModal(); loadCategories()
  }

  // A category is in use if any item or any request/PO line references it.
  function categoryInUse(id: string) { return (catUsage.get(id) ?? 0) > 0 || items.some(i => i.category_id === id) }

  async function handleDeleteCategory(c: Category) {
    setActionLoading(true)
    const { error } = await supabase.from('categories').delete().eq('id', c.id)
    setActionLoading(false); setConfirmDeleteCat(null)
    if (error) { toast.error(error.message); return }
    if (categoryFilter === c.id) setCategoryFilter('all')
    toast.success(t.common.deleted); closeCategoryModal(); loadCategories()
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

  function openNew() { setEditing({ ...EMPTY, category_id: categoryFilter !== 'all' ? categoryFilter : undefined }); setPriceStr(''); setModalOpen(true) }
  function openEdit(i: ItemWithCategory) { setEditing({ ...i }); setPriceStr(i.default_unit_price != null ? String(i.default_unit_price).replace('.', ',') : ''); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing(EMPTY); setPriceStr('') }

  async function save() {
    if (!company || !editing.name?.trim()) { toast.error(t.common.nameRequired); return }
    if (!editing.category_id) { toast.error(t.po.category + ' *'); return }
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
      toast.error(lang === 'sl'
        ? `${t.common.cannotDelete} ${t.common.usedOn} ${poLineLocSl(count ?? 0)}. ${t.common.setInactiveInstead}`
        : `${t.common.cannotDelete} ${t.common.usedOn} ${poLineCountEn(count ?? 0)}. ${t.common.setInactiveInstead}`)
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
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)
  function handlePageSizeChange(n: number) { setPageSize(n); setPage(1) }

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar actions={<><Button variant="secondary" onClick={openNewCategory} className="gap-2"><Tag className="w-4 h-4" />{t.categories.new}</Button><Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button></>}>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.common.search + '…'}
            className="w-full pl-9 pr-4 py-1.5 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:ring-2 focus:ring-accent bg-white text-ink placeholder:text-placeholder" />
        </div>
        {(['all', 'active', 'inactive'] as const).map(v => (
          <button key={v} onClick={() => setStatusFilter(v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === v ? 'bg-ink text-white' : 'bg-white border border-field text-gray-600 hover:bg-surface'}`}>
            {v === 'all' ? t.common.allM : v === 'active' ? t.common.activeM : t.common.inactiveM}
          </button>
        ))}
      </PageToolbar>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* Categories panel */}
      <div className="w-full lg:w-60 shrink-0 bg-white rounded-lg border border-field p-2">
        <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted">{t.categories.title}</p>
        {[{ id: 'all', name: t.filters.allCategories, count: items.length, status: 'active' as const }, ...allCategories.map(c => ({ id: c.id, name: c.name, count: items.filter(i => i.category_id === c.id).length, status: c.status }))].map(c => (
          <div key={c.id} className={`group flex items-center rounded-lg transition-colors ${categoryFilter === c.id ? 'bg-selected' : 'hover:bg-hover'}`}>
            <button onClick={() => setCategoryFilter(c.id)} className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-1.5 text-left">
              <span className={`flex-1 truncate text-sm ${c.status === 'active' ? 'text-ink' : 'text-muted'}`}>{c.name}</span>
              <span className="text-xs text-gray-400 tabular-nums">{c.count}</span>
            </button>
            {c.id !== 'all' && (
              <button onClick={() => openEditCategory(allCategories.find(x => x.id === c.id)!)} className="p-1.5 mr-1 text-gray-400 hover:text-ink opacity-0 group-hover:opacity-100 transition-opacity">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 min-w-0 w-full data-card bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
            <thead className="bg-surface border-b border-field">
              <tr>
                {[s.itemNumber, t.common.name, t.categories.title, s.defaultUnit, s.defaultUnitPrice, t.common.status, ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-sm font-medium text-ink2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={Package} colSpan={7} title={(search || categoryFilter !== 'all') ? t.common.empty.noResults.title : t.common.empty.items.title} subtitle={(search || categoryFilter !== 'all') ? t.common.empty.noResults.text : t.common.empty.items.text} />
              ) : paginated.map(item => {
                const count = usage.get(item.id) ?? 0
                const inUse = count > 0
                return (
                <tr key={item.id} className="hover:bg-surface transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-500 font-medium">{item.item_number}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{item.name}</p>
                    {item.long_description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{item.long_description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink2">{item.categories?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-ink2">{item.default_unit ?? '—'}</td>
                  <td className="px-4 py-3 text-ink2">{item.default_unit_price != null ? `${item.default_unit_price.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.status === 'active' ? 'bg-success-light text-success' : 'bg-selected text-muted'}`}>{item.status === 'active' ? t.common.active : t.common.inactive}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-accent hover:bg-accent-light rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                      <button disabled={inUse} onClick={() => !inUse && setConfirmDelete(item)}
                        title={inUse ? (lang === 'sl' ? `${t.common.cannotDelete} ${t.common.usedOn} ${poLineLocSl(count)}. ${t.common.setInactiveInstead}` : `${t.common.cannotDelete} ${t.common.usedOn} ${poLineCountEn(count)}. ${t.common.setInactiveInstead}`) : undefined}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={handlePageSizeChange} />
      </div>
      </div>

      <Modal open={modalOpen} onClose={closeModal} title={editing.id ? t.common.editEntity : s.new} size="md">
        <div className="flex flex-col gap-4">
          {/* Item number — read-only when editing */}
          {editing.id && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{s.itemNumber}</label>
              <div className="px-3 py-2 bg-gray-50 border border-field rounded-lg hover:border-field-hover text-sm text-gray-500">
                {editing.item_number}
              </div>
            </div>
          )}

          <Input id="i-name" label={t.common.name + " *"}
            value={editing.name ?? ''}
            onChange={e => setEditing(f => ({ ...f, name: e.target.value }))}
          />

          <div className="flex flex-col gap-1">
            <label htmlFor="i-desc" className="text-sm font-medium text-gray-700">{s.longDescription}</label>
            <textarea
              id="i-desc"
              rows={3}
              value={editing.long_description ?? ''}
              onChange={e => setEditing(f => ({ ...f, long_description: e.target.value }))}
              className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="i-cat" className="text-sm font-medium text-gray-700">{t.po.category} *</label>
              <select id="i-cat"
                value={editing.category_id ?? ''}
                onChange={e => setEditing(f => ({ ...f, category_id: e.target.value || undefined }))}
                className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">{t.common.select}</option>
                {allCategories.filter(c => c.status === 'active' || c.id === editing.category_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Input id="i-unit" label={s.defaultUnit}
              placeholder={lang === 'sl' ? 'npr. kos, kg, m' : 'e.g. pcs, kg, m'}
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
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-field">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {editing.status === 'active' ? t.common.statusActive : t.common.statusInactive}
                </p>
                <p className="text-xs text-gray-400">
                  {s.statusHelp}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(f => ({ ...f, status: f.status === 'active' ? 'inactive' : 'active' }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${editing.status === 'active' ? 'bg-accent' : 'bg-gray-300'}`}
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

      <Modal open={catModalOpen} onClose={closeCategoryModal} title={catEditing.id ? t.common.editEntity : t.categories.new} size="sm">
        <Input id="cat-name" label={t.categories.categoryName + ' *'} value={catEditing.name} onChange={e => setCatEditing(f => ({ ...f, name: e.target.value }))} />
        {catEditing.id && (
          <div className="flex items-center justify-between p-3 mt-4 bg-gray-50 rounded-lg border border-field">
            <div>
              <p className="text-sm font-medium text-gray-700">{catEditing.status === 'active' ? t.common.statusActiveF : t.common.statusInactiveF}</p>
              <p className="text-xs text-gray-400">{t.categories.statusHelp}</p>
            </div>
            <button type="button" onClick={() => setCatEditing(f => ({ ...f, status: f.status === 'active' ? 'inactive' : 'active' }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${catEditing.status === 'active' ? 'bg-accent' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${catEditing.status === 'active' ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-3 mt-5">
          {catEditing.id && (
            <button disabled={categoryInUse(catEditing.id)}
              onClick={() => { const c = allCategories.find(x => x.id === catEditing.id); if (c) setConfirmDeleteCat(c) }}
              title={categoryInUse(catEditing.id) ? `${t.common.cannotDelete} ${t.common.deactivateInstead}` : undefined}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <Button variant="secondary" onClick={closeCategoryModal}>{t.common.cancel}</Button>
            <Button loading={catSaving} onClick={saveCategory}>{catEditing.id ? t.common.saveChanges : t.common.create}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmDeleteCat} onClose={() => setConfirmDeleteCat(null)}
        onConfirm={() => confirmDeleteCat && handleDeleteCategory(confirmDeleteCat)}
        title={t.common.deleteEntity} danger loading={actionLoading}
        message={`${t.common.deleteEntity} "${confirmDeleteCat?.name}"? ${t.common.cannotUndo}`}
        confirmLabel={t.common.deleteEntity} />

      <ConfirmDialog
        open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title={t.common.deleteEntity} danger loading={actionLoading}
        message={`${t.common.deleteEntity} "${confirmDelete?.name}" (${confirmDelete?.item_number})? ${t.common.cannotUndo} ${t.common.deleteInUse}`}
        confirmLabel={t.common.deleteEntity}
      />
    </div>
  )
}
