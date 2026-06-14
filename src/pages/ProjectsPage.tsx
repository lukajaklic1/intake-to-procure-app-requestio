import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, FolderOpen } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { toast } from '../components/ui/Toast'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Pagination from '../components/ui/Pagination'
import type { Project } from '../types/database'
import { useLanguage } from '../hooks/useLanguage'
import { stProjektov } from '../utils/pluralize'

const PAGE_SIZE = 20

const EMPTY: Partial<Project> = { name: '', project_code: '', customer: '', start_date: null, end_date: null, status: 'active' }

export default function ProjectsPage() {
  const { company } = useCompany()
  const { t } = useLanguage()
  const s = t.projects
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Partial<Project>>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [members, setMembers] = useState<{ id: string; first_name: string; last_name: string }[]>([])
  const [budgetStr, setBudgetStr] = useState('')

  useEffect(() => { if (company) load() }, [company])

  async function load() {
    if (!company) return
    setLoading(true)
    const [{ data }, { data: usersData }] = await Promise.all([
      supabase.from('projects').select('*').eq('company_id', company.id).order('created_at', { ascending: false }),
      supabase.from('users').select('id, first_name, last_name').eq('company_id', company.id).order('first_name'),
    ])
    setProjects(data ?? [])
    setMembers(usersData ?? [])
    setLoading(false)
  }

  const managerName = (id: string | null) => {
    const m = members.find(u => u.id === id)
    return m ? `${m.first_name} ${m.last_name}` : '—'
  }

  const currency = company?.currency ?? 'EUR'
  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
  const fmtNum = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(n)
  const parseBudget = (str: string): number | null => {
    const clean = str.replace(/\./g, '').replace(',', '.').trim()
    if (clean === '') return null
    const n = parseFloat(clean)
    return isNaN(n) ? null : n
  }

  function openNew() { setEditing({ ...EMPTY }); setBudgetStr(''); setModalOpen(true) }
  function openEdit(p: Project) { setEditing({ ...p }); setBudgetStr(p.budget_amount != null ? fmtNum(p.budget_amount) : ''); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing(EMPTY); setBudgetStr('') }

  function field(key: keyof Project) {
    return { value: (editing[key] as string) ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setEditing(f => ({ ...f, [key]: e.target.value })) }
  }

  async function save() {
    if (!company || !editing.name?.trim()) { toast.error(t.common.nameRequired); return }
    if (!editing.manager_id) { toast.error(s.manager + ' *'); return }
    setSaving(true)
    const payload = { ...editing, start_date: editing.start_date || null, end_date: editing.end_date || null, budget_amount: parseBudget(budgetStr) }
    if (editing.id) {
      const { error } = await supabase.from('projects').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing.id)
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success(t.common.saved)
    } else {
      const { error } = await supabase.from('projects').insert({ ...payload, company_id: company.id, status: 'active' })
      if (error) { toast.error(error.message); setSaving(false); return }
      toast.success(t.common.saved)
    }
    setSaving(false); closeModal(); load()
  }

  async function handleDelete(p: Project) {
    setActionLoading(true)
    const { count } = await supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).eq('project_id', p.id)
    if ((count ?? 0) > 0) {
      setActionLoading(false); setConfirmDelete(null)
      toast.error(`Cannot delete — used on ${count} PO(s). Deactivate instead.`); return
    }
    const { error } = await supabase.from('projects').delete().eq('id', p.id)
    setActionLoading(false); setConfirmDelete(null)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.deleted); load()
  }

  const filtered = projects.filter(p => {
    const q = search.toLowerCase()
    return (p.name.toLowerCase().includes(q) || (p.project_code ?? '').toLowerCase().includes(q) || (p.customer ?? '').toLowerCase().includes(q))
      && (statusFilter === 'all' || p.status === statusFilter)
  })

  useEffect(() => { setPage(1) }, [search, statusFilter])
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{s.title}</h1>
          <p className="text-gray-500 text-sm mt-1">{stProjektov(projects.filter(p => p.status === 'active').length)}</p>
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
            {v === 'all' ? t.common.allM : v === 'active' ? t.common.activeM : t.common.inactiveM}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <FolderOpen className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">{search ? s.noMatch : s.noData}</p>
            {!search && <button onClick={openNew} className="mt-3 text-sm text-blue-600 hover:underline font-medium">{s.createFirst}</button>}
          </div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{[t.common.name, s.projectCode, s.customer, s.manager, s.budget, s.startDate, s.endDate, t.common.status, ''].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.project_code ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.customer ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{managerName(p.manager_id)}</td>
                  <td className="px-4 py-3 text-gray-700 font-medium">{p.budget_amount != null ? fmt(p.budget_amount) : '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p.start_date ? new Date(p.start_date).toLocaleDateString('de-DE') : '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p.end_date ? new Date(p.end_date).toLocaleDateString('de-DE') : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{p.status === 'active' ? t.common.active : t.common.inactive}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setConfirmDelete(p)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
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
          <div className="col-span-2"><Input id="p-name" label={s.projectName + " *"} {...field('name')} /></div>
          <Input id="p-code" label={s.projectCode} {...field('project_code')} />
          <Input id="p-customer" label={s.customer} {...field('customer')} />
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">{s.manager} *</label>
            <select value={editing.manager_id ?? ''} onChange={e => setEditing(f => ({ ...f, manager_id: e.target.value || null }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">{s.selectManager}</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
            </select>
            <p className="text-xs text-gray-400">{s.managerHint}</p>
          </div>
          <Input id="p-start" label={s.startDate} type="date" {...field('start_date')} />
          <Input id="p-end" label={s.endDate} type="date" {...field('end_date')} />
          <div className="col-span-2">
            <Input id="p-budget" label={`${s.budget} (${currency})`} inputMode="decimal"
              value={budgetStr}
              onChange={e => { if (/^[\d.,\s]*$/.test(e.target.value)) setBudgetStr(e.target.value) }}
              onBlur={() => { const n = parseBudget(budgetStr); setBudgetStr(n != null ? fmtNum(n) : '') }} />
          </div>

          {editing.id && (
            <div className="col-span-2 flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {editing.status === 'active' ? t.common.statusActive : t.common.statusInactive}
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
