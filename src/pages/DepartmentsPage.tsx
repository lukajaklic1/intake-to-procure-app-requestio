import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { toast } from '../components/ui/Toast'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Pagination from '../components/ui/Pagination'
import type { Department } from '../types/database'
import { useLanguage } from '../hooks/useLanguage'
import { stOddelkov } from '../utils/pluralize'

const PAGE_SIZE = 20

export default function DepartmentsPage() {
  const { company } = useCompany()
  const { t } = useLanguage()
  const s = t.departments
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<{ id?: string; name: string }>({ name: '' })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Department | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    if (!company) return
    setLoading(true)
    const { data } = await supabase.from('departments').select('*').eq('company_id', company.id).order('name')
    setDepartments(data ?? [])
    setLoading(false)
  }

  function openNew() { setEditing({ name: '' }); setModalOpen(true) }
  function openEdit(d: Department) { setEditing({ id: d.id, name: d.name }); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing({ name: '' }) }

  async function save() {
    if (!company || !editing.name.trim()) { toast.error(t.common.nameRequired); return }
    setSaving(true)
    if (editing.id) {
      const { error } = await supabase.from('departments').update({ name: editing.name, updated_at: new Date().toISOString() }).eq('id', editing.id)
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success(t.common.saved)
    } else {
      const { error } = await supabase.from('departments').insert({ name: editing.name, company_id: company.id })
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success(t.common.saved)
    }
    setSaving(false); closeModal(); load()
  }

  async function handleDelete(d: Department) {
    setActionLoading(true)
    const { count } = await supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).eq('department_id', d.id)
    if ((count ?? 0) > 0) {
      setActionLoading(false); setConfirmDelete(null)
      toast.error(`Cannot delete — used on ${count} PO(s).`); return
    }
    const { error } = await supabase.from('departments').delete().eq('id', d.id)
    setActionLoading(false); setConfirmDelete(null)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.deleted); load()
  }

  const filtered = departments.filter(d => d.name.toLowerCase().includes(search.toLowerCase()))

  useEffect(() => { setPage(1) }, [search])
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{s.title}</h1>
          <p className="text-gray-500 text-sm mt-1">{stOddelkov(departments.length)}</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" />{s.new}</Button>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={"Išči oddelke..."}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Users className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">{search ? s.noMatch : s.noData}</p>
            {!search && <button onClick={openNew} className="mt-3 text-sm text-blue-600 hover:underline font-medium">{s.createFirst}</button>}
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t.common.name}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{t.common.created}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(d => (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(d.created_at).toLocaleDateString('de-DE')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(d)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setConfirmDelete(d)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onChange={setPage} />

      <Modal open={modalOpen} onClose={closeModal} title={editing.id ? 'Uredi oddelek' : 'Nov oddelek'} size="sm">
        <Input id="dept-name" label={s.departmentName + " *"} value={editing.name} onChange={e => setEditing(f => ({ ...f, name: e.target.value }))} />
        <div className="flex gap-3 justify-end mt-5">
          <Button variant="secondary" onClick={closeModal}>{t.common.cancel}</Button>
          <Button loading={saving} onClick={save}>{editing.id ? t.common.saveChanges : t.common.create}</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title="Izbriši" danger loading={actionLoading}
        message={`Izbriši "${confirmDelete?.name}"? Brisanje ne bo mogoče, če je oddelek v uporabi na naročilih.`}
        confirmLabel="Izbriši" />
    </div>
  )
}
