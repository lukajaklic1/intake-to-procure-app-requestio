import { useEffect, useState } from 'react'
import { Upload, Plus, Search, Pencil, Trash2, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { toast } from '../components/ui/Toast'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Pagination from '../components/ui/Pagination'
import ImportModal from '../components/ui/ImportModal'
import PageToolbar from '../components/layout/PageToolbar'
import { useHeaderCounts } from '../components/layout/HeaderCounts'
import FilterSelect from '../components/ui/FilterSelect'
import TableEmptyState from '../components/ui/TableEmptyState'
import type { Department } from '../types/database'
import { useLanguage } from '../hooks/useLanguage'
import { useRequired } from '../lib/useRequired'
import { poLocSl, poCountEn } from '../utils/pluralize'
import { countByKey } from '../lib/usageCounts'

export default function DepartmentsPage() {
  const { company } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.departments
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const req = useRequired(t.common.fieldRequired)
  const [importOpen, setImportOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<{ id?: string; name: string; status: 'active' | 'inactive' }>({ name: '', status: 'active' })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Department | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [usage, setUsage] = useState<Map<string, number>>(new Map())

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    if (!company) return
    setLoading(true)
    const [{ data }, { data: poRows }] = await Promise.all([
      supabase.from('departments').select('*').eq('company_id', company.id).order('name'),
      supabase.from('purchase_orders').select('department_id').eq('company_id', company.id),
    ])
    setDepartments(data ?? [])
    setUsage(countByKey(poRows, 'department_id'))
    setLoading(false)
  }

  function openNew() { req.reset(); setEditing({ name: '', status: 'active' }); setModalOpen(true) }
  function openEdit(d: Department) { req.reset(); setEditing({ id: d.id, name: d.name, status: d.status }); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing({ name: '', status: 'active' }) }

  async function save() {
    if (!company || !req.check(editing, ['name'], { name: 'dept-name' })) return
    setSaving(true)
    if (editing.id) {
      const { error } = await supabase.from('departments').update({ name: editing.name, status: editing.status, updated_at: new Date().toISOString() }).eq('id', editing.id)
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success(t.common.saved)
    } else {
      const { error } = await supabase.from('departments').insert({ name: editing.name, company_id: company.id, status: 'active' })
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success(t.common.saved)
    }
    setSaving(false); closeModal(); load()
  }

  async function handleDelete(d: Department) {
    setActionLoading(true)
    const { error } = await supabase.from('departments').delete().eq('id', d.id)
    setActionLoading(false); setConfirmDelete(null)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.deleted); load()
  }

  const filtered = departments.filter(d => d.name.toLowerCase().includes(search.toLowerCase()) && (statusFilter === 'all' || d.status === statusFilter))

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
            className="w-full pl-9 pr-4 h-8 text-sm border border-field rounded-lg hover:border-field-hover focus:outline-none focus:border-field-focus bg-white text-ink placeholder:text-filter-label" />
        </div>
        <FilterSelect label={t.filters.labels.status} value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}>
          {(['all', 'active', 'inactive'] as const).map(v => <option key={v} value={v}>{v === 'all' ? t.common.allM : v === 'active' ? t.common.activeM : t.common.inactiveM}</option>)}
        </FilterSelect>
      </PageToolbar>

      <div className="data-card table-bleed bg-white rounded-lg border border-field overflow-hidden">
        {loading ? (
          <div data-empty className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
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
                <TableEmptyState icon={Users} colSpan={4} title={search ? t.common.empty.noResults.title : t.common.empty.departments.title} subtitle={search ? t.common.empty.noResults.text : t.common.empty.departments.text} />
              ) : paginated.map(d => {
                const count = usage.get(d.id) ?? 0
                const inUse = count > 0
                return (
                <tr key={d.id} className="hover:bg-surface transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{d.name}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${d.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>{d.status === 'active' ? t.common.active : t.common.inactive}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(d.created_at).toLocaleDateString('de-DE')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(d)} className="p-1.5 text-gray-400 hover:text-accent hover:bg-accent-light rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                      <button disabled={inUse} onClick={() => !inUse && setConfirmDelete(d)}
                        title={inUse ? (lang === 'sl' ? `${t.common.cannotDelete} ${t.common.usedOn} ${poLocSl(count)}. ${t.common.deactivateInstead}` : `${t.common.cannotDelete} ${t.common.usedOn} ${poCountEn(count)}. ${t.common.deactivateInstead}`) : undefined}
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

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} title={t.common.import.title}
        templateName="departments"
        columns={[{ key: 'name', label: t.common.import.cols.name, required: true, example: 'Kuhinja' }]}
        existing={new Set(departments.map(d => d.name.toLowerCase()))}
        keyOf={row => row.name.toLowerCase()}
        onImport={async rows => {
          const { error } = await supabase.from('departments').insert(rows.map(r => ({ company_id: company!.id, name: r.name, status: 'active' })))
          if (error) throw error
          load()
        }} />

      <Modal open={modalOpen} onClose={closeModal} title={editing.id ? t.common.editEntity : s.new} size="sm">
        <Input id="dept-name" label={s.departmentName + " *"} value={editing.name} error={req.errors.name} onChange={e => { req.clear('name'); setEditing(f => ({ ...f, name: e.target.value })) }} />
        {editing.id && (
          <div className="flex items-center justify-between p-3 mt-4 bg-gray-50 rounded-lg border border-field">
            <div>
              <p className="text-sm font-medium text-gray-700">
                {editing.status === 'active' ? t.common.statusActive : t.common.statusInactive}
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
