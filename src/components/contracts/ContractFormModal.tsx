import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useCompany } from '../../hooks/useCompany'
import { useLanguage } from '../../hooks/useLanguage'
import { useRequired } from '../../lib/useRequired'
import { dbError } from '../../lib/dbError'
import { toast } from '../ui/Toast'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Input from '../ui/Input'
import type { Contract } from '../../types/database'

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
}

/** Create / edit dialog for a contract (used by the list and the detail page). */
export default function ContractFormModal({ open, onClose, contract, suppliers, people, onSaved }: Props) {
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
  const selectCls = (err?: string) => `rounded-lg border px-3 py-2 text-sm bg-white focus:outline-none ${err ? 'border-red-400' : 'border-field hover:border-field-hover focus:border-field-focus'}`

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
    <Modal open={open} onClose={onClose} title={contract ? s.editTitle : s.new} size="lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Input id="c-title" label={s.contractTitle + ' *'} placeholder={s.titlePlaceholder} value={form.title} error={req.errors.title}
            onChange={e => { req.clear('title'); set('title', e.target.value) }} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="c-supplier" className="text-sm font-medium text-gray-700">{s.supplier} *</label>
          <select id="c-supplier" value={form.supplier_id} className={selectCls(req.errors.supplier_id)}
            onChange={e => {
              req.clear('supplier_id'); set('supplier_id', e.target.value)
              const sup = suppliers.find(x => x.id === e.target.value)
              if (sup?.payment_terms && !form.payment_terms) set('payment_terms', sup.payment_terms)
            }}>
            <option value="">{t.common.select}</option>
            {suppliers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          {req.errors.supplier_id && <p className="text-xs text-red-600">{req.errors.supplier_id}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="c-status" className="text-sm font-medium text-gray-700">{s.status}</label>
          <select id="c-status" value={form.status} onChange={e => set('status', e.target.value as Contract['status'])} className={selectCls()}>
            <option value="draft">{s.st.draft}</option>
            <option value="active">{s.st.active}</option>
            <option value="terminated">{s.st.terminated}</option>
          </select>
        </div>

        <Input id="c-start" label={s.startDate + ' *'} type="date" value={form.start_date} error={req.errors.start_date}
          onChange={e => { req.clear('start_date'); set('start_date', e.target.value) }} />
        <Input id="c-end" label={s.endDate} type="date" value={form.end_date} error={req.errors.end_date}
          onChange={e => { req.clear('end_date'); set('end_date', e.target.value) }} />

        <Input id="c-value" label={`${s.totalValue} (${currency})`} placeholder="0,00" value={form.total_value}
          onChange={e => { if (/^[0-9]*[,.]?[0-9]*$/.test(e.target.value)) set('total_value', e.target.value) }} />
        <Input id="c-notice" label={s.noticeDays} inputMode="numeric" value={form.notice_days}
          onChange={e => { if (/^[0-9]*$/.test(e.target.value)) set('notice_days', e.target.value) }} />

        <label className="flex items-center gap-2 text-sm text-ink2 sm:col-span-2">
          <input type="checkbox" checked={form.auto_renew} onChange={e => set('auto_renew', e.target.checked)} className="rounded border-field text-accent focus:ring-accent" />
          {s.autoRenew}
        </label>
        {form.auto_renew && (
          <Input id="c-renew" label={s.renewalMonths} inputMode="numeric" value={form.renewal_months}
            onChange={e => { if (/^[0-9]*$/.test(e.target.value)) set('renewal_months', e.target.value) }} />
        )}

        <Input id="c-terms" label={s.paymentTerms} value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)} />
        <div className="flex flex-col gap-1">
          <label htmlFor="c-owner" className="text-sm font-medium text-gray-700">{s.owner}</label>
          <select id="c-owner" value={form.owner_id} onChange={e => set('owner_id', e.target.value)} className={selectCls()}>
            <option value="">{t.common.select}</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="c-desc" className="text-sm font-medium text-gray-700">{s.description}</label>
          <textarea id="c-desc" rows={3} value={form.description} onChange={e => set('description', e.target.value)}
            className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:border-field-focus resize-none" />
        </div>
      </div>

      <div className="flex gap-3 justify-end mt-5">
        <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
        <Button loading={saving} onClick={save}>{contract ? t.common.saveChanges : t.common.create}</Button>
      </div>
    </Modal>
  )
}
