import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Pencil, Trash2, FileText, Download, Eye, Mail, Plus, Upload, SendHorizontal, Gavel, XCircle, ShoppingCart, Scale, Repeat, Trophy, CircleAlert } from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import Button from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Modal from '../components/ui/Modal'
import ModalActions from '../components/ui/ModalActions'
import RowMenu from '../components/ui/RowMenu'
import PersonCell from '../components/ui/PersonCell'
import { Card, Field } from '../components/ui/DetailCard'
import { unitLabel } from '../lib/units'
import { useRFQDownload } from '../hooks/useRFQDownload'
import { BidModal, ScoreModal, AddSupplierModal, SentModal, DeclineModal, AwardModal, type SupplierLite } from '../components/sourcing/SourcingModals'
import {
  STATUS_BADGE, TYPE_BADGE, INVITATION_BADGE, evaluate, baselineOf,
  type SEvent, type SItem, type SInvitation, type SBid, type SBidLine, type SCriterion, type SScore,
} from '../lib/sourcing'

interface Doc { id: string; file_name: string; file_path: string; invitation_id: string | null; created_at: string }
interface Act { id: string; actor_id: string | null; action: string; note: string | null; created_at: string }
interface LinkedPo { id: string; po_number: string; status: string; total_amount: number }

const fmtDate = (d: string | null) => (d ? format(new Date(d.length > 10 ? d : d + 'T00:00:00'), 'dd.MM.yyyy') : '-')
const fmtQty = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n)

type Dlg = null | { kind: 'sent' | 'add' | 'award' | 'score' | 'round' | 'cancel' | 'delete' | 'bid' | 'decline' | 'remove'; invitationId?: string }

export default function SourcingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { company, profile, isAdmin, hasPerm } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.sourcing
  const canEdit = isAdmin || hasPerm('purchase_orders', 'create')
  const currency = company?.currency ?? 'EUR'
  const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(n)
  const { downloadRFQ, downloading } = useRFQDownload()

  const [ev, setEv] = useState<SEvent | null>(null)
  const [items, setItems] = useState<SItem[]>([])
  const [invs, setInvs] = useState<SInvitation[]>([])
  const [bids, setBids] = useState<SBid[]>([])
  const [bidLines, setBidLines] = useState<SBidLine[]>([])
  const [criteria, setCriteria] = useState<SCriterion[]>([])
  const [scores, setScores] = useState<SScore[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [acts, setActs] = useState<Act[]>([])
  const [orders, setOrders] = useState<LinkedPo[]>([])
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [refs, setRefs] = useState<{ dept: string; loc: string; req: { id: string; number: string } | null }>({ dept: '', loc: '', req: null })
  const [viewRound, setViewRound] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dlg, setDlg] = useState<Dlg>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    if (!company || !id) return
    const [e, it, iv, bd, cr, at, ac, po, sup] = await Promise.all([
      supabase.from('sourcing_events').select('*').eq('id', id).single(),
      supabase.from('sourcing_items').select('*').eq('event_id', id).order('position'),
      supabase.from('sourcing_invitations').select('*').eq('event_id', id),
      supabase.from('sourcing_bids').select('*').eq('event_id', id),
      supabase.from('sourcing_criteria').select('*').eq('event_id', id).order('position'),
      supabase.from('sourcing_attachments').select('*').eq('event_id', id).order('created_at', { ascending: false }),
      supabase.from('sourcing_activity').select('*').eq('event_id', id).order('created_at', { ascending: false }),
      supabase.from('purchase_orders').select('id, po_number, status, total_amount').eq('sourcing_event_id', id),
      supabase.from('suppliers').select('id, name, email').eq('company_id', company.id),
    ])
    if (!e.data) { toast.error(t.common.notFound); navigate('/sourcing'); return }
    const event = e.data as unknown as SEvent
    setEv(event)
    setItems(((it.data ?? []) as SItem[]).map(x => ({ ...x, quantity: Number(x.quantity), target_price: x.target_price != null ? Number(x.target_price) : null })))
    setInvs((iv.data as SInvitation[]) ?? [])
    const bidList = ((bd.data ?? []) as SBid[]).map(b => ({ ...b, total_amount: Number(b.total_amount) }))
    setBids(bidList)
    setCriteria(((cr.data ?? []) as SCriterion[]).map(c => ({ ...c, weight: Number(c.weight) })))
    setDocs((at.data as Doc[]) ?? [])
    setActs((ac.data as Act[]) ?? [])
    setOrders((po.data as LinkedPo[]) ?? [])
    setSuppliers((sup.data as SupplierLite[]) ?? [])
    if (bidList.length) {
      const { data: bl } = await supabase.from('sourcing_bid_lines').select('*').in('bid_id', bidList.map(b => b.id))
      setBidLines(((bl ?? []) as SBidLine[]).map(l => ({ ...l, unit_price: l.unit_price != null ? Number(l.unit_price) : null })))
    } else setBidLines([])
    const { data: sc } = await supabase.from('sourcing_scores').select('*').in('criterion_id', ((cr.data ?? []) as SCriterion[]).map(c => c.id).concat('00000000-0000-0000-0000-000000000000'))
    setScores(((sc ?? []) as SScore[]).map(x => ({ ...x, score: Number(x.score) })))

    const userIds = [...new Set([event.created_by, event.awarded_by, ...(ac.data ?? []).map((a: Act) => a.actor_id)].filter(Boolean))] as string[]
    if (userIds.length) {
      const { data: us } = await supabase.from('users').select('id, first_name, last_name').in('id', userIds)
      setNames(Object.fromEntries((us ?? []).map(u => [u.id, `${u.first_name} ${u.last_name}`])))
    }
    const [d, l, r] = await Promise.all([
      event.department_id ? supabase.from('departments').select('name').eq('id', event.department_id).single() : Promise.resolve({ data: null }),
      event.location_id ? supabase.from('locations').select('name').eq('id', event.location_id).single() : Promise.resolve({ data: null }),
      event.request_id ? supabase.from('requests').select('id, request_number').eq('id', event.request_id).single() : Promise.resolve({ data: null }),
    ])
    setRefs({ dept: (d.data as { name: string } | null)?.name ?? '', loc: (l.data as { name: string } | null)?.name ?? '', req: r.data ? { id: (r.data as { id: string }).id, number: (r.data as { request_number: string }).request_number } : null })
    setLoading(false)
  }
  useEffect(() => { if (company && id) load() }, [company, id])

  const round = viewRound ?? ev?.current_round ?? 1
  const evaluations = useMemo(() => evaluate(round, bids, criteria, scores), [round, bids, criteria, scores])
  const supplierOf = (sid: string) => suppliers.find(x => x.id === sid)
  const invOf = (iid: string) => invs.find(i => i.id === iid)
  const priceOf = (bidId: string | undefined, itemId: string) => (bidId ? bidLines.find(l => l.bid_id === bidId && l.item_id === itemId)?.unit_price ?? null : null)
  const bidOf = (iid: string, r = round) => bids.find(b => b.invitation_id === iid && b.round === r)
  const rounds = ev ? Array.from({ length: ev.current_round }, (_, i) => i + 1) : []

  if (loading || !ev) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>

  const open = ev.status === 'sent' || ev.status === 'evaluation'
  const compared = invs.filter(i => evaluations.has(i.id))
  const bestTotal = Math.min(...[...evaluations.values()].filter(x => x.complete && x.total > 0).map(x => x.total), Infinity)
  const baseline = ev.status === 'awarded' ? ev.baseline_total : baselineOf(ev, bids, round)
  const awardedInv = ev.awarded_invitation_id ? invOf(ev.awarded_invitation_id) : undefined
  const saving = ev.status === 'awarded' && ev.baseline_total != null && ev.awarded_total != null ? Number(ev.baseline_total) - Number(ev.awarded_total) : null
  const late = open && ev.deadline ? differenceInCalendarDays(new Date(), new Date(ev.deadline + 'T00:00:00')) > 0 : false
  const answered = invs.filter(i => i.status === 'responded').length
  const hasBids = bids.length > 0

  async function setStatus(status: 'evaluation' | 'cancelled', action: string) {
    setBusy(true)
    const { error } = await supabase.from('sourcing_events').update({ status, updated_at: new Date().toISOString() }).eq('id', ev!.id)
    if (!error) await supabase.from('sourcing_activity').insert({ event_id: ev!.id, company_id: ev!.company_id, actor_id: profile?.id ?? null, action })
    setBusy(false); setDlg(null)
    if (error) { toast.error(error.message); return }
    toast.success(s.saved); load()
  }
  async function newRound() {
    setBusy(true)
    const next = ev!.current_round + 1
    const { error } = await supabase.from('sourcing_events').update({ current_round: next, status: 'sent', updated_at: new Date().toISOString() }).eq('id', ev!.id)
    if (!error) await supabase.from('sourcing_activity').insert({ event_id: ev!.id, company_id: ev!.company_id, actor_id: profile?.id ?? null, action: 'round', note: String(next) })
    setBusy(false); setDlg(null)
    if (error) { toast.error(error.message); return }
    setViewRound(null); toast.success(s.roundStarted); load()
  }
  async function deleteDraft() {
    const { error } = await supabase.from('sourcing_events').delete().eq('id', ev!.id)
    setDlg(null)
    if (error) { toast.error(error.message); return }
    toast.success(t.common.deleted); navigate('/sourcing')
  }
  async function removeInvitation(iid: string) {
    const { error } = await supabase.from('sourcing_invitations').delete().eq('id', iid)
    setDlg(null)
    if (error) { toast.error(error.message); return }
    load()
  }
  async function upload(files: FileList | null, invitationId?: string) {
    if (!company || !files?.length) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const path = `${company.id}/sourcing/${ev!.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('quotations').upload(path, file, { upsert: true })
      if (error) { toast.error(`${t.common.uploadPrefix} ${file.name}: ${error.message}`); continue }
      await supabase.from('sourcing_attachments').insert({ event_id: ev!.id, invitation_id: invitationId ?? null, company_id: company.id, file_path: path, file_name: file.name, file_size: file.size, created_by: profile?.id ?? null })
    }
    setUploading(false); if (fileRef.current) fileRef.current.value = ''; load()
  }
  async function openDoc(d: Doc) {
    const { data } = await supabase.storage.from('quotations').createSignedUrl(d.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }
  async function removeDoc(d: Doc) {
    await supabase.storage.from('quotations').remove([d.file_path])
    await supabase.from('sourcing_attachments').delete().eq('id', d.id)
    load()
  }
  function mailTo(inv: SInvitation) {
    const sup = supplierOf(inv.supplier_id)
    const fill = (txt: string) => txt.replace('{number}', ev!.event_number).replace('{title}', ev!.title).replace('{deadline}', fmtDate(ev!.deadline)).replace('{company}', company?.name ?? '')
    window.location.href = `mailto:${inv.contact_email ?? sup?.email ?? ''}?subject=${encodeURIComponent(fill(s.emailSubject))}&body=${encodeURIComponent(fill(s.emailBody))}`
  }

  const canSend = items.length > 0 && invs.length > 0
  const actions = (
    <>
      {ev.status === 'draft' && canEdit && <>
        <Button variant="secondary" onClick={() => setDlg({ kind: 'delete' })} className="!px-2.5" aria-label={t.common.deleteEntity}><Trash2 className="w-4 h-4 text-icon" /></Button>
        <Button variant="secondary" onClick={() => navigate(`/sourcing/${ev.id}/edit`)} className="gap-2"><Pencil className="w-4 h-4" />{t.common.editEntity}</Button>
        <Button onClick={() => setDlg({ kind: 'sent' })} disabled={!canSend} title={!canSend ? (items.length === 0 ? s.noItems : s.noSuppliers) : undefined} className="gap-2"><SendHorizontal className="w-4 h-4" />{s.markSent}</Button>
      </>}
      {open && canEdit && <>
        <Button variant="secondary" onClick={() => setDlg({ kind: 'cancel' })} className="gap-2 !text-danger !border-line"><XCircle className="w-4 h-4" />{s.cancelEvent}</Button>
        <Button variant="secondary" onClick={() => setDlg({ kind: 'round' })} className="gap-2"><Repeat className="w-4 h-4" />{s.newRound}</Button>
        {ev.status === 'sent' && <Button variant="secondary" loading={busy} onClick={() => setStatus('evaluation', 'evaluation')}>{s.startEvaluation}</Button>}
        <Button onClick={() => setDlg({ kind: 'award' })} disabled={compared.length === 0} className="gap-2"><Gavel className="w-4 h-4" />{s.award}</Button>
      </>}
      {ev.status === 'awarded' && canEdit && orders.length === 0 && (
        <Button onClick={() => navigate(`/purchase-orders/new?fromSourcing=${ev.id}`)} className="gap-2"><ShoppingCart className="w-4 h-4" />{s.createOrder}</Button>
      )}
    </>
  )

  const generalDocs = docs.filter(d => !d.invitation_id)
  const offerDocs = docs.filter(d => d.invitation_id)
  const activeInv = dlg?.invitationId ? invOf(dlg.invitationId) : undefined

  return (
    <div className="p-4 lg:p-6">
      <nav className="flex items-center gap-2 text-sm text-ink2 mb-5">
        <button type="button" onClick={() => navigate('/sourcing')} aria-label={s.title} title={s.title}
          className="w-7 h-7 -ml-1.5 mr-1 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <Link to="/sourcing" className="hover:text-ink transition-colors">{s.title}</Link>
        <ChevronRight className="w-3.5 h-3.5 text-icon" />
        <span className="text-ink font-medium">{ev.event_number}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-ink tracking-tight">{ev.title}</h1>
            <span className={`badge ${TYPE_BADGE[ev.event_type]}`}>{s.types[ev.event_type]}</span>
            <span className={`badge ${STATUS_BADGE[ev.status]}`}>{s.st[ev.status]}</span>
          </div>
          <p className="mt-2 text-sm text-ink2">{ev.event_number} · {names[ev.created_by ?? ''] ?? '-'} · {fmtDate(ev.created_at)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">{actions}</div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* left: the offers and who was asked */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          {(hasBids || open || ev.status === 'awarded') && (
            <Card title={s.comparison} className="overflow-hidden"
              action={<span className="inline-flex items-center gap-2">
                {rounds.length > 1 && rounds.map(r => (
                  <button key={r} type="button" onClick={() => setViewRound(r)}
                    className={`h-7 px-2.5 rounded-lg text-[13px] font-medium border transition-colors ${r === round ? 'bg-selected border-field text-ink' : 'border-transparent text-ink2 hover:bg-hover'}`}>{s.roundN.replace('{n}', String(r))}</button>
                ))}
                {open && canEdit && criteria.some(c => c.kind === 'manual') && round === ev.current_round && compared.length > 0 && (
                  <Button variant="secondary" onClick={() => setDlg({ kind: 'score' })} className="!h-8 text-[13px] gap-1.5"><Scale className="w-3.5 h-3.5" />{s.evaluate}</Button>
                )}
              </span>}>
              {compared.length === 0 ? <p className="p-5 text-sm text-ink2">{s.noBids}</p> : (
                <div className="overflow-x-auto"><table className="w-full text-sm" style={{ minWidth: 360 + compared.length * 150 }}>
                  <thead>
                    <tr className="border-b border-field text-left">
                      <th className="px-4 py-3 text-[12.5px] font-medium text-ink2">{s.itemName}</th>
                      <th className="px-4 py-3 text-[12.5px] font-medium text-ink2 text-right">{s.targetPrice}</th>
                      {compared.map(i => (
                        <th key={i.id} className="px-4 py-3 text-right">
                          <span className="text-[13px] font-semibold text-ink block truncate max-w-[170px] ml-auto">{supplierOf(i.supplier_id)?.name}</span>
                          {ev.awarded_invitation_id === i.id && <span className="badge badge-success mt-1">{s.st.awarded}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-field">
                    {items.map(it => {
                      const prices = compared.map(i => priceOf(bidOf(i.id)?.id, it.id))
                      const best = Math.min(...prices.filter((p): p is number => p != null), Infinity)
                      return (
                        <tr key={it.id}>
                          <td className="px-4 py-2.5 text-ink"><span className="font-medium">{it.name}</span><span className="text-ink2"> · {fmtQty(Number(it.quantity))} {unitLabel(it.unit, lang)}</span></td>
                          <td className="px-4 py-2.5 text-right text-ink2 tabular-nums">{it.target_price != null ? money(Number(it.target_price)) : '-'}</td>
                          {compared.map((i, k) => {
                            const p = prices[k]
                            const above = p != null && it.target_price != null && p > Number(it.target_price)
                            return (
                              <td key={i.id} className={`px-4 py-2.5 text-right tabular-nums ${p != null && p === best && prices.filter(x => x != null).length > 1 ? 'text-success font-semibold' : above ? 'text-danger' : 'text-ink'}`} title={above ? s.aboveTarget : undefined}>
                                {p != null ? money(p) : <span className="text-ink2">-</span>}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                    <tr className="bg-surface">
                      <td className="px-4 py-3 font-semibold text-ink">{s.total}</td><td />
                      {compared.map(i => {
                        const e = evaluations.get(i.id)!
                        return (
                          <td key={i.id} className={`px-4 py-3 text-right tabular-nums font-semibold ${e.complete && e.total === bestTotal && compared.length > 1 ? 'text-success' : 'text-ink'}`}>
                            {money(e.total)}
                            {!e.complete && <span className="block text-[11px] font-normal text-warn">{s.incomplete}</span>}
                          </td>
                        )
                      })}
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-ink2">{s.delivery}</td><td />
                      {compared.map(i => <td key={i.id} className="px-4 py-2.5 text-right text-ink tabular-nums">{bidOf(i.id)?.delivery_days != null ? `${bidOf(i.id)!.delivery_days} ${s.days}` : '-'}</td>)}
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-ink2">{s.payment}</td><td />
                      {compared.map(i => <td key={i.id} className="px-4 py-2.5 text-right text-ink">{bidOf(i.id)?.payment_terms ?? '-'}</td>)}
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 text-ink2">{s.valid}</td><td />
                      {compared.map(i => <td key={i.id} className="px-4 py-2.5 text-right text-ink tabular-nums">{fmtDate(bidOf(i.id)?.valid_until ?? null)}</td>)}
                    </tr>
                    {criteria.length > 0 && criteria.map(c => (
                      <tr key={c.id}>
                        <td className="px-4 py-2.5 text-ink2">{c.name} <span className="text-[12px]">({c.weight} %)</span></td><td />
                        {compared.map(i => {
                          const p = evaluations.get(i.id)!.points[c.id]
                          return <td key={i.id} className="px-4 py-2.5 text-right text-ink tabular-nums">{p == null ? <span className="text-ink2 text-[12px]">{s.unscored}</span> : String(p).replace('.', ',')}</td>
                        })}
                      </tr>
                    ))}
                    {criteria.length > 0 && (
                      <tr className="bg-surface border-t border-field">
                        <td className="px-4 py-3 font-semibold text-ink">{s.score}</td><td />
                        {compared.map(i => {
                          const e = evaluations.get(i.id)!
                          return (
                            <td key={i.id} className="px-4 py-3 text-right tabular-nums">
                              <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                                {e.rank === 1 && compared.length > 1 && <Trophy className="w-3.5 h-3.5 text-warn" strokeWidth={1.75} />}
                                {String(e.weighted).replace('.', ',')}
                                <span className="text-ink2 font-normal text-[12px]">({e.rank}.)</span>
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    )}
                  </tbody>
                </table></div>
              )}
            </Card>
          )}

          <Card title={`${s.suppliers} (${answered} / ${invs.length})`} className="overflow-hidden"
            action={canEdit && ev.status !== 'cancelled' && ev.status !== 'awarded' ? <Button variant="secondary" onClick={() => setDlg({ kind: 'add' })} className="!h-8 text-[13px] gap-1.5"><Plus className="w-3.5 h-3.5" />{s.addSupplier}</Button> : undefined}>
            {invs.length === 0 ? <p className="p-5 text-sm text-ink2">{s.noSuppliers}</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[720px]">
                <thead><tr className="border-b border-field text-left text-[12.5px] font-medium text-ink2">
                  <th className="px-4 py-2.5">{s.supplier}</th><th className="px-4 py-2.5">{s.contactEmail}</th><th className="px-4 py-2.5">{s.sentOn}</th><th className="px-4 py-2.5">{s.status}</th><th className="px-4 py-2.5 text-right">{s.total}</th><th className="px-4 py-2.5" />
                </tr></thead>
                <tbody className="divide-y divide-field">
                  {invs.map(i => {
                    const sup = supplierOf(i.supplier_id)
                    const b = bidOf(i.id, ev.current_round)
                    const menu = [
                      { label: s.downloadPdf, icon: Download, onClick: () => downloadRFQ(ev.id, ev.company_id, i.supplier_id) },
                      ...(i.contact_email || sup?.email ? [{ label: s.sendEmail, icon: Mail, onClick: () => mailTo(i) }] : []),
                      ...(canEdit && open ? [{ label: s.markDeclined, icon: XCircle, onClick: () => setDlg({ kind: 'decline', invitationId: i.id }) }] : []),
                      ...(canEdit && (ev.status === 'draft' || (open && !bids.some(x => x.invitation_id === i.id))) ? [{ label: s.removeSupplier, icon: Trash2, onClick: () => setDlg({ kind: 'remove', invitationId: i.id }) }] : []),
                    ]
                    return (
                      <tr key={i.id}>
                        <td className="px-4 py-3 font-medium text-ink">{sup?.name}</td>
                        <td className="px-4 py-3 text-ink2">{i.contact_email ?? sup?.email ?? <span className="text-warn">{s.noContact}</span>}</td>
                        <td className="px-4 py-3 text-ink2 whitespace-nowrap">{i.sent_at ? fmtDate(i.sent_at) : s.notSent}</td>
                        <td className="px-4 py-3"><span className={`badge ${INVITATION_BADGE[i.status]}`} title={i.decline_reason ?? undefined}>{s.invSt[i.status]}</span></td>
                        <td className="px-4 py-3 text-right text-ink tabular-nums whitespace-nowrap">{b ? money(Number(b.total_amount)) : '-'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {canEdit && open && i.status !== 'declined' && (
                              <button onClick={() => setDlg({ kind: 'bid', invitationId: i.id })} className="inline-flex items-center gap-1 badge badge-warn hover:brightness-95 transition-all whitespace-nowrap">
                                <Plus className="w-3 h-3" />{b ? s.editBid : s.enterBid}
                              </button>
                            )}
                            <RowMenu items={menu} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            )}
          </Card>

          {(!hasBids) && (
            <Card title={s.items} className="overflow-hidden">
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[520px]">
                <thead><tr className="border-b border-field text-left text-[12.5px] font-medium text-ink2">
                  <th className="px-4 py-2.5">{s.itemName}</th><th className="px-4 py-2.5 text-right">{s.qty}</th><th className="px-4 py-2.5">{s.unit}</th><th className="px-4 py-2.5 text-right">{s.targetPrice}</th>
                </tr></thead>
                <tbody className="divide-y divide-field">
                  {items.map(it => (
                    <tr key={it.id}>
                      <td className="px-4 py-3"><span className="font-medium text-ink">{it.name}</span>{it.description && <span className="block text-xs text-ink2">{it.description}</span>}</td>
                      <td className="px-4 py-3 text-right text-ink tabular-nums">{fmtQty(Number(it.quantity))}</td>
                      <td className="px-4 py-3 text-ink2">{unitLabel(it.unit, lang) || '-'}</td>
                      <td className="px-4 py-3 text-right text-ink2 tabular-nums">{it.target_price != null ? money(Number(it.target_price)) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </Card>
          )}
        </div>

        {/* right: the decision, the facts, the documents */}
        <div className="flex flex-col gap-4 order-first xl:order-none">
          {ev.status === 'awarded' && (
            <Card title={s.awardedTo}>
              <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-5">
                <div className="col-span-2"><Field label={s.supplier}><span className="font-medium">{awardedInv ? supplierOf(awardedInv.supplier_id)?.name : '-'}</span></Field></div>
                <Field label={s.awardedTotal}>{ev.awarded_total != null ? money(Number(ev.awarded_total)) : null}</Field>
                <Field label={s.baselineUsed}>{ev.baseline_total != null ? money(Number(ev.baseline_total)) : null}</Field>
                <div className="col-span-2"><Field label={s.saving}>
                  {saving != null ? <span className={`text-[15px] font-semibold ${saving > 0 ? 'text-success' : saving < 0 ? 'text-danger' : 'text-ink'}`}>{money(saving)}</span> : null}
                </Field></div>
                {ev.award_note && <div className="col-span-2"><Field label={s.awardNote}><span className="whitespace-pre-wrap">{ev.award_note}</span></Field></div>}
                <Field label={s.owner}>{ev.awarded_by && names[ev.awarded_by] ? <PersonCell name={names[ev.awarded_by]} /> : null}</Field>
                <Field label={s.sentDate}>{fmtDate(ev.awarded_at)}</Field>
                {orders.length > 0 && (
                  <div className="col-span-2"><Field label={s.orders}>
                    <span className="flex flex-col gap-1">{orders.map(o => <Link key={o.id} to={`/purchase-orders/${o.id}`} className="font-medium hover:underline">{o.po_number} · {money(Number(o.total_amount))}</Link>)}</span>
                  </Field></div>
                )}
              </div>
            </Card>
          )}

          <Card title={s.details}>
            <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-5">
              <Field label={s.deadline}>
                <span className={late ? 'text-danger font-medium' : ''}>{fmtDate(ev.deadline)}</span>
                {late && <span className="block text-xs text-danger mt-0.5 inline-flex items-center gap-1"><CircleAlert className="w-3 h-3" />{s.roundN.replace('{n}', String(ev.current_round))}</span>}
              </Field>
              <Field label={s.round}>{ev.current_round}</Field>
              <Field label={s.department}>{refs.dept}</Field>
              <Field label={s.location}>{refs.loc}</Field>
              {refs.req && <div className="col-span-2"><Field label={s.linkedRequest}><Link to={`/requests/${refs.req.id}`} className="font-medium hover:underline">{refs.req.number}</Link></Field></div>}
              {baseline != null && ev.status !== 'awarded' && <div className="col-span-2"><Field label={s.baselineUsed}>{money(Number(baseline))}</Field></div>}
              {ev.description && <div className="col-span-2"><Field label={s.description}><span className="whitespace-pre-wrap">{ev.description}</span></Field></div>}
            </div>
          </Card>

          <Card title={s.documents}
            action={canEdit ? (
              <>
                <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" onChange={e => upload(e.target.files)} />
                <Button variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()} className="!h-8 text-[13px] gap-1.5"><Upload className="w-3.5 h-3.5" />{s.uploadDoc}</Button>
              </>
            ) : undefined}>
            <ul className="p-5 flex flex-col gap-2">
              <li className="flex items-center gap-2.5 px-3 py-2 bg-surface rounded-lg">
                <FileText className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
                <span className="text-sm font-medium text-ink flex-1 truncate">{ev.event_number}.pdf</span>
                <button type="button" disabled={downloading} onClick={() => downloadRFQ(ev.id, ev.company_id)} aria-label={s.downloadPdf} title={s.downloadPdf} className="text-icon hover:text-ink transition-colors"><Download className="w-4 h-4" strokeWidth={1.75} /></button>
              </li>
              {generalDocs.map(d => (
                <li key={d.id} className="flex items-center gap-2.5 px-3 py-2 bg-surface rounded-lg">
                  <FileText className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
                  <button type="button" onClick={() => openDoc(d)} className="flex-1 min-w-0 text-left text-sm font-medium text-ink truncate hover:text-primary transition-colors">{d.file_name}</button>
                  <button type="button" onClick={() => openDoc(d)} aria-label={t.common.view} className="text-icon hover:text-ink transition-colors"><Eye className="w-4 h-4" strokeWidth={1.75} /></button>
                  {canEdit && <button type="button" onClick={() => removeDoc(d)} aria-label={t.common.deleteEntity} className="text-icon hover:text-danger transition-colors"><Trash2 className="w-4 h-4" strokeWidth={1.75} /></button>}
                </li>
              ))}
              {offerDocs.map(d => (
                <li key={d.id} className="flex items-center gap-2.5 px-3 py-2 bg-accent-light rounded-lg">
                  <FileText className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
                  <button type="button" onClick={() => openDoc(d)} className="flex-1 min-w-0 text-left truncate hover:text-primary transition-colors">
                    <span className="text-sm font-medium text-ink block truncate">{d.file_name}</span>
                    <span className="text-xs text-ink2">{s.supplierOffer} {supplierOf(invOf(d.invitation_id ?? '')?.supplier_id ?? '')?.name}</span>
                  </button>
                  <button type="button" onClick={() => openDoc(d)} aria-label={t.common.view} className="text-icon hover:text-ink transition-colors"><Eye className="w-4 h-4" strokeWidth={1.75} /></button>
                  {canEdit && <button type="button" onClick={() => removeDoc(d)} aria-label={t.common.deleteEntity} className="text-icon hover:text-danger transition-colors"><Trash2 className="w-4 h-4" strokeWidth={1.75} /></button>}
                </li>
              ))}
            </ul>
          </Card>

          {acts.length > 0 && (
            <Card title={s.activity}>
              <ol className="flex flex-col gap-4 p-5">
                {acts.map((a, i) => {
                  const dot = a.action === 'cancelled' ? 'bg-icon' : a.action === 'awarded' ? 'bg-success' : a.action === 'sent' || a.action === 'bid' ? 'bg-primary' : a.action === 'declined' ? 'bg-danger' : 'bg-icon'
                  return (
                    <li key={a.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className={`w-2.5 h-2.5 rounded-full ${dot} mt-1.5`} />
                        {i < acts.length - 1 && <span className="flex-1 w-px bg-line mt-1" />}
                      </div>
                      <div className="flex-1 -mt-0.5 min-w-0">
                        <p className="text-sm text-ink"><span className="font-medium">{a.actor_id ? names[a.actor_id] ?? '-' : '-'}</span> {s.act[a.action as keyof typeof s.act] ?? a.action}</p>
                        {a.note && a.action !== 'round' && <p className="mt-1 pl-3 border-l-2 border-field text-sm text-ink2 whitespace-pre-wrap">{a.note}</p>}
                        <p className="text-xs text-ink2">{format(new Date(a.created_at), 'dd.MM.yyyy HH:mm')}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </Card>
          )}
        </div>
      </div>

      <SentModal open={dlg?.kind === 'sent'} onClose={() => setDlg(null)} event={ev} invitations={invs} onSaved={load} />
      <AddSupplierModal open={dlg?.kind === 'add'} onClose={() => setDlg(null)} event={ev} invitations={invs} suppliers={suppliers} onSaved={load} />
      <BidModal open={dlg?.kind === 'bid'} onClose={() => setDlg(null)} event={ev} items={items} invitation={activeInv} supplier={activeInv ? supplierOf(activeInv.supplier_id) : undefined}
        bid={activeInv ? bidOf(activeInv.id, ev.current_round) : undefined} lines={bidLines} onSaved={() => { setViewRound(null); load() }} />
      <DeclineModal open={dlg?.kind === 'decline'} onClose={() => setDlg(null)} event={ev} invitation={activeInv} supplier={activeInv ? supplierOf(activeInv.supplier_id) : undefined} onSaved={load} />
      <ScoreModal open={dlg?.kind === 'score'} onClose={() => setDlg(null)} event={ev} criteria={criteria} invitations={invs} suppliers={suppliers} bids={bids} scores={scores} onSaved={load} />
      <AwardModal open={dlg?.kind === 'award'} onClose={() => setDlg(null)} event={ev} invitations={invs} suppliers={suppliers} bids={bids}
        evaluations={evaluate(ev.current_round, bids, criteria, scores)} onSaved={() => { setViewRound(null); load() }} />

      <Modal open={dlg?.kind === 'round'} onClose={() => setDlg(null)} title={s.newRoundTitle} size="sm" icon={Repeat}>
        <p className="text-sm text-ink2">{s.newRoundText.replace('{n}', String(ev.current_round + 1))}</p>
        <ModalActions className="justify-end">
          <Button variant="secondary" onClick={() => setDlg(null)}>{t.common.cancel}</Button>
          <Button loading={busy} onClick={newRound}>{s.newRound}</Button>
        </ModalActions>
      </Modal>

      <ConfirmDialog open={dlg?.kind === 'cancel'} onClose={() => setDlg(null)} onConfirm={() => setStatus('cancelled', 'cancelled')}
        title={s.cancelTitle} message={s.cancelQuestion} name={ev.event_number} danger loading={busy} confirmLabel={s.cancelEvent} />
      <ConfirmDialog open={dlg?.kind === 'delete'} onClose={() => setDlg(null)} onConfirm={deleteDraft}
        title={s.deleteTitle} message={s.deleteQuestion} name={ev.event_number} danger confirmLabel={t.common.deleteEntity} />
      <ConfirmDialog open={dlg?.kind === 'remove'} onClose={() => setDlg(null)} onConfirm={() => dlg?.invitationId && removeInvitation(dlg.invitationId)}
        title={s.removeSupplier} message={supplierOf(activeInv?.supplier_id ?? '')?.name ?? ''} name="" danger confirmLabel={s.removeSupplier} />
    </div>
  )
}

