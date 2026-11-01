import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowDownToLine, ClipboardCheck, Gauge, History, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useCompany } from '../../hooks/useCompany'
import { useLanguage } from '../../hooks/useLanguage'
import { useRequired } from '../../lib/useRequired'
import { unitLabel } from '../../lib/units'
import { MOVEMENT_BADGE, type MovementType, type StockRow } from '../../lib/stock'
import { toast } from '../ui/Toast'
import Modal from '../ui/Modal'
import ModalActions from '../ui/ModalActions'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'

export interface StockItem { id: string; item_number: string; name: string; default_unit: string | null }
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
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (open) { setType('usage'); setQty(''); setReason(''); req.reset() } }, [open])

  const item = items.find(i => i.id === itemId)
  const have = Number(rowOf(rows, itemId, locationId)?.on_hand ?? 0)
  const after = have - toNum(qty)
  const unit = item ? unitLabel(item.default_unit, lang) : ''
  const itemRows = rows.filter(r => r.item_id === itemId && locations.some(l => l.id === r.location_id))

  async function save() {
    if (!itemId) { req.setError('item', t.common.fieldRequired, 'mv-item'); return }
    if (!locationId) { req.setError('location', t.common.fieldRequired, 'mv-location'); return }
    if (toNum(qty) <= 0) { req.setError('qty', s.qtyRequired, 'mv-qty'); return }
    setSaving(true)
    const { error } = await supabase.rpc('record_stock_movement', { p_item_id: itemId, p_location_id: locationId, p_type: type, p_quantity: toNum(qty), p_reason: reason })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(s.saved); onSaved(); onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={s.usageTitle} size="sm" icon={ArrowDownToLine}>
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
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left transition-colors ${picked ? 'bg-selected' : 'hover:bg-surface'} disabled:cursor-default`}>
                      <span className="text-ink truncate">{locations.find(l => l.id === r.location_id)?.name}</span>
                      <span className={`tabular-nums whitespace-nowrap ${Number(r.on_hand) < 0 ? 'text-danger font-medium' : 'text-ink'}`}>{fmtQty(Number(r.on_hand))} <span className="text-ink2">{unit}</span></span>
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
          <p className="text-[13px] text-ink2 mt-0.5">{locations.length > 1 ? `${loc?.name} · ` : ''}{s.currentStock}: {fmtQty(have)} {unit}</p>
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

/** Minimum stock and minimum order quantity (MOQ) of an item at a location. With no preset it adds a new item to the stock. */
export function LimitsModal({ open, onClose, items, locations, rows, onSaved, preset }: Common & { preset?: Preset }) {
  const { t, lang } = useLanguage()
  const s = t.stock
  const { company } = useCompany()
  const req = useRequired(t.common.fieldRequired)
  const { itemId, setItemId, locationId, setLocationId } = useDefaults(open, locations, preset)
  const [min, setMin] = useState('')
  const [moq, setMoq] = useState('')
  const [saving, setSaving] = useState(false)
  // adding = the item and the location are not both known yet (the item may be known when it comes from a "not in stock" row)
  const adding = !(preset?.itemId && preset?.locationId)

  useEffect(() => {
    if (!open) return
    req.reset()
    const r = preset?.itemId && preset?.locationId ? rowOf(rows, preset.itemId, preset.locationId) : undefined
    setMin(r?.min_qty ? String(r.min_qty).replace('.', ',') : '')
    setMoq(r?.moq ? String(r.moq).replace('.', ',') : '')
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
      { company_id: company.id, item_id: itemId, location_id: locationId, min_qty: toNum(min), moq: moq.trim() === '' ? null : toNum(moq) },
      { onConflict: 'item_id,location_id' })
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
        <div>
          <Input id="lm-min" label={`${s.minimum}${unit ? ` (${unit})` : ''}`} inputMode="decimal" placeholder="0" value={min}
            onChange={e => { if (NUM.test(e.target.value)) setMin(e.target.value) }} />
          <p className="text-[13px] text-ink2 mt-1.5">{s.minimumHint}</p>
        </div>
        <div>
          <Input id="lm-moq" label={`${s.moq}${unit ? ` (${unit})` : ''}`} inputMode="decimal" placeholder="0" value={moq}
            onChange={e => { if (NUM.test(e.target.value)) setMoq(e.target.value) }} />
          <p className="text-[13px] text-ink2 mt-1.5">{s.moqHint}</p>
        </div>
      </div>
      <ModalActions className="justify-end">
        <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
        <Button loading={saving} onClick={save} disabled={adding && items.length === 0}>{t.common.save}</Button>
      </ModalActions>
    </Modal>
  )
}

interface Movement {
  id: string; created_at: string; movement_type: MovementType; quantity: number; reason: string | null; created_by: string | null
  receipt_id: string | null; receipts: { receipt_number: string } | null
}

/** Every movement of one item at one location, newest first. */
export function HistoryModal({ open, onClose, item, location }: { open: boolean; onClose: () => void; item?: StockItem; location?: StockLocation }) {
  const { t, lang } = useLanguage()
  const s = t.stock
  const [moves, setMoves] = useState<Movement[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !item || !location) return
    setLoading(true)
    ;(async () => {
      const { data } = await supabase.from('stock_movements')
        .select('id, created_at, movement_type, quantity, reason, created_by, receipt_id, receipts(receipt_number)')
        .eq('item_id', item.id).eq('location_id', location.id).order('created_at', { ascending: false }).limit(200)
      const list = (data as unknown as Movement[]) ?? []
      setMoves(list)
      const ids = [...new Set(list.map(m => m.created_by).filter(Boolean))] as string[]
      if (ids.length) {
        const { data: us } = await supabase.from('users').select('id, first_name, last_name').in('id', ids)
        setNames(Object.fromEntries((us ?? []).map(u => [u.id, `${u.first_name} ${u.last_name}`])))
      }
      setLoading(false)
    })()
  }, [open, item?.id, location?.id])

  return (
    <Modal open={open} onClose={onClose} title={s.historyTitle} size="lg" icon={History}>
      <p className="text-sm text-ink mb-4"><span className="font-medium">{item?.name}</span><span className="text-ink2"> · {location?.name}</span></p>
      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" /></div>
      ) : moves.length === 0 ? (
        <p className="text-sm text-ink2">{s.noMovements}</p>
      ) : (
        <div className="overflow-x-auto -mx-1"><table className="w-full text-sm min-w-[520px]">
          <thead><tr className="text-left text-[12.5px] font-medium text-ink2">
            <th className="px-2 py-2">{s.date}</th><th className="px-2 py-2">{s.type}</th><th className="px-2 py-2 text-right">{s.quantity}</th><th className="px-2 py-2">{s.by}</th><th className="px-2 py-2">{s.reason}</th>
          </tr></thead>
          <tbody className="divide-y divide-field">
            {moves.map(m => (
              <tr key={m.id}>
                <td className="px-2 py-2 text-ink2 whitespace-nowrap">{format(new Date(m.created_at), 'dd.MM.yyyy HH:mm')}</td>
                <td className="px-2 py-2"><span className={`badge ${MOVEMENT_BADGE[m.movement_type]}`}>{s.mt[m.movement_type]}</span></td>
                <td className={`px-2 py-2 text-right tabular-nums font-medium ${Number(m.quantity) < 0 ? 'text-danger' : 'text-ink'}`}>
                  {Number(m.quantity) > 0 ? '+' : ''}{fmtQty(Number(m.quantity))} <span className="text-ink2 font-normal">{unitLabel(item?.default_unit, lang)}</span>
                </td>
                <td className="px-2 py-2 text-ink2">{m.created_by ? names[m.created_by] ?? '-' : '-'}</td>
                <td className="px-2 py-2 text-ink2">
                  {m.receipts ? <Link to={`/receipts/${m.receipt_id}`} className="hover:underline hover:text-ink">{s.fromReceipt} {m.receipts.receipt_number}</Link> : (m.reason || '-')}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      <ModalActions className="justify-end">
        <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
      </ModalActions>
    </Modal>
  )
}
