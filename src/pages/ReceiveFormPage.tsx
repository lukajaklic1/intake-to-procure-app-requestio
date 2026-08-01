import { useEffect, useState } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { ChevronLeft, Paperclip, FileText, UploadCloud, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { format } from 'date-fns'

interface Line {
  po_line_id: string
  name: string
  unit: string
  ordered: number
  received: number
  receiveNow: string
  rejectNow: string
}

export default function ReceiveFormPage() {
  const { poId } = useParams()
  const { company, profile, isAdmin, hasPerm } = useCompany()
  const { t } = useLanguage()
  const s = t.receipts
  const navigate = useNavigate()
  const canReceive = isAdmin || hasPerm('receipts', 'create')

  const [poNumber, setPoNumber] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [receivedDate, setReceivedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [supplierReceiptNo, setSupplierReceiptNo] = useState('')
  const [note, setNote] = useState('')
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (company && poId) load() }, [company, poId])

  async function load() {
    const { data: po } = await supabase.from('purchase_orders').select('po_number, status, suppliers(name)').eq('id', poId!).single()
    if (!po) { toast.error('Not found'); navigate('/receipts'); return }
    if ((po as any).status !== 'sent') { navigate('/receipts'); return }
    setPoNumber((po as any).po_number)
    setSupplierName((po as any).suppliers?.name ?? '—')

    const { data: poLines } = await supabase.from('po_line_items').select('id, name, unit, quantity').eq('po_id', poId!).order('position')
    const ids = (poLines ?? []).map(l => l.id)
    const recvMap: Record<string, number> = {}
    if (ids.length) {
      const { data: rls } = await supabase.from('receipt_line_items').select('po_line_id, quantity_received').in('po_line_id', ids)
      for (const r of rls ?? []) recvMap[r.po_line_id] = (recvMap[r.po_line_id] ?? 0) + Number(r.quantity_received)
    }
    setLines((poLines ?? []).map(l => ({
      po_line_id: l.id, name: l.name, unit: l.unit,
      ordered: Number(l.quantity), received: recvMap[l.id] ?? 0, receiveNow: '', rejectNow: '',
    })))
    setLoading(false)
  }

  const parseNum = (v: string) => parseFloat(v.replace(',', '.')) || 0
  const remaining = (l: Line) => Math.max(0, l.ordered - l.received)
  function setReceiveNow(idx: number, v: string) {
    if (!/^[0-9]*[,.]?[0-9]*$/.test(v)) return
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, receiveNow: v } : l))
  }
  function setRejectNow(idx: number, v: string) {
    if (!/^[0-9]*[,.]?[0-9]*$/.test(v)) return
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, rejectNow: v } : l))
  }
  function receiveAll() {
    setLines(ls => ls.map(l => { const rem = remaining(l); return { ...l, receiveNow: rem > 0 ? String(rem).replace('.', ',') : '' } }))
  }

  async function save() {
    if (!company || !profile) return
    const payload = lines
      .map(l => ({ po_line_id: l.po_line_id, quantity_received: parseNum(l.receiveNow), quantity_rejected: parseNum(l.rejectNow) }))
      .filter(l => l.quantity_received > 0 || l.quantity_rejected > 0)
    if (payload.length === 0) { toast.error(s.nothingToReceive); return }
    setSaving(true)
    const { data: receiptId, error } = await (supabase as any).rpc('create_receipt', {
      p_po_id: poId, p_received_date: receivedDate, p_supplier_receipt_no: supplierReceiptNo.trim() || null,
      p_note: note.trim() || null, p_lines: payload,
    })
    if (error) { setSaving(false); toast.error(error.message); return }
    // upload attachments
    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i]
      const path = `${company.id}/receipts/${receiptId}/${Date.now()}-${i}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('quotations').upload(path, file, { upsert: true })
      if (!upErr) await supabase.from('receipt_attachments').insert({ receipt_id: receiptId, company_id: company.id, file_path: path, file_name: file.name, file_size: file.size })
    }
    setSaving(false)
    toast.success(s.receiptCreated)
    navigate(`/receipts/${receiptId}`)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
  if (!canReceive) return <Navigate to="/receipts" replace />

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <button onClick={() => navigate('/receipts')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"><ChevronLeft className="w-4 h-4" />{s.title}</button>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{s.receive}</h1>
      <p className="text-gray-500 text-sm mb-5">{s.fromPo} <span className="font-mono font-semibold text-gray-700">{poNumber}</span> · {supplierName}</p>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input id="r-date" label={s.receivedDate} type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} />
          <Input id="r-sup-no" label={s.supplierReceiptNo} value={supplierReceiptNo} onChange={e => setSupplierReceiptNo(e.target.value)} />
        </div>
        <div className="mt-4 flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">{s.note}</label>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>

        {/* Attachment */}
        <div className="mt-4">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-2"><Paperclip className="w-3.5 h-3.5" />{s.attachSlip}</label>
          {newFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg mb-2">
              <FileText className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-sm text-green-700 font-medium flex-1 truncate">{f.name}</span>
              <button type="button" onClick={() => setNewFiles(fs => fs.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
            </div>
          ))}
          <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors w-full">
            <UploadCloud className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-500">{t.po.uploadQuotation}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple className="hidden"
              onChange={e => { const fl = Array.from(e.target.files ?? []); setNewFiles(fs => [...fs, ...fl]); e.target.value = '' }} />
          </label>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">{t.po.lineItems}</h2>
          <Button variant="secondary" onClick={receiveAll}>{s.receiveAll}</Button>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 border-b border-gray-100"><tr>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">{t.po.description}</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">{s.ordered}</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">{s.received}</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">{s.remaining}</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-28">{s.receiveNow}</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide w-28">{s.rejectNow}</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {lines.map((l, idx) => {
              const rem = remaining(l)
              return (
                <tr key={l.po_line_id}>
                  <td className="px-4 py-2.5 text-gray-800">{l.name}<span className="text-gray-400"> · {l.unit}</span></td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{l.ordered}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{l.received}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-800">{rem}</td>
                  <td className="px-4 py-2.5">
                    <input value={l.receiveNow} onChange={e => setReceiveNow(idx, e.target.value)} inputMode="decimal"
                      className="w-full text-right rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </td>
                  <td className="px-4 py-2.5">
                    <input value={l.rejectNow} onChange={e => setRejectNow(idx, e.target.value)} inputMode="decimal" placeholder="0"
                      className="w-full text-right rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 placeholder-gray-300" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate('/receipts')} disabled={saving}>{t.common.cancel}</Button>
        <Button loading={saving} onClick={save}>{s.saveReceipt}</Button>
      </div>
    </div>
  )
}
