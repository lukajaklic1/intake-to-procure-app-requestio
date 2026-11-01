import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Plus, Trash2, UploadCloud, FileText, X, CircleAlert, Hash, Package, Ruler, Coins, Search as SearchIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../hooks/useCompany'
import { useLanguage } from '../hooks/useLanguage'
import { toast } from '../components/ui/Toast'
import { useRequired } from '../lib/useRequired'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import GridHead from '../components/ui/GridHead'
import CatalogPicker from '../components/ui/CatalogPicker'
import { Card } from '../components/ui/DetailCard'
import { unitCode, unitLabel, unitOptions, unitToStore } from '../lib/units'
import { DEFAULT_CRITERIA, type EventType, type CriterionKind } from '../lib/sourcing'
import type { Item } from '../types/database'

interface FormItem { key: string; item_id: string | null; category_id: string | null; name: string; description: string; quantity: string; unit: string; target_price: string }
interface FormSupplier { supplier_id: string; email: string }
interface FormCriterion { key: string; name: string; weight: string; kind: CriterionKind }
interface SupplierOpt { id: string; name: string; email: string | null }

const NUM = /^[0-9]*[,.]?[0-9]*$/
const toNum = (v: string) => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const num2 = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))
const rid = () => Math.random().toString(36).slice(2)
const newItem = (): FormItem => ({ key: rid(), item_id: null, category_id: null, name: '', description: '', quantity: '1', unit: '', target_price: '' })
const inputCls = 'w-full text-sm tabular-nums border border-field rounded-lg hover:border-field-hover px-2.5 h-9 focus:outline-none focus:border-field-focus'

/** New / edit (draft) sourcing event: what is asked for, who is asked, how the offers are judged, and the documents. */
export default function SourcingFormPage() {
  const { id } = useParams<{ id?: string }>()
  const isNew = !id
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { company, profile } = useCompany()
  const { t, lang } = useLanguage()
  const s = t.sourcing
  const req = useRequired(t.common.fieldRequired)

  const [header, setHeader] = useState({ title: '', event_type: 'rfq' as EventType, deadline: '', department_id: '', location_id: '', description: '', baseline: '', request_id: '' })
  const [items, setItems] = useState<FormItem[]>([newItem()])
  const [suppliers, setSuppliers] = useState<FormSupplier[]>([])
  const [criteria, setCriteria] = useState<FormCriterion[]>(() => DEFAULT_CRITERIA.map(c => ({ key: rid(), name: '', weight: String(c.weight), kind: c.kind })))
  const [existingDocs, setExistingDocs] = useState<{ id: string; file_name: string; file_path: string }[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [errs, setErrs] = useState<{ items?: string; suppliers?: string; criteria?: string }>({})
  const [catalog, setCatalog] = useState<Item[]>([])
  const [supplierOpts, setSupplierOpts] = useState<SupplierOpt[]>([])
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // names of the default criteria in the language of the user
  useEffect(() => {
    if (!isNew) return
    setCriteria(cs => cs.map((c, i) => (c.name ? c : { ...c, name: s.criteriaNames[DEFAULT_CRITERIA[i]?.name ?? 'price'] })))
  }, [lang])

  useEffect(() => {
    if (!company) return
    const cid = company.id
    ;(async () => {
      const [sup, d, l, it] = await Promise.all([
        supabase.from('suppliers').select('id, name, email').eq('company_id', cid).eq('status', 'active').order('name'),
        supabase.from('departments').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
        supabase.from('locations').select('id, name').eq('company_id', cid).eq('status', 'active').order('name'),
        supabase.from('items').select('*').eq('company_id', cid).eq('status', 'active').order('name'),
      ])
      setSupplierOpts((sup.data as SupplierOpt[]) ?? []); setDepartments(d.data ?? []); setLocations(l.data ?? []); setCatalog((it.data as Item[]) ?? [])
      if (isNew && l.data?.length === 1) setHeader(h => ({ ...h, location_id: h.location_id || l.data![0].id }))

      // from a request: its lines become the items of the event
      const fromRequest = isNew ? params.get('fromRequest') : null
      if (fromRequest) {
        const [{ data: r }, { data: ls }] = await Promise.all([
          supabase.from('requests').select('id, title, department_id, location_id').eq('id', fromRequest).single(),
          supabase.from('request_line_items').select('item_id, category_id, name, long_description, quantity, unit, est_unit_price').eq('request_id', fromRequest).order('position'),
        ])
        if (r) setHeader(h => ({ ...h, title: h.title || r.title || '', department_id: r.department_id ?? '', location_id: r.location_id ?? h.location_id, request_id: r.id }))
        if (ls?.length) setItems(ls.map(x => ({ key: rid(), item_id: x.item_id, category_id: x.category_id, name: x.name, description: x.long_description ?? '', quantity: num2(Number(x.quantity)), unit: x.unit ?? '', target_price: Number(x.est_unit_price) > 0 ? num2(Number(x.est_unit_price)) : '' })))
      }
    })()
  }, [company])

  // existing draft
  useEffect(() => {
    if (!company || isNew) return
    ;(async () => {
      const [{ data: ev }, { data: its }, { data: inv }, { data: cr }, { data: at }] = await Promise.all([
        supabase.from('sourcing_events').select('*').eq('id', id!).single(),
        supabase.from('sourcing_items').select('*').eq('event_id', id!).order('position'),
        supabase.from('sourcing_invitations').select('supplier_id, contact_email').eq('event_id', id!),
        supabase.from('sourcing_criteria').select('*').eq('event_id', id!).order('position'),
        supabase.from('sourcing_attachments').select('id, file_name, file_path').eq('event_id', id!).is('invitation_id', null),
      ])
      if (!ev) { toast.error(t.common.notFound); navigate('/sourcing'); return }
      if (ev.status !== 'draft') { navigate(`/sourcing/${id}`); return }
      setHeader({ title: ev.title, event_type: ev.event_type, deadline: ev.deadline ?? '', department_id: ev.department_id ?? '', location_id: ev.location_id ?? '', description: ev.description ?? '', baseline: num2(ev.baseline_amount), request_id: ev.request_id ?? '' })
      setItems((its ?? []).map(x => ({ key: x.id, item_id: x.item_id, category_id: x.category_id, name: x.name, description: x.description ?? '', quantity: num2(Number(x.quantity)), unit: x.unit ?? '', target_price: num2(x.target_price) })))
      setSuppliers((inv ?? []).map(x => ({ supplier_id: x.supplier_id, email: x.contact_email ?? '' })))
      setCriteria((cr ?? []).map(x => ({ key: x.id, name: x.name, weight: num2(Number(x.weight)), kind: x.kind })))
      setExistingDocs(at ?? [])
      setLoading(false)
    })()
  }, [company, id])

  const setH = (k: keyof typeof header, v: string) => setHeader(h => ({ ...h, [k]: v }))
  const setItem = (key: string, patch: Partial<FormItem>) => { setErrs(e => ({ ...e, items: undefined })); setItems(xs => xs.map(x => (x.key === key ? { ...x, ...patch } : x))) }
  const setCrit = (key: string, patch: Partial<FormCriterion>) => { setErrs(e => ({ ...e, criteria: undefined })); setCriteria(xs => xs.map(x => (x.key === key ? { ...x, ...patch } : x))) }
  const numField = (val: string, set: (v: string) => void) => ({ value: val, onChange: (e: React.ChangeEvent<HTMLInputElement>) => { if (NUM.test(e.target.value)) set(e.target.value) } })
  const weightSum = criteria.reduce((n, c) => n + toNum(c.weight), 0)

  function applyCatalogItem(key: string, it: Item) {
    setItem(key, { item_id: it.id, category_id: it.category_id, name: it.name, description: it.long_description ?? '', unit: it.default_unit ? unitLabel(it.default_unit, lang) : '', target_price: it.default_unit_price != null ? num2(it.default_unit_price) : '' })
  }
  function addSupplier(sid: string) {
    if (!sid) return
    setErrs(e => ({ ...e, suppliers: undefined }))
    setSuppliers(xs => (xs.some(x => x.supplier_id === sid) ? xs : [...xs, { supplier_id: sid, email: supplierOpts.find(o => o.id === sid)?.email ?? '' }]))
  }

  async function persist() {
    if (!company || !profile) return
    if (!header.title.trim()) { req.setError('title', s.titleRequired, 's-title'); return }
    const clean = items.filter(x => x.name.trim())
    if (clean.length === 0) { setErrs(e => ({ ...e, items: s.noItems })); return }
    if (criteria.length > 0 && Math.abs(weightSum - 100) > 0.01) { setErrs(e => ({ ...e, criteria: s.weightsMustBe100 })); return }
    setSaving(true)

    const base = {
      title: header.title.trim(), event_type: header.event_type, deadline: header.deadline || null, department_id: header.department_id || null, location_id: header.location_id || null,
      description: header.description.trim() || null, baseline_amount: header.baseline.trim() ? toNum(header.baseline) : null, request_id: header.request_id || null, updated_at: new Date().toISOString(),
    }
    let eventId = id ?? ''
    if (isNew) {
      const { data, error } = await supabase.from('sourcing_events').insert({ ...base, company_id: company.id, status: 'draft', created_by: profile.id }).select('id').single()
      if (error || !data) { setSaving(false); toast.error(error?.message ?? 'Error'); return }
      eventId = data.id
      await supabase.from('sourcing_activity').insert({ event_id: eventId, company_id: company.id, actor_id: profile.id, action: 'created' })
    } else {
      const { error } = await supabase.from('sourcing_events').update(base).eq('id', eventId)
      if (error) { setSaving(false); toast.error(error.message); return }
      // a draft has no offers yet, so its lists are simply written again
      await Promise.all([
        supabase.from('sourcing_items').delete().eq('event_id', eventId),
        supabase.from('sourcing_invitations').delete().eq('event_id', eventId),
        supabase.from('sourcing_criteria').delete().eq('event_id', eventId),
      ])
    }
    const common = { event_id: eventId, company_id: company.id }
    const results = await Promise.all([
      supabase.from('sourcing_items').insert(clean.map((x, i) => ({ ...common, position: (i + 1) * 10, item_id: x.item_id, category_id: x.category_id, name: x.name.trim(), description: x.description.trim() || null, quantity: toNum(x.quantity) || 1, unit: unitToStore(x.unit), target_price: x.target_price.trim() ? toNum(x.target_price) : null }))),
      suppliers.length ? supabase.from('sourcing_invitations').insert(suppliers.map(x => ({ ...common, supplier_id: x.supplier_id, contact_email: x.email.trim() || null }))) : Promise.resolve({ error: null }),
      criteria.length ? supabase.from('sourcing_criteria').insert(criteria.map((c, i) => ({ ...common, position: (i + 1) * 10, name: c.name.trim() || '-', weight: toNum(c.weight), kind: c.kind }))) : Promise.resolve({ error: null }),
    ])
    const failed = results.find(r => r.error)
    if (failed?.error) { setSaving(false); toast.error(failed.error.message); return }

    for (const file of newFiles) {
      const path = `${company.id}/sourcing/${eventId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('quotations').upload(path, file, { upsert: true })
      if (error) { toast.error(`${t.common.uploadPrefix} ${file.name}: ${error.message}`); continue }
      await supabase.from('sourcing_attachments').insert({ event_id: eventId, company_id: company.id, file_path: path, file_name: file.name, file_size: file.size, created_by: profile.id })
    }
    setSaving(false)
    toast.success(s.saved)
    navigate(`/sourcing/${eventId}`)
  }

  async function removeDoc(d: { id: string; file_path: string }) {
    await supabase.storage.from('quotations').remove([d.file_path])
    await supabase.from('sourcing_attachments').delete().eq('id', d.id)
    setExistingDocs(xs => xs.filter(x => x.id !== d.id))
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>

  const title = isNew ? s.new : s.editTitle
  const freeSuppliers = supplierOpts.filter(o => !suppliers.some(x => x.supplier_id === o.id))
  const actions = (
    <>
      <Button variant="secondary" onClick={() => navigate(isNew ? '/sourcing' : `/sourcing/${id}`)} disabled={saving}>{t.common.cancel}</Button>
      <Button loading={saving} onClick={persist}>{t.common.save}</Button>
    </>
  )

  return (
    <div className="p-4 lg:p-6 form-skin">
      <nav className="flex items-center gap-2 text-sm text-ink2 mb-5">
        <button type="button" onClick={() => navigate(isNew ? '/sourcing' : `/sourcing/${id}`)} aria-label={s.title} title={s.title}
          className="w-7 h-7 -ml-1.5 mr-1 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <Link to="/sourcing" className="hover:text-ink transition-colors">{s.title}</Link>
        <ChevronRight className="w-3.5 h-3.5 text-icon" />
        <span className="text-ink font-medium">{title}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <h1 className="text-xl font-semibold text-ink tracking-tight">{title}</h1>
        <div className="hidden lg:flex items-center gap-2">{actions}</div>
      </div>
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-field px-4 py-3 flex gap-2 shadow-lg">
        <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving} className="flex-1">{t.common.cancel}</Button>
        <Button loading={saving} onClick={persist} className="flex-1">{t.common.save}</Button>
      </div>

      <div className="flex flex-col gap-4">
        <Card title={s.details}>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <Input id="s-title" label={s.name + ' *'} value={header.title} error={req.errors.title} onChange={e => { req.clear('title'); setH('title', e.target.value) }} />
            </div>
            <div>
              <Select id="s-type" label={s.type} value={header.event_type} options={(['rfq', 'rfp', 'rfi'] as EventType[]).map(v => ({ value: v, label: `${s.types[v]} - ${s.typeNames[v]}` }))} onChange={v => setH('event_type', v)} />
            </div>
            <Input id="s-deadline" label={s.deadline} type="date" value={header.deadline} onChange={e => setH('deadline', e.target.value)} />
            <Select id="s-dept" label={s.department} value={header.department_id} placeholder="-" options={[{ value: '', label: '-' }, ...departments.map(d => ({ value: d.id, label: d.name }))]} onChange={v => setH('department_id', v)} />
            <Select id="s-loc" label={s.location} value={header.location_id} placeholder="-" options={[{ value: '', label: '-' }, ...locations.map(l => ({ value: l.id, label: l.name }))]} onChange={v => setH('location_id', v)} />
            <div className="sm:col-span-2">
              <Input id="s-base" label={`${s.baseline} (${company?.currency ?? 'EUR'})`} inputMode="decimal" placeholder="0,00" {...numField(header.baseline, v => setH('baseline', v))} />
              <p className="text-xs text-ink2 mt-1.5">{s.baselineHint}</p>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-xs text-ink2 -mt-1 mb-3">{s.typeHint[header.event_type]}</p>
              <div className="flex flex-col gap-1">
                <label htmlFor="s-desc" className="text-sm font-medium text-gray-700">{s.description}</label>
                <textarea id="s-desc" rows={3} value={header.description} onChange={e => setH('description', e.target.value)}
                  className="rounded-lg border border-field px-3 py-2 hover:border-field-hover text-sm focus:outline-none focus:border-field-focus resize-none" />
              </div>
            </div>
          </div>
        </Card>

        <Card title={s.items} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-grid w-full text-sm min-w-[860px]">
              <GridHead cols={[[s.catalog, SearchIcon], [s.itemName, Package], [s.qty, Hash, 'right'], [s.unit, Ruler], [s.targetPrice, Coins, 'right'], ['']]} />
              <tbody className="divide-y divide-field">
                {items.map(x => (
                  <tr key={x.key} className="align-top">
                    <td className="px-3 py-2.5 min-w-[150px]"><CatalogPicker items={catalog} onSelect={it => applyCatalogItem(x.key, it)} placeholder={t.common.searchCatalog} /></td>
                    <td className="px-3 py-2.5 min-w-[240px]">
                      <input value={x.name} onChange={e => setItem(x.key, { name: e.target.value })} aria-label={s.itemName}
                        className="w-full h-9 px-3 text-sm font-medium rounded-lg border border-field hover:border-field-hover bg-white text-ink focus:outline-none focus:border-field-focus" />
                      <input value={x.description} onChange={e => setItem(x.key, { description: e.target.value })} aria-label={s.description}
                        className="w-full h-9 px-3 mt-2 text-sm rounded-lg border border-field hover:border-field-hover bg-white text-ink focus:outline-none focus:border-field-focus" />
                    </td>
                    <td className="px-3 py-2.5 w-28"><input {...numField(x.quantity, v => setItem(x.key, { quantity: v }))} inputMode="decimal" aria-label={s.qty} className={inputCls + ' text-right'} /></td>
                    <td className="px-3 py-2.5 w-32"><Select value={unitCode(x.unit) ?? x.unit} options={unitOptions(x.unit, lang)} onChange={v => setItem(x.key, { unit: v ? unitLabel(v, lang) : '' })} /></td>
                    <td className="px-3 py-2.5 w-32"><input {...numField(x.target_price, v => setItem(x.key, { target_price: v }))} inputMode="decimal" placeholder="0,00" aria-label={s.targetPrice} className={inputCls + ' text-right'} /></td>
                    <td className="px-3 py-2.5 pt-3 w-12">
                      <button type="button" onClick={() => setItems(xs => (xs.length > 1 ? xs.filter(y => y.key !== x.key) : xs))} aria-label={t.common.deleteEntity}
                        className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-danger transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-field flex items-center justify-between gap-4 flex-wrap">
            <button type="button" onClick={() => setItems(xs => [...xs, newItem()])} className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover font-medium"><Plus className="w-4 h-4" />{s.addItem}</button>
            {errs.items && <p className="text-xs text-red-600 inline-flex items-center gap-1.5"><CircleAlert className="w-3.5 h-3.5" />{errs.items}</p>}
          </div>
        </Card>

        <Card title={s.suppliers}>
          <div className="p-5 flex flex-col gap-3">
            {suppliers.map(x => (
              <div key={x.supplier_id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                <div><p className="text-[12.5px] font-medium text-ink2 mb-1">{s.supplier}</p><p className="text-sm font-medium text-ink h-9 flex items-center">{supplierOpts.find(o => o.id === x.supplier_id)?.name}</p></div>
                <Input id={`s-mail-${x.supplier_id}`} label={s.contactEmail} type="email" value={x.email} onChange={e => setSuppliers(xs => xs.map(y => (y.supplier_id === x.supplier_id ? { ...y, email: e.target.value } : y)))} />
                <button type="button" onClick={() => setSuppliers(xs => xs.filter(y => y.supplier_id !== x.supplier_id))} aria-label={s.removeSupplier}
                  className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-danger transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <div className="max-w-sm">
              <Select id="s-add-sup" label={suppliers.length ? undefined : s.addSupplier} value="" placeholder={s.pickSupplier} searchable options={freeSuppliers.map(o => ({ value: o.id, label: o.name }))} onChange={addSupplier} />
            </div>
            {errs.suppliers && <p className="text-xs text-red-600">{errs.suppliers}</p>}
          </div>
        </Card>

        <Card title={s.criteria}>
          <div className="p-5 flex flex-col gap-3">
            {criteria.map(c => (
              <div key={c.key} className="grid grid-cols-1 sm:grid-cols-[1fr_220px_110px_auto] gap-3 items-end">
                <Input id={`c-name-${c.key}`} label={s.criterion} value={c.name} onChange={e => setCrit(c.key, { name: e.target.value })} />
                <Select label={s.type} value={c.kind} options={(['price', 'delivery', 'manual'] as CriterionKind[]).map(k => ({ value: k, label: s.kinds[k] }))} onChange={v => setCrit(c.key, { kind: v as CriterionKind })} />
                <Input id={`c-w-${c.key}`} label={s.weight} inputMode="decimal" {...numField(c.weight, v => setCrit(c.key, { weight: v }))} />
                <button type="button" onClick={() => setCriteria(xs => xs.filter(y => y.key !== c.key))} aria-label={t.common.deleteEntity}
                  className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-icon hover:bg-selected hover:text-danger transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 flex-wrap pt-1">
              <button type="button" onClick={() => setCriteria(xs => [...xs, { key: rid(), name: '', weight: '0', kind: 'manual' }])} className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover font-medium"><Plus className="w-4 h-4" />{s.addCriterion}</button>
              <span className={`text-sm tabular-nums ${Math.abs(weightSum - 100) > 0.01 && criteria.length ? 'text-danger font-medium' : 'text-ink2'}`}>{s.weightsSum}: {weightSum} %</span>
            </div>
            {errs.criteria && <p className="text-xs text-red-600 inline-flex items-center gap-1.5"><CircleAlert className="w-3.5 h-3.5" />{errs.criteria}</p>}
          </div>
        </Card>

        <Card title={s.documents}>
          <div className="p-5 flex flex-col gap-2">
            {existingDocs.map(d => (
              <div key={d.id} className="flex items-center gap-2.5 px-3 py-2 bg-surface rounded-lg">
                <FileText className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
                <span className="text-sm text-ink font-medium flex-1 truncate">{d.file_name}</span>
                <button type="button" onClick={() => removeDoc(d)} aria-label={t.common.deleteEntity} className="text-icon hover:text-danger transition-colors shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            {newFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2 bg-accent-light rounded-lg">
                <FileText className="w-4 h-4 text-icon shrink-0" strokeWidth={1.75} />
                <span className="text-sm text-ink font-medium flex-1 truncate">{f.name}</span>
                <span className="text-xs text-ink2 shrink-0 tabular-nums">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                <button type="button" onClick={() => setNewFiles(fs => fs.filter((_, k) => k !== i))} aria-label={t.common.cancel} className="text-icon hover:text-danger transition-colors shrink-0"><X className="w-4 h-4" /></button>
              </div>
            ))}
            <input ref={fileRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" className="hidden"
              onChange={e => { setNewFiles(f => [...f, ...Array.from(e.target.files ?? [])]); if (fileRef.current) fileRef.current.value = '' }} />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 h-10 px-3 rounded-lg border border-dashed border-field cursor-pointer text-sm text-ink2 hover:bg-surface transition-colors w-full text-left">
              <UploadCloud className="w-4 h-4 text-icon shrink-0" /><span>{s.uploadDoc}</span>
            </button>
          </div>
        </Card>

        <div className="hidden lg:flex justify-end gap-2">{actions}</div>
        <div className="lg:hidden h-16" />
      </div>
    </div>
  )
}
