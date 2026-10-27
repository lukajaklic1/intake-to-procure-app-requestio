import { Fragment, useEffect, useRef, useState } from 'react'
import { Upload, Plus, Search, Pencil, Trash2, Package, Tag, ChevronDown, ChevronRight, ListChevronsDownUp, ListChevronsUpDown, ListTree, List } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { toast } from '../components/ui/Toast'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import ImportModal from '../components/ui/ImportModal'
import PageToolbar from '../components/layout/PageToolbar'
import { useHeaderTabs } from '../components/layout/HeaderCounts'
import FilterSelect from '../components/ui/FilterSelect'
import TableEmptyState from '../components/ui/TableEmptyState'
import Pagination from '../components/ui/Pagination'
import type { Item, Category } from '../types/database'
import { useLanguage } from '../hooks/useLanguage'
import { useRequired } from '../lib/useRequired'
import { dbError } from '../lib/dbError'
import { poLineLocSl, poLineCountEn } from '../utils/pluralize'
import { countByKey, mergeUsage } from '../lib/usageCounts'
import { buildCategoryTree, categoryOptions } from '../lib/categories'

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
  const [catEditing, setCatEditing] = useState<{ id?: string; name: string; status: 'active' | 'inactive'; parent_id: string }>({ name: '', status: 'active', parent_id: '' })
  const [catSaving, setCatSaving] = useState(false)
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<Category | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const req = useRequired(t.common.fieldRequired)
  const catReq = useRequired(t.common.fieldRequired)
  const [importOpen, setImportOpen] = useState(false)
  const [importCatOpen, setImportCatOpen] = useState(false)
  const [importSubOpen, setImportSubOpen] = useState(false)
  const [importMenuOpen, setImportMenuOpen] = useState(false)
  const importMenuRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const initialCollapse = useRef(false)
  const [view, setViewState] = useState<'tree' | 'all'>(() => { try { return localStorage.getItem('catalogView') === 'all' ? 'all' : 'tree' } catch { return 'tree' } })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  function setView(v: 'tree' | 'all') { setViewState(v); try { localStorage.setItem('catalogView', v) } catch { /* ignore */ } }
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Item>>(EMPTY)
  const [priceStr, setPriceStr] = useState('')
  // Item dialog: category + dependent subcategory picker (both must already exist).
  const [catSel, setCatSel] = useState('')
  const [subSel, setSubSel] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<ItemWithCategory | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [usage, setUsage] = useState<Map<string, number>>(new Map())

  useEffect(() => { if (company) { load(); loadCategories() } }, [company])

  useEffect(() => {
    if (!importMenuOpen) return
    const onDown = (e: MouseEvent) => { if (!importMenuRef.current?.contains(e.target as Node)) setImportMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [importMenuOpen])

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
    // First load: show the tree collapsed; the user expands what they need.
    if (!initialCollapse.current) { initialCollapse.current = true; setCollapsed(new Set((data ?? []).map(c => c.id))) }
    setCatUsage(mergeUsage(countByKey(poLines, 'category_id'), countByKey(reqLines, 'category_id')))
  }

  function openNewCategory(parentId = '') { catReq.reset(); setCatEditing({ name: '', status: 'active', parent_id: parentId }); setCatModalOpen(true) }
  function openEditCategory(c: Category) { catReq.reset(); setCatEditing({ id: c.id, name: c.name, status: c.status, parent_id: c.parent_id ?? '' }); setCatModalOpen(true) }
  function closeCategoryModal() { setCatModalOpen(false); setCatEditing({ name: '', status: 'active', parent_id: '' }) }

  async function saveCategory() {
    if (!company || !catReq.check(catEditing, ['name'], { name: 'cat-name' })) return
    setCatSaving(true)
    const parent_id = catEditing.parent_id || null
    const { error } = catEditing.id
      ? await supabase.from('categories').update({ name: catEditing.name, status: catEditing.status, parent_id, updated_at: new Date().toISOString() }).eq('id', catEditing.id)
      : await supabase.from('categories').insert({ name: catEditing.name, company_id: company.id, status: 'active', parent_id })
    setCatSaving(false)
    if (error) { toast.error(dbError(error, t)); return }
    toast.success(t.common.saved); closeCategoryModal(); loadCategories()
  }

  // A category is in use if any item or any request/PO line references it.
  function categoryInUse(id: string) { return (catUsage.get(id) ?? 0) > 0 || items.some(i => i.category_id === id) || allCategories.some(c => c.parent_id === id) }

  async function handleDeleteCategory(c: Category) {
    setActionLoading(true)
    const { error } = await supabase.from('categories').delete().eq('id', c.id)
    setActionLoading(false); setConfirmDeleteCat(null)
    if (error) { toast.error(dbError(error, t)); return }
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

  function startPickers(subId?: string | null) {
    const sub = allCategories.find(c => c.id === subId && c.parent_id)
    setCatSel(sub ? sub.parent_id! : '')
    setSubSel(sub ? sub.id : '')
  }
  function openNew(categoryId?: string) { req.reset(); setEditing({ ...EMPTY, category_id: categoryId }); startPickers(categoryId); setPriceStr(''); setModalOpen(true) }
  function openEdit(i: ItemWithCategory) { req.reset(); setEditing({ ...i }); startPickers(i.category_id); setPriceStr(i.default_unit_price != null ? String(i.default_unit_price).replace('.', ',') : ''); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing(EMPTY); setPriceStr('') }

  async function save() {
    if (!company) return
    const okName = req.check(editing as Record<string, unknown>, ['name'], { name: 'i-name' })
    const catBad = !catSel
    const subBad = !subSel
    if (catBad) req.setError('cat', t.common.fieldRequired, 'i-cat')
    else if (subBad) req.setError('sub', t.common.fieldRequired, 'i-sub')
    if (!okName || catBad || subBad) return
    setSaving(true)

    const categoryId = subSel

    if (editing.id) {
      const { error } = await supabase.from('items').update({
        name: editing.name,
        long_description: editing.long_description || null,
        category_id: categoryId,
        default_unit: editing.default_unit || null,
        default_unit_price: editing.default_unit_price ?? null,
        status: editing.status,
        updated_at: new Date().toISOString(),
      }).eq('id', editing.id)
      if (error) { toast.error(dbError(error, t)); setSaving(false); return }
      toast.success(t.common.saved)
    } else {
      const itemNumber = await nextItemNumber()
      const { error } = await supabase.from('items').insert({
        company_id: company.id,
        item_number: itemNumber,
        name: editing.name,
        long_description: editing.long_description || null,
        category_id: categoryId,
        default_unit: editing.default_unit || null,
        default_unit_price: editing.default_unit_price ?? null,
        status: 'active',
      })
      if (error) { toast.error(dbError(error, t)); setSaving(false); return }
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
    if (error) { toast.error(dbError(error, t)); return }
    toast.success(t.common.deleted); load()
  }

  const q = search.toLowerCase()
  const filtering = q !== '' || statusFilter !== 'all'
  const filteredItems = items.filter(i =>
    (i.name.toLowerCase().includes(q) || i.item_number.includes(q)) && (statusFilter === 'all' || i.status === statusFilter))

  // Sections: a header per category and per subcategory, each followed by its own items.
  // While filtering, sections with no matching item are hidden.
  interface Section { id: string; name: string; level: 0 | 1; category: Category | null; inactive: boolean; rows: ItemWithCategory[]; total: number; parentId: string | null; leaf: boolean }
  const tree = buildCategoryTree(allCategories)
  const sections: Section[] = []
  for (const { category, children } of tree) {
    const own = filteredItems.filter(i => i.category_id === category.id)
    const subs = children.map(c => ({ c, rows: filteredItems.filter(i => i.category_id === c.id) }))
    const total = own.length + subs.reduce((n, x) => n + x.rows.length, 0)
    if (filtering && total === 0) continue
    if (categoryFilter !== 'all' && categoryFilter !== category.id && !children.some(c => c.id === categoryFilter)) continue
    sections.push({ id: category.id, name: category.name, level: 0, category, inactive: category.status === 'inactive', rows: own, total, parentId: null, leaf: children.length === 0 })
    for (const { c, rows } of subs) {
      if (filtering && rows.length === 0) continue
      if (categoryFilter !== 'all' && categoryFilter !== category.id && categoryFilter !== c.id) continue
      sections.push({ id: c.id, name: c.name, level: 1, category: c, inactive: c.status === 'inactive', rows, total: rows.length, parentId: category.id, leaf: true })
    }
  }
  const legacy = filteredItems.filter(i => !i.category_id)
  if (legacy.length > 0 && categoryFilter === 'all') sections.push({ id: 'none', name: t.dashboard.noCategory, level: 0, category: null, inactive: false, rows: legacy, total: legacy.length, parentId: null, leaf: true })

  // A subcategory is hidden when its category (or itself) is collapsed.
  const isOpen = (sec: Section) => filtering || !(collapsed.has(sec.id) || (sec.parentId && collapsed.has(sec.parentId)))
  const headerOpen = (sec: Section) => filtering || !collapsed.has(sec.id)
  // "All items" view: every item in one list (category filter includes subcategories)
  const flatItems = filteredItems.filter(i => {
    if (categoryFilter === 'all') return true
    const c = allCategories.find(x => x.id === i.category_id)
    return i.category_id === categoryFilter || c?.parent_id === categoryFilter
  })
  useEffect(() => { setPage(1) }, [search, statusFilter, categoryFilter, view])
  const pagedItems = flatItems.slice((page - 1) * pageSize, page * pageSize)
  const pathOf = (categoryId: string | null) => {
    const c = allCategories.find(x => x.id === categoryId)
    const parent = c?.parent_id ? allCategories.find(x => x.id === c.parent_id) : undefined
    return parent ? { top: parent.name, sub: c!.name } : { top: c?.name ?? '—', sub: '—' }
  }

  const hasSubcategories = allCategories.some(c => c.parent_id)
  const preselectSub = allCategories.find(c => c.id === categoryFilter)?.parent_id ? categoryFilter : undefined

  const allCollapsed = sections.length > 0 && sections.every(g => collapsed.has(g.id))
  function toggleAll() { setCollapsed(allCollapsed ? new Set() : new Set(sections.map(g => g.id))) }
  function toggleGroup(id: string) {
    setCollapsed(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  useHeaderTabs(loading ? [] : [
    { id: 'tree', label: t.categories.viewTree, count: allCategories.filter(c => !c.parent_id).length, active: view === 'tree', icon: ListTree },
    { id: 'all', label: t.categories.viewAll, count: filteredItems.length, active: view === 'all', icon: List },
  ], id => setView(id === 'all' ? 'all' : 'tree'))

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar attached actions={<>{view === 'tree' && <Button variant="secondary" onClick={toggleAll} disabled={sections.length === 0} className="!px-0 w-8 h-8" title={allCollapsed ? t.common.expandAll : t.common.collapseAll} aria-label={allCollapsed ? t.common.expandAll : t.common.collapseAll}>{allCollapsed ? <ListChevronsUpDown className="w-4 h-4 text-icon" /> : <ListChevronsDownUp className="w-4 h-4 text-icon" />}</Button>}<div ref={importMenuRef} className="relative">
          <Button variant="secondary" onClick={() => setImportMenuOpen(o => !o)} className="gap-2"><Upload className="w-4 h-4" />{t.common.import.button}<ChevronDown className="w-3.5 h-3.5 text-gray-400" /></Button>
          {importMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 z-40 min-w-[220px] bg-white border border-line rounded-xl shadow-[0_8px_30px_rgba(16,17,18,0.12)] p-1.5 flex flex-col gap-0.5">
              {([[t.common.import.categoriesButton, setImportCatOpen], [t.common.import.subcategoriesButton, setImportSubOpen], [t.common.import.itemsButton, setImportOpen]] as const).map(([label, open]) => (
                <button key={label} type="button" onClick={() => { setImportMenuOpen(false); open(true) }}
                  className="w-full text-left px-3 py-2 rounded-lg text-[14px] text-ink hover:bg-selected transition-colors">{label}</button>
              ))}
            </div>
          )}
        </div><Button variant="secondary" onClick={() => openNewCategory()} className="gap-2"><Plus className="w-4 h-4" />{t.categories.new}</Button><Button onClick={() => openNew(preselectSub)} disabled={!hasSubcategories} title={hasSubcategories ? undefined : t.categories.needSubFirst} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button></>}>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-filter-label" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.common.search + '…'}
            className="w-full pl-9 pr-4 h-8 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:border-field-hover bg-white text-ink placeholder:text-filter-label" />
        </div>
        <FilterSelect label={t.filters.labels.category} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="all">{t.filters.allF}</option>
          {categoryOptions(allCategories, false).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </FilterSelect>
        <FilterSelect label={t.filters.labels.status} value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}>
          {(['all', 'active', 'inactive'] as const).map(v => <option key={v} value={v}>{v === 'all' ? t.common.allM : v === 'active' ? t.common.activeM : t.common.inactiveM}</option>)}
        </FilterSelect>
      </PageToolbar>

      {view === 'tree' && (
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
              {sections.length === 0 ? (
                <TableEmptyState icon={filtering ? Package : Tag} colSpan={6}
                  title={filtering ? t.common.empty.noResults.title : t.common.empty.categories.title}
                  subtitle={filtering ? t.common.empty.noResults.text : t.common.empty.categories.text}
                  action={filtering ? undefined : <Button onClick={() => openNewCategory()} className="gap-2 mt-2"><Plus className="w-4 h-4" />{t.categories.new}</Button>} />
              ) : sections.map(g => {
                const showItems = isOpen(g)
                // a subcategory row is only shown when its category is open
                if (g.level === 1 && !(filtering || !(g.parentId && collapsed.has(g.parentId)))) return null
                return (
                  <Fragment key={g.id}>
                    {/* Category / subcategory header row */}
                    <tr className={`${g.level === 0 ? 'bg-surface hover:bg-hover' : 'hover:bg-surface'} cursor-pointer select-none group`} onClick={() => toggleGroup(g.id)}>
                      <td colSpan={6} className="!py-2.5">
                        <div className={`flex items-center gap-2 ${g.level === 1 ? 'ml-6' : ''}`}>
                          {headerOpen(g) ? <ChevronDown className="w-4 h-4 text-icon shrink-0" /> : <ChevronRight className="w-4 h-4 text-icon shrink-0" />}
                          <span className={`${g.level === 0 ? 'font-medium' : ''} ${g.inactive ? 'text-muted' : 'text-ink'}`}>{g.name}</span>
                          <span className="text-xs text-gray-400 tabular-nums">{g.total}</span>
                          {g.inactive && <span className="badge badge-neutral">{t.common.inactiveF}</span>}

                          <div className="ml-auto flex items-center gap-1">
                            {g.category && (
                              <>
                                <button onClick={e => { e.stopPropagation(); openEditCategory(g.category!) }}
                                  className="p-1 text-gray-400 hover:text-ink rounded-md opacity-0 group-hover:opacity-100 transition-opacity" title={t.common.editEntity}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button disabled={categoryInUse(g.category.id)} onClick={e => { e.stopPropagation(); setConfirmDeleteCat(g.category!) }}
                                  title={categoryInUse(g.category.id) ? `${t.common.cannotDelete} ${t.common.deactivateInstead}` : t.common.deleteEntity}
                                  className="p-1 text-gray-400 hover:text-red-600 rounded-md opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-not-allowed disabled:hover:text-gray-400">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                {/* Add: a subcategory under a category, an item under a subcategory */}
                                <button onClick={e => { e.stopPropagation(); g.level === 0 ? openNewCategory(g.id) : openNew(g.id) }}
                                  className="ml-1 inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs text-ink2 hover:text-ink hover:bg-selected transition-colors">
                                  <Plus className="w-3.5 h-3.5" />{g.level === 0 ? t.categories.addSub : t.categories.addItem}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {showItems && g.rows.map(item => {
                      const count = usage.get(item.id) ?? 0
                      const inUse = count > 0
                      return (
                        <tr key={item.id} className="hover:bg-surface transition-colors">
                          <td className="px-4 py-3 text-xs text-gray-500 font-medium" style={g.level === 1 ? { paddingLeft: 'calc(var(--page-px) + 3rem)' } : undefined}>{item.item_number}</td>
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

                  </Fragment>
                )
              })}
              {sections.length > 0 && !filtering && categoryFilter === 'all' && (
                <tr>
                  <td colSpan={6} className="!py-2">
                    <button onClick={() => openNewCategory()} className="inline-flex items-center gap-1.5 text-sm text-ink2 hover:text-ink transition-colors">
                      <Plus className="w-4 h-4" />{t.categories.addCategory}
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table></div>
        )}
      </div>

      )}

      {view === 'all' && (
        <div className="data-card table-bleed bg-white rounded-lg border border-field overflow-hidden">
          {loading ? (
            <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[820px]">
              <thead className="bg-surface border-b border-field">
                <tr>
                  {[s.itemNumber, t.common.name, t.categories.title, t.categories.subcategory, s.defaultUnit, s.defaultUnitPrice, t.common.status, ''].map((h, i) => (
                    <th key={i} className="text-left px-4 py-3 text-sm font-medium text-ink2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-field">
                {flatItems.length === 0 ? (
                  <TableEmptyState icon={Package} colSpan={8}
                    title={(search || statusFilter !== 'all' || categoryFilter !== 'all') ? t.common.empty.noResults.title : t.common.empty.items.title}
                    subtitle={(search || statusFilter !== 'all' || categoryFilter !== 'all') ? t.common.empty.noResults.text : t.common.empty.items.text} />
                ) : pagedItems.map(item => {
                  const count = usage.get(item.id) ?? 0
                  const inUse = count > 0
                  const path = pathOf(item.category_id)
                  return (
                    <tr key={item.id} className="hover:bg-surface transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-500 font-medium">{item.item_number}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{item.name}</p>
                        {item.long_description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{item.long_description}</p>}
                      </td>
                      <td className="px-4 py-3 text-ink2">{path.top}</td>
                      <td className="px-4 py-3 text-ink2">{path.sub}</td>
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
              </tbody>
            </table></div>
          )}
          <Pagination total={flatItems.length} page={page} pageSize={pageSize} onChange={setPage} onPageSizeChange={n => { setPageSize(n); setPage(1) }} />
        </div>
      )}

      {/* 1) main categories */}
      <ImportModal open={importCatOpen} onClose={() => setImportCatOpen(false)} title={t.common.import.categoriesTitle}
        templateName="categories"
        columns={[{ key: 'name', label: t.common.import.cols.name, required: true, example: 'Hrana' }]}
        existing={new Set(allCategories.filter(c => !c.parent_id).map(c => c.name.toLowerCase()))}
        keyOf={row => row.name.toLowerCase()}
        onImport={async rows => {
          const { error } = await supabase.from('categories').insert(rows.map(r => ({ company_id: company!.id, name: r.name, status: 'active' })))
          if (error) throw error
          loadCategories()
        }} />

      {/* 2) subcategories: each names its (existing) category */}
      <ImportModal open={importSubOpen} onClose={() => setImportSubOpen(false)} title={t.common.import.subcategoriesTitle}
        templateName="subcategories"
        columns={[
          { key: 'name', label: t.categories.subcategory, required: true, example: 'Meso in mesni izdelki' },
          { key: 'category', label: t.common.import.cols.category, required: true, example: 'Hrana' },
        ]}
        existing={new Set(allCategories.filter(c => c.parent_id).map(c => `${(allCategories.find(p => p.id === c.parent_id)?.name ?? '').toLowerCase()}›${c.name.toLowerCase()}`))}
        keyOf={row => `${row.category.toLowerCase()}›${row.name.toLowerCase()}`}
        validate={row => allCategories.some(c => !c.parent_id && c.name.toLowerCase() === row.category.toLowerCase()) ? null : `${t.common.import.unknownCategory}: ${row.category}`}
        onImport={async rows => {
          const top = new Map(allCategories.filter(c => !c.parent_id).map(c => [c.name.toLowerCase(), c.id]))
          const { error } = await supabase.from('categories').insert(rows.map(r => ({ company_id: company!.id, name: r.name, status: 'active', parent_id: top.get(r.category.toLowerCase()) })))
          if (error) throw error
          loadCategories()
        }} />

      {/* 3) items: each names its existing category and subcategory */}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} title={t.common.import.itemsTitle}
        templateName="catalog"
        columns={[
          { key: 'name', label: t.common.import.cols.name, required: true, example: 'Olivno olje 1 L' },
          { key: 'category', label: t.common.import.cols.category, required: true, example: 'Hrana' },
          { key: 'subcategory', label: t.common.import.cols.subcategory, required: true, example: 'Začimbe, olja in omake' },
          { key: 'unit', label: t.common.import.cols.unit, example: 'kos' },
          { key: 'price', label: t.common.import.cols.price, example: '5,90' },
          { key: 'description', label: t.common.import.cols.description, example: 'Ekstra deviško' },
        ]}
        existing={new Set(items.map(i => i.name.toLowerCase()))}
        keyOf={row => row.name.toLowerCase()}
        validate={row => {
          if (row.price && Number.isNaN(Number(row.price.replace(',', '.')))) return t.common.import.invalidNumber + ': ' + row.price
          const top = allCategories.find(c => !c.parent_id && c.name.toLowerCase() === row.category.toLowerCase())
          if (!top) return `${t.common.import.unknownCategory}: ${row.category}`
          if (!allCategories.some(c => c.parent_id === top.id && c.name.toLowerCase() === row.subcategory.toLowerCase())) return `${t.common.import.unknownSubcategory}: ${row.subcategory}`
          return null
        }}
        onImport={async rows => {
          const top = new Map(allCategories.filter(c => !c.parent_id).map(c => [c.name.toLowerCase(), c.id]))
          const sub = new Map(allCategories.filter(c => c.parent_id).map(c => [`${c.parent_id}|${c.name.toLowerCase()}`, c.id]))
          // Item numbers continue after the highest existing one.
          const last = items.reduce((m, i) => Math.max(m, parseInt(i.item_number, 10) || 0), 100000)
          const payload = rows.map((r, i) => ({
            company_id: company!.id, item_number: String(last + 1 + i), name: r.name,
            long_description: r.description || null,
            category_id: sub.get(`${top.get(r.category.toLowerCase())}|${r.subcategory.toLowerCase()}`),
            default_unit: r.unit || null,
            default_unit_price: r.price ? Number(r.price.replace(',', '.')) : null,
            status: 'active',
          }))
          for (let k = 0; k < payload.length; k += 500) {
            const { error } = await supabase.from('items').insert(payload.slice(k, k + 500))
            if (error) throw error
          }
          load()
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
              className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:border-field-focus resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="i-cat" className="text-sm font-medium text-gray-700">{t.categories.title} *</label>
              <select id="i-cat" value={catSel}
                onChange={e => { req.clear('cat'); req.clear('sub'); setCatSel(e.target.value); setSubSel('') }}
                className={`rounded-lg border px-3 py-2 text-sm bg-white focus:outline-none ${req.errors.cat ? 'border-red-400' : 'border-field hover:border-field-hover focus:border-field-focus'}`}>
                <option value="">{t.common.select}</option>
                {tree.filter(n => n.category.status === 'active' || n.category.id === catSel).map(n => <option key={n.category.id} value={n.category.id}>{n.category.name}</option>)}
              </select>
              {req.errors.cat && <p className="text-xs text-red-600">{req.errors.cat}</p>}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="i-sub" className="text-sm font-medium text-gray-700">{t.categories.subcategory} *</label>
              <select id="i-sub" value={subSel} disabled={!catSel}
                onChange={e => { req.clear('sub'); setSubSel(e.target.value) }}
                className={`rounded-lg border px-3 py-2 text-sm bg-white focus:outline-none ${req.errors.sub ? 'border-red-400' : 'border-field hover:border-field-hover focus:border-field-focus'}` + ' disabled:bg-gray-50 disabled:text-gray-400'}>
                <option value="">{t.common.select}</option>
                {(tree.find(n => n.category.id === catSel)?.children ?? []).filter(c => c.status === 'active' || c.id === subSel).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {req.errors.sub && <p className="text-xs text-red-600">{req.errors.sub}</p>}
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

      <Modal open={catModalOpen} onClose={closeCategoryModal} title={catEditing.id ? t.common.editEntity : catEditing.parent_id ? t.categories.newSub : t.categories.new} size="sm">
        <Input id="cat-name" label={(catEditing.parent_id ? t.categories.subcategory : t.categories.categoryName) + ' *'} value={catEditing.name} error={catReq.errors.name} onChange={e => { catReq.clear('name'); setCatEditing(f => ({ ...f, name: e.target.value })) }} />
        {catEditing.parent_id && (
          <p className="text-sm text-ink2 mt-3">{t.categories.parent}: <span className="text-ink font-medium">{allCategories.find(c => c.id === catEditing.parent_id)?.name}</span></p>
        )}
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
