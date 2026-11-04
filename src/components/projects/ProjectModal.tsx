import { useEffect, useState } from 'react'
import { Briefcase } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCompany } from '../../hooks/useCompany'
import { useLanguage } from '../../hooks/useLanguage'
import { useRequired } from '../../lib/useRequired'
import { dbError } from '../../lib/dbError'
import { toast } from '../ui/Toast'
import Modal from '../ui/Modal'
import ModalFooter from '../ui/ModalFooter'
import ConfirmDialog from '../ui/ConfirmDialog'
import Input from '../ui/Input'
import Select from '../ui/Select'
import StatusSelect from '../ui/StatusSelect'
import type { Project } from '../../types/database'

interface Props {
  open: boolean
  onClose: () => void
  project: Project | null
  members: { id: string; name: string }[]
  onSaved: () => void
  onDeleted?: () => void
}

const toNum = (v: string) => { const n = Number(v.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const num2 = (n: number | null | undefined) => (n ? String(n).replace('.', ',') : '')
const EMPTY = { project_code: '', name: '', manager_id: '', start_date: '', end_date: '', budget: '', description: '', status: 'active' as 'active' | 'inactive' }

/** Creating and changing a project: name, code, project manager, period, budget. The project manager is the person responsible for it. */
export default function ProjectModal({ open, onClose, project, members, onSaved, onDeleted }: Props) {
  const { company } = useCompany()
  const { t } = useLanguage()
  const s = t.projects
  const req = useRequired(t.common.fieldRequired)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    req.reset()
    setForm(project ? {
      project_code: project.project_code ?? '', name: project.name, manager_id: project.manager_id ?? '', start_date: project.start_date ?? '', end_date: project.end_date ?? '',
      budget: num2(project.budget_amount), description: project.description ?? '', status: project.status,
    } : EMPTY)
  }, [open, project?.id])

  const set = (k: keyof typeof EMPTY, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!company || !req.check(form, ['name'], { name: 'pr-name' })) return
    if (form.start_date && form.end_date && form.end_date < form.start_date) { req.setError('end_date', t.invoices.dueBeforeInvoice, 'pr-end'); return }
    setSaving(true)
    const payload = {
      project_code: form.project_code.trim() || null, name: form.name.trim(), manager_id: form.manager_id || null,
      start_date: form.start_date || null, end_date: form.end_date || null, budget_amount: toNum(form.budget) || null,
      description: form.description.trim() || null,
    }
    const { error } = project
      ? await supabase.from('projects').update({ ...payload, status: form.status, updated_at: new Date().toISOString() }).eq('id', project.id)
      : await supabase.from('projects').insert({ ...payload, company_id: company.id, status: 'active' })
    setSaving(false)
    if (error) { toast.error(dbError(error, t)); return }
    toast.success(t.common.saved); onSaved(); onClose()
  }

  async function remove() {
    if (!project) return
    setDeleting(true)
    const { error } = await supabase.from('projects').delete().eq('id', project.id)
    setDeleting(false); setConfirmDelete(false)
    if (error) { toast.error(s.deleteBlockedMsg); return }
    toast.success(t.common.deleted); onClose(); onDeleted?.(); onSaved()
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title={project ? s.edit : s.new} size="md" icon={Briefcase}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
          <Input id="pr-code" label={s.code} value={form.project_code} onChange={e => set('project_code', e.target.value)} />
          <Input id="pr-name" label={s.projectName + ' *'} value={form.name} error={req.errors.name} onChange={e => { req.clear('name'); set('name', e.target.value) }} />
          <div className="sm:col-span-2">
            <Select id="pr-manager" label={s.manager} value={form.manager_id} placeholder={s.selectManager} options={[{ value: '', label: '-' }, ...members.map(m => ({ value: m.id, label: m.name }))]} onChange={v => set('manager_id', v)} />
            <p className="text-xs text-ink2 mt-1.5">{s.managerHint}</p>
          </div>
          <Input id="pr-start" label={s.startDate} type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          <Input id="pr-end" label={s.endDate} type="date" min={form.start_date} value={form.end_date} error={req.errors.end_date} onChange={e => { req.clear('end_date'); set('end_date', e.target.value) }} />
          <div className="sm:col-span-2">
            <Input id="pr-budget" label={`${s.budget} (${company?.currency ?? 'EUR'})`} inputMode="decimal" placeholder="0,00" value={form.budget}
              onChange={e => { if (/^[0-9\s]*[,.]?[0-9]*$/.test(e.target.value)) set('budget', e.target.value) }} />
            <p className="text-xs text-ink2 mt-1.5">{s.projectBudgetHint}</p>
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1">
            <label htmlFor="pr-desc" className="text-sm font-medium text-gray-700">{s.description}</label>
            <textarea id="pr-desc" rows={3} value={form.description} onChange={e => set('description', e.target.value)}
              className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:border-field-focus resize-none" />
          </div>
          {project && (
            <div className="sm:col-span-2">
              <StatusSelect active={form.status === 'active'} activeLabel={t.common.statusActive} inactiveLabel={t.common.statusInactive}
                onChange={on => set('status', on ? 'active' : 'inactive')} />
            </div>
          )}
        </div>
        <ModalFooter onCancel={onClose} onSave={save} saving={saving} saveLabel={project ? t.common.saveChanges : t.common.create}
          onDelete={project ? () => setConfirmDelete(true) : undefined} />
      </Modal>
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={remove}
        title={s.deleteTitle} message={s.deleteQuestion} name={project?.name ?? ''} danger loading={deleting} confirmLabel={t.common.deleteEntity} />
    </>
  )
}
