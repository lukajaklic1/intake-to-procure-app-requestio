import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Tag } from 'lucide-react'
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
import type { Category } from '../types/database'
import { useLanguage } from '../hooks/useLanguage'
import { poLocSl, poCountEn, itemLocSl, itemCountEn } from '../utils/pluralize'
import { countByKey } from '../lib/usageCounts'

export default function CategoriesPage() {
  const { company } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.categories
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<{ id?: string; name: string; status: 'active' | 'inactive' }>({ name: '', status: 'active' })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [poUsage, setPoUsage] = useState<Map<string, number>>(new Map())
  const [itemUsage, setItemUsage] = useState<Map<string, number>>(new Map())

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    if (!company) return
    setLoading(true)
    const [{ data }, { data: poRows }, { data: itemRows }] = await Promise.all([
      supabase.from('categories').select('*').eq('company_id', company.id).order('name'),
      supabase.from('purchase_orders').select('category_id').eq('company_id', company.id),
      supabase.from('items').select('category_id').eq('company_id', company.id),
    ])
    setCategories(data ?? [])
    setPoUsage(countByKey(poRows, 'category_id'))
    setItemUsage(countByKey(itemRows, 'category_id'))
    setLoading(false)
  }

  function openNew() { setEditing({ name: '', status: 'active' }); setModalOpen(true) }
  function openEdit(c: Category) { setEditing({ id: c.id, name: c.name, status: c.status }); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing({ name: '', status: 'active' }) }

  async function save() {
    if (!company || !editing.name.trim()) { toast.error(t.common.nameRequired); return }
    setSaving(true)
    if (editing.id) {
      const { error } = await supabase.from('categories').update({ name: editing.name, status: editing.status, updated_at: new Date().toISOString() }).eq('id', editing.id)
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success(t.common.saved)
    } else {
      const { error } = await supabase.from('categories').insert({ name: editing.name, company_id: company.id, status: 'active' })
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success(t.common.saved)
    }
    setSaving(false); closeModal(); load()
  }

  async function handleDelete(c: Category) {
    setActionLoading(true)
    const { error } = await supabase.from('categories').delete().eq('id', c.id)
    setActionLoading(false); setConfirmDelete(null)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.deleted); load()
  }

  const filtered = categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) && (statusFilter === 'all' || c.status === statusFilter))

  useEffect(() => { setPage(1) }, [search, statusFilter])
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)
  function handlePageSizeChange(n: number) { setPageSize(n); setPage(1) }

  return (
    <div className="p-4 lg:p-6">
      <PageToolbar actions={<Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button>}>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.common.search + '…'}
            className="w-full pl-9 pr-4 py-1.5 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:ring-2 focus:ring-accent bg-white text-ink placeholder:text-placeholder" />
        </div>
        {(['all', 'active', 'inactive'] as const).map(v => (
          <button key={v} onClick={() => setStatusFilter(v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === v ? 'bg-ink text-white' : 'bg-white border border-field text-gray-600 hover:bg-surface'}`}>
            {v === 'all' ? t.common.allM : v === 'active' ? t.common.activeFPl : t.common.inactiveFPl}
          </button>
        ))}
      </PageToolbar>

      <div className="bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
            <thead className="bg-surface border-b border-field">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-ink2">{t.common.name}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-ink2">{t.common.status}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-ink2">{t.common.created}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-field">
              {filtered.length === 0 ? (
                <TableEmptyState icon={Tag} colSpan={4} subtitle={search ? s.noMatch : s.noData} />
              ) : paginated.map(c => {
                const poCount = poUsage.get(c.id) ?? 0
                const itemCount = itemUsage.get(c.id) ?? 0
                const inUse = poCount > 0 || itemCount > 0
                const parts = lang === 'sl'
                  ? [poCount > 0 ? poLocSl(poCount) : null, itemCount > 0 ? itemLocSl(itemCount) : null].filter(Boolean).join(` ${t.common.andWord} `)
                  : [poCount > 0 ? poCountEn(poCount) : null, itemCount > 0 ? itemCountEn(itemCount) : null].filter(Boolean).join(` ${t.common.andWord} `)
                return (
                <tr key={c.id} className="hover:bg-surface transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.status === 'active' ? 'bg-success-light text-success' : 'bg-selected text-muted'}`}>{c.status === 'active' ? t.common.activeF : t.common.inactiveF}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(c.created_at).toLocaleDateString('de-DE')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-accent hover:bg-accent-light rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                      <button disabled={inUse} onClick={() => !inUse && setConfirmDelete(c)}
                        title={inUse ? `${t.common.cannotDelete} ${t.common.usedOn} ${parts}. ${t.common.deactivateInstead}` : undefined}
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

      <Modal open={modalOpen} onClose={closeModal} title={editing.id ? t.common.editEntity : s.new} size="sm">
        <Input id="cat-name" label={s.categoryName + " *"} value={editing.name} onChange={e => setEditing(f => ({ ...f, name: e.target.value }))} />
        {editing.id && (
          <div className="flex items-center justify-between p-3 mt-4 bg-gray-50 rounded-lg border border-field">
            <div>
              <p className="text-sm font-medium text-gray-700">
                {editing.status === 'active' ? t.common.statusActiveF : t.common.statusInactiveF}
              </p>
              <p className="text-xs text-gray-400">{s.statusHelp}</p>
            </div>
            <button type="button"
              onClick={() => setEditing(f => ({ ...f, status: f.status === 'active' ? 'inactive' : 'active' }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${editing.status === 'active' ? 'bg-accent' : 'bg-gray-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editing.status === 'active' ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        )}
        <div className="flex gap-3 justify-end mt-5">
          <Button variant="secondary" onClick={closeModal}>{t.common.cancel}</Button>
          <Button loading={saving} onClick={save}>{editing.id ? t.common.saveChanges : t.common.create}</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title={t.common.deleteEntity} danger loading={actionLoading}
        message={`${t.common.deleteEntity} "${confirmDelete?.name}"? ${t.common.cannotUndo} ${t.common.deleteInUse}`}
        confirmLabel={t.common.deleteEntity} />
    </div>
  )
}
