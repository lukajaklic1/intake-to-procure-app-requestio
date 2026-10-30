import { FileSignature, FileText, Paperclip, X } from 'lucide-react'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useCompany } from '../../hooks/useCompany'
import { useLanguage } from '../../hooks/useLanguage'
import { useRequired } from '../../lib/useRequired'
import { dbError } from '../../lib/dbError'
import { toast } from '../ui/Toast'
import Modal from '../ui/Modal'
import ModalFooter from '../ui/ModalFooter'
import Input from '../ui/Input'
import type { Contract, ContractAttachment } from '../../types/database'
import Select from '../ui/Select'
import { STATUS_BADGE } from '../../lib/contracts'

export interface SupplierLite { id: string; name: string; payment_terms: string | null }
export interface PersonLite { id: string; first_name: string; last_name: string }

const EMPTY = {
  number: '', title: '', supplier_id: '', status: 'draft' as Contract['status'], start_date: '', end_date: '',
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
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [docs, setDocs] = useState<ContractAttachment[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const currency = company?.currency ?? 'EUR'

  useEffect(() => {
    if (!open) return
    req.reset(); setNewFiles([]); setDocs([])
    if (contract) supabase.from('contract_attachments').select('*').eq('contract_id', contract.id).order('created_at').then(({ data }) => setDocs((data as ContractAttachment[]) ?? []))
    if (!contract) { setForm(EMPTY); return }
    setForm({
      number: contract.contract_number, title: contract.title, supplier_id: contract.supplier_id, status: contract.status, start_date: contract.start_date, end_date: contract.end_date ?? '',
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
      // empty = keep the current number (edit) or let the database number it POG-0001, POG-0002 ... (new)
      ...(form.number.trim() ? { contract_number: form.number.trim() } : {}),
    }
    const { data: created, error } = contract
      ? await supabase.from('contracts').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', contract.id).select('id').single()
      : await supabase.from('contracts').insert({ ...payload, company_id: company.id, created_by: profile?.id ?? null }).select('id').single()
    if (error) {
      setSaving(false)
      if (/contract_number|unique|duplicate/i.test(error.message)) { req.setError('number', t.common.alreadyExists, 'c-number'); return }
      toast.error(dbError(error, t)); return
    }
    // files chosen in the dialog are uploaded now that the contract has an id
    for (const file of newFiles) {
      const path = `${company.id}/contracts/${created!.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('quotations').upload(path, file, { upsert: true })
      if (upErr) { toast.error(`${t.common.uploadPrefix} ${file.name}: ${upErr.message}`); continue }
      await supabase.from('contract_attachments').insert({ contract_id: created!.id, company_id: company.id, file_path: path, file_name: file.name, file_size: file.size })
    }
    setSaving(false)
    toast.success(t.common.saved); onClose(); onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={contract ? s.editTitle : s.new} size="lg" icon={FileSignature}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Input id="c-title" label={s.contractTitle + ' *'} placeholder={s.titlePlaceholder} value={form.title} error={req.errors.title}
            onChange={e => { req.clear('title'); set('title', e.target.value) }} />
        </div>

        <Input id="c-number" label={s.number} placeholder="POG-0001" value={form.number} error={req.errors.number}
          onChange={e => { req.clear('number'); set('number', e.target.value) }} />
        <Select id="c-status" label={s.status} value={form.status} onChange={v => set('status', v as Contract['status'])}
          options={(['draft', 'active', 'terminated'] as const).map(v => ({ value: v, label: s.st[v], badge: STATUS_BADGE[v] }))} />

        <Select className="sm:col-span-2" id="c-supplier" label={s.supplier} required value={form.supplier_id} error={req.errors.supplier_id}
          options={suppliers.map(x => ({ value: x.id, label: x.name }))}
          onChange={v => {
            req.clear('supplier_id'); set('supplier_id', v)
            const sup = suppliers.find(x => x.id === v)
            if (sup?.payment_terms && !form.payment_terms) set('payment_terms', sup.payment_terms)
          }} />

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

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label>{s.documents}</label>
          <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
            onChange={e => { setNewFiles(f => [...f, ...Array.from(e.target.files ?? [])]); if (fileRef.current) fileRef.current.value = '' }} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 h-9 px-3 rounded-[0.625rem] border border-dashed border-field text-sm text-ink2 hover:bg-surface transition-colors text-left">
            <Paperclip className="w-4 h-4 text-icon" />{s.upload}
          </button>
          {(docs.length > 0 || newFiles.length > 0) && (
            <ul className="flex flex-col gap-1">
              {docs.map(d => (
                <li key={d.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface text-sm text-ink"><FileText className="w-4 h-4 text-icon shrink-0" /><span className="truncate">{d.file_name}</span></li>
              ))}
              {newFiles.map((f, i) => (
                <li key={f.name + i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-accent-light text-sm text-ink">
                  <FileText className="w-4 h-4 text-icon shrink-0" /><span className="truncate flex-1">{f.name}</span>
                  <span className="text-xs text-ink2 shrink-0">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                  <button type="button" onClick={() => setNewFiles(list => list.filter((_, k) => k !== i))} className="p-0.5 text-icon hover:text-ink" aria-label="Remove"><X className="w-3.5 h-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

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
