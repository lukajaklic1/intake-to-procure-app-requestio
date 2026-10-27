import { Fragment, useEffect, useState } from 'react'
import { Upload, Plus, Search, Pencil, Trash2, Package, Tag, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { toast } from '../components/ui/Toast'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import ImportModal from '../components/ui/ImportModal'
import PageToolbar from '../components/layout/PageToolbar'
import FilterSelect from '../components/ui/FilterSelect'
import TableEmptyState from '../components/ui/TableEmptyState'
import type { Item, Category } from '../types/database'
import { useLanguage } from '../hooks/useLanguage'
import { useRequired } from '../lib/useRequired'
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
  const req = useRequired(t.common.fieldRequired)
  const catReq = useRequired(t.common.fieldRequired)
  const [importOpen, setImportOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Item>>(EMPTY)
  const [priceStr, setPriceStr] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<ItemWithCategory | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
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

  function openNewCategory() { catReq.reset(); setCatEditing({ name: '', status: 'active' }); setCatModalOpen(true) }
  function openEditCategory(c: Category) { catReq.reset(); setCatEditing({ id: c.id, name: c.name, status: c.status }); setCatModalOpen(true) }
  function closeCategoryModal() { setCatModalOpen(false); setCatEditing({ name: '', status: 'active' }) }

  async function saveCategory() {
    if (!company || !catReq.check(catEditing, ['name'], { name: 'cat-name' })) return
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

  function openNew(categoryId?: string) { req.reset(); setEditing({ ...EMPTY, category_id: categoryId }); setPriceStr(''); setModalOpen(true) }
  function openEdit(i: ItemWithCategory) { req.reset(); setEditing({ ...i }); setPriceStr(i.default_unit_price != null ? String(i.default_unit_price).replace('.', ',') : ''); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing(EMPTY); setPriceStr('') }

  async function save() {
    if (!company || !req.check(editing as Record<string, unknown>, ['name', 'category_id'], { name: 'i-name', category_id: 'i-cat' })) return
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

  const q = search.toLowerCase()
  const filtering = q !== '' || statusFilter !== 'all'
  const filteredItems = items.filter(i =>
    (i.name.toLowerCase().includes(q) || i.item_number.includes(q)) && (statusFilter === 'all' || i.status === statusFilter))

  // One group per category (plus legacy items without one). While filtering, groups with no match are hidden.
  const groups = [
    ...allCategories.map(c => ({ id: c.id, name: c.name, category: c as Category | null, inactive: c.status === 'inactive', rows: filteredItems.filter(i => i.category_id === c.id) })),
    { id: 'none', name: t.dashboard.noCategory, category: null, inactive: false, rows: filteredItems.filter(i => !i.category_id) },
  ].filter(g => (g.category || g.rows.length > 0) && (!filtering || g.rows.length > 0))

  function toggleGroup(id: string) {
    setCollapsed(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached actions={<><Button variant="secondary" onClick={() => setImportOpen(true)} className="gap-2"><Upload className="w-4 h-4" />{t.common.import.button}</Button><Button onClick={openNewCategory} className="gap-2"><Tag className="w-4 h-4" />{t.categories.new}</Button></>}>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-filter-label" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.common.search + '…'}
            className="w-full pl-9 pr-4 h-8 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:ring-2 focus:ring-accent bg-white text-ink placeholder:text-filter-label" />
        </div>
        <FilterSelect label={t.filters.labels.status} value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}>
          {(['all', 'active', 'inactive'] as const).map(v => <option key={v} value={v}>{v === 'all' ? t.common.allM : v === 'active' ? t.common.activeM : t.common.inactiveM}</option>)}
        </FilterSelect>
      </PageToolbar>

      <div className="data-card table-bleed bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
            <thead className="bg-surface border-b border-field">
              <tr>
                {[s.itemNumber, t.common.name, s.defaultUnit, s.defaultUnitPrice, t.common.status, ''].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-sm font-medium text-ink2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-field">
              {groups.length === 0 ? (
                <TableEmptyState icon={filtering ? Package : Tag} colSpan={6}
                  title={filtering ? t.common.empty.noResults.title : t.common.empty.categories.title}
                  subtitle={filtering ? t.common.empty.noResults.text : t.common.empty.categories.text}
                  action={filtering ? undefined : <Button onClick={openNewCategory} className="gap-2 mt-2"><Plus className="w-4 h-4" />{t.categories.new}</Button>} />
              ) : groups.map(g => {
                const open = filtering || !collapsed.has(g.id)
                return (
                  <Fragment key={g.id}>
                    {/* Category header row */}
                    <tr className="bg-surface hover:bg-hover cursor-pointer select-none group" onClick={() => toggleGroup(g.id)}>
                      <td colSpan={6} className="!py-2.5">
                        <div className="flex items-center gap-2">
                          {open ? <ChevronDown className="w-4 h-4 text-icon shrink-0" /> : <ChevronRight className="w-4 h-4 text-icon shrink-0" />}
                          <span className={`font-medium ${g.inactive ? 'text-muted' : 'text-ink'}`}>{g.name}</span>
                          <span className="text-xs text-gray-400 tabular-nums">{g.rows.length}</span>
                          {g.inactive && <span className="badge badge-neutral">{t.common.inactiveF}</span>}
                          {g.category && (
                            <button onClick={e => { e.stopPropagation(); openEditCategory(g.category!) }}
                              className="ml-1 p-1 text-gray-400 hover:text-ink rounded-md opacity-0 group-hover:opacity-100 transition-opacity" title={t.common.editEntity}>
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {open && g.rows.map(item => {
                      const count = usage.get(item.id) ?? 0
                      const inUse = count > 0
                      return (
                        <tr key={item.id} className="hover:bg-surface transition-colors">
                          <td className="px-4 py-3 text-xs text-gray-500 font-medium">{item.item_number}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{item.name}</p>
                            {item.long_description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{item.long_description}</p>}
                          </td>
                          <td className="px-4 py-3 text-ink2">{item.default_unit ?? '—'}</td>
                          <td className="px-4 py-3 text-ink2">{item.default_unit_price != null ? `${item.default_unit_price.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`badge ${item.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>{item.status === 'active' ? t.common.active : t.common.inactive}</span>
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

                    {/* Add an item inside this category */}
                    {open && !filtering && g.category && (
                      <tr>
                        <td colSpan={6} className="!py-2">
                          <button onClick={() => openNew(g.id)} className="inline-flex items-center gap-1.5 text-sm text-ink2 hover:text-ink transition-colors">
                            <Plus className="w-4 h-4" />{g.rows.length === 0 ? t.common.empty.categoryEmpty + ' ' : ''}{s.new}
                          </button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table></div>
        )}
      </div>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} title={t.common.import.title}
        templateName="catalog"
        columns={[
          { key: 'name', label: t.common.import.cols.name, required: true, example: 'Olivno olje 1 L' },
          { key: 'category', label: t.common.import.cols.category, required: true, example: 'Hrana' },
          { key: 'unit', label: t.common.import.cols.unit, example: 'kos' },
          { key: 'price', label: t.common.import.cols.price, example: '5,90' },
          { key: 'description', label: t.common.import.cols.description, example: 'Ekstra deviško' },
        ]}
        existing={new Set(items.map(i => i.name.toLowerCase()))}
        keyOf={row => row.name.toLowerCase()}
        validate={row => (row.price && Number.isNaN(Number(row.price.replace(',', '.')))) ? t.common.import.invalidNumber + ': ' + row.price : null}
        onImport={async rows => {
          // Categories named in the file that don't exist yet are created first.
          const byName = new Map(allCategories.map(c => [c.name.toLowerCase(), c.id]))
          const missing = [...new Set(rows.map(r => r.category).filter(n => !byName.has(n.toLowerCase())))]
          if (missing.length) {
            const { data, error } = await supabase.from('categories')
              .insert(missing.map(name => ({ company_id: company!.id, name, status: 'active' }))).select('id, name')
            if (error) throw error
            for (const c of data ?? []) byName.set(c.name.toLowerCase(), c.id)
          }
          // Item numbers continue after the highest existing one.
          const last = items.reduce((m, i) => Math.max(m, parseInt(i.item_number, 10) || 0), 100000)
          const payload = rows.map((r, i) => ({
            company_id: company!.id, item_number: String(last + 1 + i), name: r.name,
            long_description: r.description || null, category_id: byName.get(r.category.toLowerCase()),
            default_unit: r.unit || null,
            default_unit_price: r.price ? Number(r.price.replace(',', '.')) : null,
            status: 'active',
          }))
          for (let i = 0; i < payload.length; i += 500) {
            const { error } = await supabase.from('items').insert(payload.slice(i, i + 500))
            if (error) throw error
          }
          load(); loadCategories()
        }} />

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
            value={editing.name ?? ''} error={req.errors.name}
            onChange={e => { req.clear('name'); setEditing(f => ({ ...f, name: e.target.value })) }}
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
                onChange={e => { req.clear('category_id'); setEditing(f => ({ ...f, category_id: e.target.value || undefined })) }}
                className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${req.errors.category_id ? 'border-red-400 focus:ring-red-400' : 'border-field hover:border-field-hover focus:ring-accent'}`}
              >
                <option value="">{t.common.select}</option>
                {allCategories.filter(c => c.status === 'active' || c.id === editing.category_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {req.errors.category_id && <p className="text-xs text-red-600">{req.errors.category_id}</p>}
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
        <Input id="cat-name" label={t.categories.categoryName + ' *'} value={catEditing.name} error={catReq.errors.name} onChange={e => { catReq.clear('name'); setCatEditing(f => ({ ...f, name: e.target.value })) }} />
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
