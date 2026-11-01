import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { FileText, Gavel, MessageSquarePlus, Scale, SendHorizontal, UploadCloud, UserPlus, X, Ban } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCompany } from '../../hooks/useCompany'
import { useLanguage } from '../../hooks/useLanguage'
import { toast } from '../ui/Toast'
import Modal from '../ui/Modal'
import ModalActions from '../ui/ModalActions'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import { unitFor } from '../../lib/units'
import { bidTotal, baselineOf, type SBid, type SBidLine, type SCriterion, type SEvent, type SInvitation, type SItem, type SScore, type Evaluation } from '../../lib/sourcing'

export interface SupplierLite { id: string; name: string; email: string | null }

const NUM = /^[0-9]*[,.]?[0-9]*$/
const toNum = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const num2 = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))
const fmtQty = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n)

async function log(eventId: string, companyId: string, actorId: string | undefined, action: string, note?: string) {
  await supabase.from('sourcing_activity').insert({ event_id: eventId, company_id: companyId, actor_id: actorId ?? null, action, note: note ?? null })
}

/** Offer of one supplier in one round, typed in by the buyer. A price left empty means the supplier does not offer that item. */
export function BidModal({ open, onClose, event, items, invitation, supplier, bid, lines, onSaved }: {
  open: boolean; onClose: () => void; event: SEvent; items: SItem[]; invitation?: SInvitation; supplier?: SupplierLite
  bid?: SBid; lines: SBidLine[]; onSaved: () => void
}) {
  const { t, lang } = useLanguage()
  const s = t.sourcing
  const { company, profile } = useCompany()
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [days, setDays] = useState('')
  const [terms, setTerms] = useState('')
  const [valid, setValid] = useState('')
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const currency = company?.currency ?? 'EUR'
  const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)

  useEffect(() => {
    if (!open) return
    setPrices(Object.fromEntries(items.map(i => [i.id, num2(lines.find(l => l.bid_id === bid?.id && l.item_id === i.id)?.unit_price)])))
    setDays(bid?.delivery_days != null ? String(bid.delivery_days) : '')
    setTerms(bid?.payment_terms ?? ''); setValid(bid?.valid_until ?? ''); setNotes(bid?.notes ?? ''); setFiles([])
  }, [open, bid?.id, invitation?.id])

  const parsed = useMemo(() => new Map(items.map(i => [i.id, prices[i.id]?.trim() ? toNum(prices[i.id]) : null] as [string, number | null])), [items, prices])
  const { total, complete } = bidTotal(items, parsed)

  async function save() {
    if (!company || !invitation) return
    setSaving(true)
    const row = {
      event_id: event.id, invitation_id: invitation.id, company_id: company.id, round: event.current_round, total_amount: total, complete,
      delivery_days: days.trim() ? Math.round(toNum(days)) : null, payment_terms: terms.trim() || null, valid_until: valid || null, notes: notes.trim() || null,
      submitted_at: new Date().toISOString(), created_by: profile?.id ?? null,
    }
    const { data: saved, error } = await supabase.from('sourcing_bids').upsert(row, { onConflict: 'invitation_id,round' }).select('id').single()
    if (error || !saved) { setSaving(false); toast.error(error?.message ?? 'Error'); return }
    await supabase.from('sourcing_bid_lines').delete().eq('bid_id', saved.id)
    const priced = items.filter(i => parsed.get(i.id) != null)
    if (priced.length) {
      const { error: lineErr } = await supabase.from('sourcing_bid_lines').insert(priced.map(i => ({ bid_id: saved.id, company_id: company.id, item_id: i.id, unit_price: parsed.get(i.id) })))
      if (lineErr) { setSaving(false); toast.error(lineErr.message); return }
    }
    await supabase.from('sourcing_invitations').update({ status: 'responded', responded_at: new Date().toISOString(), decline_reason: null }).eq('id', invitation.id)
    for (const file of files) {
      const path = `${company.id}/sourcing/${event.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('quotations').upload(path, file, { upsert: true })
      if (upErr) { toast.error(`${t.common.uploadPrefix} ${file.name}: ${upErr.message}`); continue }
      await supabase.from('sourcing_attachments').insert({ event_id: event.id, invitation_id: invitation.id, company_id: company.id, file_path: path, file_name: file.name, file_size: file.size, created_by: profile?.id ?? null })
    }
    await log(event.id, company.id, profile?.id, 'bid', `${supplier?.name ?? ''} · ${money(total)}`)
    setSaving(false)
    toast.success(s.saved); onSaved(); onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`${s.bidTitle}: ${supplier?.name ?? ''}`} size="lg" icon={MessageSquarePlus}>
      <p className="text-[13px] text-ink2 mb-4">{s.roundN.replace('{n}', String(event.current_round))} · {s.leaveEmpty}</p>
      <div className="overflow-x-auto -mx-1 mb-4"><table className="w-full text-sm min-w-[520px]">
        <thead><tr className="text-left text-[12.5px] font-medium text-ink2">
          <th className="px-2 py-2">{s.itemName}</th><th className="px-2 py-2 text-right">{s.qty}</th><th className="px-2 py-2 text-right">{s.targetPrice}</th><th className="px-2 py-2 text-right w-36">{s.unitPrice}</th>
        </tr></thead>
        <tbody className="divide-y divide-field">
          {items.map(i => (
            <tr key={i.id}>
              <td className="px-2 py-2 text-ink">{i.name}</td>
              <td className="px-2 py-2 text-right text-ink2 tabular-nums whitespace-nowrap">{fmtQty(Number(i.quantity))} {unitFor(i.unit, lang, Number(i.quantity))}</td>
              <td className="px-2 py-2 text-right text-ink2 tabular-nums">{i.target_price != null ? money(Number(i.target_price)) : '-'}</td>
              <td className="px-2 py-1.5">
                <input value={prices[i.id] ?? ''} inputMode="decimal" placeholder="0,00" aria-label={s.unitPrice}
                  onChange={e => { if (NUM.test(e.target.value)) setPrices(p => ({ ...p, [i.id]: e.target.value })) }}
                  className="w-full text-right rounded-lg border border-field hover:border-field-hover px-2.5 h-9 text-sm tabular-nums focus:outline-none focus:border-field-focus" />
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <div className="flex items-center justify-between gap-3 mb-4 text-sm">
        <span className={complete ? 'text-ink2' : 'text-warn'}>{complete ? '' : s.incomplete}</span>
        <span className="text-ink font-semibold tabular-nums">{s.offerTotal}: {money(total)}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Input id="bid-days" label={s.deliveryDays} inputMode="numeric" value={days} onChange={e => { if (/^[0-9]*$/.test(e.target.value)) setDays(e.target.value) }} />
        <Input id="bid-terms" label={s.paymentTerms} value={terms} onChange={e => setTerms(e.target.value)} />
        <Input id="bid-valid" label={s.validUntil} type="date" value={valid} onChange={e => setValid(e.target.value)} />
        <div className="sm:col-span-3">
          <Input id="bid-notes" label={s.bidNotes} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {files.map((f, i) => (
          <div key={i} className="flex items-center gap-2.5 px-3 py-2 bg-accent-light rounded-lg">
            <FileText className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} /><span className="text-sm text-ink font-medium flex-1 truncate">{f.name}</span>
            <button type="button" onClick={() => setFiles(fs => fs.filter((_, k) => k !== i))} aria-label={t.common.cancel} className="text-icon hover:text-danger transition-colors"><X className="w-4 h-4" /></button>
          </div>
        ))}
        <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" className="hidden"
          onChange={e => { setFiles(f => [...f, ...Array.from(e.target.files ?? [])]); if (fileRef.current) fileRef.current.value = '' }} />
        <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 h-10 px-3 rounded-lg border border-dashed border-field text-sm text-ink2 hover:bg-surface transition-colors w-full text-left">
          <UploadCloud className="w-4 h-4 text-icon shrink-0" /><span>{s.uploadDoc}</span>
        </button>
      </div>
      <ModalActions className="justify-end">
        <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
        <Button loading={saving} onClick={save}>{t.common.save}</Button>
      </ModalActions>
    </Modal>
  )
}

/** The scores of the signed-in evaluator (0-10) for the criteria that are scored by hand. */
export function ScoreModal({ open, onClose, event, criteria, invitations, suppliers, bids, scores, onSaved }: {
  open: boolean; onClose: () => void; event: SEvent; criteria: SCriterion[]; invitations: SInvitation[]; suppliers: SupplierLite[]
  bids: SBid[]; scores: SScore[]; onSaved: () => void
}) {
  const { t } = useLanguage()
  const s = t.sourcing
  const { company, profile } = useCompany()
  const [vals, setVals] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const manual = criteria.filter(c => c.kind === 'manual')
  const inv = invitations.filter(i => bids.some(b => b.invitation_id === i.id && b.round === event.current_round))
  const key = (c: string, i: string) => `${c}|${i}`

  useEffect(() => {
    if (!open) return
    setVals(Object.fromEntries(scores.filter(x => x.evaluator_id === profile?.id).map(x => [key(x.criterion_id, x.invitation_id), String(x.score).replace('.', ',')])))
  }, [open])

  async function save() {
    if (!company || !profile) return
    setSaving(true)
    const rows: { company_id: string; criterion_id: string; invitation_id: string; evaluator_id: string; score: number }[] = []
    const empty: { c: string; i: string }[] = []
    for (const c of manual) for (const i of inv) {
      const v = vals[key(c.id, i.id)]
      if (v == null || v.trim() === '') empty.push({ c: c.id, i: i.id })
      else rows.push({ company_id: company.id, criterion_id: c.id, invitation_id: i.id, evaluator_id: profile.id, score: Math.min(10, Math.max(0, toNum(v))) })
    }
    if (rows.length) {
      const { error } = await supabase.from('sourcing_scores').upsert(rows, { onConflict: 'criterion_id,invitation_id,evaluator_id' })
      if (error) { setSaving(false); toast.error(error.message); return }
    }
    for (const e of empty) await supabase.from('sourcing_scores').delete().eq('criterion_id', e.c).eq('invitation_id', e.i).eq('evaluator_id', profile.id)
    await log(event.id, company.id, profile.id, 'scored')
    setSaving(false)
    toast.success(s.saved); onSaved(); onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={s.evaluateTitle} size="lg" icon={Scale}>
      <p className="text-[13px] text-ink2 mb-4">{s.evaluateHint}</p>
      {manual.length === 0 || inv.length === 0 ? <p className="text-sm text-ink2">{s.noBids}</p> : (
        <div className="overflow-x-auto -mx-1"><table className="w-full text-sm">
          <thead><tr className="text-left text-[12.5px] font-medium text-ink2">
            <th className="px-2 py-2">{s.criterion}</th>
            {inv.map(i => <th key={i.id} className="px-2 py-2 text-right">{suppliers.find(x => x.id === i.supplier_id)?.name}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-field">
            {manual.map(c => (
              <tr key={c.id}>
                <td className="px-2 py-2 text-ink">{c.name} <span className="text-ink2">({Number(c.weight)} %)</span></td>
                {inv.map(i => (
                  <td key={i.id} className="px-2 py-1.5 w-28">
                    <input value={vals[key(c.id, i.id)] ?? ''} inputMode="decimal" placeholder="0-10" aria-label={c.name}
                      onChange={e => { if (NUM.test(e.target.value)) setVals(v => ({ ...v, [key(c.id, i.id)]: e.target.value })) }}
                      className="w-full text-right rounded-lg border border-field hover:border-field-hover px-2.5 h-9 text-sm tabular-nums focus:outline-none focus:border-field-focus" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      <ModalActions className="justify-end">
        <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
        <Button loading={saving} onClick={save}>{t.common.save}</Button>
      </ModalActions>
    </Modal>
  )
}

/** Adds one more supplier to an event that is already running. */
export function AddSupplierModal({ open, onClose, event, invitations, suppliers, onSaved }: {
  open: boolean; onClose: () => void; event: SEvent; invitations: SInvitation[]; suppliers: SupplierLite[]; onSaved: () => void
}) {
  const { t } = useLanguage()
  const s = t.sourcing
  const { company, profile } = useCompany()
  const [sid, setSid] = useState('')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setSid(''); setEmail(''); setErr('') } }, [open])
  const free = suppliers.filter(x => !invitations.some(i => i.supplier_id === x.id))

  async function save() {
    if (!company) return
    if (!sid) { setErr(t.common.fieldRequired); return }
    setSaving(true)
    const { error } = await supabase.from('sourcing_invitations').insert({ event_id: event.id, company_id: company.id, supplier_id: sid, contact_email: email.trim() || null })
    setSaving(false)
    if (error) { toast.error(/duplicate|unique/i.test(error.message) ? s.supplierExists : error.message); return }
    await log(event.id, company.id, profile?.id, 'supplier_added', suppliers.find(x => x.id === sid)?.name)
    toast.success(s.saved); onSaved(); onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={s.addSupplier} size="sm" icon={UserPlus}>
      <div className="flex flex-col gap-4">
        <Select id="as-sup" label={s.supplier} required value={sid} placeholder={s.pickSupplier} searchable error={err} options={free.map(x => ({ value: x.id, label: x.name }))}
          onChange={v => { setErr(''); setSid(v); setEmail(suppliers.find(x => x.id === v)?.email ?? '') }} />
        <Input id="as-mail" label={s.contactEmail} type="email" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <ModalActions className="justify-end">
        <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
        <Button loading={saving} onClick={save}>{t.common.save}</Button>
      </ModalActions>
    </Modal>
  )
}

/** Marks the request as sent to the suppliers (on a date) and opens the offer phase. */
export function SentModal({ open, onClose, event, invitations, onSaved }: { open: boolean; onClose: () => void; event: SEvent; invitations: SInvitation[]; onSaved: () => void }) {
  const { t } = useLanguage()
  const s = t.sourcing
  const { company, profile } = useCompany()
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) setDate(format(new Date(), 'yyyy-MM-dd')) }, [open])

  async function save() {
    if (!company) return
    setSaving(true)
    const at = new Date(date + 'T12:00:00').toISOString()
    const { error } = await supabase.from('sourcing_events').update({ status: 'sent', sent_at: at, updated_at: new Date().toISOString() }).eq('id', event.id)
    if (error) { setSaving(false); toast.error(error.message); return }
    await supabase.from('sourcing_invitations').update({ sent_at: at }).eq('event_id', event.id).is('sent_at', null)
    await log(event.id, company.id, profile?.id, 'sent')
    setSaving(false)
    toast.success(s.saved); onSaved(); onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={s.markSentTitle} size="sm" icon={SendHorizontal}>
      <p className="text-sm text-ink2 mb-4">{s.markSentText} ({invitations.length})</p>
      <Input id="sent-date" label={s.sentDate} type="date" max={format(new Date(), 'yyyy-MM-dd')} value={date} onChange={e => setDate(e.target.value)} />
      <ModalActions className="justify-end">
        <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
        <Button loading={saving} onClick={save} disabled={!date}>{s.markSent}</Button>
      </ModalActions>
    </Modal>
  )
}

/** A supplier tells the buyer they will not bid. */
export function DeclineModal({ open, onClose, event, invitation, supplier, onSaved }: {
  open: boolean; onClose: () => void; event: SEvent; invitation?: SInvitation; supplier?: SupplierLite; onSaved: () => void
}) {
  const { t } = useLanguage()
  const s = t.sourcing
  const { company, profile } = useCompany()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) setReason(invitation?.decline_reason ?? '') }, [open, invitation?.id])

  async function save() {
    if (!company || !invitation) return
    setSaving(true)
    const { error } = await supabase.from('sourcing_invitations').update({ status: 'declined', responded_at: new Date().toISOString(), decline_reason: reason.trim() || null }).eq('id', invitation.id)
    if (error) { setSaving(false); toast.error(error.message); return }
    await log(event.id, company.id, profile?.id, 'declined', `${supplier?.name ?? ''}${reason.trim() ? ': ' + reason.trim() : ''}`)
    setSaving(false)
    toast.success(s.saved); onSaved(); onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={`${s.markDeclined}: ${supplier?.name ?? ''}`} size="sm" icon={Ban}>
      <Input id="dec-reason" label={s.declineReason} value={reason} onChange={e => setReason(e.target.value)} />
      <ModalActions className="justify-end">
        <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
        <Button loading={saving} onClick={save}>{t.common.save}</Button>
      </ModalActions>
    </Modal>
  )
}

/** The decision: which supplier gets the business. A reason is required when it is not the cheapest complete offer. */
export function AwardModal({ open, onClose, event, invitations, suppliers, bids, evaluations, onSaved }: {
  open: boolean; onClose: () => void; event: SEvent; invitations: SInvitation[]; suppliers: SupplierLite[]; bids: SBid[]
  evaluations: Map<string, Evaluation>; onSaved: () => void
}) {
  const { t } = useLanguage()
  const s = t.sourcing
  const { company, profile } = useCompany()
  const [sid, setSid] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: company?.currency ?? 'EUR' }).format(n)

  const candidates = invitations.filter(i => evaluations.has(i.id))
  const bestScore = [...evaluations.values()].sort((a, b) => a.rank - b.rank)[0]
  const cheapest = Math.min(...[...evaluations.values()].filter(e => e.complete && e.total > 0).map(e => e.total), Infinity)
  useEffect(() => { if (open) { setSid(bestScore?.invitationId ?? ''); setNote(''); setErr('') } }, [open])

  const ev = sid ? evaluations.get(sid) : undefined
  const notCheapest = !!ev && ev.total > cheapest + 0.005

  async function save() {
    if (!company || !ev) { setErr(t.common.fieldRequired); return }
    if (notCheapest && !note.trim()) { setErr(s.awardNoteRequired); return }
    setSaving(true)
    const baseline = baselineOf(event, bids, event.current_round)
    const { error } = await supabase.from('sourcing_events').update({
      status: 'awarded', awarded_invitation_id: sid, awarded_at: new Date().toISOString(), awarded_by: profile?.id ?? null, award_note: note.trim() || null,
      awarded_total: ev.total, baseline_total: baseline, updated_at: new Date().toISOString(),
    }).eq('id', event.id)
    if (error) { setSaving(false); toast.error(error.message); return }
    await log(event.id, company.id, profile?.id, 'awarded', `${suppliers.find(x => x.id === invitations.find(i => i.id === sid)?.supplier_id)?.name ?? ''} · ${money(ev.total)}`)
    setSaving(false)
    toast.success(s.saved); onSaved(); onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={s.awardTitle} size="sm" icon={Gavel}>
      <div className="flex flex-col gap-4">
        <Select id="aw-sup" label={s.awardTo} required value={sid} placeholder={s.pickSupplier}
          options={candidates.map(i => { const e = evaluations.get(i.id)!; return { value: i.id, label: `${suppliers.find(x => x.id === i.supplier_id)?.name} - ${money(e.total)} (${e.rank}.)` } })}
          onChange={v => { setErr(''); setSid(v) }} />
        <div className="flex flex-col gap-1">
          <label htmlFor="aw-note" className="text-sm font-medium text-gray-700">{s.awardNote}{notCheapest ? ' *' : ''}</label>
          <textarea id="aw-note" rows={3} value={note} onChange={e => { setErr(''); setNote(e.target.value) }}
            className={`rounded-lg border px-3 py-2 text-sm focus:outline-none resize-none ${err ? 'border-red-500' : 'border-field hover:border-field-hover focus:border-field-focus'}`} />
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      </div>
      <ModalActions className="justify-end">
        <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
        <Button loading={saving} onClick={save}>{s.award}</Button>
      </ModalActions>
    </Modal>
  )
}

