import { useEffect, useState } from 'react'
import { PackageMinus, ArrowRightLeft, ClipboardCheck, Gauge, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCompany } from '../../hooks/useCompany'
import { useLanguage } from '../../hooks/useLanguage'
import { useRequired } from '../../lib/useRequired'
import { unitLabel, unitFor } from '../../lib/units'
import { type StockRow } from '../../lib/stock'
import { toast } from '../ui/Toast'
import Modal from '../ui/Modal'
import ModalActions from '../ui/ModalActions'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'

export interface StockItem { id: string; item_number: string; name: string; default_unit: string | null; category_id?: string | null }
export interface StockLocation { id: string; name: string }

interface Common {
  open: boolean
  onClose: () => void
  items: StockItem[]
  locations: StockLocation[]
  rows: StockRow[]
  onSaved: () => void
}
interface Preset { itemId?: string; locationId?: string }

const NUM = /^[0-9]*[,.]?[0-9]*$/
const NO_LOCATIONS: StockLocation[] = []   // a stable value: useDefaults depends on it
const toNum = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const fmtQty = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n)
const rowOf = (rows: StockRow[], itemId: string, locationId: string) => rows.find(r => r.item_id === itemId && r.location_id === locationId)

function useDefaults(open: boolean, locations: StockLocation[], preset?: Preset) {
  const [itemId, setItemId] = useState('')
  const [locationId, setLocationId] = useState('')
  useEffect(() => {
    if (!open) return
    setItemId(preset?.itemId ?? '')
    // with a single location there is nothing to choose
    setLocationId(preset?.locationId ?? (locations.length === 1 ? locations[0].id : ''))
  }, [open, preset?.itemId, preset?.locationId, locations])
  return { itemId, setItemId, locationId, setLocationId }
}

/** Usage or waste: takes a quantity out of the stock. */
export function MovementModal({ open, onClose, items, locations, rows, onSaved, preset }: Common & { preset?: Preset }) {
  const { t, lang } = useLanguage()
  const s = t.stock
  const req = useRequired(t.common.fieldRequired)
  const { itemId, setItemId, locationId, setLocationId } = useDefaults(open, locations, preset)
  const [type, setType] = useState<'usage' | 'waste'>('usage')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const { company, profile } = useCompany()
  useEffect(() => { if (open) { setType('usage'); setQty(''); setReason(''); setDepartmentId(profile?.department_id ?? ''); req.reset() } }, [open])
  // the department the usage is booked to; the department of the person is preselected
  useEffect(() => {
    if (!open || !company) return
    supabase.from('departments').select('id, name').eq('company_id', company.id).eq('status', 'active').order('name').then(({ data }) => setDepartments((data as { id: string; name: string }[]) ?? []))
  }, [open, company?.id])

  const item = items.find(i => i.id === itemId)
  const have = Number(rowOf(rows, itemId, locationId)?.on_hand ?? 0)
  const after = have - toNum(qty)
  const unit = item ? unitLabel(item.default_unit, lang) : ''
  const itemRows = rows.filter(r => r.item_id === itemId && locations.some(l => l.id === r.location_id))

  async function save() {
    if (!itemId) { req.setError('item', t.common.fieldRequired, 'mv-item'); return }
    if (!locationId) { req.setError('location', t.common.fieldRequired, 'mv-location'); return }
    if (toNum(qty) <= 0) { req.setError('qty', s.qtyRequired, 'mv-qty'); return }
    if (!departmentId) { req.setError('department', t.common.fieldRequired, 'mv-department'); return }
    setSaving(true)
    const { error } = await supabase.rpc('record_stock_movement', { p_item_id: itemId, p_location_id: locationId, p_type: type, p_quantity: toNum(qty), p_reason: reason, p_department_id: departmentId })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(s.saved); onSaved(); onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={s.usageTitle} size="sm" icon={PackageMinus}>
      <div className="flex flex-col gap-4">
        <Select id="mv-type" label={s.type} value={type} options={[{ value: 'usage', label: s.mt.usage }, { value: 'waste', label: s.mt.waste }]} onChange={v => setType(v as 'usage' | 'waste')} />
        <Select id="mv-item" label={s.item} required searchable value={itemId} placeholder={s.selectItem} disabled={!!preset?.itemId} error={req.errors.item}
          options={items.map(i => ({ value: i.id, label: `${i.name} (${i.item_number})` }))} onChange={v => { req.clear('item'); setItemId(v) }} />
        {itemId && locations.length > 1 && (
          <div>
            <p className="text-[13px] font-medium text-ink2 mb-1.5">{s.stockByLocation}</p>
            {itemRows.length === 0 ? (
              <p className="text-[13px] text-ink2">{s.notInStockAnywhere}</p>
            ) : (
              <div className="rounded-lg border border-field divide-y divide-field overflow-hidden">
                {itemRows.map(r => {
                  const picked = r.location_id === locationId
                  return (
                    <button key={r.location_id} type="button" disabled={!!preset?.locationId} onClick={() => { req.clear('location'); setLocationId(r.location_id) }}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left transition-colors ${picked ? 'bg-surface' : 'hover:bg-surface'} disabled:cursor-default`}>
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className={`shrink-0 w-4 h-4 rounded-full border bg-white ${picked ? 'border-[5px] border-accent' : 'border-field'}`} />
                        <span className={`truncate ${picked ? 'text-ink font-medium' : 'text-ink'}`}>{locations.find(l => l.id === r.location_id)?.name}</span>
                      </span>
                      <span className={`tabular-nums whitespace-nowrap ${Number(r.on_hand) < 0 ? 'text-danger font-medium' : 'text-ink'}`}>{fmtQty(Number(r.on_hand))} <span className="text-ink2">{unitFor(item?.default_unit, lang, Number(r.on_hand))}</span></span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
        {locations.length > 1 && (
          <Select id="mv-location" label={s.location} required value={locationId} placeholder={t.common.select} disabled={!!preset?.locationId} error={req.errors.location}
            options={locations.map(l => ({ value: l.id, label: l.name }))} onChange={v => { req.clear('location'); setLocationId(v) }} />
        )}
        <Input id="mv-qty" label={`${s.quantity}${unit ? ` (${unit})` : ''} *`} inputMode="decimal" placeholder="0" value={qty} error={req.errors.qty}
          onChange={e => { if (NUM.test(e.target.value)) { req.clear('qty'); setQty(e.target.value) } }} />
        <Select id="mv-department" label={s.department} required value={departmentId} placeholder={t.common.select} error={req.errors.department}
          options={departments.map(d => ({ value: d.id, label: d.name }))} onChange={v => { req.clear('department'); setDepartmentId(v) }} />
        <Input id="mv-reason" label={s.reason} placeholder={s.reasonPh} value={reason} onChange={e => setReason(e.target.value)} />
        {itemId && locationId && toNum(qty) > 0 && (
          <div className="text-[13px] flex items-center justify-between gap-3">
            <span className="text-ink2">{s.currentStock}: {fmtQty(have)} → {s.stockAfter}: <span className={after < 0 ? 'text-danger font-medium' : 'text-ink font-medium'}>{fmtQty(after)}</span></span>
          </div>
        )}
        {after < 0 && toNum(qty) > 0 && <p className="text-[13px] text-danger -mt-2">{s.overStock}</p>}
      </div>
      <ModalActions className="justify-end">
        <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
        <Button loading={saving} onClick={save}>{t.common.save}</Button>
      </ModalActions>
    </Modal>
  )
}

/** Count: what is really on the shelf becomes the stock. */
export function CountModal({ open, onClose, items, locations, rows, onSaved, preset }: Common & { preset: Preset }) {
  const { t, lang } = useLanguage()
  const s = t.stock
  const req = useRequired(t.common.fieldRequired)
  const [counted, setCounted] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setCounted(''); setReason(''); req.reset() } }, [open])

  const item = items.find(i => i.id === preset.itemId)
  const loc = locations.find(l => l.id === preset.locationId)
  const have = Number(rowOf(rows, preset.itemId ?? '', preset.locationId ?? '')?.on_hand ?? 0)
  const diff = toNum(counted) - have
  const unit = item ? unitLabel(item.default_unit, lang) : ''

  async function save() {
    if (counted.trim() === '') { req.setError('counted', t.common.fieldRequired, 'ct-counted'); return }
    setSaving(true)
    const { error } = await supabase.rpc('set_stock_count', { p_item_id: preset.itemId, p_location_id: preset.locationId, p_counted: toNum(counted), p_reason: reason })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(s.saved); onSaved(); onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={s.countTitle} size="sm" icon={ClipboardCheck}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium text-ink">{item?.name}</p>
          <p className="text-[13px] text-ink2 mt-0.5">{locations.length > 1 ? `${loc?.name} · ` : ''}{s.currentStock}: {fmtQty(have)} {unitFor(item?.default_unit, lang, have)}</p>
        </div>
        <Input id="ct-counted" label={`${s.counted}${unit ? ` (${unit})` : ''} *`} inputMode="decimal" placeholder="0" value={counted} error={req.errors.counted}
          onChange={e => { if (NUM.test(e.target.value)) { req.clear('counted'); setCounted(e.target.value) } }} />
        <p className="text-[13px] text-ink2 -mt-2">{s.countedHint}</p>
        <Input id="ct-reason" label={s.reason} value={reason} onChange={e => setReason(e.target.value)} />
        {counted.trim() !== '' && (
          <p className="text-[13px] text-ink2">{s.difference}: <span className={`font-medium ${diff < 0 ? 'text-danger' : 'text-ink'}`}>{diff > 0 ? '+' : ''}{fmtQty(diff)}</span></p>
        )}
      </div>
      <ModalActions className="justify-end">
        <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
        <Button loading={saving} onClick={save}>{t.common.save}</Button>
      </ModalActions>
    </Modal>
  )
}

/** Minimum stock of an item at a location. With no preset it adds a new item to the stock. */
export function LimitsModal({ open, onClose, items, locations, rows, onSaved, preset }: Common & { preset?: Preset }) {
  const { t, lang } = useLanguage()
  const s = t.stock
  const { company } = useCompany()
  const req = useRequired(t.common.fieldRequired)
  const { itemId, setItemId, locationId, setLocationId } = useDefaults(open, locations, preset)
  const [min, setMin] = useState('')
  const [initial, setInitial] = useState('')
  const [saving, setSaving] = useState(false)
  // adding = the item and the location are not both known yet (the item may be known when it comes from a "not in stock" row)
  const adding = !(preset?.itemId && preset?.locationId)

  useEffect(() => {
    if (!open) return
    req.reset()
    const r = preset?.itemId && preset?.locationId ? rowOf(rows, preset.itemId, preset.locationId) : undefined
    setMin(r?.min_qty ? String(r.min_qty).replace('.', ',') : '')
    setInitial('')
  }, [open, preset?.itemId, preset?.locationId])

  const item = items.find(i => i.id === itemId)
  const unit = item ? unitLabel(item.default_unit, lang) : ''

  async function save() {
    if (!company) return
    if (!itemId) { req.setError('item', t.common.fieldRequired, 'lm-item'); return }
    if (!locationId) { req.setError('location', t.common.fieldRequired, 'lm-location'); return }
    if (adding && rowOf(rows, itemId, locationId)) { req.setError('item', s.alreadyThere, 'lm-item'); return }
    setSaving(true)
    const { error } = await supabase.from('stock_limits').upsert(
      { company_id: company.id, item_id: itemId, location_id: locationId, min_qty: toNum(min) },
      { onConflict: 'item_id,location_id' })
    if (!error && adding && initial.trim() !== '') {
      const { error: countErr } = await supabase.rpc('set_stock_count', { p_item_id: itemId, p_location_id: locationId, p_counted: toNum(initial), p_reason: s.initialReason })
      if (countErr) { setSaving(false); toast.error(countErr.message); onSaved(); return }
    }
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(s.saved); onSaved(); onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={adding ? s.addTitle : s.limitsTitle} size="sm" icon={adding ? Plus : Gauge}>
      <div className="flex flex-col gap-4">
        {adding && (items.length === 0
          ? <p className="text-sm text-ink2">{s.noTracked}</p>
          : <p className="text-[13px] text-ink2 -mt-1">{s.addHint}</p>)}
        <Select id="lm-item" label={s.item} required searchable value={itemId} placeholder={s.selectItem} disabled={!!preset?.itemId} error={req.errors.item}
          options={items.map(i => ({ value: i.id, label: `${i.name} (${i.item_number})` }))} onChange={v => { req.clear('item'); setItemId(v) }} />
        {locations.length > 1 && (
          <Select id="lm-location" label={s.location} required value={locationId} placeholder={t.common.select} disabled={!!preset?.locationId} error={req.errors.location}
            options={locations.map(l => ({ value: l.id, label: l.name }))} onChange={v => { req.clear('location'); setLocationId(v) }} />
        )}
        {adding && (
          <div>
            <Input id="lm-initial" label={`${s.initialStock}${unit ? ` (${unit})` : ''}`} inputMode="decimal" placeholder="0" value={initial}
              onChange={e => { if (NUM.test(e.target.value)) setInitial(e.target.value) }} />
            <p className="text-[13px] text-ink2 mt-1.5">{s.initialStockHint}</p>
          </div>
        )}
        <div>
          <Input id="lm-min" label={`${s.minimum}${unit ? ` (${unit})` : ''}`} inputMode="decimal" placeholder="0" value={min}
            onChange={e => { if (NUM.test(e.target.value)) setMin(e.target.value) }} />
          <p className="text-[13px] text-ink2 mt-1.5">{s.minimumHint}</p>
        </div>
      </div>
      <ModalActions className="justify-end">
        <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
        <Button loading={saving} onClick={save} disabled={adding && items.length === 0}>{t.common.save}</Button>
      </ModalActions>
    </Modal>
  )
}

/** Moves a quantity from one location to another. */
export function TransferModal({ open, onClose, items, locations, rows, onSaved, preset }: Common & { preset?: Preset }) {
  const { t, lang } = useLanguage()
  const s = t.stock
  const req = useRequired(t.common.fieldRequired)
  const { itemId, setItemId, locationId: fromId, setLocationId: setFromId } = useDefaults(open, NO_LOCATIONS, preset)
  const [toId, setToId] = useState('')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setToId(''); setQty(''); setReason(''); req.reset() } }, [open])

  const item = items.find(i => i.id === itemId)
  const unit = item ? unitLabel(item.default_unit, lang) : ''
  const have = Number(rowOf(rows, itemId, fromId)?.on_hand ?? 0)

  async function save() {
    if (!itemId) { req.setError('item', t.common.fieldRequired, 'tr-item'); return }
    if (!fromId) { req.setError('from', t.common.fieldRequired, 'tr-from'); return }
    if (!toId) { req.setError('to', t.common.fieldRequired, 'tr-to'); return }
    if (fromId === toId) { req.setError('to', s.sameLocation, 'tr-to'); return }
    if (toNum(qty) <= 0) { req.setError('qty', s.qtyRequired, 'tr-qty'); return }
    setSaving(true)
    const { error } = await supabase.rpc('transfer_stock', { p_item_id: itemId, p_from: fromId, p_to: toId, p_quantity: toNum(qty), p_reason: reason })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(s.saved); onSaved(); onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={s.transferTitle} size="sm" icon={ArrowRightLeft}>
      <div className="flex flex-col gap-4">
        <Select id="tr-item" label={s.item} required searchable value={itemId} placeholder={s.selectItem} disabled={!!preset?.itemId} error={req.errors.item}
          options={items.map(i => ({ value: i.id, label: `${i.name} (${i.item_number})` }))} onChange={v => { req.clear('item'); setItemId(v) }} />
        <Select id="tr-from" label={s.fromLocation} required value={fromId} placeholder={t.common.select} disabled={!!preset?.locationId} error={req.errors.from}
          options={locations.map(l => ({ value: l.id, label: l.name }))} onChange={v => { req.clear('from'); setFromId(v) }} />
        <Select id="tr-to" label={s.toLocation} required value={toId} placeholder={t.common.select} error={req.errors.to}
          options={locations.filter(l => l.id !== fromId).map(l => ({ value: l.id, label: l.name }))} onChange={v => { req.clear('to'); setToId(v) }} />
        <Input id="tr-qty" label={`${s.quantity}${unit ? ` (${unit})` : ''} *`} inputMode="decimal" placeholder="0" value={qty} error={req.errors.qty}
          onChange={e => { if (NUM.test(e.target.value)) { req.clear('qty'); setQty(e.target.value) } }} />
        {itemId && fromId && <p className="text-[13px] text-ink2 -mt-2">{s.currentStock}: {fmtQty(have)} {unitFor(item?.default_unit, lang, have)}{toNum(qty) > have ? ' · ' + s.overStock : ''}</p>}
        <Input id="tr-reason" label={s.reason} value={reason} onChange={e => setReason(e.target.value)} />
      </div>
      <ModalActions className="justify-end">
        <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
        <Button loading={saving} onClick={save}>{t.common.save}</Button>
      </ModalActions>
    </Modal>
  )
}
