import { FileSignature } from 'lucide-react'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useCompany } from '../../hooks/useCompany'
import { useLanguage } from '../../hooks/useLanguage'
import { useRequired } from '../../lib/useRequired'
import { dbError } from '../../lib/dbError'
import { toast } from '../ui/Toast'
import Modal from '../ui/Modal'
import ModalFooter from '../ui/ModalFooter'
import Input from '../ui/Input'
import type { Contract } from '../../types/database'
import Select from '../ui/Select'
import { STATUS_BADGE } from '../../lib/contracts'

export interface SupplierLite { id: string; name: string; payment_terms: string | null }
export interface PersonLite { id: string; first_name: string; last_name: string }

const EMPTY = {
  title: '', supplier_id: '', status: 'draft' as Contract['status'], start_date: '', end_date: '',
  auto_renew: false, renewal_months: '', notice_days: '', total_value: '', payment_terms: '', owner_id: '', description: '',
}
type Form = typeof EMPTY

interface Props {
  open: boolean
  onClose: () => void
  contract: Contract | null          // null = create
  suppliers: SupplierLite[]
  people: PersonLite[]
  onSaved: () => void
  /** Offered when editing: closes this dialog and lets the caller confirm the deletion. */
  onDelete?: () => void
  deleteBlocked?: string | null
}

/** Create / edit dialog for a contract (used by the list and the detail page). */
export default function ContractFormModal({ open, onClose, contract, suppliers, people, onSaved, onDelete, deleteBlocked }: Props) {
  const { company, profile } = useCompany()
  const { t } = useLanguage()
  const s = t.contracts
  const req = useRequired(t.common.fieldRequired)
  const [form, setForm] = useState<Form>(EMPTY)
  const [saving, setSaving] = useState(false)
  const currency = company?.currency ?? 'EUR'

  useEffect(() => {
    if (!open) return
    req.reset()
    if (!contract) { setForm(EMPTY); return }
    setForm({
      title: contract.title, supplier_id: contract.supplier_id, status: contract.status, start_date: contract.start_date, end_date: contract.end_date ?? '',
      auto_renew: contract.auto_renew, renewal_months: contract.renewal_months?.toString() ?? '', notice_days: contract.notice_days?.toString() ?? '',
      total_value: contract.total_value?.toString().replace('.', ',') ?? '', payment_terms: contract.payment_terms ?? '', owner_id: contract.owner_id ?? '', description: contract.description ?? '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contract])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }))
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

  async function save() {
    if (!company) return
    if (!req.check(form as unknown as Record<string, unknown>, ['title', 'supplier_id', 'start_date'], { title: 'c-title', supplier_id: 'c-supplier', start_date: 'c-start' })) return
    if (form.end_date && form.end_date < form.start_date) { req.setError('end_date', `${s.endDate} < ${s.startDate}`, 'c-end'); return }
    setSaving(true)
    const payload = {
      title: form.title.trim(), supplier_id: form.supplier_id, status: form.status,
      start_date: form.start_date, end_date: form.end_date || null,
      auto_renew: form.auto_renew, renewal_months: form.auto_renew ? num(form.renewal_months) : null,
      notice_days: num(form.notice_days), total_value: num(form.total_value),
      payment_terms: form.payment_terms.trim() || null, owner_id: form.owner_id || null, description: form.description.trim() || null,
    }
    const { error } = contract
      ? await supabase.from('contracts').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', contract.id)
      : await supabase.from('contracts').insert({ ...payload, company_id: company.id, created_by: profile?.id ?? null })
    setSaving(false)
    if (error) { toast.error(dbError(error, t)); return }
    toast.success(t.common.saved); onClose(); onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={contract ? s.editTitle : s.new} size="lg" icon={FileSignature}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Input id="c-title" label={s.contractTitle + ' *'} placeholder={s.titlePlaceholder} value={form.title} error={req.errors.title}
            onChange={e => { req.clear('title'); set('title', e.target.value) }} />
        </div>

        <Select id="c-supplier" label={s.supplier} required value={form.supplier_id} error={req.errors.supplier_id}
          options={suppliers.map(x => ({ value: x.id, label: x.name }))}
          onChange={v => {
            req.clear('supplier_id'); set('supplier_id', v)
            const sup = suppliers.find(x => x.id === v)
            if (sup?.payment_terms && !form.payment_terms) set('payment_terms', sup.payment_terms)
          }} />
        <Select id="c-status" label={s.status} value={form.status} onChange={v => set('status', v as Contract['status'])}
          options={(['draft', 'active', 'terminated'] as const).map(v => ({ value: v, label: s.st[v], badge: STATUS_BADGE[v] }))} />

        <Input id="c-start" label={s.startDate + ' *'} type="date" value={form.start_date} error={req.errors.start_date}
          onChange={e => { req.clear('start_date'); set('start_date', e.target.value) }} />
        <Input id="c-end" label={s.endDate} type="date" value={form.end_date} error={req.errors.end_date}
          onChange={e => { req.clear('end_date'); set('end_date', e.target.value) }} />

        <Input id="c-value" label={`${s.totalValue} (${currency})`} placeholder="0,00" value={form.total_value}
          onChange={e => { if (/^[0-9]*[,.]?[0-9]*$/.test(e.target.value)) set('total_value', e.target.value) }} />
        <Input id="c-notice" placeholder={t.common.ph.noticeDays} label={s.noticeDays} inputMode="numeric" value={form.notice_days}
          onChange={e => { if (/^[0-9]*$/.test(e.target.value)) set('notice_days', e.target.value) }} />

        <label className="flex items-center gap-2 text-sm text-ink2 sm:col-span-2">
          <input type="checkbox" checked={form.auto_renew} onChange={e => set('auto_renew', e.target.checked)} className="rounded border-field text-accent focus:ring-accent" />
          {s.autoRenew}
        </label>
        {form.auto_renew && (
          <Input id="c-renew" placeholder={t.common.ph.renewalMonths} label={s.renewalMonths} inputMode="numeric" value={form.renewal_months}
            onChange={e => { if (/^[0-9]*$/.test(e.target.value)) set('renewal_months', e.target.value) }} />
        )}

        <Input id="c-terms" placeholder={t.common.ph.paymentTerms} label={s.paymentTerms} value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)} />
        <Select id="c-owner" label={s.owner} value={form.owner_id} onChange={v => set('owner_id', v)}
          options={people.map(p => ({ value: p.id, label: `${p.first_name} ${p.last_name}` }))} />

        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="c-desc" className="text-sm font-medium text-gray-700">{s.description}</label>
          <textarea id="c-desc" placeholder={t.common.ph.contractDesc} rows={3} value={form.description} onChange={e => set('description', e.target.value)}
            className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:border-field-focus resize-none" />
        </div>
      </div>

      <ModalFooter onCancel={onClose} onSave={save} saving={saving} saveLabel={contract ? t.common.saveChanges : t.common.create}
        onDelete={contract && onDelete ? () => { onClose(); onDelete() } : undefined} deleteBlocked={deleteBlocked} />
    </Modal>
  )
}
